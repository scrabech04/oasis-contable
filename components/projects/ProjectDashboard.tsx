"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { Project, Invoice, Purchase, Contact, InvoiceItem, PurchaseItem, Payment } from "@prisma/client";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useRouter } from "next/navigation";

interface ProjectDashboardProps {
    project: Project & {
        contact: Contact;
        invoices: (Invoice & { items: InvoiceItem[], payments: Payment[] })[];
        purchases: (Purchase & { items: PurchaseItem[], payments: Payment[] })[];
    };
    taxSettings?: {
        incomeTaxRegime?: string | null;
        incomeTaxRate?: number | null;
    };
}

function calculateIndividualProgressiveISR(annualTaxableIncome: number) {
    const income = Math.max(0, annualTaxableIncome);
    if (income <= 416220) return 0;
    if (income <= 624329) return (income - 416220.01) * 0.15;
    if (income <= 867123) return 31216 + (income - 624329.01) * 0.2;
    return 79776 + (income - 867123.01) * 0.25;
}

function resolveIncomeTax(taxableProfit: number, taxSettings?: ProjectDashboardProps["taxSettings"]) {
    const regime = taxSettings?.incomeTaxRegime || "LEGAL_ENTITY";
    const configuredRate = Number.isFinite(Number(taxSettings?.incomeTaxRate)) ? Number(taxSettings?.incomeTaxRate) : 0.27;

    if (regime === "PERSON_PROGRESSIVE") {
        return {
            amount: calculateIndividualProgressiveISR(taxableProfit),
            label: "ISR PF progresivo",
            helper: "Escala anual persona fisica",
        };
    }

    const rate = Math.min(1, Math.max(0, configuredRate));
    return {
        amount: Math.max(0, taxableProfit) * rate,
        label: regime === "CUSTOM" ? `ISR ref. ${(rate * 100).toFixed(2).replace(/\.00$/, "")}%` : `ISR PJ ${(rate * 100).toFixed(0)}%`,
        helper: regime === "CUSTOM" ? "Tasa personalizada del perfil" : "Persona juridica",
    };
}

