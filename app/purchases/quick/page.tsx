import { QuickPurchaseForm } from "@/components/purchases/QuickPurchaseForm";
import { getProjects, getPurchaseTags } from "@/app/actions";

export default async function QuickPurchasePage() {
    const [projects, tagSuggestions] = await Promise.all([getProjects(), getPurchaseTags()]);

    return (
        <div className="animate-in fade-in duration-500">
            <QuickPurchaseForm projects={projects} tagSuggestions={tagSuggestions} />
        </div>
    );
}
