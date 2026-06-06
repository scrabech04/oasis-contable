import { PurchaseForm } from "@/components/purchases/PurchaseForm";
import { QuickPurchaseForm } from "@/components/purchases/QuickPurchaseForm";
import { getContacts, getPurchase, getProjects } from "@/app/actions";
import { notFound } from "next/navigation";

interface EditPurchasePageProps {
    params: Promise<{ id: string }>;
}

export default async function EditPurchasePage({ params }: EditPurchasePageProps) {
    const { id } = await params;
    const purchaseId = parseInt(id);

    if (isNaN(purchaseId)) {
        notFound();
    }

    const [purchase, contacts, projects] = await Promise.all([
        getPurchase(purchaseId),
        getContacts({ type: 'SUPPLIER' as any }),
        getProjects()
    ]);

    if (!purchase) {
        notFound();
    }

    return (
        <div className="animate-in fade-in duration-500">
            {purchase.type === "FORMAL" ? (
                <PurchaseForm contacts={contacts} projects={projects} initialData={purchase} />
            ) : (
                <QuickPurchaseForm projects={projects} initialData={purchase} />
            )}
        </div>
    );
}