export function ProjectDashboard({ project, taxSettings }: ProjectDashboardProps) {
    const router = useRouter();
    // Financial Calculations
    const totalInvoiced = project.invoices.reduce((sum: number, inv: any) => sum + inv.total, 0);
    const totalSalesBase = project.invoices.reduce((sum: number, inv: any) => sum + inv.subtotal, 0);
    const totalSalesItbis = project.invoices.reduce((sum: number, inv: any) => sum + inv.tax, 0);
    const totalCollected = project.invoices.reduce((sum: number, inv: any) => {
        // paidAmount now includes withholdings from the backend fix
        return sum + inv.paidAmount;
    }, 0);

    const totalWithholdings = project.invoices.reduce((sum: number, inv: any) => {
        const invWithholdings = inv.payments?.reduce((pSum: number, p: any) => {
            return pSum + (p.withholdings?.reduce((wSum: number, w: any) => wSum + w.amount, 0) || 0);
        }, 0) || 0;
        return sum + invWithholdings;
    }, 0);

    const actualCashCollected = totalCollected - totalWithholdings;
    const totalCosts = project.purchases.reduce((sum: number, pur: any) => sum + pur.total, 0);
    const creditableItbis = project.purchases.reduce((sum: number, pur: any) => {
        const canUseAsCredit = pur.hasFiscalCredit && pur.report606 !== false && pur.taxTreatment === "LOCAL_CREDIT";
        return sum + (canUseAsCredit ? pur.tax : 0);
    }, 0);
    const deductibleCosts = project.purchases.reduce((sum: number, pur: any) => {
        if (pur.affectsISR === false) return sum;
        const taxIsCredit = pur.hasFiscalCredit && pur.report606 !== false && pur.taxTreatment === "LOCAL_CREDIT";
        return sum + (taxIsCredit ? pur.subtotal : pur.total);
    }, 0);
    const netItbisDue = Math.max(0, totalSalesItbis - creditableItbis);
    const itbisCreditBalance = Math.max(0, creditableItbis - totalSalesItbis);
    const taxableProfitBeforeISR = totalSalesBase - deductibleCosts;
    const incomeTaxEstimate = resolveIncomeTax(taxableProfitBeforeISR, taxSettings);
    const estimatedISR = incomeTaxEstimate.amount;
    const estimatedNetProfit = taxableProfitBeforeISR - estimatedISR;
    const estimatedCashAfterTaxes = totalInvoiced - totalCosts - netItbisDue - estimatedISR;

    const grossProfit = totalInvoiced - totalCosts;
    const netProfit = actualCashCollected - totalCosts; // Based on cash flow (collected cash - total costs incurred)
    const margin = totalInvoiced > 0 ? (grossProfit / totalInvoiced) * 100 : 0;

    const budgetIncome = project.budgetIncome || 0;
    const budgetCost = project.budgetCost || 0;

    const incomeDeviation = budgetIncome > 0 ? ((totalInvoiced - budgetIncome) / budgetIncome) * 100 : 0;
    const costDeviation = budgetCost > 0 ? ((totalCosts - budgetCost) / budgetCost) * 100 : 0;

    // Chart Data
    const summaryData = [
        { name: "Facturado", value: totalInvoiced },
        { name: "Costos", value: totalCosts },
    ];

    const chartData = [
        { name: "Presupuesto", Ingresos: budgetIncome, Costos: budgetCost },
        { name: "Real", Ingresos: totalInvoiced, Costos: totalCosts },
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
        <div className="space-y-6">
            {/* Project Header Summary */}
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-card p-4 text-card-foreground shadow-sm dark:border-slate-800 md:flex-row md:items-center md:p-6">
                <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2 md:gap-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{project.code}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${getStatusColor(project.status)}`}>
                            {project.status}
                        </span>
                    </div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white md:text-2xl">{project.name}</h1>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <span className="material-icons-outlined text-sm">person</span>
                        {project.contact?.name || "Sin contacto"}
                    </p>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/60">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Margen Bruto</span>
                        <span className={`text-lg font-bold font-mono ${margin >= 20 ? 'text-green-600' : margin > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                            {margin.toFixed(1)}%
                        </span>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/60">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Desvio Costos</span>
                        <span className={`text-lg font-bold font-mono ${costDeviation <= 0 ? "text-green-600" : "text-orange-500"}`}>
                            {costDeviation.toFixed(1)}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <Card className="min-w-0 shadow-none border-slate-200 transition-colors hover:border-blue-200 dark:border-slate-800 dark:hover:border-blue-900/60">
                    <CardContent className="p-4 md:p-5">
                        <div className="flex items-center gap-2 mb-3 text-blue-500">
                            <span className="material-icons-outlined text-[18px]">account_balance_wallet</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Total Facturado</span>
                        </div>
                        <div className="break-words text-[13px] font-bold text-slate-900 font-mono dark:text-white sm:text-base md:text-2xl">RD$ {formatCurrency(totalInvoiced)}</div>
                        <div className="mt-2 space-y-1 text-[10px] text-slate-500 dark:text-slate-400">
                            <div>Total Cobrado: <span className="font-bold text-blue-600">RD$ {formatCurrency(totalCollected)}</span></div>
                            <div className="flex justify-between">
                                <span>- En Efectivo:</span>
                                <span className="font-medium">RD$ {formatCurrency(actualCashCollected)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>- Retenciones:</span>
                                <span className="font-medium text-amber-600">RD$ {formatCurrency(totalWithholdings)}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="min-w-0 shadow-none border-slate-200 transition-colors hover:border-red-200 dark:border-slate-800 dark:hover:border-red-900/60">
                    <CardContent className="p-4 md:p-5">
                        <div className="flex items-center gap-2 mb-3 text-red-500">
                            <span className="material-icons-outlined text-[18px]">shopping_cart</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Costos Totales</span>
                        </div>
                        <div className="break-words text-[13px] font-bold text-slate-900 font-mono dark:text-white sm:text-base md:text-2xl">RD$ {formatCurrency(totalCosts)}</div>
                        <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                            Presupuesto: <span className="font-bold text-slate-700 dark:text-slate-200">RD$ {formatCurrency(budgetCost)}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="min-w-0 shadow-none border-slate-200 transition-colors hover:border-green-200 dark:border-slate-800 dark:hover:border-green-900/60">
                    <CardContent className="p-4 md:p-5">
                        <div className="flex items-center gap-2 mb-3 text-green-500">
                            <span className="material-icons-outlined text-[18px]">trending_up</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Ganancia Bruta</span>
                        </div>
                        <div className={`break-words text-[13px] font-bold font-mono sm:text-base md:text-2xl ${grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                            RD$ {formatCurrency(grossProfit)}
                        </div>
                        <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                            Sobre lo facturado
                        </div>
                    </CardContent>
                </Card>

                <Card className="min-w-0 shadow-none border-slate-200 transition-colors hover:border-indigo-200 dark:border-slate-800 dark:hover:border-indigo-900/60">
                    <CardContent className="p-4 md:p-5">
                        <div className="flex items-center gap-2 mb-3 text-indigo-500">
                            <span className="material-icons-outlined text-[18px]">payments</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Flujo de Caja</span>
                        </div>
                        <div className={`break-words text-[13px] font-bold font-mono sm:text-base md:text-2xl ${netProfit >= 0 ? "text-indigo-600" : "text-red-600"}`}>
                            RD$ {formatCurrency(netProfit)}
                        </div>
                        <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                            Efectivo - Gastos
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Project Fiscal Estimate */}
            <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-slate-800">
                <CardHeader className="border-b border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                            <span className="material-icons-outlined text-[20px] text-blue-600 dark:text-blue-300">request_quote</span>
                            Estimacion fiscal del proyecto
                        </CardTitle>
                        <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                            {incomeTaxEstimate.label}
                        </span>
                    </div>
                </CardHeader>
                <CardContent className="p-4 md:p-5">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                            <p className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">ITBIS cobrado</p>
                            <p className="mt-2 break-words font-mono text-lg font-black text-slate-950 dark:text-white">RD$ {formatCurrency(totalSalesItbis)}</p>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Facturas de venta</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">ITBIS acreditable</p>
                            <p className="mt-2 break-words font-mono text-lg font-black text-slate-950 dark:text-white">RD$ {formatCurrency(creditableItbis)}</p>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Compras con credito fiscal</p>
                        </div>
                        <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4 dark:border-orange-900/50 dark:bg-orange-950/20">
                            <p className="text-[10px] font-black uppercase tracking-wider text-orange-700 dark:text-orange-300">ITBIS neto a pagar</p>
                            <p className="mt-2 break-words font-mono text-lg font-black text-orange-600 dark:text-orange-300">RD$ {formatCurrency(netItbisDue)}</p>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {itbisCreditBalance > 0 ? `Credito a favor RD$ ${formatCurrency(itbisCreditBalance)}` : "Despues de creditos"}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
                            <p className="text-[10px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-300">ISR estimado</p>
                            <p className="mt-2 break-words font-mono text-lg font-black text-violet-600 dark:text-violet-300">RD$ {formatCurrency(estimatedISR)}</p>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{incomeTaxEstimate.helper}</p>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Base para ISR</p>
                            <div className="mt-3 space-y-2 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-slate-500 dark:text-slate-400">Ingresos sin ITBIS</span>
                                    <span className="font-mono font-bold text-slate-900 dark:text-white">RD$ {formatCurrency(totalSalesBase)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-slate-500 dark:text-slate-400">Costos deducibles</span>
                                    <span className="font-mono font-bold text-slate-900 dark:text-white">RD$ {formatCurrency(deductibleCosts)}</span>
                                </div>
                                <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-black text-slate-700 dark:text-slate-200">Utilidad fiscal</span>
                                        <span className={`font-mono font-black ${taxableProfitBeforeISR >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>
                                            RD$ {formatCurrency(taxableProfitBeforeISR)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Ganancia real estimada</p>
                            <p className={`mt-3 break-words font-mono text-2xl font-black ${estimatedNetProfit >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>
                                RD$ {formatCurrency(estimatedNetProfit)}
                            </p>
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                Utilidad fiscal menos ISR estimado.
                            </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
                            <p className="text-[10px] font-black uppercase tracking-wider text-blue-200">Caja despues de impuestos</p>
                            <p className={`mt-3 break-words font-mono text-2xl font-black ${estimatedCashAfterTaxes >= 0 ? "text-blue-200" : "text-red-300"}`}>
                                RD$ {formatCurrency(estimatedCashAfterTaxes)}
                            </p>
                            <p className="mt-2 text-xs text-slate-300">
                                Total facturado menos compras, ITBIS neto e ISR.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Charts Section */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
                <Card className="lg:col-span-2 shadow-sm border-slate-200 dark:border-slate-800">
                    <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between p-4 dark:border-slate-800">
                        <CardTitle className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                            <span className="material-icons-outlined">bar_chart</span>
                            Presupuesto vs Real
                        </CardTitle>
                        <span className={`hidden rounded-full px-2 py-1 text-[10px] font-black uppercase sm:inline-flex ${incomeDeviation >= 0 ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"}`}>
                            Ingresos {incomeDeviation.toFixed(1)}%
                        </span>
                    </CardHeader>
                    <CardContent className="h-[230px] p-3 sm:p-4 md:h-[300px] md:p-6 [--chart-axis:#64748b] [--chart-grid:#e2e8f0] dark:[--chart-axis:#94a3b8] dark:[--chart-grid:#243244]">
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

                <Card className="shadow-sm border-slate-200 dark:border-slate-800">
                    <CardHeader className="border-b border-slate-100 p-4 dark:border-slate-800">
                        <CardTitle className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                            <span className="material-icons-outlined">pie_chart</span>
                            Composición
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[240px] p-3 sm:p-4 md:h-[300px] md:p-6">
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
                <Card className="shadow-sm border-slate-200 dark:border-slate-800">
                    <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between p-4 dark:border-slate-800">
                        <CardTitle className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                            <span className="material-icons-outlined">list_alt</span>
                            Transacciones Asociadas
                        </CardTitle>
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
                                                <p className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500">{isSale ? "Cobrado" : "Pagado"}</p>
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
                            <TableHeader className="bg-slate-50/50 dark:bg-slate-800/50">
                                <TableRow>
                                    <TableHead className="text-[10px] uppercase font-bold">Fecha</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold">Tipo</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold">Documento</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold text-right">Monto</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold text-right">Cobrado/Pagado</TableHead>
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
