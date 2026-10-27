import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { formatCurrency, formatDate } from "@/lib/format";
import { BrandBar, CoverPage, DiscountLines, PageFooter, PdfOptions, SubheadingText, TermsBlock, companyLogo, itemNumber, moneyPrefix, styles } from "./documentTheme";
import type { EcfRepresentation } from "@/lib/ecf/representation";

const defaultTerms = "Esta factura se emite segun los servicios o productos descritos.\nLos pagos deben realizarse antes de la fecha de vencimiento indicada.\nCualquier cambio, reclamacion o ajuste debe solicitarse por escrito.";

/**
 * Con `ecf` la factura se imprime como Representacion Impresa de un e-CF: tipo de
 * comprobante en palabras, e-NCF y vencimiento tomados del XML firmado, una "E" delante de
 * las lineas exentas, totales del e-CF y el QR con el codigo de seguridad y la fecha de firma.
 */
export const InvoicePDF = ({ invoice, company, options = {}, ecf = null }: { invoice: any, company: any, options?: PdfOptions, ecf?: EcfRepresentation | null }) => {
    const logo = companyLogo(company);
    const prefix = moneyPrefix(company);
    // Lo pone la ruta desde la secuencia de numeracion; si esa serie no tiene fecha de
    // vencimiento no se imprime nada, antes que inventar una fecha fiscal.
    const ncfExpiry = invoice.ncfExpiresAt || null;
    // Numero de linea del e-CF de cada item facturable (los encabezados no cuentan), para
    // marcar con "E" los exentos.
    const exemptLines = new Set(ecf?.exemptLines || []);
    const ecfLineByIndex = new Map<number, number>();
    invoice.items.forEach((item: any, index: number) => {
        if (!item.itemType || item.itemType === "ITEM") ecfLineByIndex.set(index, ecfLineByIndex.size + 1);
    });

    return (
        <Document>
            {options.includeCoverPage && (
                <CoverPage document={invoice} company={company} label="FACTURA" secondaryDateLabel="Vencimiento" />
            )}

            <Page size="A4" style={styles.page}>
                <BrandBar />
                <View style={styles.content}>
                    <View style={styles.brandRow}>
                        <View style={{ width: "54%" }}>
                            {logo ? <Image src={logo} style={styles.companyLogo} /> : null}
                            <Text style={styles.companyName}>{company.name}</Text>
                            <Text style={styles.companyLine}>RNC: {company.taxId || "N/A"}</Text>
                            {company.address ? <Text style={styles.companyLine}>{company.address}</Text> : null}
                            {company.email ? <Text style={styles.companyLine}>{company.email}</Text> : null}
                            {company.phone ? <Text style={styles.companyLine}>{company.phone}</Text> : null}
                        </View>

                        <View style={styles.invoiceSide}>
                            {ecf ? (
                                <>
                                    <Text style={[styles.watermarkTitle, { fontSize: 11, color: "#0f172a", fontStyle: "normal", textAlign: "right" }]}>{ecf.typeName}</Text>
                                    <Text style={styles.eyebrow}>e-NCF</Text>
                                    <Text style={ecf.sequenceExpiry ? [styles.ncf, styles.ncfWithExpiry] : styles.ncf}>{ecf.encf}</Text>
                                    {ecf.sequenceExpiry ? <Text style={styles.ncfExpiry}>Fecha de vencimiento: {ecf.sequenceExpiry}</Text> : null}
                                    {ecf.reference ? <Text style={styles.ncfExpiry}>e-NCF modificado: {ecf.reference.ncf}{ecf.reference.codigo ? ` - ${ecf.reference.codigo}` : ""}</Text> : null}
                                </>
                            ) : <Text style={styles.watermarkTitle}>FACTURA</Text>}
                            {!ecf && invoice.ncf ? (
                                <>
                                    <Text style={styles.eyebrow}>NCF</Text>
                                    <Text style={ncfExpiry ? [styles.ncf, styles.ncfWithExpiry] : styles.ncf}>{invoice.ncf}</Text>
                                    {ncfExpiry ? <Text style={styles.ncfExpiry}>Valido hasta {formatDate(ncfExpiry)}</Text> : null}
                                </>
                            ) : null}
                            <Text style={styles.eyebrow}>Numero de factura</Text>
                            <Text style={invoice.ncf ? styles.invoiceNumberSecondary : styles.invoiceNumber}>{invoice.number || `INV-${invoice.id}`}</Text>
                        </View>
                    </View>

                    <View style={styles.separator} />

                    <View style={styles.metaGrid}>
                        <View style={styles.clientBlock}>
                            <Text style={styles.eyebrow}>Facturar a:</Text>
                            <Text style={styles.clientName}>{invoice.contact?.name || "Sin cliente"}</Text>
                            {invoice.contact?.taxId ? <Text style={styles.clientLine}>RNC/Cedula: {invoice.contact.taxId}</Text> : null}
                            {invoice.contact?.address ? <Text style={styles.clientLine}>{invoice.contact.address}</Text> : null}
                            {invoice.contact?.email ? <Text style={styles.clientLine}>{invoice.contact.email}</Text> : null}
                        </View>

                        <View style={styles.datesBlock}>
                            <View style={styles.dateCell}>
                                <Text style={styles.eyebrow}>Fecha emision</Text>
                                <Text style={styles.dateValue}>{formatDate(invoice.date)}</Text>
                            </View>
                            <View style={styles.dateCell}>
                                <Text style={styles.eyebrow}>Vencimiento</Text>
                                <Text style={[styles.dateValue, styles.dueDate]}>{formatDate(invoice.dueDate)}</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.table}>
                        <View style={styles.tableHeader}>
                            <Text style={[styles.th, styles.colNo]}>#</Text>
                            <Text style={[styles.th, styles.colDesc]}>Descripcion</Text>
                            <Text style={[styles.th, styles.colQty]}>Cantidad</Text>
                            <Text style={[styles.th, styles.colPrice]}>Precio Unit.</Text>
                            <Text style={[styles.th, styles.colTax]}>ITBIS %</Text>
                            <Text style={[styles.th, styles.colTotal]}>Total</Text>
                        </View>
                        {invoice.items.map((item: any, index: number) => {
                            const isHeading = item.itemType === "HEADING";
                            const isSubheading = item.itemType === "SUBHEADING";

                            if (isHeading || isSubheading) {
                                return (
                                    <View key={item.id || index} wrap={false} style={[styles.tableRow, isHeading ? styles.sectionRow : styles.subsectionRow]}>
                                        <View style={styles.colNo} />
                                        {isHeading ? <Text style={styles.headingText}>{item.description}</Text> : <SubheadingText text={item.description} />}
                                    </View>
                                );
                            }

                            const exempt = exemptLines.has(ecfLineByIndex.get(index) ?? -1);
                            return (
                                <View key={item.id || index} wrap={false} style={styles.tableRow}>
                                    <Text style={[styles.td, styles.colNo]}>{itemNumber(invoice.items, index)}</Text>
                                    <Text style={[styles.td, styles.colDesc]}>{exempt ? `E  ${item.description}` : item.description}</Text>
                                    <Text style={[styles.td, styles.colQty]}>{item.quantity}</Text>
                                    <Text style={[styles.td, styles.colPrice]}>{formatCurrency(item.price)}</Text>
                                    <Text style={[styles.td, styles.colTax]}>{`${item.taxRate}%`}</Text>
                                    <Text style={[styles.td, styles.colTotal]}>{formatCurrency(item.total)}</Text>
                                </View>
                            );
                        })}
                    </View>

                    <View style={styles.lower}>
                        <View style={styles.notes}>
                            <Text style={styles.eyebrow}>Notas</Text>
                            <Text style={styles.notesText}>
                                {invoice.notes || "Gracias por su preferencia. Por favor realice el pago antes de la fecha de vencimiento."}
                            </Text>
                        </View>

                        {ecf ? (
                        <View style={styles.totals}>
                            <DiscountLines document={invoice} prefix={prefix} />
                            {ecf.totals.gravado !== null ? (
                                <View style={styles.totalLine}>
                                    <Text style={styles.totalLabel}>Subtotal gravado</Text>
                                    <Text style={styles.totalValue}>{prefix} {formatCurrency(ecf.totals.gravado)}</Text>
                                </View>
                            ) : null}
                            {ecf.totals.exento !== null ? (
                                <View style={styles.totalLine}>
                                    <Text style={styles.totalLabel}>Subtotal exento</Text>
                                    <Text style={styles.totalValue}>{prefix} {formatCurrency(ecf.totals.exento)}</Text>
                                </View>
                            ) : null}
                            <View style={styles.totalLine}>
                                <Text style={styles.totalLabel}>Total ITBIS</Text>
                                <Text style={styles.totalValue}>{prefix} {formatCurrency(ecf.totals.itbis ?? 0)}</Text>
                            </View>
                            <View style={styles.grandTotal}>
                                <Text style={styles.grandLabel}>Total</Text>
                                <Text style={styles.grandValue}>{prefix} {formatCurrency(ecf.totals.total)}</Text>
                            </View>
                        </View>
                        ) : (
                        <View style={styles.totals}>
                            <View style={styles.totalLine}>
                                <Text style={styles.totalLabel}>Subtotal</Text>
                                <Text style={styles.totalValue}>{prefix} {formatCurrency((invoice.discount || 0) > 0 ? invoice.subtotal + invoice.discount : invoice.subtotal)}</Text>
                            </View>
                            <DiscountLines document={invoice} prefix={prefix} />
                            <View style={styles.totalLine}>
                                <Text style={styles.totalLabel}>ITBIS (18%)</Text>
                                <Text style={styles.totalValue}>{prefix} {formatCurrency(invoice.tax)}</Text>
                            </View>
                            <View style={styles.grandTotal}>
                                <Text style={styles.grandLabel}>Total</Text>
                                <Text style={styles.grandValue}>{prefix} {formatCurrency(invoice.total)}</Text>
                            </View>
                        </View>
                        )}
                    </View>

                    {ecf ? (
                        // QR abajo a la izquierda, a mas de 2 cm del borde (34 + 24 pt) y de 25 mm,
                        // con el codigo de seguridad y la fecha de firma debajo, como pide la DGII.
                        <View wrap={false} style={{ marginLeft: 24, marginBottom: 10, width: 150 }}>
                            <Image src={ecf.qrDataUrl} style={{ width: 72, height: 72, margin: 8.5 }} />
                            <Text style={{ fontSize: 7.5, color: "#0f172a" }}>Código de Seguridad: {ecf.securityCode}</Text>
                            <Text style={{ fontSize: 7.5, color: "#0f172a" }}>Fecha de Firma Digital: {ecf.signedAtText}</Text>
                        </View>
                    ) : null}
                </View>

                <PageFooter note="Valido solo con sello y firma - Original: Cliente" />
            </Page>

            {options.includeTermsPage && (
                <Page size="A4" style={styles.termsPage}>
                    <Text style={styles.termsTitle}>TERMINOS Y CONDICIONES</Text>
                    <TermsBlock text={invoice.termsAndConditions || defaultTerms} />
                </Page>
            )}
        </Document>
    );
};
