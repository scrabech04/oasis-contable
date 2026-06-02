import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { formatCurrency, formatDate } from "@/lib/format";

type PdfOptions = {
    includeCoverPage?: boolean;
    includeTermsPage?: boolean;
};

const blue = "#155dfc";
const slate900 = "#0f172a";
const slate700 = "#334155";
const slate500 = "#64748b";
const slate400 = "#94a3b8";
const slate100 = "#e2e8f0";
const slate50 = "#f8fafc";

const styles = StyleSheet.create({
    page: {
        padding: 0,
        fontFamily: "Helvetica",
        fontSize: 9,
        color: slate700,
        backgroundColor: "#ffffff",
    },
    topBar: {
        height: 5,
        backgroundColor: blue,
    },
    content: {
        paddingTop: 30,
        paddingRight: 34,
        paddingBottom: 0,
        paddingLeft: 34,
    },
    brandRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 26,
    },
    brand: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 18,
    },
    brandMark: {
        width: 14,
        height: 14,
        borderRadius: 2,
        backgroundColor: blue,
        color: "#ffffff",
        fontSize: 9,
        fontWeight: "bold",
        textAlign: "center",
        paddingTop: 2,
        marginRight: 6,
    },
    brandName: {
        fontSize: 13,
        fontWeight: "bold",
        color: slate900,
    },
    brandBy: {
        fontSize: 7,
        color: slate500,
        letterSpacing: 2,
        textTransform: "uppercase",
        marginLeft: 4,
    },
    companyLogo: {
        width: 44,
        height: 44,
        objectFit: "contain",
        marginBottom: 10,
    },
    companyName: {
        fontSize: 10,
        fontWeight: "bold",
        color: slate900,
        marginBottom: 4,
    },
    companyLine: {
        fontSize: 7.5,
        color: slate500,
        lineHeight: 1.35,
    },
    invoiceSide: {
        alignItems: "flex-end",
    },
    watermarkTitle: {
        fontSize: 26,
        fontWeight: "bold",
        fontStyle: "italic",
        color: "#e5e7eb",
        textTransform: "uppercase",
        marginBottom: 12,
    },
    eyebrow: {
        fontSize: 6.5,
        fontWeight: "bold",
        color: slate400,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        marginBottom: 3,
    },
    invoiceNumber: {
        fontSize: 12,
        fontWeight: "bold",
        color: slate900,
        marginBottom: 10,
    },
    ncf: {
        fontSize: 12,
        fontWeight: "bold",
        color: blue,
    },
    separator: {
        borderBottomWidth: 1,
        borderBottomColor: slate100,
        marginBottom: 28,
    },
    metaGrid: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 28,
    },
    clientBlock: {
        width: "55%",
    },
    datesBlock: {
        width: "35%",
        flexDirection: "row",
        justifyContent: "space-between",
    },
    clientName: {
        fontSize: 12,
        fontWeight: "bold",
        color: slate900,
        marginBottom: 5,
    },
    clientLine: {
        fontSize: 8.5,
        color: slate500,
        lineHeight: 1.4,
    },
    dateCell: {
        alignItems: "flex-end",
        width: "48%",
    },
    dateValue: {
        fontSize: 8.5,
        fontWeight: "bold",
        color: slate900,
    },
    dueDate: {
        color: "#ef4444",
    },
    table: {
        marginBottom: 26,
    },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: "#fbfdff",
        borderBottomWidth: 1,
        borderBottomColor: slate100,
        paddingTop: 10,
        paddingBottom: 10,
    },
    tableRow: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: "#edf2f7",
        paddingTop: 10,
        paddingBottom: 12,
        minHeight: 72,
    },
    th: {
        fontSize: 6.5,
        fontWeight: "bold",
        color: slate400,
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    td: {
        fontSize: 8,
        color: slate900,
        lineHeight: 1.28,
    },
    colNo: { width: "6%", textAlign: "center" },
    colDesc: { width: "52%", paddingRight: 12 },
    colQty: { width: "11%", textAlign: "center" },
    colPrice: { width: "12%", textAlign: "right" },
    colTax: { width: "8%", textAlign: "center" },
    colTotal: { width: "11%", textAlign: "right" },
    lower: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 6,
        marginBottom: 28,
    },
    notes: {
        width: "44%",
    },
    notesText: {
        fontSize: 7.4,
        color: slate500,
        lineHeight: 1.45,
        fontStyle: "italic",
    },
    totals: {
        width: "34%",
    },
    totalLine: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 10,
    },
    totalLabel: {
        fontSize: 8.5,
        color: slate500,
    },
    totalValue: {
        fontSize: 8.5,
        color: slate900,
        fontWeight: "bold",
    },
    grandTotal: {
        borderTopWidth: 1,
        borderTopColor: slate100,
        paddingTop: 12,
        marginTop: 2,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    grandLabel: {
        fontSize: 9,
        fontWeight: "bold",
        color: slate900,
        textTransform: "uppercase",
    },
    grandValue: {
        fontSize: 17,
        fontWeight: "bold",
        fontStyle: "italic",
        color: blue,
    },
    footer: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 42,
        backgroundColor: slate50,
        borderTopWidth: 1,
        borderTopColor: slate100,
        paddingLeft: 34,
        paddingRight: 34,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    footerText: {
        fontSize: 6.5,
        fontWeight: "bold",
        letterSpacing: 1,
        color: slate400,
        textTransform: "uppercase",
    },
    coverPage: {
        padding: 48,
        fontFamily: "Helvetica",
        color: slate900,
        backgroundColor: "#ffffff",
    },
    coverBrand: {
        fontSize: 13,
        fontWeight: "bold",
        color: blue,
        marginBottom: 130,
    },
    coverTitle: {
        fontSize: 36,
        fontWeight: "bold",
        color: slate900,
        marginBottom: 18,
    },
    coverClient: {
        fontSize: 20,
        color: slate700,
        marginBottom: 8,
    },
    coverMeta: {
        fontSize: 10,
        color: slate500,
        marginBottom: 5,
    },
    termsPage: {
        padding: 42,
        fontFamily: "Helvetica",
        fontSize: 10,
        color: slate700,
    },
    termsTitle: {
        fontSize: 22,
        fontWeight: "bold",
        color: blue,
        marginBottom: 24,
    },
    termsText: {
        fontSize: 10,
        lineHeight: 1.55,
        marginBottom: 8,
    },
});

