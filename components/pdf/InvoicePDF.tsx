import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { formatCurrency, formatDate } from "@/lib/format";
import { BrandBar, CoverPage, PdfOptions, TermsBlock, companyLogo, itemNumber, moneyPrefix, styles } from "./documentTheme";

const defaultTerms = "Esta factura se emite segun los servicios o productos descritos.\nLos pagos deben realizarse antes de la fecha de vencimiento indicada.\nCualquier cambio, reclamacion o ajuste debe solicitarse por escrito.";

export const InvoicePDF = ({ invoice, company, options = {} }: { invoice: any, company: any, options?: PdfOptions }) => {
    const logo = companyLogo(company);
    const prefix = moneyPrefix(company);
    // Lo pone la ruta desde la secuencia de numeracion; si esa serie no tiene fecha de
    // vencimiento no se imprime nada, antes que inventar una fecha fiscal.
    const ncfExpiry = invoice.ncfExpiresAt || null;

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
                            <Text style={styles.watermarkTitle}>FACTURA</Text>
                            {invoice.ncf ? (
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
                                    <View key={item.id || index} style={[styles.tableRow, isHeading ? styles.sectionRow : styles.subsectionRow]}>
                                        <View style={styles.colNo} />
                                        <Text style={isHeading ? styles.headingText : styles.subheadingText}>{item.description}</Text>
                                    </View>
                                );
                            }

                            return (
                                <View key={item.id || index} style={styles.tableRow}>
                                    <Text style={[styles.td, styles.colNo]}>{itemNumber(invoice.items, index)}</Text>
                                    <Text style={[styles.td, styles.colDesc]}>{item.description}</Text>
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

                        <View style={styles.totals}>
                            <View style={styles.totalLine}>
                                <Text style={styles.totalLabel}>Subtotal</Text>
                                <Text style={styles.totalValue}>{prefix} {formatCurrency(invoice.subtotal)}</Text>
                            </View>
                            <View style={styles.totalLine}>
                                <Text style={styles.totalLabel}>ITBIS (18%)</Text>
                                <Text style={styles.totalValue}>{prefix} {formatCurrency(invoice.tax)}</Text>
                            </View>
                            <View style={styles.grandTotal}>
                                <Text style={styles.grandLabel}>Total</Text>
                                <Text style={styles.grandValue}>{prefix} {formatCurrency(invoice.total)}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>Valido solo con sello y firma - Original: Cliente</Text>
                    <Text style={styles.footerBrand}>oFlow by Oasis</Text>
                    <Text style={styles.footerText}>Pagina 1 de 1</Text>
                </View>
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
