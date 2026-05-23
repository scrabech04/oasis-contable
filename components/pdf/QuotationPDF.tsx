

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatCurrency, formatDate } from '@/lib/format';

const styles = StyleSheet.create({
    page: {
        padding: 40,
        fontFamily: 'Helvetica',
        fontSize: 10,
        color: '#334155',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 40,
    },
    companyInfo: {
        flexDirection: 'column',
    },
    companyName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#0f172a',
        marginBottom: 4,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#059669', // Green for Quotations
        textAlign: 'right',
    },
    quoteInfo: {
        textAlign: 'right',
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#0f172a',
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        paddingBottom: 4,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    label: {
        color: '#64748b',
    },
    value: {
        fontWeight: 'bold',
    },
    table: {
        display: 'table' as any,
        width: 'auto',
        marginBottom: 30,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        paddingVertical: 8,
        alignItems: 'center',
    },
    tableHeader: {
        backgroundColor: '#f8fafc',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        fontWeight: 'bold',
    },
    colNo: { width: '5%', textAlign: 'center', paddingLeft: 5 },
    colDescription: { width: '40%' },
    colQty: { width: '10%', textAlign: 'center' },
    colPrice: { width: '15%', textAlign: 'right' },
    colTax: { width: '10%', textAlign: 'center' },
    colTotal: { width: '20%', textAlign: 'right', paddingRight: 5 },

    footer: {
        position: 'absolute',
        bottom: 30,
        left: 40,
        right: 40,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        paddingTop: 10,
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: 8,
    },
    totalsContainer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    totalsBox: {
        width: 200,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    grandTotal: {
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        marginTop: 4,
        paddingTop: 8,
        fontSize: 14,
        fontWeight: 'bold',
        color: '#059669',
    },
    statusBadge: {
        backgroundColor: '#ecfdf5',
        color: '#059669',
        fontSize: 10,
        padding: '4 8',
        borderRadius: 4,
        marginTop: 8,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    coverPage: {
        padding: 50,
        fontFamily: 'Helvetica',
        color: '#0f172a',
        backgroundColor: '#f8fafc',
    },
    coverBrand: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#059669',
        marginBottom: 120,
    },
    coverTitle: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#0f172a',
        marginBottom: 18,
    },
    coverClient: {
        fontSize: 20,
        color: '#334155',
        marginBottom: 8,
    },
    coverMeta: {
        fontSize: 11,
        color: '#64748b',
        marginBottom: 5,
    },
    termsPage: {
        padding: 40,
        fontFamily: 'Helvetica',
        fontSize: 10,
        color: '#334155',
    },
    termsTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#059669',
        marginBottom: 24,
    },
    termsText: {
        fontSize: 10,
        lineHeight: 1.55,
        marginBottom: 8,
    }
});

type PdfOptions = {
    includeCoverPage?: boolean;
    includeTermsPage?: boolean;
};

const defaultTerms = "Esta cotizacion tiene una validez de 30 dias.\nLos precios estan sujetos a cambios hasta la aprobacion formal.\nEl inicio del proyecto requiere aprobacion de la propuesta y condiciones de pago acordadas.";

function TermsBlock({ text }: { text: string }) {
    return (
        <View>
            {text.split(/\r?\n/).filter(Boolean).map((line, index) => (
                <Text key={index} style={styles.termsText}>{line}</Text>
            ))}
        </View>
    );
}

