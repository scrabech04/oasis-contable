import { ProjectForm } from "@/components/projects/ProjectForm";
import { getContacts, getProject } from "@/app/actions";
import { notFound } from "next/navigation";
import { getAccountProfiles, getActiveProfile } from "@/lib/account-profiles";

interface EditProjectPageProps {
    params: Promise<{ id: string }>;
}

export default async function EditProjectPage({ params }: EditProjectPageProps) {
    const { id } = await params;
    const projectId = parseInt(id);

    if (isNaN(projectId)) {
        notFound();
    }

    const [project, contacts, profiles, activeProfile] = await Promise.all([
        getProject(projectId),
        getContacts({ type: 'CLIENT' as any }),
        getAccountProfiles(),
        getActiveProfile(),
    ]);

    if (!project || project.profileId !== activeProfile.id) {
        notFound();
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Editar Proyecto</h1>
            </div>
            <ProjectForm contacts={contacts} project={project as any} profiles={profiles} activeProfileId={activeProfile.id} />
        </div>
    );
}
