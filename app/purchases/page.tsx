import Link from "next/link";
import { Plus, ShoppingCart, Pencil, Sparkles } from "lucide-react";
import { getPurchases, deletePurchase } from "@/app/actions";
import { DeleteButton } from "@/components/DeleteButton";
import { formatCurrency } from "@/lib/format";
import { PurchasesTable } from "@/components/purchases/PurchasesTable";
import { PurchasesActions } from "@/components/purchases/PurchasesActions";
import { primaryActionClass } from "@/lib/ui-styles";

export default async function PurchasesPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const sortBy = searchParams.sortBy === 'createdAt' ? 'createdAt' : 'date';
    const sortOrder = searchParams.sortOrder === 'asc' ? 'asc' : 'desc';

    const purchases = await getPurchases({ sortBy, sortOrder });

    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Compras y Gastos</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Historial de adquisiciones, gastos operativos e importaciones.</p>
                </div>
                <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:flex-wrap">
                    <PurchasesActions />
                    <Link
                        href="/purchases/ai-import"
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 px-3 text-center text-sm font-bold text-blue-600 shadow-sm ring-offset-background transition-all hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 sm:px-6"
                    >
                        <span className="material-icons-round mr-1.5 text-[20px] sm:mr-2">auto_awesome</span>
                        Importar con IA
                    </Link>
                    <Link
                        href="/purchases/new"
                        className={primaryActionClass}
                    >
                        <span className="material-icons-round text-[20px]">add</span>
                        Nueva Compra
                    </Link>
                </div>
            </header>

            <div className="flex flex-wrap gap-2 items-center text-sm font-medium bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <span className="text-slate-400 px-3 py-1 flex items-center gap-1.5">
                    <span className="material-icons-round text-sm">sort</span>
                    Ordenar por:
                </span>
                <Link
                    href={`/purchases?sortBy=date&sortOrder=${sortBy === 'date' && sortOrder === 'desc' ? 'asc' : 'desc'}`}
                    className={`px-4 py-2 rounded-lg text-xs transition-all flex items-center gap-1.5 ${sortBy === 'date' ? 'bg-blue-50/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold border border-blue-100 dark:border-blue-800' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                    Fecha Factura
                    {sortBy === 'date' && (
                        <span className="material-icons-round text-sm">{sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'}</span>
                    )}
                </Link>
                <Link
                    href={`/purchases?sortBy=createdAt&sortOrder=${sortBy === 'createdAt' && sortOrder === 'desc' ? 'asc' : 'desc'}`}
                    className={`px-4 py-2 rounded-lg text-xs transition-all flex items-center gap-1.5 ${sortBy === 'createdAt' ? 'bg-blue-50/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold border border-blue-100 dark:border-blue-800' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                    Recién Añadida
                    {sortBy === 'createdAt' && (
                        <span className="material-icons-round text-sm">{sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'}</span>
                    )}
                </Link>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden min-h-[400px]">
                {purchases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 min-h-[400px]">
                        <div className="h-20 w-20 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center mb-6">
                            <span className="material-icons-round text-4xl opacity-20">shopping_cart</span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No hay compras registradas</h3>
                        <p className="max-w-[300px] text-sm leading-relaxed">Comienza registrando tus facturas de proveedores o gastos menores para tener un control total.</p>
                    </div>
                ) : (
                    <PurchasesTable purchases={purchases} />
                )}
            </div>
        </div>
    );
}
