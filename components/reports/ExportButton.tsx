"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportButtonProps {
    type: "606" | "607";
    data: any[];
    period: string;
    companyTaxId: string;
}

function formatDgiiDate(value: string | Date | null | undefined) {
    if (!value) {
        return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
}

function formatAmount(value: number | null | undefined) {
    return (value ?? 0).toFixed(2);
}

function normalizeTaxId(value: string | null | undefined) {
    return (value || "").replace(/\D/g, "");
}

function getTipoId(taxId: string) {
    if (taxId.length === 11) {
        return "2";
    }

    return "1";
}

function getPaymentMethodCode(payments: any[], status: string) {
    if (payments.length === 0) {
        return status === "PAID" ? "2" : "4";
    }

    const methodCodes = new Set(
        payments.map((payment) => {
            switch (payment.method) {
                case "CASH":
                    return "1";
                case "BANK_TRANSFER":
                case "CHECK":
                    return "2";
                case "CARD":
                    return "3";
                default:
                    return "7";
            }
        })
    );

    return methodCodes.size === 1 ? Array.from(methodCodes)[0] : "7";
}

function sumWithholdingsByKind(payments: any[], kind: "ITBIS" | "ISR") {
    return payments.reduce((sum, payment) => {
        const paymentTotal = (payment.withholdings || [])
            .filter((withholding: any) => {
                const type = String(withholding.type || "").toUpperCase();

                if (kind === "ITBIS") {
                    return type.includes("ITBIS");
                }

                return type.includes("ISR") || type.includes("ESTADO");
            })
            .reduce((withholdingSum: number, withholding: any) => withholdingSum + (withholding.amount || 0), 0);

        return sum + paymentTotal;
    }, 0);
}

function getLatestWithholdingDate(payments: any[]) {
    const dates = payments
        .filter((payment) => (payment.withholdings || []).some((withholding: any) => Number(withholding.amount) > 0))
        .map((payment) => new Date(payment.date))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((a, b) => b.getTime() - a.getTime());

    return dates[0] ? formatDgiiDate(dates[0]) : "";
}

function getIsrRetentionType(payments: any[]) {
    const withholdingTypes = payments
        .flatMap((payment) => payment.withholdings || [])
        .map((withholding: any) => String(withholding.type || "").toUpperCase());

    if (withholdingTypes.includes("ESTADO_5")) {
        return "7";
    }

    if (withholdingTypes.includes("ISR_10")) {
        return "2";
    }

    if (withholdingTypes.includes("ISR_2")) {
        return "4";
    }

    if (withholdingTypes.includes("ISR_1")) {
        return "3";
    }

    return "";
}

export function ExportButton({ type, data, period, companyTaxId }: ExportButtonProps) {
    const handleExport = () => {
        if (data.length === 0) {
            alert("No hay datos para exportar en este periodo.");
            return;
        }

        let csvContent = "";
        const emitterTaxId = normalizeTaxId(companyTaxId) || "000000000";
        const controlLine = `${type}|${emitterTaxId}|${period}|${data.length}\n`;

        if (type === "606") {
            const headers = "RNC;TipoID;NCF;NCF_Mod;Fecha;FechaPago;Servicios;Bienes;Monto_Total;ITBIS_Facturado;ITBIS_Retenido;ITBIS_Sujeto_Proporcionalidad;ITBIS_Llevado_Costo;ITBIS_por_Adelantar;ITBIS_Percibido;Tipo_Retencion_ISR;Monto_Retencion_Renta;ISR_Percibido;ISC;Otros_Impuestos_Tasas;Propina_Legal;Tipo_Gasto;Forma_Pago\n";
            csvContent = controlLine + headers + data.map(p => {
                const rnc = normalizeTaxId(p.contact?.taxId || p.supplierTaxId) || "000000000";
                const ncf = p.ncf || "";
                const date = formatDgiiDate(p.date);
                const paymentDate = formatDgiiDate(p.payments?.[p.payments.length - 1]?.date);
                const subtotal = p.subtotal || 0;
                const tax = p.tax || 0;
                const itbisRetenido = sumWithholdingsByKind(p.payments || [], "ITBIS");
                const retencionRenta = sumWithholdingsByKind(p.payments || [], "ISR");
                const tipoRetencionIsr = retencionRenta > 0 ? getIsrRetentionType(p.payments || []) : "";
                const costType = p.costType || "02";
                const formaPago = getPaymentMethodCode(p.payments || [], p.status || "OPEN");

                // Aún no modelamos la proporción bienes/servicios por línea.
                // Para no inflar el total ni mezclar ITBIS, exportamos el subtotal completo en servicios.
                const servicios = subtotal;
                const bienes = 0;
                const itbisLlevadoCosto = 0;
                const itbisPorAdelantar = Math.max(tax - itbisLlevadoCosto, 0);

                return [
                    rnc,
                    getTipoId(rnc),
                    ncf,
                    "",
                    date,
                    paymentDate,
                    formatAmount(servicios),
                    formatAmount(bienes),
                    formatAmount(subtotal),
                    formatAmount(tax),
                    formatAmount(itbisRetenido),
                    "0.00",
                    formatAmount(itbisLlevadoCosto),
                    formatAmount(itbisPorAdelantar),
                    "0.00",
                    tipoRetencionIsr,
                    formatAmount(retencionRenta),
                    "0.00",
                    "0.00",
                    "0.00",
                    "0.00",
                    costType,
                    formaPago
                ].join(";");
            }).join("\n");
        } else {
            // DGII 607 Headers
            const headers = "RNC;TipoID;NCF;NCF_Mod;Tipo_Ingreso;Fecha;Fecha_Retencion;Monto_Facturado;ITBIS_Facturado;ITBIS_Retenido;ITBIS_Percibido;Retencion_Renta;Impuesto_Consumo;Otros_Impuestos;Propina;Monto_Efectivo\n";
            csvContent = controlLine + headers + data.map(inv => {
                const rnc = normalizeTaxId(inv.contact?.taxId) || "000000000";
                const ncf = inv.ncf || "";
                const date = formatDgiiDate(inv.date);
                const payments = inv.payments || [];
                const fechaRetencion = getLatestWithholdingDate(payments);
                const subtotal = formatAmount(inv.subtotal);
                const tax = formatAmount(inv.tax);
                const itbisRetenido = sumWithholdingsByKind(payments, "ITBIS");
                const retencionRenta = sumWithholdingsByKind(payments, "ISR");
                const incomeType = inv.incomeType || "01";

                return `${rnc};${getTipoId(rnc)};${ncf};;${incomeType};${date};${fechaRetencion};${subtotal};${tax};${formatAmount(itbisRetenido)};0.00;${formatAmount(retencionRenta)};0.00;0.00;0.00;${formatAmount(inv.total)}`;
            }).join("\n");
        }

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Reporte_${type}_${period}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Button
            onClick={handleExport}
            className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
        >
            <FileDown className="h-4 w-4" />
            Exportar CSV {type}
        </Button>
    );
}
