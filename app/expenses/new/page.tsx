import { ExpenseForm } from "@/components/expenses/ExpenseForm";

export default function NewExpensePage() {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Registrar Gasto</h1>
            </div>
            <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                <ExpenseForm />
            </div>
        </div>
    );
}
