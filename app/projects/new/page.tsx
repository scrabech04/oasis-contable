import { ProjectForm } from "@/components/projects/ProjectForm";
import { getContacts } from "@/app/actions";
import { getAccountProfiles, getActiveProfile } from "@/lib/account-profiles";

export default async function NewProjectPage() {
    const [contacts, profiles, activeProfile] = await Promise.all([
        getContacts({ type: 'CLIENT' as any }),
        getAccountProfiles(),
        getActiveProfile(),
    ]);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Nuevo Proyecto</h1>
            </div>
            <ProjectForm contacts={contacts} profiles={profiles} activeProfileId={activeProfile.id} />
        </div>
    );
}
