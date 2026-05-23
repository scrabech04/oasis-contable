import { QuickPurchaseForm } from "@/components/purchases/QuickPurchaseForm";
import { getProjects } from "@/app/actions";

export default async function QuickPurchasePage() {
    const projects = await getProjects();

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Registrar Gasto Rápido</h1>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-6">
                <QuickPurchaseForm projects={projects} />
            </div>
        </div>
    );
}
