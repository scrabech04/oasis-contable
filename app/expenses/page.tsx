import Link from "next/link";
import { Receipt } from "lucide-react";
import { getExpenses } from "@/app/actions";
import { formatCurrency } from "@/lib/format";
import { primaryActionClass } from "@/lib/ui-styles";
import { ListToolbar } from "@/components/listing/ListToolbar";
import { getPeriodParams } from "@/lib/list-period";
import { normalizeSearchTerm } from "@/lib/list-search";

export default async function ExpensesPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const search = normalizeSearchTerm(searchParams.search);
    const sortBy = typeof searchParams.sortBy === "string" ? searchParams.sortBy : "date";
    const sortOrder = searchParams.sortOrder === "asc" ? "asc" : "desc";
    const period = getPeriodParams(searchParams);
    const expenses = await getExpenses({ search, sortBy, sortOrder, ...period });

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Gastos</h1>
                <Link href="/purchases/quick" className={primaryActionClass}>
                    <span className="material-icons-round text-lg">add</span>
                    Registrar Gasto
                </Link>
            </div>

            <ListToolbar
                basePath="/expenses"
                searchParams={searchParams}
                total={expenses.length}
                itemSingular="registro"
                itemPlural="registros"
                search={search}
                searchPlaceholder="Buscar gasto, proveedor o monto..."
                sortBy={sortBy}
                sortOrder={sortOrder}
                sortOptions={[
                    { key: "date", label: "Fecha" },
                    { key: "total", label: "Monto" },
                ]}
            />

            <div className="rounded-md border">
                {expenses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                        <Receipt className="h-10 w-10 mb-4 opacity-20" />
                        <p>No hay gastos registrados aún.</p>
                        <p className="text-sm">Registra tus gastos para llevar el control.</p>
                    </div>
                ) : (
                    <table className="w-full caption-bottom text-sm">
                        <thead className="[&_tr]:border-b">
                            <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Fecha</th>
                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Concepto</th>
                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Categoría</th>
                                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Monto</th>
                                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground"></th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {expenses.map((expense: any) => {
                                // Las compras informales guardan el concepto en las notas con el
                                // formato "Categoria: descripcion" (ver purchaseNotes en actions).
                                const [rawCategory, ...rest] = String(expense.notes || "").split(":");
                                const concept = rest.join(":").trim();
                                const category = concept ? rawCategory.trim() : "";
                                const label = concept || rawCategory.trim() || expense.contact?.name || expense.supplierName || "Gasto";

                                return (
                                    <tr key={expense.id} className="border-b transition-colors hover:bg-muted/50">
                                        <td className="p-4 align-middle">{new Date(expense.date).toLocaleDateString()}</td>
                                        <td className="p-4 align-middle">{label}</td>
                                        <td className="p-4 align-middle">
                                            {category ? (
                                                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-secondary text-secondary-foreground">
                                                    {category}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </td>
                                        <td className="p-4 align-middle text-right font-medium">RD${formatCurrency(expense.total)}</td>
                                        <td className="p-4 align-middle text-right">
                                            <Link href={`/purchases/${expense.id}/edit`} className="text-sm font-bold text-blue-600 underline-offset-4 hover:underline">
                                                Editar
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
