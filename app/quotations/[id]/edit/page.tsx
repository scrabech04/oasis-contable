import { QuotationForm } from "@/components/quotations/QuotationForm";
import { getContacts, getProjects, getQuotation } from "@/app/actions";
import { notFound } from "next/navigation";

interface EditQuotationPageProps {
    params: { id: string };
}

export default async function EditQuotationPage({ params }: EditQuotationPageProps) {
    const { id: idStr } = await params;
    const id = parseInt(idStr);

    const [contacts, projects, quotation] = await Promise.all([
        getContacts({ type: 'CLIENT' as any }),
        getProjects(),
        getQuotation(id),
    ]);

    if (!quotation) {
        notFound();
    }

    return (
        <div className="animate-in fade-in duration-500">
            <QuotationForm contacts={contacts} projects={projects} initialData={quotation} />
        </div>
    );
}
