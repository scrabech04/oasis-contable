import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { getContacts, getInvoice, getProjects } from "@/app/actions";
import { notFound } from "next/navigation";

interface EditInvoicePageProps {
    params: Promise<{ id: string }>;
}

export default async function EditInvoicePage({ params }: EditInvoicePageProps) {
    const { id } = await params;
    const invoiceId = parseInt(id);

    if (isNaN(invoiceId)) {
        notFound();
    }

    const [invoice, contacts, projects] = await Promise.all([
        getInvoice(invoiceId),
        getContacts({ type: 'CLIENT' as any }),
        getProjects()
    ]);

    if (!invoice) {
        notFound();
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Editar Factura #{invoice.id}</h1>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <InvoiceForm contacts={contacts} projects={projects} initialData={invoice} />
            </div>
        </div>
    );
}
