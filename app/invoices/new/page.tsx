import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { getContacts, getProjects, getNumberingSequences } from "@/app/actions";

export default async function NewInvoicePage(props: {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = props.searchParams ? await props.searchParams : {};
    const defaultProjectId = typeof searchParams.projectId === "string" ? searchParams.projectId : "";
    const defaultContactId = typeof searchParams.contactId === "string" ? searchParams.contactId : "";
    const successRedirect = typeof searchParams.returnTo === "string" ? searchParams.returnTo : undefined;
    const [contacts, projects, numberingSequences] = await Promise.all([
        getContacts({ type: 'CLIENT' as any }),
        getProjects(),
        getNumberingSequences("INVOICE")
    ]);

    return (

        <div className="animate-in fade-in duration-500">
            <InvoiceForm
                contacts={contacts}
                projects={projects}
                numberingSequences={numberingSequences}
                defaultProjectId={defaultProjectId}
                defaultContactId={defaultContactId}
                successRedirect={successRedirect}
            />
        </div>

    );
}
