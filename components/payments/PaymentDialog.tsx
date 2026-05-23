"use client";

import { useState, useEffect } from "react";
import { recordPayment, updatePayment } from "@/app/actions";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, X as CloseIcon, Trash2, Receipt, User, CreditCard } from "lucide-react";

const WITHHOLDING_TYPES = [
    { label: "Retención ITBIS - 30%", value: "ITBIS_30" },
    { label: "Retención ITBIS - 100%", value: "ITBIS_100" },
    { label: "Retención ISR - 10% (Honorarios)", value: "ISR_10" },
    { label: "Retención ISR - 2% (Servicios)", value: "ISR_2" },
    { label: "Retención ISR - 1% (Otros)", value: "ISR_1" },
    { label: "Retención Proveedores del Estado - 5%", value: "ESTADO_5" },
];

interface PaymentDialogProps {
    isOpen: boolean;
    onClose: () => void;
    targetId: number;
    targetType: 'INVOICE' | 'PURCHASE';
    total: number;
    subtotal: number;
    tax: number;
    paidAmount: number;
    number: string;
    entityName: string;
    onSuccess: () => void;
    initialPaymentData?: any | null; // For editing
}

export function PaymentDialog({
    isOpen,
    onClose,
    targetId,
    targetType,
    total,
    subtotal,
    tax,
    paidAmount,
    number,
    entityName,
    onSuccess,
    initialPaymentData
}: PaymentDialogProps) {
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("BANK_TRANSFER");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [submitting, setSubmitting] = useState(false);
    const [withholdings, setWithholdings] = useState<{ type: string, amount: string }[]>([]);

    useEffect(() => {
        if (isOpen) {
            if (initialPaymentData) {
                setAmount(initialPaymentData.amount.toString());
                setMethod(initialPaymentData.method);
                setDate(new Date(initialPaymentData.date).toISOString().split('T')[0]);
                if (initialPaymentData.withholdings) {
                    setWithholdings(initialPaymentData.withholdings.map((w: any) => ({
                        type: w.type,
                        amount: w.amount.toString()
                    })));
                } else {
                    setWithholdings([]);
                }
            } else {
                // New Payment Mode
                setAmount((total - paidAmount).toFixed(2));
                setMethod("BANK_TRANSFER");
                setDate(new Date().toISOString().split('T')[0]);
                setWithholdings([]);
            }
        }
    }, [isOpen, initialPaymentData, total, paidAmount]);

    const calculateWithholdingAmount = (type: string) => {
        // ISR is calculated on subtotal
        // ITBIS is calculated on tax amount
        const t = parseFloat(tax.toString()) || 0;
        const s = parseFloat(subtotal.toString()) || 0;

        switch (type) {
            case "ITBIS_30": return (t * 0.30);
            case "ITBIS_100": return (t * 1.00);
            case "ISR_10": return (s * 0.10);
            case "ISR_2": return (s * 0.02);
            case "ISR_1": return (s * 0.01);
            case "ESTADO_5": return (s * 0.05);
            default: return 0;
        }
    };

    // Auto-adjust main amount when withholdings change
    useEffect(() => {
        const totalWithholding = withholdings.reduce((sum, w) => sum + (parseFloat(w.amount) || 0), 0);
        const pending = total - (initialPaymentData ? paidAmount - initialPaymentData.amount : paidAmount);
        const suggestedAmount = Math.max(0, pending - totalWithholding);
        setAmount(suggestedAmount.toFixed(2));
    }, [withholdings, total, paidAmount, initialPaymentData]);

    const addWithholding = () => {
        const defaultType = "ITBIS_30";
        const defaultAmount = calculateWithholdingAmount(defaultType).toFixed(2);
        setWithholdings([...withholdings, { type: defaultType, amount: defaultAmount }]);
    };

    const removeWithholding = (index: number) => {
        setWithholdings(withholdings.filter((_, i) => i !== index));
    };

    const updateWithholding = (index: number, field: 'type' | 'amount', value: string) => {
        const newWithholdings = [...withholdings];

        if (field === 'type') {
            const calculated = calculateWithholdingAmount(value);
            newWithholdings[index] = {
                type: value,
                amount: calculated.toFixed(2)
            };
        } else {
            newWithholdings[index] = {
                ...newWithholdings[index],
                amount: value
            };
        }

        setWithholdings(newWithholdings);
    };

    const handleRecordPayment = async () => {
        if (!amount) return;

        setSubmitting(true);
        const formData = new FormData();
        formData.append("amount", amount);
        formData.append("method", method);
        formData.append("date", date);
        formData.append("withholdings", JSON.stringify(withholdings));

        try {
            if (initialPaymentData) {
                await updatePayment(initialPaymentData.id, formData);
            } else {
                await recordPayment(targetId, targetType, formData);
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Error recording payment:", error);
            alert("Error al registrar el pago");
        } finally {
            setSubmitting(false);
        }
    };

    const pending = total - (initialPaymentData ? paidAmount - initialPaymentData.amount : paidAmount);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-blue-600" />
                        {initialPaymentData ? 'Editar Pago' : (targetType === 'INVOICE' ? 'Registrar Cobro' : 'Registrar Pago')}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-2">
                    {/* Summary Card */}
                    <Card className="bg-slate-50/50 border-slate-200 shadow-none">
                        <CardContent className="p-4 space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Receipt className="h-4 w-4" />
                                    <span>Documento</span>
                                </div>
                                <span className="font-semibold">{number}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <User className="h-4 w-4" />
                                    <span>{targetType === 'INVOICE' ? 'Cliente' : 'Proveedor'}</span>
                                </div>
                                <span className="font-semibold text-right">{entityName}</span>
                            </div>
                            <div className="pt-2 border-t flex items-center justify-between">
                                <span className="text-sm font-bold text-slate-700">Saldo Pendiente (Actual)</span>
                                <span className={`text-lg font-bold ${targetType === 'INVOICE' ? 'text-blue-600' : 'text-orange-600'}`}>
                                    RD$ {formatCurrency(pending)}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Payment Inputs */}
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="amount" className="text-xs font-bold uppercase text-slate-500">Monto</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">RD$</span>
                                <Input
                                    id="amount"
                                    type="number"
                                    step="0.01"
                                    className="pl-12 h-11 text-lg font-medium"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="date" className="text-xs font-bold uppercase text-slate-500">Fecha</Label>
                                <Input
                                    id="date"
                                    type="date"
                                    className="h-10"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="method" className="text-xs font-bold uppercase text-slate-500">Método</Label>
                                <Select value={method} onValueChange={setMethod}>
                                    <SelectTrigger className="h-10">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="CASH">Efectivo</SelectItem>
                                        <SelectItem value="BANK_TRANSFER">Transferencia</SelectItem>
                                        <SelectItem value="CHECK">Cheque</SelectItem>
                                        <SelectItem value="CARD">Tarjeta</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Retenciones Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between border-b pb-2">
                            <h4 className="text-xs font-bold uppercase text-slate-500">Retenciones</h4>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px] gap-1 px-2 border-dashed"
                                onClick={addWithholding}
                            >
                                <Plus className="h-3 w-3" />
                                Agregar
                            </Button>
                        </div>

                        {withholdings.length > 0 ? (
                            <div className="space-y-3">
                                {withholdings.map((w, index) => (
                                    <div key={index} className="flex flex-col gap-1 p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 animate-in fade-in slide-in-from-top-1">
                                        <div className="flex gap-2 items-start">
                                            <div className="flex-1 space-y-1">
                                                <Select
                                                    value={w.type}
                                                    onValueChange={(val) => updateWithholding(index, 'type', val)}
                                                >
                                                    <SelectTrigger className="h-9 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                                                        <SelectValue placeholder="Seleccionar tipo" />
                                                    </SelectTrigger>
                                                    <SelectContent className="dark:bg-slate-950 dark:border-slate-800">
                                                        {WITHHOLDING_TYPES.map(type => (
                                                            <SelectItem key={type.value} value={type.value} className="text-xs text-slate-900 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-800">
                                                                {type.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="w-32 relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium">RD$</span>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    className="h-9 text-xs pl-8 text-right font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                                                    value={w.amount}
                                                    onChange={(e) => updateWithholding(index, 'amount', e.target.value)}
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 text-slate-400 hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => removeWithholding(index)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-[9px] text-slate-400 font-medium">
                                                Base: {w.type.startsWith('ITBIS') ? `ITBIS (RD$ ${formatCurrency(tax)})` : `Sutotal (RD$ ${formatCurrency(subtotal)})`}
                                            </span>
                                            <span className="text-[9px] font-bold text-slate-500">
                                                {w.type === "ITBIS_30" ? "30% ITBIS" :
                                                    w.type === "ITBIS_100" ? "100% ITBIS" :
                                                        w.type === "ISR_10" ? "10% ISR" :
                                                            w.type === "ISR_2" ? "2% ISR" :
                                                                w.type === "ISR_1" ? "1% ISR" : "5% Estado"}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-[10px] text-muted-foreground italic text-center py-2">No hay retenciones aplicadas</p>
                        )}
                    </div>
                </div>

                <DialogFooter className="mt-4 gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} className="border-slate-200 text-slate-500">Cancelar</Button>
                    <Button
                        onClick={handleRecordPayment}
                        disabled={submitting || !amount}
                        className={`min-w-[120px] ${targetType === 'INVOICE' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                    >
                        {submitting ? "Procesando..." : (initialPaymentData ? "Actualizar Pago" : "Confirmar Pago")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