const defaultTerms = "Esta factura se emite segun los servicios o productos descritos.\nLos pagos deben realizarse antes de la fecha de vencimiento indicada.\nCualquier cambio, reclamacion o ajuste debe solicitarse por escrito.";

function termsLines(text: string) {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function itemNumber(items: any[], index: number) {
    return items.slice(0, index).filter((item: any) => item.itemType === "ITEM").length + 1;
}

function companyLogo(company: any) {
    const logo = company.logoUrl || company.logo;
    return typeof logo === "string" && /^https?:\/\//i.test(logo) ? logo : "";
}

function moneyPrefix(company: any) {
    return company.currency || "RD$";
}

function TermsBlock({ text }: { text: string }) {
    return (
        <View>
            {termsLines(text).map((line, index) => (
                <Text key={index} style={styles.termsText}>{line}</Text>
            ))}
        </View>
    );
}

export const InvoicePDF = ({ invoice, company, options = {} }: { invoice: any, company: any, options?: PdfOptions }) => {
    const logo = companyLogo(company);
    const prefix = moneyPrefix(company);

    return (
        <Document>
            {options.includeCoverPage && (
                <Page size="A4" style={styles.coverPage}>
                    <View style={styles.topBar} />
                    <Text style={styles.coverBrand}>oFlow by Oasis</Text>
                    <Text style={styles.coverTitle}>{invoice.title || "FACTURA"}</Text>
                    <Text style={styles.coverClient}>{invoice.contact?.name || "Sin cliente"}</Text>
                    {invoice.project?.name && <Text style={styles.coverMeta}>Proyecto: {invoice.project.name}</Text>}
                    <Text style={styles.coverMeta}>Documento: {invoice.number || invoice.id}</Text>
                    <Text style={styles.coverMeta}>Fecha: {formatDate(invoice.date)}</Text>
                    <Text style={styles.coverMeta}>Vencimiento: {formatDate(invoice.dueDate)}</Text>
                </Page>
            )}

            <Page size="A4" style={styles.page}>
                <View style={styles.topBar} />
                <View style={styles.content}>
                    <View style={styles.brandRow}>
                        <View style={{ width: "54%" }}>
                            <View style={styles.brand}>
                                <Text style={styles.brandMark}>C</Text>
                                <Text style={styles.brandName}>oFlow</Text>
                                <Text style={styles.brandBy}>by Oasis</Text>
                            </View>
                            {logo ? <Image src={logo} style={styles.companyLogo} /> : null}
                            <Text style={styles.companyName}>{company.name}</Text>
                            <Text style={styles.companyLine}>RNC: {company.taxId || "N/A"}</Text>
                            {company.address ? <Text style={styles.companyLine}>{company.address}</Text> : null}
                            {company.email ? <Text style={styles.companyLine}>{company.email}</Text> : null}
                            {company.phone ? <Text style={styles.companyLine}>{company.phone}</Text> : null}
                        </View>

                        <View style={styles.invoiceSide}>
                            <Text style={styles.watermarkTitle}>FACTURA</Text>
                            <Text style={styles.eyebrow}>Numero de factura</Text>
                            <Text style={styles.invoiceNumber}>{invoice.number || `INV-${invoice.id}`}</Text>
                            {invoice.ncf ? (
                                <>
                                    <Text style={styles.eyebrow}>NCF</Text>
                                    <Text style={styles.ncf}>{invoice.ncf}</Text>
                                </>
                            ) : null}
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
                            const isItem = item.itemType === "ITEM" || !item.itemType;
                            return (
                                <View key={item.id || index} style={styles.tableRow}>
                                    <Text style={[styles.td, styles.colNo]}>{isItem ? itemNumber(invoice.items, index) : ""}</Text>
                                    <Text style={[styles.td, styles.colDesc]}>{item.description}</Text>
                                    <Text style={[styles.td, styles.colQty]}>{isItem ? item.quantity : ""}</Text>
                                    <Text style={[styles.td, styles.colPrice]}>{isItem ? formatCurrency(item.price) : ""}</Text>
                                    <Text style={[styles.td, styles.colTax]}>{isItem ? `${item.taxRate}%` : ""}</Text>
                                    <Text style={[styles.td, styles.colTotal]}>{isItem ? formatCurrency(item.total) : ""}</Text>
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
