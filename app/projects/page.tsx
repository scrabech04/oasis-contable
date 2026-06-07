import Link from "next/link";
import { deleteProject, getProjects } from "@/app/actions";
import { DeleteButton } from "@/components/DeleteButton";
import { ListPeriodFilter } from "@/components/ListPeriodFilter";
import { formatCurrency } from "@/lib/format";
import { getActiveProfile } from "@/lib/account-profiles";
import { getPeriodParams } from "@/lib/list-period";
import { primaryActionClass } from "@/lib/ui-styles";

export default async function ProjectsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const period = getPeriodParams(searchParams);
  const [projects, activeProfile] = await Promise.all([
    getProjects(period),
    getActiveProfile(),
  ]);

  const activeProjects = projects.filter((project: any) => project.status === "ACTIVE").length;
  const totalInvoiced = projects.reduce((sum: number, project: any) => sum + totalProjectInvoices(project), 0);
  const totalCosts = projects.reduce((sum: number, project: any) => sum + totalProjectCosts(project), 0);
  const avgMargin = projects.length > 0
    ? projects.reduce((sum: number, project: any) => sum + projectMargin(project), 0) / projects.length
    : 0;

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Proyectos</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gestion y seguimiento financiero por proyecto.</p>
        </div>
        <Link href="/projects/new" className={primaryActionClass}>
          <span className="material-icons-outlined text-lg">add</span>
          Nuevo Proyecto
        </Link>
      </header>

      <ListPeriodFilter basePath="/projects" searchParams={searchParams} total={projects.length} itemSingular="proyecto registrado" itemPlural="proyectos registrados" />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Proyectos activos" value={String(activeProjects)} />
        <Metric label="Total facturado" value={`RD$ ${formatCurrency(totalInvoiced)}`} tone="blue" />
        <Metric label="Costos totales" value={`RD$ ${formatCurrency(totalCosts)}`} tone="red" />
        <Metric label="Margen promedio" value={`${avgMargin.toFixed(1)}%`} tone={avgMargin >= 20 ? "green" : "amber"} />
      </section>

      <section className="space-y-3 md:hidden">
        {projects.map((project: any) => (
          <ProjectCard key={project.id} project={project} activeProfileId={activeProfile.id} />
        ))}
        {projects.length === 0 ? <EmptyProjects /> : null}
      </section>

      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="px-6 py-4 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Proyecto</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Cliente</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Estado</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Facturado</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Rentabilidad</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {projects.map((project: any) => {
                const invoiced = totalProjectInvoices(project);
                const costs = totalProjectCosts(project);
                const profit = invoiced - costs;
                const margin = invoiced > 0 ? (profit / invoiced) * 100 : 0;
                const isOwner = project.profileId === activeProfile.id;

                return (
                  <tr key={project.id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-6 py-5">
                      <div className="space-y-1">
                        <div className="font-bold text-slate-900 dark:text-white">{project.name}</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] uppercase text-slate-400">{project.code}</span>
                          {!isOwner ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase text-violet-600">Compartido</span> : null}
                          {project.profile?.name ? <span className="text-[10px] text-slate-400">Dueno: {project.profile.name}</span> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm text-slate-600 dark:text-slate-300">{project.contact?.name || "Sin contacto"}</td>
                    <td className="px-6 py-5"><StatusBadge status={project.status} /></td>
                    <td className="px-6 py-5 text-right font-mono text-xs font-bold text-slate-700 dark:text-slate-200">RD$ {formatCurrency(invoiced)}</td>
                    <td className="px-6 py-5 text-right">
                      <div className={`text-xs font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>RD$ {formatCurrency(profit)}</div>
                      <div className="ml-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className={`h-full ${margin >= 20 ? "bg-green-500" : "bg-orange-500"}`} style={{ width: `${Math.min(Math.max(margin, 0), 100)}%` }} />
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <IconLink href={`/projects/${project.id}`} icon="dashboard" label="Ver proyecto" />
                        {isOwner ? (
                          <>
                            <IconLink href={`/projects/${project.id}/edit`} icon="edit" label="Editar proyecto" />
                            <DeleteButton id={project.id} action={deleteProject} variant="ghost_icon" label="Eliminar proyecto" />
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center italic text-slate-400">
                    No hay proyectos registrados aun.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function totalProjectInvoices(project: any) {
  return project.invoices?.reduce((sum: number, invoice: any) => sum + invoice.total, 0) || 0;
}

function totalProjectCosts(project: any) {
  return project.purchases?.reduce((sum: number, purchase: any) => sum + purchase.total, 0) || 0;
}

function projectMargin(project: any) {
  const invoiced = totalProjectInvoices(project);
  const costs = totalProjectCosts(project);
  return invoiced > 0 ? ((invoiced - costs) / invoiced) * 100 : 0;
}

function statusClass(status: string) {
  switch (status) {
    case "ACTIVE": return "bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-900/40";
    case "PROPOSAL": return "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-900/40";
    case "ON_HOLD": return "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-900/40";
    case "COMPLETED": return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    case "CANCELLED": return "bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900/40";
    default: return "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
  }
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${statusClass(status)}`}>{status}</span>;
}

function Metric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "blue" | "red" | "green" | "amber" }) {
  const classes = {
    slate: "border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white",
    blue: "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300",
    red: "border-red-100 bg-red-50 text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300",
    amber: "border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300",
  }[tone];
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${classes}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 font-mono text-base font-black md:text-xl">{value}</p>
    </div>
  );
}

