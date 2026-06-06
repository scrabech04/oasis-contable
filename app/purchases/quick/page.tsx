import { QuickPurchaseForm } from "@/components/purchases/QuickPurchaseForm";
import { getProjects } from "@/app/actions";

export default async function QuickPurchasePage() {
    const projects = await getProjects();

    return (
        <div className="animate-in fade-in duration-500">
            <QuickPurchaseForm projects={projects} />
        </div>
    );
}
