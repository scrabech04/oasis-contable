"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { Project, Invoice, Purchase, Contact, InvoiceItem, PurchaseItem, Payment, Withholding } from "@prisma/client";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useRouter } from "next/navigation";

interface ProjectDashboardProps {
    project: Project & {
        contact: Contact;
        invoices: (Invoice & { items: InvoiceItem[], payments: (Payment & { withholdings: Withholding[] })[] })[];
        purchases: (Purchase & { items: PurchaseItem[], payments: (Payment & { withholdings: Withholding[] })[] })[];
    };
    taxSettings?: {
        incomeTaxRegime?: string | null;
        incomeTaxRate?: number | null;
    };
}

const PERSON_INCOME_TAX_EXEMPT_LIMIT = 416220;

function calculateIndividualProgressiveISR(annualTaxableIncome: number) {
    const income = Math.max(0, annualTaxableIncome);
    if (income <= PERSON_INCOME_TAX_EXEMPT_LIMIT) return 0;
    if (income <= 624329) return (income - 416220.01) * 0.15;
    if (income <= 867123) return 31216 + (income - 624329.01) * 0.2;
    return 79776 + (income - 867123.01) * 0.25;
}

function resolveIncomeTax(taxableProfit: number, taxSettings?: ProjectDashboardProps["taxSettings"]) {
    const regime = taxSettings?.incomeTaxRegime || "LEGAL_ENTITY";
    const configuredRate = Number.isFinite(Number(taxSettings?.incomeTaxRate)) ? Number(taxSettings?.incomeTaxRate) : 0.27;

    if (regime === "PERSON_PROGRESSIVE") {
        const isExempt = Math.max(0, taxableProfit) <= PERSON_INCOME_TAX_EXEMPT_LIMIT;
        return {
            amount: calculateIndividualProgressiveISR(taxableProfit),
            label: "ISR PF progresivo",
            helper: isExempt ? `Exento por escala anual hasta RD$ ${formatCurrency(PERSON_INCOME_TAX_EXEMPT_LIMIT)}` : "Escala anual persona fisica",
        };
    }

    const rate = Math.min(1, Math.max(0, configuredRate));
    return {
        amount: Math.max(0, taxableProfit) * rate,
        label: regime === "CUSTOM" ? `ISR ref. ${(rate * 100).toFixed(2).replace(/\.00$/, "")}%` : `ISR PJ ${(rate * 100).toFixed(0)}%`,
        helper: regime === "CUSTOM" ? "Tasa personalizada del perfil" : "Persona juridica",
    };
}

function sumPaymentCash(payments: Array<Payment & { withholdings?: Withholding[] }> = []) {
    return payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
}

function sumWithholdings(payments: Array<Payment & { withholdings?: Withholding[] }> = [], kind?: "ITBIS" | "ISR") {
    return payments.reduce((sum, payment) => {
        return sum + (payment.withholdings || []).reduce((withholdingSum, withholding) => {
            const type = String(withholding.type || "").toUpperCase();
            if (kind && !type.startsWith(kind)) return withholdingSum;
            return withholdingSum + (Number(withholding.amount) || 0);
        }, 0);
    }, 0);
}

