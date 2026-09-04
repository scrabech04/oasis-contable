/**
 * El diseno compartido de los documentos en PDF: paleta de Oasis Gate, hoja de estilos y
 * las piezas comunes (portada, terminos, logo).
 *
 * Vive aparte porque la factura y la cotizacion se habian ido separando hasta no parecer
 * de la misma empresa: la cotizacion seguia en verde, sin logo y con otra tipografia. Con
 * los estilos aqui, un cambio de marca alcanza a los dos documentos a la vez.
 */
import { Page, Text, View, StyleSheet, Image, Svg, Defs, LinearGradient, Stop, Rect } from "@react-pdf/renderer";
import { formatDate } from "@/lib/format";


export type PdfOptions = {
    includeCoverPage?: boolean;
    includeTermsPage?: boolean;
};

/**
 * Los dos tonos de Oasis Gate, muestreados del gradiente de la marca (el boton del sitio y
 * la palabra "TE" del titular). Van juntos y en ese orden: el azul abre y el morado cierra.
 */
export const brandBlue = "#76a8f7";
export const brandPurple = "#a468f5";

/**
 * El morado de marca sobre papel blanco se queda en 2.7:1 de contraste, flojo para un
 * importe o un NCF. Este conserva el tono (262 grados, el mismo) y sube a 6.3:1, asi que el
 * texto usa este y los rellenos decorativos usan los de arriba.
 */
export const brandInk = "#7838d8";

/** La franja de marca del borde superior: azul a la izquierda, morado a la derecha. */
export function BrandBar() {
    return (
        <Svg style={styles.topBar} viewBox="0 0 100 5" preserveAspectRatio="none">
            <Defs>
                <LinearGradient id="brandBar" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={brandBlue} />
                    <Stop offset="1" stopColor={brandPurple} />
                </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="5" fill="url(#brandBar)" />
        </Svg>
    );
}
export const slate900 = "#0f172a";
export const slate700 = "#334155";
export const slate500 = "#64748b";
export const slate400 = "#94a3b8";
export const slate100 = "#e2e8f0";
export const slate50 = "#f8fafc";

