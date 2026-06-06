import { PurchaseForm } from "@/components/purchases/PurchaseForm";
import { getContacts, getProjects } from "@/app/actions";

export default async function NewPurchasePage(props: {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = props.searchParams ? await props.searchParams : {};
    const defaultProjectId = typeof searchParams.projectId === "string" ? searchParams.projectId : "";
    const successRedirect = typeof searchParams.returnTo === "string" ? searchParams.returnTo : undefined;
    const [contacts, projects] = await Promise.all([
        getContacts({ type: 'SUPPLIER' as any }),
        getProjects()
    ]);

    return (
        <div className="animate-in fade-in duration-500">
            <PurchaseForm contacts={contacts} projects={projects} defaultProjectId={defaultProjectId} successRedirect={successRedirect} />
        </div>
    );
}
