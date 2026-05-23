import { QuotationForm } from "@/components/quotations/QuotationForm";
import { getContacts, getProjects } from "@/app/actions";

export default async function NewQuotationPage() {
    const [contacts, projects] = await Promise.all([
        getContacts({ type: 'CLIENT' as any }),
        getProjects(),
    ]);

    return (
        <div className="animate-in fade-in duration-500">
            <QuotationForm contacts={contacts} projects={projects} />
        </div>
    );
}
