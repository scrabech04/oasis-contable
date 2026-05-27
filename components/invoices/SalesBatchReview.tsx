"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createInvoice } from "@/app/actions";
import { formatCurrency } from "@/lib/format";

interface SalesBatchReviewProps {
    invoices: any[];
    onComplete: () => void;
    onCancel: () => void;
}

export function SalesBatchReview({ invoices: initialInvoices, onComplete, onCancel }: SalesBatchReviewProps) {
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
                formData.append("contactId", "new");
                formData.append("contactName", inv.clientName);
                formData.append("contactTaxId", inv.clientTaxId || "");
                formData.append("ncf", inv.ncf || "");
                formData.append("date", inv.date);
                formData.append("dueDate", inv.dueDate || inv.date);
                formData.append("items", JSON.stringify(inv.items));
                formData.append("incomeType", inv.incomeType || "01");
                formData.append("notes", inv.notes || "");

                const result = await createInvoice(formData);
                if (!result.success) {
                    throw new Error(result.error || "No fue posible guardar una factura de venta.");
                }
            }
            onComplete();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Error al guardar algunas facturas";
            alert(message);
        } finally {
            setIsSaving(false);
        }
    };

    if (invoices.length === 0) {
        return (
            <div className="text-center py-10">
                <p className="text-muted-foreground mb-4">No hay facturas para revisar.</p>
                <Button onClick={onCancel} variant="outline">Volver</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Revisar Facturas de Venta ({invoices.length})</h2>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={onCancel}>Cancelar</Button>
                    <Button onClick={handleSaveAll} disabled={isSaving}>
                        {isSaving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Guardando...
                            </>
                        ) : "Guardar Todo"}
                    </Button>
                </div>
            </div>

            <div className="grid gap-4">
                {invoices.map((inv, index) => (
                    <Card key={index} className="overflow-hidden border-l-4 border-l-green-500">
                        <CardHeader className="flex flex-row items-center justify-between py-3 bg-muted/20">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">
                                    VENTA
                                </span>
                                <CardTitle className="text-sm">
                                    {inv.clientName}
                                </CardTitle>
                            </div>
                            <Button variant="ghost" className="h-8 w-8 p-0 text-red-600" onClick={() => handleRemove(index)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground text-xs">Fecha</p>
                                    <p className="font-medium">{inv.date}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs">RNC/Cédula</p>
                                    <input
                                        type="text"
                                        className="w-full text-xs border rounded px-1 mt-1"
                                        value={inv.clientTaxId || ""}
                                        onChange={(e) => {
                                            const newInvoices = [...invoices];
                                            newInvoices[index].clientTaxId = e.target.value;
                                            setInvoices(newInvoices);
                                        }}
                                    />
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs">NCF</p>
                                    <p className="font-medium">{inv.ncf || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs">Vencimiento</p>
                                    <p className="font-medium">{inv.dueDate || inv.date}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs">Monto Total (aprox)</p>
                                    <p className="font-bold text-green-600">
                                        RD${formatCurrency(inv.items.reduce((acc: number, item: any) => acc + (item.price * item.quantity * (1 + item.taxRate / 100)), 0))}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3">
                                <p className="text-muted-foreground text-xs mb-1">Ítems detectados:</p>
                                <ul className="text-xs space-y-1">
                                    {inv.items.map((item: any, i: number) => (
                                        <li key={i} className="flex justify-between border-b border-muted py-1">
                                            <span>{item.quantity}x {item.description} (ITBIS {item.taxRate}%)</span>
                                            <span>RD${formatCurrency(item.price * item.quantity)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
