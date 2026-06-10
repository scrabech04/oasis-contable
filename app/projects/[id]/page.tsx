import { getCompanySettings, getProject } from "@/app/actions";
import { ProjectDashboard } from "@/components/projects/ProjectDashboard";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getActiveProfile } from "@/lib/account-profiles";
import { ProjectDeleteButton } from "@/components/projects/ProjectDeleteButton";

interface ProjectPageProps {
    params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
    const { id } = await params;
    const projectId = parseInt(id);

    if (isNaN(projectId)) {
        notFound();
    }

    const [project, activeProfile, companySettings] = await Promise.all([
        getProject(projectId),
        getActiveProfile(),
        getCompanySettings(),
    ]);

    if (!project) {
        notFound();
    }

    return (
        <div className="space-y-6 pb-10 premium-enter">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <Link href="/projects" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" title="Volver a proyectos">
                        <span className="material-icons-outlined text-[22px]">arrow_back</span>
                    </Link>
                    <h1 className="truncate text-2xl font-black text-slate-950 dark:text-white">Panel de Control</h1>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                    {project.profileId === activeProfile.id && (
                        <>
                            <Link href={`/projects/${projectId}/edit`} className="hidden sm:inline-flex" title="Editar proyecto">
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                                    <span className="material-icons-outlined text-[19px]">edit</span>
                                </Button>
                            </Link>
                            <span className="hidden sm:inline-flex">
                                <ProjectDeleteButton id={projectId} compact />
                            </span>
                        </>
                    )}
                    <Link href={`/purchases/new?projectId=${projectId}&returnTo=/projects/${projectId}`}>
                        <Button size="sm" className="h-9 w-full gap-2 border border-emerald-700 bg-emerald-700 px-4 text-white shadow-sm hover:bg-emerald-800 sm:w-auto">
                            <span className="material-icons-outlined text-[18px]">shopping_cart</span>
                            Compra
                        </Button>
                    </Link>
                    <Link href={`/invoices/new?projectId=${projectId}&contactId=${project.contact?.profileId === activeProfile.id ? project.contactId : ""}&returnTo=/projects/${projectId}`}>
                        <Button size="sm" className="h-9 w-full gap-2 border border-blue-700 bg-blue-700 px-4 text-white shadow-sm hover:bg-blue-800 sm:w-auto">
                            <span className="material-icons-outlined text-[18px]">receipt_long</span>
                            Factura
                        </Button>
                    </Link>
                    {project.profileId === activeProfile.id && (
                        <div className="col-span-2 grid grid-cols-2 gap-2 sm:hidden">
                            <Link href={`/projects/${projectId}/edit`}>
                                <Button variant="outline" size="sm" className="h-9 w-full gap-2 border-slate-200">
                                    <span className="material-icons-outlined text-[18px]">edit</span>
                                    Editar
                                </Button>
                            </Link>
                            <ProjectDeleteButton id={projectId} />
                        </div>
                    )}
                </div>
            </div>

            <ProjectDashboard
                project={project as any}
                taxSettings={{
                    incomeTaxRegime: companySettings.incomeTaxRegime,
                    incomeTaxRate: companySettings.incomeTaxRate,
                }}
            />
        </div>
    );
}
