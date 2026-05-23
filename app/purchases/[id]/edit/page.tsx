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
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                    Editar {purchase.type === "FORMAL" ? "Compra" : "Gasto"} #{purchase.id}
                </h1>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-6">
                {purchase.type === "FORMAL" ? (
                    <PurchaseForm contacts={contacts} projects={projects} initialData={purchase} />
                ) : (
                    <QuickPurchaseForm projects={projects} initialData={purchase} />
                )}
            </div>
        </div>
    );
}
