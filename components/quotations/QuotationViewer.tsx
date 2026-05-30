"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import clsx from "clsx";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface QuotationViewerProps {
    quotation: any;
    identities?: any[];
    companySettings?: any;
}

export function QuotationViewer({ quotation, identities = [], companySettings }: QuotationViewerProps) {
    const defaultIdentity = identities.find(id => id.isDefault) || identities[0];
    const [selectedIdentityId, setSelectedIdentityId] = useState<string>(defaultIdentity?.id?.toString() || "");
    const [currency, setCurrency] = useState<'DOP' | 'USD'>('DOP');
    const [exchangeRate, setExchangeRate] = useState<number>(60.50);

    const selectedIdentity = identities.find(id => id.id.toString() === selectedIdentityId);

    // Fallback chain: selected identity → CompanySettings → hardcoded defaults
    const companyName = selectedIdentity?.name || companySettings?.name || "Tu Empresa S.R.L.";
    const companyTaxId = selectedIdentity?.taxId || companySettings?.taxId || "131-XXXXX-X";
    const companyEmail = selectedIdentity?.email || companySettings?.email;
    const companyPhone = selectedIdentity?.phone || companySettings?.phone;
    const companyAddress = selectedIdentity?.address || companySettings?.address;

    const convertAmount = (amount: number) => {
        if (currency === 'USD') {
            return amount / exchangeRate;
        }
        return amount;
    };

    const currencyPrefix = currency === 'DOP' ? 'RD$' : 'US$';

    return (
        <div className="space-y-6">
            {/* Controls (Hidden on Print) */}
            <div className="no-print bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                    {/* Identity Selection */}
                    {identities.length > 0 && (
                        <div className="flex items-center gap-3">
                            <Label htmlFor="identity-select" className="text-sm font-bold text-slate-700 dark:text-slate-300">Identidad:</Label>
                            <Select value={selectedIdentityId} onValueChange={setSelectedIdentityId}>
                                <SelectTrigger id="identity-select" className="w-[200px] h-9">
                                    <SelectValue placeholder="Seleccionar Identidad" />
                                </SelectTrigger>
                                <SelectContent>
                                    {identities.map((id) => (
                                        <SelectItem key={id.id} value={id.id.toString()}>
                                            {id.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="flex items-center space-x-2">
                        <Label htmlFor="currency-mode" className="text-sm font-bold text-slate-700 dark:text-slate-300">RD$</Label>
                        <Switch
                            id="currency-mode"
                            checked={currency === 'USD'}
                            onCheckedChange={(checked) => setCurrency(checked ? 'USD' : 'DOP')}
                        />
                        <Label htmlFor="currency-mode" className="text-sm font-bold text-slate-700 dark:text-slate-300">US$</Label>
                    </div>
                </div>

                {currency === 'USD' && (
                    <div className="flex items-center gap-3">
                        <Label htmlFor="exchange-rate" className="text-sm text-slate-500 whitespace-nowrap">Tasa de Cambio:</Label>
                        <div className="relative w-32">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">RD$</span>
                            <Input
                                id="exchange-rate"
                                type="number"
                                step="0.01"
                                value={exchangeRate}
                                onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 1)}
                                className="pl-9 h-9 text-sm font-mono"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Quotation Design */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden ring-1 ring-slate-200/50 print:overflow-visible print:shadow-none print:border-none print:ring-0 print:rounded-none">
                <div className="h-2 bg-gradient-to-r from-slate-700 to-slate-900" />

                <div className="p-8 md:p-12">
                    {/* Top Section */}
                    <div className="flex flex-col md:flex-row justify-between gap-8 mb-6">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="material-icons-round text-3xl text-slate-800">request_quote</span>
                                <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                                    oFlow<span className="ml-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">by Oasis</span>
                                </span>
                            </div>
                            {selectedIdentity?.logoUrl && (
                                <div>
                                    <img src={selectedIdentity.logoUrl} alt={companyName} className="h-16 object-contain" />
                                </div>
                            )}
                            <div className="text-sm text-slate-500 space-y-1">
                                <p className="font-bold text-slate-700 dark:text-slate-300">{companyName}</p>
                                <p>RNC: {companyTaxId}</p>
                                {companyAddress && <p className="text-xs">{companyAddress}</p>}
                                <div className="flex gap-4 text-[10px]">
                                    {companyEmail && <span>{companyEmail}</span>}
                                    {companyPhone && <span>{companyPhone}</span>}
                                </div>
                            </div>
                        </div>

                        <div className="text-right space-y-2">
                            <h2 className="text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tighter italic opacity-10 leading-none mb-4">Cotización</h2>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Número</p>
                                <p className="text-lg font-bold text-slate-900 dark:text-white">{quotation.number}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha</p>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{formatDate(quotation.date)}</p>
                            </div>
                        </div>
                    </div>

                    <hr className="border-slate-100 dark:border-slate-800 mb-6" />

                    {/* Client Info */}
                    <div className="mb-12">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Preparado para:</p>
                        <div className="space-y-1">
                            <p className="text-lg font-bold text-slate-900 dark:text-white">{quotation.contact?.name ?? "Sin cliente"}</p>
                            {quotation.contact?.taxId && <p className="text-sm text-slate-500">RNC/Cédula: {quotation.contact.taxId}</p>}
                            {quotation.contact?.email && <p className="text-sm text-slate-500">{quotation.contact.email}</p>}
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="mb-12 overflow-hidden border border-slate-100 dark:border-slate-800 rounded-xl">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                    <th className="px-4 py-3 print:px-2 print:py-1 text-center w-8 print:w-auto">#</th>
                                    <th className="px-4 py-3 print:px-2 print:py-1">Descripción</th>
                                    <th className="px-4 py-3 print:px-2 print:py-1 text-center w-16 print:w-auto">Cant.</th>
                                    <th className="px-4 py-3 print:px-2 print:py-1 text-right w-24 print:w-auto">Precio</th>
                                    <th className="px-4 py-3 print:px-2 print:py-1 text-center w-16 print:w-auto">ITBIS %</th>
                                    <th className="px-4 py-3 print:px-2 print:py-1 text-right w-28 print:w-auto">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                {quotation.items.map((item: any, index: number) => {
                                    const itemNumber = quotation.items.slice(0, index).filter((i: any) => i.itemType === "ITEM").length + 1;
                                    return (
                                        <tr key={item.id || index} className={clsx(
                                            "text-sm",
                                            {
                                                "bg-slate-50/30 dark:bg-slate-800/20": item.itemType === "HEADING",
                                                "font-medium": item.itemType === "SUBHEADING"
                                            }
                                        )}>
                                            <td className="px-4 py-3 print:px-2 print:py-1.5 text-center text-slate-400 font-mono text-xs italic">
                                                {item.itemType === "ITEM" ? itemNumber : ""}
                                            </td>
                                            <td className="px-4 py-3 print:px-2 print:py-1.5">
                                                <div className={clsx(
                                                    {
                                                        "text-base font-bold text-slate-900 dark:text-white tracking-tight print:text-sm": item.itemType === "HEADING",
                                                        "text-sm font-semibold text-slate-700 dark:text-slate-300 pl-4 print:text-xs": item.itemType === "SUBHEADING",
                                                        "text-slate-600 dark:text-slate-400 print:text-xs": item.itemType === "ITEM"
                                                    }
                                                )}>
                                                    {item.description}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 print:px-2 print:py-1.5 text-center text-slate-500 print:text-xs">
                                                {item.itemType === "ITEM" ? item.quantity : ""}
                                            </td>
                                            <td className="px-4 py-3 print:px-2 print:py-1.5 text-right text-slate-500 font-mono print:text-xs">
                                                {item.itemType === "ITEM" ? `${currencyPrefix} ${formatCurrency(convertAmount(item.price))}` : ""}
                                            </td>
                                            <td className="px-4 py-3 print:px-2 print:py-1.5 text-center text-slate-500 font-mono print:text-xs">
                                                {item.itemType === "ITEM" ? `${item.taxRate}%` : ""}
                                            </td>
                                            <td className="px-4 py-3 print:px-2 print:py-1.5 text-right font-bold text-slate-900 dark:text-white font-mono print:text-xs">
                                                {item.itemType === "ITEM" ? `${currencyPrefix} ${formatCurrency(convertAmount(item.total))}` : ""}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Totals Section */}
                    <div className="flex flex-col md:flex-row justify-between gap-12 pt-8">
                        <div className="max-w-md space-y-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 font-mono">Términos y Condiciones</p>
                                <p className="text-xs text-slate-500 leading-relaxed italic">
                                    {quotation.notes || "Esta cotización tiene una validez de 30 días. Los precios están sujetos a cambios sin previo aviso."}
                                </p>
                                {currency === 'USD' && (
                                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-2">
                                        Nota: Los montos han sido calculados en dólares estadounidenses (USD) a una tasa de cambio de RD${exchangeRate.toFixed(2)}.
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="space-y-3 md:w-64">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Subtotal</span>
                                <span className="font-medium text-slate-700 dark:text-slate-300 font-mono">{currencyPrefix} {formatCurrency(convertAmount(quotation.subtotal))}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Impuestos</span>
                                <span className="font-medium text-slate-700 dark:text-slate-300 font-mono">{currencyPrefix} {formatCurrency(convertAmount(quotation.tax))}</span>
                            </div>
                            <div className="flex justify-between items-center pt-4 border-t-2 border-slate-900 dark:border-white">
                                <span className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Total</span>
                                <span className="text-2xl font-black text-slate-900 dark:text-white font-mono italic">{currencyPrefix} {formatCurrency(convertAmount(quotation.total))}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Banner */}
                <div className="bg-slate-900 p-8 text-center space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">¡Gracias por confiar en nosotros!</p>
                </div>
            </div>
        </div>
    );
}
