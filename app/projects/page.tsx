import { deleteProject, getProjects } from "@/app/actions";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { primaryActionClass } from "@/lib/ui-styles";
import { getActiveProfile } from "@/lib/account-profiles";
import { ListPeriodFilter } from "@/components/ListPeriodFilter";
import { getPeriodParams } from "@/lib/list-period";
import { DeleteButton } from "@/components/DeleteButton";

export default async function ProjectsPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const period = getPeriodParams(searchParams);
    const [projects, activeProfile] = await Promise.all([
        getProjects(period),
        getActiveProfile(),
    ]);

    const activeProjects = projects.filter((p: any) => p.status === "ACTIVE").length;
    const totalInvoiced = projects.reduce((sum: number, p: any) => sum + (p.invoices?.reduce((s: number, i: any) => s + i.total, 0) || 0), 0);
    const totalCosts = projects.reduce((sum: number, p: any) => sum + (p.purchases?.reduce((s: number, i: any) => s + i.total, 0) || 0), 0);
    const avgMargin = projects.length > 0
        ? projects.reduce((sum: number, p: any) => {
            const pi = p.invoices?.reduce((s: number, i: any) => s + i.total, 0) || 0;
            const pc = p.purchases?.reduce((s: number, i: any) => s + i.total, 0) || 0;
            return sum + (pi > 0 ? ((pi - pc) / pi) * 100 : 0);
        }, 0) / projects.length
        : 0;

    const getStatusColor = (status: string) => {
        switch (status) {
            case "ACTIVE": return "text-green-600 bg-green-50";
            case "PROPOSAL": return "text-blue-600 bg-blue-50";
            case "ON_HOLD": return "text-orange-600 bg-orange-50";
            case "COMPLETED": return "text-slate-600 bg-slate-100";
            case "CANCELLED": return "text-red-600 bg-red-50";
            default: return "text-slate-600 bg-slate-50";
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Proyectos</h1>
                    <p className="text-slate-500">Gestión y seguimiento financiero por proyecto</p>
                </div>
                <Link href="/projects/new" className={primaryActionClass}>
                    <span className="material-icons-outlined text-lg">add</span>
                    Nuevo Proyecto
                </Link>
            </div>

            <ListPeriodFilter basePath="/projects" searchParams={searchParams} total={projects.length} itemSingular="proyecto registrado" itemPlural="proyectos registrados" />

            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <Card className="border-slate-200 shadow-none">
                    <CardContent className="p-4 md:p-5">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Proyectos Activos</span>
                        <div className="text-xl font-bold text-slate-800 md:text-2xl">{activeProjects}</div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-none">
                    <CardContent className="p-4 md:p-5">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Total Facturado</span>
                        <div className="text-base font-bold text-blue-600 font-mono md:text-2xl">RD$ {formatCurrency(totalInvoiced)}</div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-none">
                    <CardContent className="p-4 md:p-5">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Costos Totales</span>
                        <div className="text-base font-bold text-red-500 font-mono md:text-2xl">RD$ {formatCurrency(totalCosts)}</div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-none">
                    <CardContent className="p-4 md:p-5">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Margen Promedio</span>
                        <div className={`text-xl font-bold font-mono md:text-2xl ${avgMargin >= 20 ? 'text-green-600' : 'text-orange-500'}`}>
                            {avgMargin.toFixed(1)}%
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Projects List */}
            <div className="space-y-3 md:hidden">
                {projects.map((project: any) => {
                    const pi = project.invoices.reduce((s: number, i: any) => s + i.total, 0);
                    const pc = project.purchases.reduce((s: number, i: any) => s + i.total, 0);
                    const profit = pi - pc;
                    const margin = pi > 0 ? (profit / pi) * 100 : 0;
                    const isOwner = project.profileId === activeProfile.id;

                    return (
                        <article key={project.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                            {project.code}
                                        </span>
                                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${getStatusColor(project.status)}`}>
                                            {project.status}
                                        </span>
                                        {!isOwner && (
                                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-black uppercase text-violet-600">
                                                Compartido
                                            </span>
                                        )}
                                    </div>
                                    <h2 className="mt-2 text-base font-black text-slate-900 dark:text-white">{project.name}</h2>
                                    <p className="mt-1 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                                        {project.contact?.name || "Sin contacto"}
                                    </p>
                                    {project.profile?.name && (
                                        <p className="mt-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">Dueno: {project.profile.name}</p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Margen</p>
                                    <p className={`font-mono text-lg font-black ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                        {margin.toFixed(1)}%
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                                <div>
                                    <p className="text-[9px] font-black uppercase text-slate-400">Facturado</p>
                                    <p className="mt-1 font-mono text-xs font-bold text-blue-600">RD$ {formatCurrency(pi)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black uppercase text-slate-400">Costos</p>
                                    <p className="mt-1 font-mono text-xs font-bold text-red-500">RD$ {formatCurrency(pc)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black uppercase text-slate-400">Ganancia</p>
                                    <p className={`mt-1 font-mono text-xs font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                        RD$ {formatCurrency(profit)}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                                <Link href={`/projects/${project.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black uppercase tracking-wider text-white shadow-sm shadow-blue-500/20">
                                    <span className="material-icons-outlined text-[18px]">dashboard</span>
                                    Ver
                                </Link>
                                {isOwner && (
                                    <div className="flex items-center gap-1">
                                        <Link href={`/projects/${project.id}/edit`} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-300">
                                            <span className="material-icons-outlined text-[18px]">edit</span>
                                        </Link>
                                        <DeleteButton id={project.id} action={deleteProject} variant="ghost_icon" label="Eliminar proyecto" />
                                    </div>
                                )}
                            </div>
                        </article>
                    );
                })}
                {projects.length === 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                            <span className="material-icons-outlined">folder_open</span>
                        </div>
                        <p className="text-sm font-black text-slate-900 dark:text-white">No hay proyectos registrados</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Crea un proyecto para medir ingresos, costos y rentabilidad.</p>
                    </div>
                )}
            </div>

            <Card className="hidden border-slate-200 shadow-sm overflow-hidden md:block">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow>
                            <TableHead className="text-[10px] uppercase font-bold">Proyecto</TableHead>
                            <TableHead className="text-[10px] uppercase font-bold">Cliente</TableHead>
                            <TableHead className="text-[10px] uppercase font-bold">Estado</TableHead>
                            <TableHead className="text-[10px] uppercase font-bold text-right">Facturado</TableHead>
                            <TableHead className="text-[10px] uppercase font-bold text-right">Rentabilidad</TableHead>
                            <TableHead className="text-[10px] uppercase font-bold text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {projects.map((project: any) => {
                            const pi = project.invoices.reduce((s: number, i: any) => s + i.total, 0);
                            const pc = project.purchases.reduce((s: number, i: any) => s + i.total, 0);
                            const profit = pi - pc;
                            const margin = pi > 0 ? (profit / pi) * 100 : 0;

                            return (
                                <TableRow key={project.id} className="hover:bg-slate-50 transition-colors">
                                    <TableCell>
                                        <div className="space-y-0.5">
                                            <div className="font-bold text-slate-800">{project.name}</div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-[10px] font-mono text-slate-400 uppercase">{project.code}</span>
                                                {project.profileId !== activeProfile.id && (
                                                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase text-violet-600">
                                                        Compartido
                                                    </span>
                                                )}
                                                {project.profile?.name && (
                                                    <span className="text-[10px] text-slate-400">Dueño: {project.profile.name}</span>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-600">
                                        {project.contact?.name || "Sin contacto"}
                                    </TableCell>
                                    <TableCell>
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${getStatusColor(project.status)}`}>
                                            {project.status}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs font-bold text-slate-700">
                                        RD$ {formatCurrency(pi)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="space-y-1">
                                            <div className={`text-xs font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                RD$ {formatCurrency(profit)}
                                            </div>
                                            <div className="w-16 ml-auto h-1 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${margin >= 20 ? 'bg-green-500' : 'bg-orange-500'}`}
                                                    style={{ width: `${Math.min(Math.max(margin, 0), 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Link href={`/projects/${project.id}`}>
                                                <Button variant="outline" size="sm" className="h-8 px-2 border-slate-200">
                                                    <span className="material-icons-outlined text-sm">dashboard</span>
                                                </Button>
                                            </Link>
                                            {project.profileId === activeProfile.id && (
                                                <>
                                                    <Link href={`/projects/${project.id}/edit`}>
                                                        <Button variant="outline" size="sm" className="h-8 px-2 border-slate-200">
                                                            <span className="material-icons-outlined text-sm">edit</span>
                                                        </Button>
                                                    </Link>
                                                    <DeleteButton id={project.id} action={deleteProject} variant="ghost_icon" label="Eliminar proyecto" />
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {projects.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-20 text-slate-400 italic">
                                    No hay proyectos registrados aún.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
