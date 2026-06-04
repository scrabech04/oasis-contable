"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { DeleteButton } from "@/components/DeleteButton";
import { deletePurchase } from "@/app/actions";
import { PaymentDialog } from "@/components/payments/PaymentDialog";
import { useRouter } from "next/navigation";

function formatPurchaseDate(value: string | Date) {
    return new Intl.DateTimeFormat("es-DO", {
        timeZone: "UTC",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).format(new Date(value));
}

function statusLabel(status: string) {
    return status === "PAID" ? "Saldada" : status === "PARTIAL" ? "Parcial" : "Pend.";
}

function taxTreatmentLabel(value: string) {
    const labels: Record<string, string> = {
        LOCAL_CREDIT: "Crédito fiscal",
        LOCAL_NO_CREDIT: "Sin crédito",
        FOREIGN_EXPENSE: "Internacional",
        IMPORT_GOODS: "Importación",
        FOREIGN_WITHHOLDING: "Exterior c/ret.",
    };
    return labels[value] || "Sin clasificar";
}

function isForeignPurchase(purchase: any) {
    return purchase.origin === "FOREIGN" || ["FOREIGN_EXPENSE", "IMPORT_GOODS", "FOREIGN_WITHHOLDING"].includes(purchase.taxTreatment);
}

function websiteHref(value?: string | null) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function sourceCurrencyLabel(purchase: any) {
    return purchase.currency === "USD" ? "US$" : "RD$";
}

export function PurchasesTable({ purchases }: { purchases: any[] }) {
    const router = useRouter();
    const [selectedPurchase, setSelectedPurchase] = useState<any>(null);

    return (
        <>
            <div className="space-y-3 md:hidden">
                {purchases.map((purchase) => {
                    const supplierName = purchase.contact?.name || purchase.supplierName;
                    const supplierTaxId = purchase.contact?.taxId || purchase.supplierTaxId;
                    const isForeign = isForeignPurchase(purchase);
                    const supplierWebsite = purchase.supplierWebsiteUrl || purchase.contact?.website;
                    const supplierWebsiteLink = websiteHref(supplierWebsite);
                    const isMissingData = !isForeign && purchase.type === "FORMAL" && (!purchase.ncf || !supplierTaxId || supplierTaxId === "999999999");

                    return (
                        <article key={purchase.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                                            {purchase.type === "FORMAL" ? supplierName || "Proveedor sin nombre" : purchase.notes?.split(":")[1] || purchase.notes}
                                        </p>
                                        {isMissingData && (
                                            <span className="material-icons-round text-sm text-amber-500" title="Faltan datos fiscales">warning</span>
                                        )}
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {formatPurchaseDate(purchase.date)} · {purchase.type === "FORMAL" ? "Formal" : "Personal"}
                                    </p>
                                    <p className="mt-1 truncate text-[10px] font-mono text-slate-400">
                                        {purchase.ncf || "Sin NCF"}
                                    </p>
                                    <span className="mt-2 inline-flex w-fit rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                                        {taxTreatmentLabel(purchase.taxTreatment)}
                                    </span>
                                    {purchase.attachments?.[0] && (
                                        <a
                                            href={`/api/purchases/attachments/${purchase.attachments[0].id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-blue-600"
                                        >
                                            <span className="material-icons-round text-xs">attach_file</span>
                                            Ver soporte
                                        </a>
                                    )}
                                    {supplierWebsiteLink && (
                                        <a
                                            href={supplierWebsiteLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600"
                                        >
                                            <span className="material-icons-round text-xs">language</span>
                                            Sitio oficial
                                        </a>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="font-mono text-sm font-black text-slate-900 dark:text-white">
                                        RD${formatCurrency(purchase.total)}
                                    </p>
                                    {purchase.currency === "USD" && (
                                        <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                                            {sourceCurrencyLabel(purchase)} {formatCurrency(purchase.sourceTotal || 0)}
                                        </p>
                                    )}
                                    <span className="mt-2 inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                                        {statusLabel(purchase.status)}
                                    </span>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                                <span className="text-[10px] font-medium text-slate-500">
                                    {isForeign ? "RNC: No aplica" : `RNC: ${supplierTaxId || "Sin RNC"}`}
                                </span>
                                <div className="flex items-center gap-1 text-slate-400">
                                    {purchase.status !== "PAID" && (
                                        <button onClick={() => setSelectedPurchase(purchase)} className="rounded-lg p-2 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-900/30" title="Registrar Pago">
                                            <span className="material-icons-round text-[20px]">payments</span>
                                        </button>
                                    )}
                                    <Link href={`/purchases/${purchase.id}`} className="rounded-lg p-2 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100" title="Ver detalles">
                                        <span className="material-icons-round text-[20px]">visibility</span>
                                    </Link>
                                    <Link href={`/purchases/${purchase.id}/edit`} className="rounded-lg p-2 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30" title="Editar">
                                        <span className="material-icons-round text-[20px]">edit</span>
                                    </Link>
                                    <DeleteButton id={purchase.id} action={deletePurchase} variant="ghost_icon" />
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>

            <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                            <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 hidden md:table-cell">Fecha</th>
                            <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 hidden sm:table-cell">Tipo</th>
                            <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">Proveedor / Detalle</th>
                            <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">NCF</th>
                            <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 hidden lg:table-cell">Estado</th>
                            <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 text-right">Monto</th>
                            <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 text-right w-[100px] md:w-[140px]">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {purchases.map((purchase) => {
                            const supplierName = purchase.contact?.name || purchase.supplierName;
                            const supplierTaxId = purchase.contact?.taxId || purchase.supplierTaxId;
                            const isForeign = isForeignPurchase(purchase);
                            const supplierWebsite = purchase.supplierWebsiteUrl || purchase.contact?.website;
                            const supplierWebsiteLink = websiteHref(supplierWebsite);
                            const isMissingData = !isForeign && purchase.type === "FORMAL" && (!purchase.ncf || !supplierTaxId || supplierTaxId === "999999999");

                            return (
                                <tr key={purchase.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                                    <td className="px-4 md:px-6 py-4 text-slate-600 dark:text-slate-400 font-numeric whitespace-nowrap hidden md:table-cell">
                                        {formatPurchaseDate(purchase.date)}
                                    </td>
                                    <td className="px-4 md:px-6 py-4 hidden sm:table-cell">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${purchase.type === "FORMAL"
                                            ? "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800"
                                            : "bg-slate-50 text-slate-500 border-slate-100 dark:bg-slate-800/50 dark:border-slate-700"
                                            }`}>
                                            {purchase.type === "FORMAL" ? "Formal" : "Personal"}
                                        </span>
                                    </td>
                                    <td className="px-4 md:px-6 py-4">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-900 dark:text-white truncate max-w-[120px] md:max-w-[200px]" title={purchase.type === "FORMAL" ? supplierName : purchase.notes}>
                                                    {purchase.type === "FORMAL" ? supplierName || "Proveedor sin nombre" : purchase.notes?.split(":")[1] || purchase.notes}
                                                </span>
                                                {isMissingData && (
                                                    <span className="material-icons-round text-amber-500 text-sm animate-pulse" title="Faltan datos fiscales (RNC o NCF)">warning</span>
                                                )}
                                            </div>
                                            {purchase.type === "FORMAL" && (
                                                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                                                    {isForeign ? "RNC: No aplica" : `RNC: ${supplierTaxId || "Sin RNC registrado"}`}
                                                </div>
                                            )}
                                            <span className="mt-1 inline-flex w-fit rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                                                {taxTreatmentLabel(purchase.taxTreatment)}
                                            </span>
                                            {purchase.attachments?.[0] && (
                                                <a
                                                    href={`/api/purchases/attachments/${purchase.attachments[0].id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700"
                                                    onClick={(event) => event.stopPropagation()}
                                                >
                                                    <span className="material-icons-round text-xs">attach_file</span>
                                                    Soporte
                                                </a>
                                            )}
                                            {supplierWebsiteLink && (
                                                <a
                                                    href={supplierWebsiteLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700"
                                                    onClick={(event) => event.stopPropagation()}
                                                >
                                                    <span className="material-icons-round text-xs">language</span>
                                                    Sitio oficial
                                                </a>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 md:px-6 py-4 text-[10px] font-numeric font-extrabold text-slate-500 tracking-wider">
                                        {purchase.ncf || <span className="text-slate-300 dark:text-slate-600 tracking-normal font-normal">-</span>}
                                    </td>
                                    <td className="px-6 py-4 hidden lg:table-cell">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${purchase.status === "PAID"
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800"
                                            : purchase.status === "PARTIAL"
                                                ? "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800"
                                                : "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-700"
                                            }`}>
                                            {statusLabel(purchase.status)}
                                        </span>
                                    </td>
                                    <td className="px-4 md:px-6 py-4 text-right">
                                        <div className="font-numeric font-black text-slate-900 dark:text-white text-sm md:text-base">
                                            RD${formatCurrency(purchase.total)}
                                        </div>
                                        {purchase.currency === "USD" && (
                                            <div className="text-[9px] md:text-[10px] text-slate-500 dark:text-slate-400 font-bold font-numeric">
                                                US${formatCurrency(purchase.sourceTotal || 0)} @ RD${formatCurrency(purchase.exchangeRate || 1)}
                                            </div>
                                        )}
                                        {purchase.paidAmount > 0 && purchase.paidAmount < purchase.total && (
                                            <div className="text-[9px] md:text-[10px] text-emerald-600 dark:text-emerald-400 font-bold font-numeric">
                                                Restan: RD${formatCurrency(purchase.total - purchase.paidAmount)}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 md:px-6 py-4">
                                        <div className="flex justify-end items-center gap-0.5 md:gap-1.5 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                            {purchase.status !== "PAID" && (
                                                <button onClick={() => setSelectedPurchase(purchase)} className="p-1.5 md:p-2 hover:bg-orange-50 dark:hover:bg-orange-900/30 hover:text-orange-600 text-slate-400 rounded-lg transition-all" title="Registrar Pago">
                                                    <span className="material-icons-round text-[18px] md:text-[20px]">payments</span>
                                                </button>
                                            )}
                                            <Link href={`/purchases/${purchase.id}`} className="p-1.5 md:p-2 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-100 text-slate-400 rounded-lg transition-all" title="Ver detalles">
                                                <span className="material-icons-round text-[18px] md:text-[20px]">visibility</span>
                                            </Link>
                                            <Link href={`/purchases/${purchase.id}/edit`} className="p-1.5 md:p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 text-slate-400 rounded-lg transition-all" title="Editar">
                                                <span className="material-icons-round text-[18px] md:text-[20px]">edit</span>
                                            </Link>
                                            <DeleteButton id={purchase.id} action={deletePurchase} variant="ghost_icon" />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {selectedPurchase && (
                <PaymentDialog
                    isOpen={!!selectedPurchase}
                    onClose={() => setSelectedPurchase(null)}
                    targetId={selectedPurchase.id}
                    targetType="PURCHASE"
                    total={selectedPurchase.total}
                    subtotal={selectedPurchase.subtotal}
                    tax={selectedPurchase.tax}
                    paidAmount={selectedPurchase.paidAmount}
                    number={selectedPurchase.number || "Compra #" + selectedPurchase.id}
                    entityName={selectedPurchase.contact?.name || selectedPurchase.supplierName || "Proveedor Informal"}
                    onSuccess={() => router.refresh()}
                />
            )}
        </>
    );
}
