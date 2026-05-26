import Link from "next/link";
import { Receipt } from "lucide-react";
import { getExpenses } from "@/app/actions";
import { formatCurrency } from "@/lib/format";
import { primaryActionClass } from "@/lib/ui-styles";
import { ListPeriodFilter } from "@/components/ListPeriodFilter";
import { getPeriodParams } from "@/lib/list-period";

export default async function ExpensesPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const period = getPeriodParams(searchParams);
    const expenses = await getExpenses(period);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Gastos</h1>
                <Link href="/expenses/new" className={primaryActionClass}>
                    <span className="material-icons-round text-lg">add</span>
                    Registrar Gasto
                </Link>
            </div>

            <ListPeriodFilter basePath="/expenses" searchParams={searchParams} total={expenses.length} itemSingular="gasto registrado" itemPlural="gastos registrados" />

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
                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Descripción</th>
                                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Categoría</th>
                                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Monto</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {expenses.map((expense: any) => (
                                <tr key={expense.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                    <td className="p-4 align-middle">{new Date(expense.date).toLocaleDateString()}</td>
                                    <td className="p-4 align-middle">{expense.description}</td>
                                    <td className="p-4 align-middle">
                                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                                            {expense.category}
                                        </span>
                                    </td>
                                    <td className="p-4 align-middle text-right">RD${formatCurrency(expense.amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
