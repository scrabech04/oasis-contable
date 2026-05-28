"use client";

import { useState } from "react";
import { Check, Trash2, Edit2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPurchase } from "@/app/actions";
import { formatCurrency } from "@/lib/format";

interface BatchReviewProps {
    invoices: any[];
    onComplete: () => void;
    onCancel: () => void;
}

export function BatchReview({ invoices: initialInvoices, onComplete, onCancel }: BatchReviewProps) {
    const [invoices, setInvoices] = useState(initialInvoices);
    const [isSaving, setIsSaving] = useState(false);

    const handleRemove = (index: number) => {
        setInvoices(invoices.filter((_, i) => i !== index));
    };

    const handleSaveAll = async () => {
        setIsSaving(true);
        try {
            for (const inv of invoices) {
                const formData = new FormData();
                formData.append("type", inv.type);
                formData.append("date", inv.date);
                formData.append("taxTreatment", inv.taxTreatment || (inv.type === "INFORMAL" ? "LOCAL_NO_CREDIT" : "LOCAL_CREDIT"));
                if (inv.attachment) {
                    formData.append("attachmentStoragePath", inv.attachment.storagePath || "");
                    formData.append("attachmentFileName", inv.attachment.fileName || "");
                    formData.append("attachmentMimeType", inv.attachment.mimeType || "");
                    formData.append("attachmentFileSize", String(inv.attachment.fileSize || 0));
                }

                if (inv.type === "FORMAL") {
                    formData.append("contactId", "manual");
                    formData.append("contactName", inv.supplierName || "");
                    formData.append("contactTaxId", inv.supplierTaxId || "");
                    formData.append("supplierName", inv.supplierName || "");
                    formData.append("supplierTaxId", inv.supplierTaxId || "");
                    formData.append("saveAsContact", "false");
                    formData.append("ncf", inv.ncf || "");
                    formData.append("dueDate", inv.dueDate || inv.date);
                    formData.append("costType", inv.costType || "02");

                    const mappedItems = inv.items.map((item: any) => {
                        const baseAmount = item.baseAmount || 0;
                        const taxAmount = item.taxAmount || 0;
                        const effectiveTaxRate = baseAmount > 0 ? (taxAmount / baseAmount) * 100 : 0;

                        return {
                            description: item.description,
                            quantity: item.quantity || 1,
                            price: baseAmount,
                            taxRate: effectiveTaxRate
                        };
                    });

                    formData.append("items", JSON.stringify(mappedItems));
                } else {
                    formData.append("contactId", "manual");
                    formData.append("contactName", inv.supplierName || "Gasto menor");
                    formData.append("contactTaxId", inv.supplierTaxId || "");
                    formData.append("description", inv.items?.[0]?.description || "Gasto Informal");
                    formData.append("amount", (inv.total || inv.items?.[0]?.baseAmount || 0).toString());
                    formData.append("category", inv.category || "Otros");
                    formData.append("costType", inv.costType || "09");
                    formData.append("items", JSON.stringify((inv.items || []).map((item: any) => ({
                        description: item.description || "Gasto Informal",
                        quantity: item.quantity || 1,
                        price: item.baseAmount || item.price || inv.total || 0,
                        taxRate: item.taxRate || 0,
                    }))));
                }

                const result = await createPurchase(formData);
                if (!result.success) {
                    throw new Error(result.error || "No fue posible guardar una factura de compra.");
                }
            }
            onComplete();
        } catch (error) {
            console.error("Error saving purchases:", error);
            const message = error instanceof Error ? error.message : "Error al guardar algunas facturas";
            alert(message);
        } finally {
            setIsSaving(false);
        }
    };

    if (invoices.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 min-h-[400px]">
                <div className="h-20 w-20 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center mb-6">
                    <span className="material-icons-round text-4xl opacity-20">inventory_2</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No hay facturas para revisar</h3>
                <p className="max-w-[300px] text-sm leading-relaxed mb-6">Sube nuevos documentos para que la IA los procese.</p>
                <Button onClick={onCancel} variant="outline" className="rounded-xl px-8">Volver</Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Revision por Lotes</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Se han detectado {invoices.length} {invoices.length === 1 ? 'factura' : 'facturas'}. Verifica los datos antes de guardar.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={onCancel} className="rounded-xl font-bold h-11 border-slate-200 dark:border-slate-800">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSaveAll}
                        disabled={isSaving}
                        className="rounded-xl bg-primary text-white font-bold h-11 px-8 shadow-sm shadow-primary/20"
                    >
                        {isSaving ? (
                            <>
                                <span className="material-icons-round animate-spin mr-2">sync</span>
                                Guardando...
                            </>
                        ) : (
                            <>
                                <span className="material-icons-round mr-2">done_all</span>
                                Guardar Todo
                            </>
                        )}
                    </Button>
                </div>
            </header>

            <div className="grid gap-6">
                {invoices.map((inv, index) => {
                    const total = inv.total || (inv.items?.reduce((acc: number, item: any) => acc + (item.baseAmount || 0) + (item.taxAmount || 0), 0)) || 0;
                    const tax = inv.items?.reduce((acc: number, item: any) => acc + (item.taxAmount || 0), 0) || 0;
                    const subtotal = inv.items?.reduce((acc: number, item: any) => acc + (item.baseAmount || 0), 0) || 0;

                    return (
                        <div key={index} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden group transition-all hover:border-primary/50">
                            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/20">
                                <div className="flex items-center gap-3">
                                    <span className={clsx(
                                        "text-[10px] font-black px-2 py-0.5 rounded-md border uppercase tracking-wider",
                                        inv.type === 'FORMAL'
                                            ? 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800'
                                            : 'bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800'
                                    )}>
                                        {inv.type === 'FORMAL' ? 'Fiscal/Formal' : 'Gasto Menor'}
                                    </span>
                                    <input
                                        className="max-w-[300px] rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-bold text-slate-900 outline-none transition-all focus:border-slate-200 focus:bg-white dark:text-white dark:focus:border-slate-700 dark:focus:bg-slate-900"
                                        value={inv.type === 'FORMAL' ? (inv.supplierName || '') : (inv.items?.[0]?.description || 'Gasto Menor')}
                                        placeholder={inv.type === 'FORMAL' ? 'Proveedor desconocido' : 'Gasto menor'}
                                        onChange={(e) => {
                                            const newInvoices = [...invoices];
                                            if (newInvoices[index].type === 'FORMAL') {
                                                newInvoices[index].supplierName = e.target.value;
                                            } else if (newInvoices[index].items?.[0]) {
                                                newInvoices[index].items[0].description = e.target.value;
                                            }
                                            setInvoices(newInvoices);
                                        }}
                                    />
                                </div>
                                <button
                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                    onClick={() => handleRemove(index)}
                                >
                                    <span className="material-icons-round text-[20px]">delete_outline</span>
                                </button>
                            </div>

                            <div className="p-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <span className="material-icons-round text-sm">calendar_today</span>
                                            Fecha DGII
                                        </p>
                                        <p className="font-numeric font-bold text-slate-700 dark:text-slate-300">{inv.date}</p>
                                    </div>

                                    {inv.type === 'FORMAL' ? (
                                        <>
                                            <div className="space-y-1.5">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                                    <span className="material-icons-round text-sm">badge</span>
                                                    RNC / Cédula
                                                </p>
                                                <input
                                                    type="text"
                                                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm font-numeric font-bold rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                                                    value={inv.supplierTaxId || ""}
                                                    placeholder="Sin RNC"
                                                    onChange={(e) => {
                                                        const newInvoices = [...invoices];
                                                        newInvoices[index].supplierTaxId = e.target.value;
                                                        setInvoices(newInvoices);
                                                    }}
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                                    <span className="material-icons-round text-sm">tag</span>
                                                    NCF (BXX...)
                                                </p>
                                                <p className="font-numeric font-bold text-slate-700 dark:text-slate-300 tracking-wider">
                                                    {inv.ncf || <span className="text-slate-300">—</span>}
                                                </p>
                                            </div>
                                            <div className="text-right space-y-1">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monto Total</p>
                                                <p className="font-numeric font-black text-primary text-xl">
                                                    RD${formatCurrency(total)}
                                                </p>
                                                <p className="text-[10px] font-numeric text-slate-400">
                                                    Base: RD${formatCurrency(subtotal)} | ITBIS: RD${formatCurrency(tax)}
                                                </p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="space-y-1.5">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                                    <span className="material-icons-round text-sm">payments</span>
                                                    Base Imponible
                                                </p>
                                                <p className="font-numeric font-bold text-slate-700 dark:text-slate-300">RD${formatCurrency(subtotal)}</p>
                                            </div>
                                            <div className="space-y-1.5">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                                    <span className="material-icons-round text-sm">receipt</span>
                                                    ITBIS Detallado
                                                </p>
                                                <p className="font-numeric font-bold text-slate-700 dark:text-slate-300">RD${formatCurrency(tax)}</p>
                                            </div>
                                            <div className="text-right space-y-1">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Gasto</p>
                                                <p className="font-numeric font-black text-orange-600 dark:text-orange-400 text-xl">RD${formatCurrency(total)}</p>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {inv.notes && (
                                    <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800 flex items-start gap-2 text-[11px] text-slate-400 bg-slate-50/50 dark:bg-slate-800/30 p-2 rounded-lg italic">
                                        <span className="material-icons-round text-sm opacity-50">info</span>
                                        {inv.notes}
                                    </div>
                                )}

                                {inv.attachment && (
                                    <div className="mt-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-xs font-semibold text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
                                        <span className="material-icons-round text-sm">attach_file</span>
                                        Soporte listo para adjuntar: {inv.attachment.fileName}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

import clsx from "clsx";
