import { PurchaseForm } from "@/components/purchases/PurchaseForm";
import { getContacts, getProjects } from "@/app/actions";

export default async function NewPurchasePage() {
    const [contacts, projects] = await Promise.all([
        getContacts({ type: 'SUPPLIER' as any }),
        getProjects()
    ]);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Nueva Compra a Proveedor</h1>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <PurchaseForm contacts={contacts} projects={projects} />
            </div>
        </div>
    );
}