export const QuotationPDF = ({ quotation, company, options = {} }: { quotation: any, company: any, options?: PdfOptions }) => (
    <Document>
        {options.includeCoverPage && (
            <Page size="A4" style={styles.coverPage}>
                <Text style={styles.coverBrand}>{company.name}</Text>
                <Text style={styles.coverTitle}>{quotation.title || "COTIZACION"}</Text>
                <Text style={styles.coverClient}>{quotation.contact?.name || "Sin cliente"}</Text>
                {quotation.project?.name && <Text style={styles.coverMeta}>Proyecto: {quotation.project.name}</Text>}
                <Text style={styles.coverMeta}>Documento: {quotation.number}</Text>
                <Text style={styles.coverMeta}>Fecha: {formatDate(quotation.date)}</Text>
                {quotation.validUntil && <Text style={styles.coverMeta}>Valida hasta: {formatDate(quotation.validUntil)}</Text>}
                <View style={{ position: 'absolute', left: 50, right: 50, bottom: 45, borderTopWidth: 1, borderTopColor: '#d1fae5', paddingTop: 14 }}>
                    <Text style={{ fontSize: 9, color: '#64748b' }}>{company.email} | {company.phone} | {company.address}</Text>
                </View>
            </Page>
        )}
        <Page size="A4" style={styles.page}>
            {/* Header / Brand */}
            <View style={styles.header}>
                <View style={styles.companyInfo}>
                    <Text style={styles.companyName}>{company.name}</Text>
                    <Text>RNC: {company.taxId}</Text>
                    <Text>{company.address}</Text>
                    <Text>Tel: {company.phone}</Text>
                    <Text>Email: {company.email}</Text>
                </View>
                <View style={styles.quoteInfo}>
                    <Text style={styles.title}>{quotation.title || "COTIZACIÓN"}</Text>
                    {quotation.subtitle && (
                        <Text style={{ fontSize: 10, color: '#64748b', textAlign: 'right', marginTop: 2 }}>
                            {quotation.subtitle}
                        </Text>
                    )}
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#334155', marginTop: 4 }}>
                        {quotation.number}
                    </Text>
                    <View style={styles.statusBadge}>
                        <Text>{quotation.status}</Text>
                    </View>
                </View>
            </View>

            {/* Separator */}
            <View style={{ borderBottomWidth: 2, borderBottomColor: '#10b981', marginBottom: 25 }} />

            {/* Client and Dates */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 }}>
                <View style={{ flex: 1.5 }}>
                    <Text style={[styles.sectionTitle, { borderBottomColor: '#10b981' }]}>DIRIGIDO A</Text>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 }}>
                        {quotation.contact?.name || 'Sin cliente'}
                    </Text>
                    <Text style={{ color: '#64748b', marginBottom: 2 }}>
                        RNC/Cédula: {quotation.contact?.taxId || 'N/A'}
                    </Text>
                    <Text style={{ color: '#64748b' }}>
                        {quotation.contact?.address || 'Sin dirección registrada'}
                    </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.sectionTitle}>VALIDEZ Y FECHAS</Text>
                    <View style={styles.row}>
                        <Text style={styles.label}>Fecha Cotización: </Text>
                        <Text style={styles.value}>{formatDate(quotation.date)}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>Válida Hasta: </Text>
                        <Text style={styles.value}>{quotation.validUntil ? formatDate(quotation.validUntil) : 'N/A'}</Text>
                    </View>
                </View>
            </View>

            {/* Items Table */}
            <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={styles.colNo}>#</Text>
                    <Text style={[styles.colDescription, { paddingLeft: 10 }]}>Descripción del Trabajo / Producto</Text>
                    <Text style={styles.colQty}>Cant.</Text>
                    <Text style={styles.colPrice}>Precio Unit.</Text>
                    <Text style={styles.colTax}>ITBIS %</Text>
                    <Text style={styles.colTotal}>Total</Text>
                </View>
                {quotation.items.map((item: any, index: number) => {
                    const isItem = item.itemType === 'ITEM';
                    const isHeading = item.itemType === 'HEADING';
                    const isSubheading = item.itemType === 'SUBHEADING';
                    const itemNumber = quotation.items.slice(0, index).filter((i: any) => i.itemType === 'ITEM').length + 1;
                    
                    return (
                        <View key={index} style={[styles.tableRow, { backgroundColor: isHeading || isSubheading ? '#f8fafc' : (index % 2 === 0 ? '#ffffff' : '#f0fdf4') }]}>
                            <Text style={styles.colNo}>{isItem ? itemNumber : ''}</Text>
                            <Text style={[styles.colDescription, { 
                                paddingLeft: isSubheading ? 20 : 10,
                                fontWeight: isHeading ? 'bold' : 'normal',
                                fontSize: isHeading ? 11 : 10,
                                color: isHeading ? '#0f172a' : '#334155'
                            }]}>
                                {item.description}
                            </Text>
                            <Text style={styles.colQty}>{isItem ? item.quantity : ''}</Text>
                            <Text style={styles.colPrice}>{isItem ? formatCurrency(item.price) : ''}</Text>
                            <Text style={styles.colTax}>{isItem ? `${item.taxRate}%` : ''}</Text>
                            <Text style={[styles.colTotal, { fontWeight: 'bold' }]}>
                                {isItem ? formatCurrency(item.total) : ''}
                            </Text>
                        </View>
                    );
                })}
            </View>

            {/* Footer Totals */}
            <View style={styles.totalsContainer}>
                <View style={[styles.totalsBox, { backgroundColor: '#f0fdf4', padding: 15, borderRadius: 8 }]}>
                    <View style={styles.totalRow}>
                        <Text style={styles.label}>Subtotal:</Text>
                        <Text style={styles.value}>{company.currency} {formatCurrency(quotation.subtotal)}</Text>
                    </View>
                    <View style={styles.totalRow}>
                        <Text style={styles.label}>ITBIS Estimado (18%):</Text>
                        <Text style={styles.value}>{company.currency} {formatCurrency(quotation.tax)}</Text>
                    </View>
                    <View style={[styles.totalRow, styles.grandTotal, { marginTop: 10, paddingTop: 10, borderTopColor: '#dcfce7' }]}>
                        <Text style={{ fontSize: 12, color: '#065f46' }}>TOTAL ESTIMADO:</Text>
                        <Text style={{ fontSize: 16, color: '#059669' }}>{company.currency} {formatCurrency(quotation.total)}</Text>
                    </View>
                </View>
            </View>

            {/* Notes */}
            {quotation.notes && (
                <View style={{ marginTop: 30, padding: 10, backgroundColor: '#f0f9ff', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#0ea5e9' }}>
                    <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#0369a1', marginBottom: 2 }}>NOTAS ADICIONALES:</Text>
                    <Text style={{ fontSize: 9, color: '#075985', lineHeight: 1.4 }}>{quotation.notes}</Text>
                </View>
            )}

            {/* Footer */}
            <View style={styles.footer}>
                <Text style={{ marginBottom: 2 }}>{company.name} • {company.taxId} • {company.email}</Text>
                <Text>Esta cotización no constituye una factura legal y está sujeta a cambios.</Text>
                <Text style={{ marginTop: 4, color: '#cbd5e1' }}>Generado por ContableApp</Text>
            </View>
        </Page>
        {options.includeTermsPage && (
            <Page size="A4" style={styles.termsPage}>
                <View style={styles.header}>
                    <View style={styles.companyInfo}>
                        <Text style={styles.companyName}>{company.name}</Text>
                        <Text>RNC: {company.taxId}</Text>
                        <Text>{company.address}</Text>
                        <Text>Tel: {company.phone}</Text>
                        <Text>Email: {company.email}</Text>
                    </View>
                    <View style={styles.quoteInfo}>
                        <Text style={styles.title}>{quotation.number}</Text>
                        <Text style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>Anexo contractual</Text>
                    </View>
                </View>
                <Text style={styles.termsTitle}>TERMINOS Y CONDICIONES</Text>
                <TermsBlock text={quotation.termsAndConditions || defaultTerms} />
                <View style={styles.footer}>
                    <Text>{company.name} | {company.taxId} | {company.email}</Text>
                </View>
            </Page>
        )}
    </Document>
);
