import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { getContacts, getProjects, getNumberingSequences } from "@/app/actions";

export default async function NewInvoicePage() {
    const [contacts, projects, numberingSequences] = await Promise.all([
        getContacts({ type: 'CLIENT' as any }),
        getProjects(),
        getNumberingSequences("INVOICE")
    ]);

    return (

        <div className="animate-in fade-in duration-500">
            <InvoiceForm contacts={contacts} projects={projects} numberingSequences={numberingSequences} />
        </div>

    );
}
