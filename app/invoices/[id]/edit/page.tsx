import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { getContacts, getInvoice, getNumberingSequences, getProjects } from "@/app/actions";
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

    const [invoice, contacts, projects, numberingSequences] = await Promise.all([
        getInvoice(invoiceId),
        getContacts({ type: 'CLIENT' as any }),
        getProjects(),
        getNumberingSequences()
    ]);

    if (!invoice) {
        notFound();
    }

    return (
        <div className="animate-in fade-in duration-500">
            <InvoiceForm
                contacts={contacts}
                projects={projects}
                initialData={invoice}
                numberingSequences={numberingSequences}
            />
        </div>
    );
}
