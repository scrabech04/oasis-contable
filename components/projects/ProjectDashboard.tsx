"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { Project, Invoice, Purchase, Contact, InvoiceItem, PurchaseItem, Payment } from "@prisma/client";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

interface ProjectDashboardProps {
    project: Project & {
        contact: Contact;
        invoices: (Invoice & { items: InvoiceItem[], payments: Payment[] })[];
        purchases: (Purchase & { items: PurchaseItem[], payments: Payment[] })[];
    };
}

export function ProjectDashboard({ project }: ProjectDashboardProps) {
    // Financial Calculations
    const totalInvoiced = project.invoices.reduce((sum: number, inv: any) => sum + inv.total, 0);
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

    const getStatusColor = (status: string) => {
        switch (status) {
            case "ACTIVE": return "text-green-600 bg-green-50";
            case "PROPOSAL": return "text-blue-600 bg-blue-50";
            case "ON_HOLD": return "text-orange-600 bg-orange-50";
            case "COMPLETED": return "text-slate-600 bg-slate-100";
            case "CANCELLED": return "text-red-600 bg-red-50";
            default: return "text-slate-600 bg-slate-50";
        }
    };

    return (
        <div className="space-y-6">
            {/* Project Header Summary */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{project.code}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${getStatusColor(project.status)}`}>
                            {project.status}
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800">{project.name}</h1>
                    <p className="text-slate-500 text-sm flex items-center gap-2">
                        <span className="material-icons-outlined text-sm">person</span>
                        {project.contact?.name || "Sin contacto"}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <div className="px-4 py-2 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Margen Bruto</span>
                        <span className={`text-lg font-bold font-mono ${margin >= 20 ? 'text-green-600' : margin > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                            {margin.toFixed(1)}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="shadow-none border-slate-200 hover:border-blue-200 transition-colors">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-3 text-blue-500">
                            <span className="material-icons-outlined text-[18px]">account_balance_wallet</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Total Facturado</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-800 font-mono">RD$ {formatCurrency(totalInvoiced)}</div>
                        <div className="mt-2 text-[10px] text-slate-500 space-y-1">
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

                <Card className="shadow-none border-slate-200 hover:border-red-200 transition-colors">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-3 text-red-500">
                            <span className="material-icons-outlined text-[18px]">shopping_cart</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Costos Totales</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-800 font-mono">RD$ {formatCurrency(totalCosts)}</div>
                        <div className="mt-2 text-[10px] text-slate-500">
                            Presupuesto: <span className="font-bold text-slate-700">RD$ {formatCurrency(budgetCost)}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-none border-slate-200 hover:border-green-200 transition-colors">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-3 text-green-500">
                            <span className="material-icons-outlined text-[18px]">trending_up</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Ganancia Bruta</span>
                        </div>
                        <div className={`text-2xl font-bold font-mono ${grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                            RD$ {formatCurrency(grossProfit)}
                        </div>
                        <div className="mt-2 text-[10px] text-slate-500">
                            Sobre lo facturado
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-none border-slate-200 hover:border-indigo-200 transition-colors">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-3 text-indigo-500">
                            <span className="material-icons-outlined text-[18px]">payments</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Flujo de Caja</span>
                        </div>
                        <div className={`text-2xl font-bold font-mono ${netProfit >= 0 ? "text-indigo-600" : "text-red-600"}`}>
                            RD$ {formatCurrency(netProfit)}
                        </div>
                        <div className="mt-2 text-[10px] text-slate-500">
                            Efectivo - Gastos
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 shadow-sm border-slate-200">
                    <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between py-4">
                        <CardTitle className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                            <span className="material-icons-outlined">bar_chart</span>
                            Presupuesto vs Real
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" fontSize={12} stroke="#64748b" axisLine={false} tickLine={false} />
                                <YAxis fontSize={12} stroke="#64748b" axisLine={false} tickLine={false} tickFormatter={(value) => `$${value / 1000}k`} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value: any) => [`RD$ ${formatCurrency(value)}`, undefined]}
                                />
                                <Legend />
                                <Bar dataKey="Ingresos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Costos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200">
                    <CardHeader className="border-b border-slate-100 py-4">
                        <CardTitle className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                            <span className="material-icons-outlined">pie_chart</span>
                            Composición
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={summaryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {summaryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: any) => `RD$ ${formatCurrency(value)}`} />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Timeline / Transactions Table */}
            <div className="grid grid-cols-1 gap-6">
                <Card className="shadow-sm border-slate-200">
                    <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between py-4">
                        <CardTitle className="text-sm font-bold uppercase text-slate-500 flex items-center gap-2">
                            <span className="material-icons-outlined">list_alt</span>
                            Transacciones Asociadas
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader className="bg-slate-50/50">
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
                                {[
                                    ...project.invoices.map((inv: any) => ({ ...inv, docType: "Venta" })),
                                    ...project.purchases.map((pur: any) => ({ ...pur, docType: "Compra" }))
                                ].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((doc: any, idx) => (
                                    <TableRow key={idx} className="hover:bg-slate-50 transition-colors">
                                        <TableCell className="text-xs text-slate-500">
                                            {new Date(doc.date).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })}
                                        </TableCell>
                                        <TableCell>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${doc.docType === 'Venta' ? 'text-blue-600 bg-blue-50' : 'text-orange-600 bg-orange-50'}`}>
                                                {doc.docType}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-xs font-medium text-slate-700">
                                            {doc.number || doc.ncf || "S/N"}
                                        </TableCell>
                                        <TableCell className="text-xs font-mono text-right font-medium">
                                            RD$ {formatCurrency(doc.total)}
                                        </TableCell>
                                        <TableCell className="text-xs font-mono text-right text-slate-500">
                                            RD$ {formatCurrency(doc.paidAmount)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${doc.status === 'PAID' ? 'text-green-600 bg-green-50' : 'text-slate-500 bg-slate-50'}`}>
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
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
