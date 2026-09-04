import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { formatCurrency, formatDate } from "@/lib/format";
import { BrandBar, CoverPage, PdfOptions, TermsBlock, companyLogo, itemNumber, moneyPrefix, styles } from "./documentTheme";

const defaultTerms = "Esta cotizacion tiene una validez de 30 dias.\nLos precios estan sujetos a cambios hasta la aprobacion formal.\nEl inicio del proyecto requiere aprobacion de la propuesta y condiciones de pago acordadas.";

export const QuotationPDF = ({ quotation, company, options = {} }: { quotation: any, company: any, options?: PdfOptions }) => {
    const logo = companyLogo(company);
    const prefix = moneyPrefix(company);
    const asunto = [quotation.title, quotation.subtitle].filter(Boolean).join(" - ");

    return (
        <Document>
            {options.includeCoverPage && (
                <CoverPage document={quotation} company={company} label="COTIZACION" secondaryDateLabel="Valida hasta" />
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
                            <Text style={styles.watermarkTitle}>COTIZACION</Text>
                            <Text style={styles.eyebrow}>Numero de cotizacion</Text>
                            <Text style={styles.invoiceNumber}>{quotation.number || "COT-" + quotation.id}</Text>
                            {asunto ? <Text style={styles.documentSubject}>{asunto}</Text> : null}
                        </View>
                    </View>

                    <View style={styles.separator} />

                    <View style={styles.metaGrid}>
                        <View style={styles.clientBlock}>
                            <Text style={styles.eyebrow}>Dirigido a:</Text>
                            <Text style={styles.clientName}>{quotation.contact?.name || "Sin cliente"}</Text>
                            {quotation.contact?.taxId ? <Text style={styles.clientLine}>RNC/Cedula: {quotation.contact.taxId}</Text> : null}
                            {quotation.contact?.address ? <Text style={styles.clientLine}>{quotation.contact.address}</Text> : null}
                            {quotation.contact?.email ? <Text style={styles.clientLine}>{quotation.contact.email}</Text> : null}
                        </View>

                        <View style={styles.datesBlock}>
                            <View style={styles.dateCell}>
                                <Text style={styles.eyebrow}>Fecha cotizacion</Text>
                                <Text style={styles.dateValue}>{formatDate(quotation.date)}</Text>
                            </View>
                            {/*
                              * Sin fecha de validez no se pinta la celda. Antes salia "N/A" en rojo
                              * y en grande donde va una fecha limite, que se lee como si algo
                              * estuviera mal en la cotizacion en vez de como un dato que falta.
                              */}
                            {quotation.validUntil ? (
                                <View style={styles.dateCell}>
                                    <Text style={styles.eyebrow}>Valida hasta</Text>
                                    <Text style={[styles.dateValue, styles.dueDate]}>{formatDate(quotation.validUntil)}</Text>
                                </View>
                            ) : null}
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
                        {quotation.items.map((item: any, index: number) => {
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
                                    <Text style={[styles.td, styles.colNo]}>{itemNumber(quotation.items, index)}</Text>
                                    <Text style={[styles.td, styles.colDesc]}>{item.description}</Text>
                                    <Text style={[styles.td, styles.colQty]}>{item.quantity}</Text>
                                    <Text style={[styles.td, styles.colPrice]}>{formatCurrency(item.price)}</Text>
                                    <Text style={[styles.td, styles.colTax]}>{item.taxRate + "%"}</Text>
                                    <Text style={[styles.td, styles.colTotal]}>{formatCurrency(item.total)}</Text>
                                </View>
                            );
                        })}
                    </View>

                    <View style={styles.lower}>
                        <View style={styles.notes}>
                            <Text style={styles.eyebrow}>Notas</Text>
                            <Text style={styles.notesText}>
                                {quotation.notes || "Los montos son estimados y quedan sujetos a la aprobacion formal de esta propuesta."}
                            </Text>
                        </View>

                        <View style={styles.totals}>
                            <View style={styles.totalLine}>
                                <Text style={styles.totalLabel}>Subtotal</Text>
                                <Text style={styles.totalValue}>{prefix} {formatCurrency(quotation.subtotal)}</Text>
                            </View>
                            <View style={styles.totalLine}>
                                <Text style={styles.totalLabel}>ITBIS estimado (18%)</Text>
                                <Text style={styles.totalValue}>{prefix} {formatCurrency(quotation.tax)}</Text>
                            </View>
                            <View style={styles.grandTotal}>
                                <Text style={styles.grandLabel}>Total estimado</Text>
                                <Text style={styles.grandValue}>{prefix} {formatCurrency(quotation.total)}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>No constituye una factura legal - Sujeta a cambios</Text>
                    <Text style={styles.footerBrand}>oFlow by Oasis</Text>
                    <Text style={styles.footerText}>Pagina 1 de 1</Text>
                </View>
            </Page>

            {options.includeTermsPage && (
                <Page size="A4" style={styles.termsPage}>
                    <Text style={styles.termsTitle}>TERMINOS Y CONDICIONES</Text>
                    <TermsBlock text={quotation.termsAndConditions || defaultTerms} />
                </Page>
            )}
        </Document>
    );
};
