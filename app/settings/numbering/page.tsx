"use client";

import { useState } from "react";
import { getNumberingSequences, deleteNumberingSequence } from "@/app/actions";
import { SequenceForm } from "@/components/settings/SequenceForm";
import { Plus, Edit2, Trash2, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import clsx from "clsx";
import { primaryActionClass } from "@/lib/ui-styles";

export default function NumberingSettingsPage() {
    const [sequences, setSequences] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingSequence, setEditingSequence] = useState<any>(null);
    const [docType, setDocType] = useState("INVOICE");

    const loadSequences = async () => {
        setLoading(true);
        try {
            const data = await getNumberingSequences(docType);
            setSequences(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSequences();
    }, [docType]);

    const handleDelete = async (id: number) => {
        if (!confirm("¿Eliminar esta numeración? Esta acción no se puede deshacer.")) return;
        await deleteNumberingSequence(id);
        loadSequences();
    };

    return (
        <div className="px-4 py-8 space-y-8 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                        <span className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600">
                            <span className="material-icons-outlined">format_list_numbered</span>
                        </span>
                        Numeraciones de comprobantes
                    </h1>
                    <p className="text-slate-500 mt-1">Administra las numeraciones de los comprobantes que generas en tu negocio.</p>
                </div>
                <Button
                    onClick={() => { setEditingSequence(null); setShowForm(true); }}
                    className={primaryActionClass}
                >
                    <Plus className="h-4 w-4" /> Nueva numeración
                </Button>
            </header>

            {showForm && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <SequenceForm
                        initialData={editingSequence}
                        onClose={() => { setShowForm(false); setEditingSequence(null); loadSequences(); }}
                    />
                </div>
            )}

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="max-w-xs space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tipo de documento</label>
                        <select
                            value={docType}
                            onChange={(e) => setDocType(e.target.value)}
                            className="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                        >
                            <option value="INVOICE">Factura de venta</option>
                            <option value="QUOTATION">Cotización</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/20 dark:bg-slate-800/20 text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-widest font-black border-b border-slate-100 dark:border-slate-800">
                                <th className="px-6 py-4">Nombre</th>
                                <th className="px-6 py-4 text-center">Preferida</th>
                                <th className="px-6 py-4 text-center">Prefijo</th>
                                <th className="px-6 py-4 text-right">Siguiente número</th>
                                <th className="px-6 py-4 text-center">Vencimiento</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {sequences.map((seq) => (
                                <tr key={seq.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="px-6 py-5">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{seq.name}</span>
                                            <span className="text-[10px] text-slate-400 font-medium">{seq.branch}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        {seq.isPreferred ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-100 dark:border-blue-800">SÍ</span>
                                        ) : (
                                            <span className="text-[10px] font-bold text-slate-300">NO</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded font-mono text-xs font-bold text-slate-600 dark:text-slate-400">{seq.prefix}</span>
                                    </td>
                                    <td className="px-6 py-5 text-right font-mono font-bold text-slate-900 dark:text-white">
                                        {seq.nextNumber}
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        <span className="text-xs font-medium text-slate-500">
                                            {seq.expiryDate ? new Date(seq.expiryDate).toLocaleDateString() : 'No vence'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                                onClick={() => { setEditingSequence(seq); setShowForm(true); }}
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                onClick={() => handleDelete(seq.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loading && sequences.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-2">
                                            <AlertCircle className="h-10 w-10 text-slate-200" />
                                            <p className="text-slate-400 font-medium">No hay numeraciones configuradas para este tipo</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-6 flex gap-4">
                <Info className="h-6 w-6 text-blue-500 shrink-0" />
                <div className="text-sm text-blue-700 dark:text-blue-300">
                    <p className="font-bold mb-1">Sobre las numeraciones</p>
                    <p>Configura las numeraciones autorizadas por la DGII. El sistema llevará el control automático y te avisará cuando estés cerca de alcanzar el número final o la fecha de vencimiento.</p>
                </div>
            </div>
        </div>
    );
}
