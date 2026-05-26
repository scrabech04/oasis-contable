import Link from "next/link";
import { getInvoices, processRecurringInvoices } from "@/app/actions";
import { InvoicesTable } from "@/components/invoices/InvoicesTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Repeat } from "lucide-react";
import { primaryActionClass } from "@/lib/ui-styles";
import { ListPeriodFilter } from "@/components/ListPeriodFilter";
import { getPeriodParams } from "@/lib/list-period";

export default async function InvoicesPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const search = typeof searchParams.search === "string" ? searchParams.search : undefined;
    const sortBy = typeof searchParams.sortBy === "string" ? searchParams.sortBy : "date";
    const sortOrder = searchParams.sortOrder === "asc" ? "asc" : "desc";
    const period = getPeriodParams(searchParams);
    const hrefWith = (next: Record<string, string>) => {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(searchParams)) {
            if (Array.isArray(value)) value.forEach((item) => item && query.append(key, item));
            else if (value) query.set(key, value);
        }
        Object.entries(next).forEach(([key, value]) => query.set(key, value));
        return `/invoices?${query.toString()}`;
    };

    const { generatedCount } = await processRecurringInvoices();
    const invoices = await getInvoices({ search, sortBy, sortOrder, ...period });

    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Facturación</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Gestiona y monitorea tus facturas emitidas</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Link
                        href="/invoices/ai-import"
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 px-6 text-sm font-bold text-blue-600 shadow-sm ring-offset-background transition-all hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                    >
                        <span className="material-icons-round mr-2 text-[20px]">smart_toy</span>
                        Importar con IA
                    </Link>
                    <Link href="/invoices/new" className={primaryActionClass}>
                        <span className="material-icons-round text-lg">add</span>
                        Nueva Factura
                    </Link>
                </div>
            </header>

            {generatedCount > 0 && (
                <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                    <Repeat className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <AlertTitle className="text-green-800 dark:text-green-300">¡Facturas Generadas!</AlertTitle>
                    <AlertDescription className="text-green-700 dark:text-green-400">
                        Se han generado automáticamente {generatedCount} {generatedCount === 1 ? "nueva factura" : "nuevas facturas"} basadas en tus plantillas recurrentes.
                    </AlertDescription>
                </Alert>
            )}

            <ListPeriodFilter basePath="/invoices" searchParams={searchParams} total={invoices.length} itemSingular="factura registrada" itemPlural="facturas registradas" />

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                <form className="relative w-full md:w-96">
                    {period.year ? <input type="hidden" name="year" value={period.year} /> : null}
                    {period.month ? <input type="hidden" name="month" value={period.month} /> : null}
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                        <span className="material-icons-round text-lg">search</span>
                    </span>
                    <input
                        type="search"
                        name="search"
                        placeholder="Buscar por cliente, NCF o número..."
                        defaultValue={search}
                        className="block w-full pl-10 pr-3 py-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg focus:ring-primary focus:border-primary sm:text-sm transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                    />
                </form>

                <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
                    <span className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap mr-2">Ordenar por:</span>
                    <Link
                        href={hrefWith({ sortBy: "date", sortOrder: sortBy === "date" && sortOrder === "desc" ? "asc" : "desc" })}
                        className={`px-3 py-1.5 text-xs font-medium border rounded-md transition-all ${sortBy === "date" ? "bg-blue-50 dark:bg-blue-900/30 text-primary border-blue-100 dark:border-blue-900/50" : "text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                    >
                        Fecha {sortBy === "date" && (sortOrder === "desc" ? "↓" : "↑")}
                    </Link>
                    <Link
                        href={hrefWith({ sortBy: "client", sortOrder: sortBy === "client" && sortOrder === "asc" ? "desc" : "asc" })}
                        className={`px-3 py-1.5 text-xs font-medium border rounded-md transition-all ${sortBy === "client" ? "bg-blue-50 dark:bg-blue-900/30 text-primary border-blue-100 dark:border-blue-900/50" : "text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                    >
                        Cliente {sortBy === "client" && (sortOrder === "asc" ? "↑" : "↓")}
                    </Link>
                    <Link
                        href={hrefWith({ sortBy: "total", sortOrder: sortBy === "total" && sortOrder === "desc" ? "asc" : "desc" })}
                        className={`px-3 py-1.5 text-xs font-medium border rounded-md transition-all ${sortBy === "total" ? "bg-blue-50 dark:bg-blue-900/30 text-primary border-blue-100 dark:border-blue-900/50" : "text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                    >
                        Monto {sortBy === "total" && (sortOrder === "desc" ? "↓" : "↑")}
                    </Link>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                {invoices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
                        <span className="material-icons-round text-5xl mb-4 opacity-20">description</span>
                        <p className="font-medium">No se encontraron facturas.</p>
                        <p className="text-sm mt-1">Intenta con otro término de búsqueda o crea una nueva.</p>
                    </div>
                ) : (
                    <InvoicesTable invoices={invoices} />
                )}
            </div>
        </div>
    );
}
