import { getRecurringInvoices, processRecurringInvoices } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Plus, Repeat, AlertCircle } from "lucide-react";
import Link from "next/link";
import { RecurringInvoicesTable } from "@/components/invoices/RecurringInvoicesTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { primaryActionClass } from "@/lib/ui-styles";

export default async function RecurringInvoicesPage() {
    // Trigger processing on page load (server-side)
    const { generatedCount } = await processRecurringInvoices();
    const recurringInvoices = await getRecurringInvoices();

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Facturas Recurrentes</h1>
                    <p className="text-slate-500 text-sm md:text-base">Gestiona tus plantillas de facturación automática.</p>
                </div>
                <Link href="/invoices/recurring/new" className={primaryActionClass}>
                    <Plus className="h-4 w-4" /> Nueva Plantilla
                </Link>
            </header>

            {generatedCount > 0 && (
                <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                    <Repeat className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <AlertTitle className="text-green-800 dark:text-green-300">¡Facturas Generadas!</AlertTitle>
                    <AlertDescription className="text-green-700 dark:text-green-400">
                        Se han generado automáticamente {generatedCount} {generatedCount === 1 ? 'nueva factura' : 'nuevas facturas'} basadas en tus plantillas.
                    </AlertDescription>
                </Alert>
            )}

            {recurringInvoices.length === 0 ? (
                <Card className="border-dashed border-2 py-12">
                    <div className="flex flex-col items-center justify-center text-center space-y-4">
                        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-full">
                            <Repeat className="h-8 w-8 text-slate-400" />
                        </div>
                        <div className="max-w-md">
                            <h3 className="text-lg font-semibold">No hay facturas recurrentes</h3>
                            <p className="text-slate-500 text-sm mt-1">
                                Crea una plantilla recurrente para automatizar tus cobros mensuales, semanales o anuales.
                            </p>
                        </div>
                        <Link href="/invoices/recurring/new">
                            <Button variant="outline">Crear mi primera plantilla</Button>
                        </Link>
                    </div>
                </Card>
            ) : (
                <RecurringInvoicesTable invoices={recurringInvoices} />
            )}
        </div>
    );
}

// Inline Card for empty state to avoid extra file for now
function Card({ children, className }: { children: React.ReactNode, className?: string }) {
    return (
        <div className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 ${className}`}>
            {children}
        </div>
    )
}
