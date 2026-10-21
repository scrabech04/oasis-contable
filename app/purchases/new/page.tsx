import { PurchaseForm } from "@/components/purchases/PurchaseForm";
import { getContacts, getProjects, getPurchaseTags } from "@/app/actions";
import { safeReturnTo } from "@/lib/return-to";

export default async function NewPurchasePage(props: {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = props.searchParams ? await props.searchParams : {};
    const defaultProjectId = typeof searchParams.projectId === "string" ? searchParams.projectId : "";
    const successRedirect = safeReturnTo(searchParams.returnTo);
    const [contacts, projects, tagSuggestions] = await Promise.all([
        getContacts({ type: 'SUPPLIER' as any }),
        getProjects(),
        getPurchaseTags(),
    ]);

    return (
        <div className="animate-in fade-in duration-500">
            <PurchaseForm contacts={contacts} projects={projects} defaultProjectId={defaultProjectId} successRedirect={successRedirect} tagSuggestions={tagSuggestions} />
        </div>
    );
}
