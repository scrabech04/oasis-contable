import { RecurringInvoiceForm } from "@/components/invoices/RecurringInvoiceForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getContacts, getProjects, getNumberingSequences } from "@/app/actions";

export default async function NewRecurringInvoicePage() {
    const [contacts, projects, numberingSequences] = await Promise.all([
        getContacts({ type: 'CLIENT' as any }),
        getProjects(),
        getNumberingSequences("INVOICE")
    ]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-12">
            <header className="flex items-center gap-4">
                <Link href="/invoices/recurring">
                    <Button variant="ghost" size="icon" className="rounded-full">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Nueva Factura Recurrente</h1>
                    <p className="text-slate-500">Configura una plantilla para facturación automática.</p>
                </div>
            </header>

            <RecurringInvoiceForm
                contacts={contacts}
                projects={projects}
                numberingSequences={numberingSequences}
            />
        </div>
    );
}