export const styles = StyleSheet.create({
    /** Asunto de la cotizacion: va bajo el numero, sin competir con el. */
    documentSubject: {
        fontSize: 7.5,
        color: slate500,
        textAlign: "right",
        marginTop: -6,
        marginBottom: 10,
    },
    page: {
        padding: 0,
        fontFamily: "Helvetica",
        fontSize: 9,
        color: slate700,
        backgroundColor: "#ffffff",
    },
    topBar: {
        width: "100%",
        height: 5,
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
    companyLogo: {
        width: 58,
        height: 58,
        objectFit: "contain",
        marginBottom: 12,
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
    invoiceNumberSecondary: {
        fontSize: 9,
        fontWeight: "bold",
        color: slate400,
        marginBottom: 10,
    },
    ncf: {
        fontSize: 16,
        fontWeight: "bold",
        color: brandInk,
        marginBottom: 10,
    },
    ncfWithExpiry: {
        marginBottom: 1,
    },
    ncfExpiry: {
        fontSize: 6.5,
        color: slate400,
        marginBottom: 10,
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
    /**
     * Un titulo es una linea de texto, no una fila de tabla. El `minHeight` de arriba esta
     * para que a un item no se le venga encima la descripcion larga de la siguiente linea;
     * en un titulo de una sola linea deja 72 puntos de aire debajo, que era el hueco
     * enorme entre cada seccion y sus items.
     */
    sectionRow: {
        minHeight: 0,
        paddingTop: 11,
        paddingBottom: 5,
    },
    subsectionRow: {
        minHeight: 0,
        paddingTop: 6,
        paddingBottom: 5,
    },
    headingText: {
        width: "94%",
        fontSize: 9.5,
        fontWeight: "bold",
        color: slate900,
        lineHeight: 1.28,
    },
    subheadingText: {
        width: "94%",
        paddingLeft: 10,
        fontSize: 8.2,
        fontWeight: "bold",
        color: slate700,
        lineHeight: 1.28,
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
        width: "42%",
    },
    notesText: {
        fontSize: 7.4,
        color: slate500,
        lineHeight: 1.45,
        fontStyle: "italic",
    },
    totals: {
        width: "38%",
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
        // Sin esto el rotulo y el importe se encimaban: react-pdf no encoge un texto que
        // no cabe, lo desborda. Se veia con "TOTAL ESTIMADO" de la cotizacion, que es mas
        // largo que el "TOTAL" de la factura.
        flexShrink: 1,
        paddingRight: 6,
    },
    grandValue: {
        fontSize: 17,
        fontWeight: "bold",
        fontStyle: "italic",
        color: brandInk,
        flexShrink: 0,
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
    footerBrand: {
        fontSize: 6,
        color: "#cbd5e1",
        letterSpacing: 0.4,
    },
    coverPage: {
        position: "relative",
        padding: 0,
        fontFamily: "Helvetica",
        color: "#ffffff",
        backgroundColor: slate900,
    },
    coverBackground: {
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
    },
    coverBackdrop: {
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "#000000",
    },
    coverContent: {
        position: "absolute",
        maxWidth: 390,
    },
    coverBrand: {
        fontSize: 13,
        fontWeight: "bold",
        marginBottom: 46,
        letterSpacing: 2,
        textTransform: "uppercase",
    },
    coverTitle: {
        fontSize: 38,
        fontWeight: "bold",
        marginBottom: 18,
    },
    coverClient: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 8,
    },
    coverMeta: {
        fontSize: 10,
        marginBottom: 5,
    },
    coverAccent: {
        width: 80,
        height: 4,
        borderRadius: 4,
        marginBottom: 28,
    },
    coverFooter: {
        position: "absolute",
        left: 50,
        right: 50,
        bottom: 34,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.35)",
        paddingTop: 12,
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
        color: brandInk,
        marginBottom: 24,
    },
    termsText: {
        fontSize: 10,
        lineHeight: 1.55,
        marginBottom: 8,
    },
});


export function termsLines(text: string) {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function itemNumber(items: any[], index: number) {
    return items.slice(0, index).filter((item: any) => item.itemType === "ITEM").length + 1;
}

/**
 * Se acepta tambien un logo incrustado como data URI, no solo una URL: el unico logo que
 * habia guardado apuntaba a un dominio que responde 404, y una imagen que el PDF no puede
 * descargar deja la cabecera vacia sin avisar.
 */
export function companyLogo(company: any) {
    const logo = company.logoUrl || company.logo;
    if (typeof logo !== "string") return "";
    return /^(https?:\/\/|data:image\/)/i.test(logo) ? logo : "";
}

export function moneyPrefix(company: any) {
    return company.currency || "RD$";
}

export function coverTextPosition(company: any) {
    const value = company.coverTextPosition || "BOTTOM_LEFT";
    if (value === "TOP_RIGHT") return { top: 64, right: 50, alignItems: "flex-end", textAlign: "right" };
    if (value === "CENTER") return { top: 300, left: 70, right: 70, maxWidth: 455, alignItems: "center", textAlign: "center" };
    if (value === "BOTTOM_RIGHT") return { bottom: 92, right: 50, alignItems: "flex-end", textAlign: "right" };
    if (value === "TOP_LEFT") return { top: 64, left: 50 };
    return { bottom: 92, left: 50 };
}

export function coverImageFit(company: any) {
    return company.coverImageFit === "CONTAIN" ? "contain" : "cover";
}

export function CoverPage({ document, company, label, secondaryDateLabel }: { document: any; company: any; label: string; secondaryDateLabel?: string }) {
    const textColor = company.coverTextColor || "#ffffff";
    const accentColor = company.coverAccentColor || brandInk;
    const overlayOpacity = typeof company.coverOverlayOpacity === "number" ? company.coverOverlayOpacity : 0.35;
    const backgroundImage = typeof company.coverImageUrl === "string" ? company.coverImageUrl : "";

    return (
        <Page size="A4" style={styles.coverPage}>
            {backgroundImage ? (
                <Image src={backgroundImage} style={[styles.coverBackground, { objectFit: coverImageFit(company) }]} />
            ) : null}
            <View style={[styles.coverBackdrop, { opacity: overlayOpacity }]} />
            <View style={[styles.coverContent, coverTextPosition(company), { color: textColor } as any]}>
                <View style={[styles.coverAccent, { backgroundColor: accentColor }]} />
                {company.coverShowLogo !== false ? (
                    <Text style={[styles.coverBrand, { color: accentColor }]}>{company.name || "oFlow by Oasis"}</Text>
                ) : null}
                <Text style={{ fontSize: 9, fontWeight: "bold", letterSpacing: 2, textTransform: "uppercase", color: accentColor, marginBottom: 12 }}>{label}</Text>
                <Text style={[styles.coverTitle, { color: textColor }]}>{document.title || label}</Text>
                {company.coverShowClient !== false ? <Text style={[styles.coverClient, { color: textColor }]}>{document.contact?.name || "Sin cliente"}</Text> : null}
                {company.coverShowProject !== false && document.project?.name ? <Text style={[styles.coverMeta, { color: textColor }]}>Proyecto: {document.project.name}</Text> : null}
                {company.coverShowDocumentNumber !== false ? <Text style={[styles.coverMeta, { color: textColor }]}>Documento: {document.number || document.id}</Text> : null}
                {company.coverShowDate !== false && document.date ? <Text style={[styles.coverMeta, { color: textColor }]}>Fecha: {formatDate(document.date)}</Text> : null}
                {secondaryDateLabel && document.dueDate ? <Text style={[styles.coverMeta, { color: textColor }]}>{secondaryDateLabel}: {formatDate(document.dueDate)}</Text> : null}
            </View>
            <View style={styles.coverFooter}>
                <Text style={{ fontSize: 8, color: textColor }}>{[company.taxId && `RNC: ${company.taxId}`, company.email, company.phone, company.address].filter(Boolean).join(" | ")}</Text>
            </View>
        </Page>
    );
}

export function TermsBlock({ text }: { text: string }) {
    return (
        <View>
            {termsLines(text).map((line, index) => (
                <Text key={index} style={styles.termsText}>{line}</Text>
            ))}
        </View>
    );
}
