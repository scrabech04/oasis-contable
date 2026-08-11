import { Document, Page, Text, View, StyleSheet, Image, Link } from "@react-pdf/renderer";

export type ConstanciaField = {
    label: string;
    value: string;
};

export type DgiiConstanciaData = {
    encf: string;
    estado: string;
    fields: ConstanciaField[];
    timbreUrl: string;
    qrDataUrl: string;
    consultedAt: string;
    companyName?: string;
};

const blue = "#155dfc";
const emerald = "#047857";
const amber = "#b45309";
const slate900 = "#0f172a";
const slate700 = "#334155";
const slate500 = "#64748b";
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
        paddingRight: 40,
        paddingBottom: 30,
        paddingLeft: 40,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 22,
    },
    title: {
        fontSize: 16,
        fontWeight: "bold",
        color: slate900,
    },
    subtitle: {
        fontSize: 8,
        color: slate500,
        marginTop: 4,
        maxWidth: 320,
        lineHeight: 1.5,
    },
    companyName: {
        fontSize: 9,
        fontWeight: "bold",
        color: slate700,
        textAlign: "right",
    },
    consultedAt: {
        fontSize: 7,
        color: slate500,
        textAlign: "right",
        marginTop: 3,
    },
    summary: {
        flexDirection: "row",
        gap: 10,
        marginBottom: 20,
    },
    summaryBox: {
        flexGrow: 1,
        flexBasis: 0,
        borderWidth: 1,
        borderColor: slate100,
        borderRadius: 6,
        padding: 10,
        backgroundColor: slate50,
    },
    summaryLabel: {
        fontSize: 7,
        color: slate500,
        textTransform: "uppercase",
        letterSpacing: 1,
        marginBottom: 4,
    },
    summaryValue: {
        fontSize: 12,
        fontWeight: "bold",
        color: slate900,
    },
    body: {
        flexDirection: "row",
        gap: 18,
    },
    table: {
        flexGrow: 1,
        flexBasis: 0,
        borderWidth: 1,
        borderColor: slate100,
        borderRadius: 6,
    },
    row: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: slate100,
    },
    rowLast: {
        flexDirection: "row",
    },
    cellLabel: {
        width: "45%",
        paddingVertical: 7,
        paddingHorizontal: 9,
        backgroundColor: slate50,
        fontSize: 8,
        color: slate500,
    },
    cellValue: {
        width: "55%",
        paddingVertical: 7,
        paddingHorizontal: 9,
        fontSize: 8,
        color: slate900,
        fontWeight: "bold",
    },
    qrPanel: {
        width: 150,
        alignItems: "center",
    },
    qrImage: {
        width: 130,
        height: 130,
    },
    qrCaption: {
        fontSize: 7,
        color: slate500,
        textAlign: "center",
        marginTop: 8,
        lineHeight: 1.5,
    },
    linkBox: {
        marginTop: 18,
        borderWidth: 1,
        borderColor: slate100,
        borderRadius: 6,
        padding: 10,
        backgroundColor: slate50,
    },
    linkLabel: {
        fontSize: 7,
        color: slate500,
        textTransform: "uppercase",
        letterSpacing: 1,
        marginBottom: 4,
    },
    link: {
        fontSize: 7,
        color: blue,
        textDecoration: "none",
    },
    footer: {
        marginTop: 18,
        fontSize: 7,
        color: slate500,
        lineHeight: 1.6,
    },
});

export function DgiiConstanciaPDF({ data }: { data: DgiiConstanciaData }) {
    const estadoColor = /aceptad/i.test(data.estado) ? emerald : amber;

    return (
        <Document
            title={`Constancia DGII ${data.encf}`}
            author="oFlow by Oasis"
            subject="Verificacion de comprobante fiscal electronico"
        >
            <Page size="A4" style={styles.page}>
                <View style={styles.topBar} />
                <View style={styles.content}>
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>Constancia de Verificacion DGII</Text>
                            <Text style={styles.subtitle}>
                                Datos obtenidos del portal de verificacion de comprobantes fiscales
                                electronicos de la Direccion General de Impuestos Internos.
                            </Text>
                        </View>
                        <View>
                            {data.companyName ? (
                                <Text style={styles.companyName}>{data.companyName}</Text>
                            ) : null}
                            <Text style={styles.consultedAt}>Consultado el {data.consultedAt}</Text>
                        </View>
                    </View>

                    <View style={styles.summary}>
                        <View style={styles.summaryBox}>
                            <Text style={styles.summaryLabel}>e-NCF</Text>
                            <Text style={styles.summaryValue}>{data.encf || "-"}</Text>
                        </View>
                        <View style={styles.summaryBox}>
                            <Text style={styles.summaryLabel}>Estado en DGII</Text>
                            <Text style={[styles.summaryValue, { color: estadoColor }]}>
                                {data.estado || "-"}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.body}>
                        <View style={styles.table}>
                            {data.fields.map((field, index) => (
                                <View
                                    key={`${field.label}-${index}`}
                                    style={index === data.fields.length - 1 ? styles.rowLast : styles.row}
                                >
                                    <Text style={styles.cellLabel}>{field.label}</Text>
                                    <Text style={styles.cellValue}>{field.value}</Text>
                                </View>
                            ))}
                        </View>

                        <View style={styles.qrPanel}>
                            <Image style={styles.qrImage} src={data.qrDataUrl} />
                            <Text style={styles.qrCaption}>
                                Escanea este codigo para abrir la verificacion oficial en el portal de
                                la DGII y confirmar los datos en vivo.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.linkBox}>
                        <Text style={styles.linkLabel}>Enlace oficial del timbre</Text>
                        <Link src={data.timbreUrl} style={styles.link}>
                            {data.timbreUrl}
                        </Link>
                    </View>

                    <Text style={styles.footer}>
                        Este documento es un respaldo generado automaticamente por oFlow by Oasis a
                        partir de la respuesta del portal de la DGII en la fecha indicada. No sustituye
                        al comprobante fiscal original: se adjunta como evidencia de que el comprobante
                        fue verificado ante la DGII. El estado de un comprobante puede cambiar despues
                        de esta consulta, por lo que el enlace y el codigo QR permiten reverificarlo en
                        cualquier momento.
                    </Text>
                </View>
            </Page>
        </Document>
    );
}
