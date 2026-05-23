"use client";

import Link from "next/link";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteContact } from "@/app/actions";

function contactTypeLabel(type: string) {
    return type === "CLIENT" ? "Cliente" : type === "SUPPLIER" ? "Proveedor" : "Ambos";
}

function contactTypeClass(type: string) {
    return type === "CLIENT"
        ? "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800"
        : type === "SUPPLIER"
            ? "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800"
            : "bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800";
}

export function ContactsTable({ contacts }: { contacts: any[] }) {
    return (
        <div>
            <div className="space-y-3 md:hidden">
                {contacts.map((contact) => {
                    const mainPerson = contact.persons?.find((p: any) => p.isMain) || contact.persons?.[0];

                    return (
                        <article key={contact.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-black text-slate-900 dark:text-white">{contact.name}</p>
                                    <p className="mt-1 text-[10px] font-mono text-slate-500">{contact.taxId || "Sin RNC"}</p>
                                    <p className="mt-2 text-xs text-slate-500">
                                        {mainPerson ? mainPerson.name : "Contacto no definido"}
                                    </p>
                                </div>
                                <span className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${contactTypeClass(contact.type)}`}>
                                    {contactTypeLabel(contact.type)}
                                </span>
                            </div>
                            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                                <div className="min-w-0 text-[11px] text-slate-500">
                                    <p className="truncate">{contact.email || mainPerson?.email || "Sin email"}</p>
                                    <p className="truncate">{contact.phone || mainPerson?.phone || "Sin teléfono"}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1 text-slate-400">
                                    <Link href={`/contacts/${contact.id}/edit`} className="rounded-lg p-2 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30" title="Editar">
                                        <span className="material-icons-round text-[20px]">edit</span>
                                    </Link>
                                    <DeleteButton id={contact.id} action={deleteContact} variant="ghost_icon" />
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
                            <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">Nombre / RNC</th>
                            <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 hidden sm:table-cell">Tipo</th>
                            <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 hidden md:table-cell">Contacto Principal</th>
                            <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 hidden lg:table-cell">Email/Tel</th>
                            <th className="px-4 md:px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 text-right w-[140px]">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {contacts.map((contact) => {
                            const mainPerson = contact.persons?.find((p: any) => p.isMain) || contact.persons?.[0];

                            return (
                                <tr key={contact.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                                    <td className="px-4 md:px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-900 dark:text-white">{contact.name}</span>
                                            <span className="text-[10px] text-slate-500 font-mono">{contact.taxId || "Sin RNC"}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 md:px-6 py-4 hidden sm:table-cell">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${contactTypeClass(contact.type)}`}>
                                            {contactTypeLabel(contact.type)}
                                        </span>
                                    </td>
                                    <td className="px-4 md:px-6 py-4 hidden md:table-cell text-slate-600 dark:text-slate-400">
                                        {mainPerson ? mainPerson.name : <span className="text-slate-300 dark:text-slate-600 italic text-xs">No definido</span>}
                                    </td>
                                    <td className="px-4 md:px-6 py-4 hidden lg:table-cell">
                                        <div className="flex flex-col text-[11px] text-slate-500">
                                            <span>{contact.email || mainPerson?.email || "-"}</span>
                                            <span>{contact.phone || mainPerson?.phone || "-"}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 md:px-6 py-4">
                                        <div className="flex justify-end items-center gap-1.5 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Link href={`/contacts/${contact.id}/edit`} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 text-slate-400 rounded-lg transition-all" title="Editar">
                                                <span className="material-icons-round text-[20px]">edit</span>
                                            </Link>
                                            <DeleteButton id={contact.id} action={deleteContact} variant="ghost_icon" />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
