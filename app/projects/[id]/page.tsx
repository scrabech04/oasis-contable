import { getProject } from "@/app/actions";
import { ProjectDashboard } from "@/components/projects/ProjectDashboard";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getActiveProfile } from "@/lib/account-profiles";

interface ProjectPageProps {
    params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
    const { id } = await params;
    const projectId = parseInt(id);

    if (isNaN(projectId)) {
        notFound();
    }

    const [project, activeProfile] = await Promise.all([
        getProject(projectId),
        getActiveProfile(),
    ]);

    if (!project) {
        notFound();
    }

    return (
        <div className="space-y-6 pb-10">
            <div className="flex items-center gap-4">
                <Link href="/projects">
                    <Button variant="outline" size="sm" className="h-9 px-3 border-slate-200">
                        <span className="material-icons-outlined">arrow_back</span>
                    </Button>
                </Link>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-slate-800">Panel de Control</h1>
                </div>
                {project.profileId === activeProfile.id && (
                    <div className="flex gap-2">
                        <Link href={`/projects/${projectId}/edit`}>
                            <Button variant="outline" size="sm" className="h-9 px-4 border-slate-200">
                                <span className="material-icons-outlined mr-2 text-[18px]">edit</span>
                                Editar
                            </Button>
                        </Link>
                    </div>
                )}
            </div>

            <ProjectDashboard project={project as any} />
        </div>
    );
}