export function ProjectDashboard({ project, taxSettings }: ProjectDashboardProps) {
    const router = useRouter();
    // Financial Calculations
    const totalInvoiced = project.invoices.reduce((sum: number, inv: any) => sum + inv.total, 0);
    const totalSalesBase = project.invoices.reduce((sum: number, inv: any) => sum + inv.subtotal, 0);
    const totalSalesItbis = project.invoices.reduce((sum: number, inv: any) => sum + inv.tax, 0);
    const totalCollected = project.invoices.reduce((sum: number, inv: any) => sum + inv.paidAmount, 0);
    const totalWithholdings = project.invoices.reduce((sum: number, inv: any) => sum + sumWithholdings(inv.payments), 0);
    const salesItbisWithheld = project.invoices.reduce((sum: number, inv: any) => sum + sumWithholdings(inv.payments, "ITBIS"), 0);
    const salesIsrWithheld = project.invoices.reduce((sum: number, inv: any) => sum + sumWithholdings(inv.payments, "ISR"), 0);
    const actualCashCollected = project.invoices.reduce((sum: number, inv: any) => sum + sumPaymentCash(inv.payments), 0);
    const totalCosts = project.purchases.reduce((sum: number, pur: any) => sum + pur.total, 0);
    const actualCashPaid = project.purchases.reduce((sum: number, pur: any) => sum + sumPaymentCash(pur.payments), 0);
    const purchaseWithholdings = project.purchases.reduce((sum: number, pur: any) => sum + sumWithholdings(pur.payments), 0);
    const creditableItbis = project.purchases.reduce((sum: number, pur: any) => {
        const canUseAsCredit = pur.hasFiscalCredit && pur.report606 !== false && pur.taxTreatment === "LOCAL_CREDIT";
        return sum + (canUseAsCredit ? pur.tax : 0);
    }, 0);
    const deductibleCosts = project.purchases.reduce((sum: number, pur: any) => {
        if (pur.affectsISR === false) return sum;
        const taxIsCredit = pur.hasFiscalCredit && pur.report606 !== false && pur.taxTreatment === "LOCAL_CREDIT";
        return sum + (taxIsCredit ? pur.subtotal : pur.total);
    }, 0);
    const netItbisBeforeWithholdings = Math.max(0, totalSalesItbis - creditableItbis);
    const netItbisDue = Math.max(0, totalSalesItbis - creditableItbis - salesItbisWithheld);
    const itbisCreditBalance = Math.max(0, creditableItbis + salesItbisWithheld - totalSalesItbis);
    const taxableProfitBeforeISR = totalSalesBase - deductibleCosts;
    const incomeTaxEstimate = resolveIncomeTax(taxableProfitBeforeISR, taxSettings);
    const estimatedISR = incomeTaxEstimate.amount;
    const remainingISRDue = Math.max(0, estimatedISR - salesIsrWithheld);
    const estimatedNetProfit = taxableProfitBeforeISR - estimatedISR;
    const estimatedCashAfterTaxes = actualCashCollected - actualCashPaid - netItbisDue - remainingISRDue - purchaseWithholdings;

    const grossProfit = totalSalesBase - deductibleCosts;
    const netProfit = actualCashCollected - actualCashPaid;
    const margin = totalSalesBase > 0 ? (grossProfit / totalSalesBase) * 100 : 0;

    const budgetIncome = project.budgetIncome || 0;
    const budgetCost = project.budgetCost || 0;

    const incomeDeviation = budgetIncome > 0 ? ((totalInvoiced - budgetIncome) / budgetIncome) * 100 : 0;
    const costDeviation = budgetCost > 0 ? ((totalCosts - budgetCost) / budgetCost) * 100 : 0;

    // Chart Data
    const summaryData = [
        { name: "Ingresos netos", value: totalSalesBase },
        { name: "Costos", value: deductibleCosts },
    ];

    const chartData = [
        { name: "Presupuesto", Ingresos: budgetIncome, Costos: budgetCost },
        { name: "Real", Ingresos: totalSalesBase, Costos: deductibleCosts },
    ];

    const COLORS = ["#3b82f6", "#ef4444"];
    const transactions = [
        ...project.invoices.map((inv: any) => ({ ...inv, docType: "Venta", detailHref: `/invoices/${inv.id}` })),
        ...project.purchases.map((pur: any) => ({ ...pur, docType: "Compra", detailHref: `/purchases/${pur.id}/edit` }))
    ].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const chartTooltipStyle = {
        borderRadius: "12px",
        border: "1px solid rgba(148, 163, 184, 0.22)",
        background: "var(--card)",
        color: "var(--card-foreground)",
        boxShadow: "0 14px 30px -20px rgba(15, 23, 42, 0.45)",
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "ACTIVE": return "text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-300";
            case "PROPOSAL": return "text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300";
            case "ON_HOLD": return "text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-300";
            case "COMPLETED": return "text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300";
            case "CANCELLED": return "text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-300";
            default: return "text-slate-600 bg-slate-50 dark:bg-slate-800 dark:text-slate-300";
        }
    };

    return (
        <div className="space-y-7">
            {/* Project Header Summary */}
            <div className="premium-card flex flex-col justify-between gap-5 rounded-xl border border-slate-200 bg-card p-5 text-card-foreground shadow-sm dark:border-slate-800 md:flex-row md:items-center md:p-6">
                <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-2 md:gap-3">
                        <span className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-800 dark:text-slate-300">{project.code}</span>
                        <span className={`rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${getStatusColor(project.status)}`}>
                            {project.status}
                        </span>
                    </div>
                    <h2 className="text-xl font-black leading-tight text-slate-950 dark:text-white md:text-2xl">{project.name}</h2>
                    <p className="mt-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <span className="material-icons-outlined text-[17px]">business</span>
                        {project.contact?.name || "Sin contacto"}
                    </p>
                </div>
                <div className="grid w-full grid-cols-2 gap-4 sm:w-auto sm:min-w-[260px]">
                    <div className="text-left sm:text-right">
                        <span className="block font-mono text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Margen bruto</span>
                        <span className={`mt-2 block font-mono text-2xl font-black ${margin >= 20 ? 'text-emerald-600 dark:text-emerald-300' : margin > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                            {margin.toFixed(1)}%
                        </span>
                    </div>
                    <div className="text-left sm:text-right">
                        <span className="block font-mono text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Desvio costos</span>
                        <span className={`mt-2 block font-mono text-2xl font-black ${costDeviation <= 0 ? "text-slate-950 dark:text-white" : "text-orange-500"}`}>
                            {costDeviation.toFixed(1)}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="premium-card min-w-0 border-slate-200 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:hover:border-blue-900/60">
                    <CardContent className="p-5">
                        <div className="mb-5 flex items-center gap-4">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                                <span className="material-icons-outlined text-[22px]">account_balance_wallet</span>
                            </span>
                            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Total Facturado</span>
                        </div>
                        <div className="break-words font-mono text-2xl font-black text-slate-950 dark:text-white">RD$ {formatCurrency(totalInvoiced)}</div>
                        <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            <div className="flex justify-between gap-3">Liquidado fiscal <span className="font-mono font-black text-blue-600 dark:text-blue-300">RD$ {formatCurrency(totalCollected)}</span></div>
                            <div className="flex justify-between">
                                <span>En banco/caja</span>
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">RD$ {formatCurrency(actualCashCollected)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Retenciones</span>
                                <span className="font-mono font-bold text-amber-600">RD$ {formatCurrency(totalWithholdings)}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="premium-card min-w-0 border-slate-200 shadow-sm transition-all hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md dark:border-slate-800 dark:hover:border-red-900/60">
                    <CardContent className="p-5">
                        <div className="mb-5 flex items-center gap-4">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-300">
                                <span className="material-icons-outlined text-[22px]">shopping_cart</span>
                            </span>
                            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Costos Totales</span>
                        </div>
                        <div className="break-words font-mono text-2xl font-black text-slate-950 dark:text-white">RD$ {formatCurrency(totalCosts)}</div>
                        <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            <div className="flex justify-between gap-3">
                                <span>Presupuesto</span>
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">RD$ {formatCurrency(budgetCost)}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                                <span>Desviacion</span>
                                <span className={`font-mono font-black ${costDeviation <= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-red-600"}`}>{costDeviation.toFixed(1)}%</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="premium-card min-w-0 border-slate-200 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md dark:border-slate-800 dark:hover:border-emerald-900/60">
                    <CardContent className="p-5">
                        <div className="mb-5 flex items-center gap-4">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                <span className="material-icons-outlined text-[22px]">trending_up</span>
                            </span>
                            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Ganancia Bruta</span>
                        </div>
                        <div className={`break-words font-mono text-2xl font-black ${grossProfit >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-600"}`}>
                            RD$ {formatCurrency(grossProfit)}
                        </div>
                        <div className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
                            Subtotal de ventas menos costos deducibles; no incluye ITBIS ni retenciones.
                        </div>
                    </CardContent>
                </Card>

                <Card className="premium-card min-w-0 border-slate-200 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md dark:border-slate-800 dark:hover:border-orange-900/60">
                    <CardContent className="p-5">
                        <div className="mb-5 flex items-center gap-4">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                                <span className="material-icons-outlined text-[22px]">payments</span>
                            </span>
                            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Flujo de Caja</span>
                        </div>
                        <div className={`break-words font-mono text-2xl font-black ${netProfit >= 0 ? "text-blue-700 dark:text-blue-300" : "text-red-600"}`}>
                            RD$ {formatCurrency(netProfit)}
                        </div>
                        <div className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
                            Efectivo recibido menos pagos hechos en efectivo.
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Project Fiscal Estimate */}
            <section className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="flex items-center gap-2 text-2xl font-black text-slate-950 dark:text-white">
                        <span className="material-icons-outlined text-[24px] text-blue-700 dark:text-blue-300">analytics</span>
                        Estimacion Fiscal del Proyecto
                    </h2>
                    <span className="w-fit rounded-full bg-blue-100 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-widest text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                        {incomeTaxEstimate.label}
                    </span>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="premium-card rounded-xl border border-blue-100 bg-blue-50/50 p-5 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20">
                            <p className="font-mono text-[10px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-300">ITBIS cobrado</p>
                            <p className="mt-3 break-words font-mono text-2xl font-black text-slate-950 dark:text-white">RD$ {formatCurrency(totalSalesItbis)}</p>
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Facturas de venta</p>
                        </div>
                        <div className="premium-card rounded-xl border border-emerald-100 bg-emerald-50/40 p-5 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
                            <p className="font-mono text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">ITBIS acreditable</p>
                            <p className="mt-3 break-words font-mono text-2xl font-black text-slate-950 dark:text-white">RD$ {formatCurrency(creditableItbis)}</p>
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Compras con credito fiscal</p>
                        </div>
                        <div className="premium-card rounded-xl border border-red-100 bg-red-50/40 p-5 shadow-sm dark:border-red-900/50 dark:bg-red-950/20">
                            <p className="font-mono text-[10px] font-black uppercase tracking-widest text-red-700 dark:text-red-300">ITBIS neto a pagar</p>
                            <p className="mt-3 break-words font-mono text-2xl font-black text-red-600 dark:text-red-300">RD$ {formatCurrency(netItbisDue)}</p>
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                                {itbisCreditBalance > 0
                                    ? `Credito a favor RD$ ${formatCurrency(itbisCreditBalance)}`
                                    : salesItbisWithheld > 0
                                        ? `Antes de retenciones RD$ ${formatCurrency(netItbisBeforeWithholdings)}`
                                        : "Despues de creditos aplicados"}
                            </p>
                        </div>
                        <div className="premium-card rounded-xl border border-orange-100 bg-orange-50/40 p-5 shadow-sm dark:border-orange-900/50 dark:bg-orange-950/20">
                            <p className="font-mono text-[10px] font-black uppercase tracking-widest text-orange-700 dark:text-orange-300">ISR estimado</p>
                            <p className="mt-3 break-words font-mono text-2xl font-black text-slate-950 dark:text-white">RD$ {formatCurrency(estimatedISR)}</p>
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{incomeTaxEstimate.helper}</p>
                            {(salesIsrWithheld > 0 || remainingISRDue > 0) && (
                                <p className="mt-1 text-xs font-bold text-amber-600 dark:text-amber-300">
                                    Retenido RD$ {formatCurrency(salesIsrWithheld)} | Pendiente RD$ {formatCurrency(remainingISRDue)}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="premium-card rounded-xl border border-slate-900 bg-slate-900 p-6 text-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
                            <p className="font-mono text-[10px] font-black uppercase tracking-widest text-slate-400">Caja actual despues de impuestos</p>
                            <p className={`mt-4 break-words font-mono text-4xl font-light ${estimatedCashAfterTaxes >= 0 ? "text-white" : "text-red-300"}`}>
                                RD$ {formatCurrency(estimatedCashAfterTaxes)}
                            </p>
                            <p className="mt-4 text-sm leading-relaxed text-slate-300">
                                Efectivo recibido menos pagos realizados e impuestos pendientes.
                            </p>
                        </div>
                        <div className="premium-card rounded-xl border border-blue-100 bg-blue-50/60 p-4 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20">
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="text-slate-600 dark:text-slate-400">Base para ISR</span>
                                <span className="font-mono font-black text-slate-950 dark:text-white">RD$ {formatCurrency(taxableProfitBeforeISR)}</span>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                                <span className="text-slate-600 dark:text-slate-400">ITBIS retenido</span>
                                <span className="font-mono font-black text-amber-600">RD$ {formatCurrency(salesItbisWithheld)}</span>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                                <span className="text-slate-600 dark:text-slate-400">ISR pendiente</span>
                                <span className="font-mono font-black text-slate-950 dark:text-white">RD$ {formatCurrency(remainingISRDue)}</span>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                                <span className="text-slate-600 dark:text-slate-400">Ganancia Real Est.</span>
                                <span className={`font-mono font-black ${estimatedNetProfit >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>
                                    RD$ {formatCurrency(estimatedNetProfit)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Charts Section */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <Card className="premium-card border-slate-200 shadow-sm dark:border-slate-800">
                    <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between p-4 dark:border-slate-800">
                        <CardTitle className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                            <span className="material-icons-outlined">bar_chart</span>
                            Presupuesto vs Real
                        </CardTitle>
                        <span className={`hidden rounded-full px-2 py-1 text-[10px] font-black uppercase sm:inline-flex ${incomeDeviation >= 0 ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"}`}>
                            Ingresos {incomeDeviation.toFixed(1)}%
                        </span>
                    </CardHeader>
                    <CardContent className="h-[260px] p-3 sm:p-4 md:h-[360px] md:p-6 [--chart-axis:#64748b] [--chart-grid:#e2e8f0] dark:[--chart-axis:#94a3b8] dark:[--chart-grid:#243244]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 4, left: -22, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                                <XAxis dataKey="name" fontSize={11} stroke="var(--chart-axis)" axisLine={false} tickLine={false} />
                                <YAxis fontSize={11} stroke="var(--chart-axis)" axisLine={false} tickLine={false} tickFormatter={(value) => `$${value / 1000}k`} width={46} />
                                <Tooltip
                                    contentStyle={chartTooltipStyle}
                                    labelStyle={{ color: "var(--card-foreground)", fontWeight: 700 }}
                                    formatter={(value: any) => [`RD$ ${formatCurrency(value)}`, undefined]}
                                />
                                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconSize={9} />
                                <Bar dataKey="Ingresos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Costos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="premium-card border-slate-200 shadow-sm dark:border-slate-800">
                    <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
                        <CardTitle className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                            <span className="material-icons-outlined">pie_chart</span>
                            Composición
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[260px] p-3 sm:p-4 md:h-[360px] md:p-6">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={summaryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius="48%"
                                    outerRadius="70%"
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {summaryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={chartTooltipStyle}
                                    labelStyle={{ color: "var(--card-foreground)", fontWeight: 700 }}
                                    formatter={(value: any) => `RD$ ${formatCurrency(value)}`}
                                />
                                <Legend verticalAlign="bottom" height={34} wrapperStyle={{ fontSize: 11 }} iconSize={9} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Timeline / Transactions Table */}
            <div className="grid grid-cols-1 gap-6">
                <Card className="premium-card overflow-hidden border-slate-200 shadow-sm dark:border-slate-800">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
                        <CardTitle className="flex items-center gap-2 text-2xl font-black text-slate-950 dark:text-white">
                            <span className="material-icons-outlined text-[24px] text-blue-700 dark:text-blue-300">list_alt</span>
                            Transacciones Asociadas
                        </CardTitle>
                        <span className="hidden text-sm text-slate-500 dark:text-slate-400 sm:inline-flex">
                            Mostrando {transactions.length} {transactions.length === 1 ? "resultado" : "resultados"}
                        </span>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="space-y-3 p-4 md:hidden">
                            {transactions.map((doc: any) => {
                                const isSale = doc.docType === "Venta";
                                const pendingAmount = Math.max(0, doc.total - doc.paidAmount);

                                return (
                                    <article
                                        key={`${doc.docType}-${doc.id}`}
                                        className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:active:bg-slate-800"
                                        tabIndex={0}
                                        onClick={() => router.push(doc.detailHref)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                router.push(doc.detailHref);
                                            }
                                        }}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isSale ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300" : "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300"}`}>
                                                        <span className="material-icons-outlined text-[20px]">{isSale ? "receipt_long" : "shopping_cart"}</span>
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                                            {new Date(doc.date).toLocaleDateString("es-DO", { day: "2-digit", month: "short" })}
                                                        </p>
                                                        <p className="mt-0.5 truncate text-sm font-black text-slate-900 dark:text-white">
                                                            {doc.number || doc.ncf || "S/N"}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${isSale ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300" : "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300"}`}>
                                                    {doc.docType}
                                                </span>
                                                <p className="mt-2 font-mono text-sm font-black text-slate-900 dark:text-white">RD$ {formatCurrency(doc.total)}</p>
                                            </div>
                                        </div>

                                        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                                            <div>
                                                <p className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500">{isSale ? "Liquidado" : "Pagado"}</p>
                                                <p className="mt-1 font-mono text-xs font-bold text-emerald-600">RD$ {formatCurrency(doc.paidAmount)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500">Pendiente</p>
                                                <p className="mt-1 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">RD$ {formatCurrency(pendingAmount)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500">Estado</p>
                                                <p className={`mt-1 w-fit rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${doc.status === "PAID" ? "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"}`}>
                                                    {doc.status}
                                                </p>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                            {transactions.length === 0 && (
                                <div className="p-8 text-center">
                                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No hay transacciones asociadas.</p>
                                </div>
                            )}
                        </div>

                        <div className="hidden md:block">
                        <Table>
                            <TableHeader className="bg-blue-50/80 dark:bg-slate-800/70">
                                <TableRow>
                                    <TableHead className="text-[10px] uppercase font-bold">Fecha</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold">Tipo</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold">Documento</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold text-right">Monto</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold text-right">Liquidado/Pagado</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold text-center">Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.map((doc: any) => (
                                    <TableRow
                                        key={`${doc.docType}-${doc.id}`}
                                        className="cursor-pointer hover:bg-slate-50 transition-colors group dark:hover:bg-slate-800/50"
                                        tabIndex={0}
                                        onClick={() => router.push(doc.detailHref)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                router.push(doc.detailHref);
                                            }
                                        }}
                                    >
                                        <TableCell className="text-xs text-slate-500 dark:text-slate-400">
                                            {new Date(doc.date).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })}
                                        </TableCell>
                                        <TableCell>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${doc.docType === 'Venta' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300' : 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-300'}`}>
                                                {doc.docType}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                            <span className="inline-flex items-center gap-1 group-hover:text-blue-600">
                                                {doc.number || doc.ncf || "S/N"}
                                                <span className="material-icons-outlined text-[14px] opacity-0 transition-opacity group-hover:opacity-100">open_in_new</span>
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-xs font-mono text-right font-medium text-slate-800 dark:text-slate-200">
                                            RD$ {formatCurrency(doc.total)}
                                        </TableCell>
                                        <TableCell className="text-xs font-mono text-right text-slate-500 dark:text-slate-400">
                                            RD$ {formatCurrency(doc.paidAmount)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${doc.status === 'PAID' ? 'text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-300' : 'text-slate-500 bg-slate-50 dark:bg-slate-800 dark:text-slate-300'}`}>
                                                {doc.status}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {project.invoices.length === 0 && project.purchases.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-10 text-slate-400 text-sm italic">
                                            No hay transacciones asociadas a este proyecto.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