function ProjectCard({ project, activeProfileId }: { project: any; activeProfileId: number }) {
  const invoiced = totalProjectInvoices(project);
  const costs = totalProjectCosts(project);
  const profit = invoiced - costs;
  const margin = invoiced > 0 ? (profit / invoiced) * 100 : 0;
  const isOwner = project.profileId === activeProfileId;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">{project.code}</span>
            <StatusBadge status={project.status} />
            {!isOwner ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-black uppercase text-violet-600">Compartido</span> : null}
          </div>
          <h2 className="mt-2 text-base font-black text-slate-900 dark:text-white">{project.name}</h2>
          <p className="mt-1 truncate text-xs font-medium text-slate-500 dark:text-slate-400">{project.contact?.name || "Sin contacto"}</p>
          {project.profile?.name ? <p className="mt-1 text-[10px] font-semibold text-slate-400">Dueno: {project.profile.name}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Margen</p>
          <p className={`font-mono text-lg font-black ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>{margin.toFixed(1)}%</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
        <ProjectAmount label="Facturado" value={invoiced} color="text-blue-600" />
        <ProjectAmount label="Costos" value={costs} color="text-red-500" />
        <ProjectAmount label="Ganancia" value={profit} color={profit >= 0 ? "text-green-600" : "text-red-600"} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
        <Link href={`/projects/${project.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black uppercase tracking-wider text-white shadow-sm shadow-blue-500/20">
          <span className="material-icons-outlined text-[18px]">dashboard</span>
          Ver
        </Link>
        {isOwner ? (
          <div className="flex items-center gap-1">
            <IconLink href={`/projects/${project.id}/edit`} icon="edit" label="Editar proyecto" />
            <DeleteButton id={project.id} action={deleteProject} variant="ghost_icon" label="Eliminar proyecto" />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ProjectAmount({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase text-slate-400">{label}</p>
      <p className={`mt-1 font-mono text-xs font-bold ${color}`}>RD$ {formatCurrency(value)}</p>
    </div>
  );
}

function IconLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link href={href} aria-label={label} title={label} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
      <span className="material-icons-outlined text-[18px]">{icon}</span>
    </Link>
  );
}

function EmptyProjects() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
        <span className="material-icons-outlined">folder_open</span>
      </div>
      <p className="text-sm font-black text-slate-900 dark:text-white">No hay proyectos registrados</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Crea un proyecto para medir ingresos, costos y rentabilidad.</p>
    </div>
  );
}
