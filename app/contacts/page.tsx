import Link from "next/link";
import { getContacts } from "@/app/actions";
import { ContactsTable } from "@/components/contacts/ContactsTable";
import { primaryActionClass } from "@/lib/ui-styles";
import { ListPeriodFilter } from "@/components/ListPeriodFilter";
import { getPeriodParams } from "@/lib/list-period";

export default async function ContactsPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const sortBy = (searchParams.sortBy as string) || 'name';
    const sortOrder = (searchParams.sortOrder as 'asc' | 'desc') || 'asc';
    const type = searchParams.type as string | undefined;
    const period = getPeriodParams(searchParams);

    const contacts = await getContacts({ sortBy, sortOrder, type: type as any, ...period });

    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Contactos</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Gestión unificada de clientes, proveedores y personas de contacto.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Link
                        href="/contacts/new"
                        className={primaryActionClass}
                    >
                        <span className="material-icons-round text-[20px]">person_add</span>
                        Nuevo Contacto
                    </Link>
                </div>
            </header>

            <ListPeriodFilter basePath="/contacts" searchParams={searchParams} total={contacts.length} itemSingular="contacto registrado" itemPlural="contactos registrados" />

            <div className="flex flex-wrap gap-2 items-center text-sm font-medium bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <span className="text-slate-400 px-3 py-1 flex items-center gap-1.5">
                    <span className="material-icons-round text-sm">filter_alt</span>
                    Tipo:
                </span>
                <Link
                    href="/contacts"
                    className={`px-4 py-2 rounded-lg text-xs transition-all ${!type ? 'bg-blue-50/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold border border-blue-100 dark:border-blue-800' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                    Todos
                </Link>
                <Link
                    href="/contacts?type=CLIENT"
                    className={`px-4 py-2 rounded-lg text-xs transition-all ${type === 'CLIENT' ? 'bg-blue-50/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold border border-blue-100 dark:border-blue-800' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                    Clientes
                </Link>
                <Link
                    href="/contacts?type=SUPPLIER"
                    className={`px-4 py-2 rounded-lg text-xs transition-all ${type === 'SUPPLIER' ? 'bg-blue-50/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold border border-blue-100 dark:border-blue-800' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                    Proveedores
                </Link>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden min-h-[400px]">
                {contacts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 min-h-[400px]">
                        <div className="h-20 w-20 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center mb-6">
                            <span className="material-icons-round text-4xl opacity-20">contacts</span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No hay contactos</h3>
                        <p className="max-w-[300px] text-sm leading-relaxed">Agrega tus clientes y proveedores para empezar a gestionar tus facturas y proyectos.</p>
                    </div>
                ) : (
                    <ContactsTable contacts={contacts} />
                )}
            </div>
        </div>
    );
}
