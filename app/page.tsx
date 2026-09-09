import Link from "next/link";
import { Activity, PieChart as PieIcon } from "lucide-react";
import { getDashboardStats, processRecurringInvoices } from "@/app/actions";
import { OverviewChart } from "@/components/reports/OverviewChart";
import { ExpenseDistributionChart } from "@/components/reports/ExpenseDistributionChart";
import { ReceivableAgingChart } from "@/components/reports/ReceivableAgingChart";
import { TopSuppliersChart } from "@/components/reports/TopSuppliersChart";
import { DashboardFilters } from "@/components/reports/DashboardFilters";
import { formatCurrency } from "@/lib/format";
import { getPeriodParams } from "@/lib/list-period";
import { getActiveProfile } from "@/lib/account-profiles";

const cardClass =
  "bg-white dark:bg-[#111820] rounded-2xl md:rounded-[2.5rem] p-5 md:p-8 border border-slate-100 dark:border-[#2a3442] shadow-sm transition-all hover:shadow-md";

export default async function DashboardPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const period = getPeriodParams(searchParams);

  await processRecurringInvoices();
  const [stats, activeProfile] = await Promise.all([
    getDashboardStats(period),
    getActiveProfile(),
  ]);

  return (
    <div className="flex flex-col gap-6 md:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              {activeProfile.name}
            </h1>
            <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Analisis avanzado de tu salud financiera.
            </p>
          </div>
          <div className="flex w-fit items-center gap-2 md:gap-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-3 md:px-4 py-2 rounded-2xl shadow-sm text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">
            <Activity className="w-4 h-4 text-emerald-500" />
            {stats.periodLabel}
          </div>
        </div>
        <DashboardFilters period={period} />
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-6">
        <StatCard label="Ingresos" value={stats.totalIncome} icon="trending_up" tone="blue" change={stats.incomeChange} />
        <StatCard label="Gastos" value={stats.totalExpenses} icon="trending_down" tone="orange" change={stats.expenseChange} riseIsGood={false} />
        <StatCard label="Utilidad" value={stats.netProfit} icon="account_balance" tone="emerald" />
        <StatCard label="Cuentas por Cobrar" value={stats.totalReceivable} icon="request_quote" tone="indigo" />
        <StatCard label="Cuentas por Pagar" value={stats.totalPayable} icon="payment" tone="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        <section className={cardClass}>
          <SectionHeading kicker="Finanzas" title="Ingresos vs Gastos" note={stats.periodLabel} />
          <div className="h-72 md:h-80 -ml-4">
            <OverviewChart data={stats.monthlyData} showMargin={stats.monthlyData.length > 1} />
          </div>
        </section>

        <section className={cardClass}>
          <SectionHeading
            kicker="Egresos"
            title="Distribucion por Categoria"
            note={stats.periodLabel}
            icon={<PieIcon className="w-6 h-6 text-slate-300" />}
          />
          <div className="h-72 md:h-80">
            <ExpenseDistributionChart data={stats.categoryData} />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <section className={cardClass}>
          <SectionHeading kicker="Clientes" title="Mejor Cliente" note={stats.periodLabel} />
          {stats.topClient ? (
            <div className="flex flex-col gap-5">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-blue-500/20">
                    {stats.topClient.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-black text-slate-900 dark:text-white truncate">
                      {stats.topClient.name}
                    </p>
                    <p className="text-xs font-bold text-slate-400">
                      {stats.topClient.count} {stats.topClient.count === 1 ? "factura" : "facturas"}
                      {stats.topClientShare !== null ? ` · ${Math.round(stats.topClientShare)}% del total` : ""}
                    </p>
                  </div>
                </div>
                <p className="text-2xl md:text-3xl font-black font-mono tracking-tighter italic text-slate-900 dark:text-white">
                  RD${formatCurrency(stats.topClient.total)}
                </p>
              </div>

              {stats.previousLabel ? (
                <p className="text-xs font-medium text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-4">
                  {stats.previousTopClient
                    ? `En ${stats.previousLabel} fue ${stats.previousTopClient.name} con RD$${formatCurrency(stats.previousTopClient.total)}.`
                    : `En ${stats.previousLabel} no facturaste a nadie.`}
                </p>
              ) : null}

              {stats.clientRanking.length > 1 ? (
                <ul className="flex flex-col gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                  {stats.clientRanking.slice(1).map((client, index) => (
                    <li key={client.name} className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-slate-300 font-black">{index + 2}</span>
                        <span className="font-bold text-slate-600 dark:text-slate-300 truncate">{client.name}</span>
                      </span>
                      <span className="font-mono font-bold text-slate-400 shrink-0">
                        RD${formatCurrency(client.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic py-8 text-center">
              No hay facturas en {stats.periodLabel.toLowerCase()}.
            </p>
          )}
        </section>

        <section className={`${cardClass} lg:col-span-2`}>
          <SectionHeading kicker="Proveedores" title="En quien mas gastamos" note={stats.periodLabel} />
          <div className="h-72">
            <TopSuppliersChart data={stats.topSuppliers} />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <section className={`${cardClass} lg:col-span-2`}>
          <SectionHeading
            kicker="Cobros"
            title="Antiguedad de lo pendiente"
            note={stats.overdueAmount > 0 ? `RD$${formatCurrency(stats.overdueAmount)} vencidos` : "Todo al dia"}
          />
          <div className="h-64 md:h-72">
            <ReceivableAgingChart data={stats.receivableAging} />
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-2">
            Cuenta todas las facturas abiertas, sin importar el filtro de mes: una factura de mayo sigue vencida hoy.
          </p>
        </section>

        <section className={cardClass}>
          <SectionHeading kicker="Objetivo" title="Meta Mensual" note={stats.monthlyGoal.label} />
          {stats.monthlyGoal.amount ? (
            <div className="flex flex-col gap-4">
              <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    (stats.monthlyGoal.progress ?? 0) >= 100 ? "bg-emerald-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, stats.monthlyGoal.progress ?? 0))}%` }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tighter italic">
                  {Math.round(stats.monthlyGoal.progress ?? 0)}%
                </span>
                <span className="text-xs font-mono text-slate-400">
                  RD${formatCurrency(stats.monthlyGoal.income)} de RD${formatCurrency(stats.monthlyGoal.amount)}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {(stats.monthlyGoal.progress ?? 0) >= 100
                  ? "Meta cumplida."
                  : `Te faltan RD$${formatCurrency(stats.monthlyGoal.amount - stats.monthlyGoal.income)}.`}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-2">
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                Todavia no has definido cuanto quieres facturar al mes.
              </p>
              <Link
                href="/settings"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black uppercase tracking-widest text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95"
              >
                <span className="material-icons-round text-base">flag</span>
                Definir meta
              </Link>
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 pb-12">
        <section className={`${cardClass} lg:col-span-2 flex flex-col`}>
          <div className="flex items-center justify-between mb-6 md:mb-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-icons-round text-blue-500">history</span>
              Actividad Reciente
            </h2>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {stats.periodLabel}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {stats.activity.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8 md:col-span-2">
                No hay actividad en este periodo.
              </p>
            ) : (
              stats.activity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 md:gap-4 group p-3 md:p-4 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl md:rounded-3xl border border-transparent hover:border-slate-100 dark:hover:border-slate-700 transition-all"
                >
                  <div
                    className={`w-11 h-11 md:w-12 md:h-12 rounded-2xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 ${
                      item.type === "INVOICE"
                        ? "bg-blue-100 text-blue-600"
                        : "bg-orange-100 text-orange-600"
                    }`}
                  >
                    <span className="material-icons-round text-[22px]">
                      {item.type === "INVOICE" ? "description" : "payments"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-400 truncate font-medium">{item.subtitle}</p>
                  </div>
                  <div className="text-right min-w-fit">
                    <p
                      className={`text-xs md:text-sm font-black font-mono ${
                        item.amount > 0 ? "text-emerald-500" : "text-rose-500"
                      }`}
                    >
                      {item.amount > 0 ? "+" : ""}RD${formatCurrency(Math.abs(item.amount))}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                      {new Date(item.date).toLocaleDateString("es-ES", {
                        timeZone: "UTC",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="bg-gradient-to-br from-indigo-600 to-blue-700 p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] text-white shadow-xl shadow-indigo-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <span className="material-icons-round text-9xl">auto_awesome</span>
          </div>
          <div className="relative z-10 flex flex-col gap-6">
            <div>
              <div className="bg-white/20 w-fit p-3 rounded-2xl backdrop-blur-md mb-4">
                <span className="material-icons-round">insights</span>
              </div>
              <h3 className="text-xl font-bold">Que mirar</h3>
              <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-200 mt-1">
                {stats.periodLabel}
              </p>
            </div>

            <ul className="flex flex-col gap-4">
              {stats.insights.map((insight) => (
                <li key={insight.id} className="flex gap-3">
                  <span
                    className={`material-icons-round text-[20px] shrink-0 ${
                      insight.tone === "danger"
                        ? "text-rose-300"
                        : insight.tone === "warning"
                          ? "text-amber-300"
                          : insight.tone === "good"
                            ? "text-emerald-300"
                            : "text-indigo-200"
                    }`}
                  >
                    {insight.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-snug">{insight.title}</p>
                    <p className="text-xs text-indigo-100 leading-relaxed font-medium mt-0.5">
                      {insight.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SectionHeading({
  kicker,
  title,
  note,
  icon,
}: {
  kicker: string;
  title: string;
  note?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6 md:mb-8 gap-3">
      <div>
        <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase italic opacity-20 leading-none mb-1">
          {kicker}
        </h2>
        <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">{title}</h3>
        {note ? (
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">{note}</p>
        ) : null}
      </div>
      {icon}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
  change,
  riseIsGood = true,
}: {
  label: string;
  value: number;
  icon: string;
  tone: "blue" | "orange" | "emerald" | "indigo" | "rose";
  /** Variacion porcentual contra el periodo anterior; null cuando no hay con que comparar. */
  change?: number | null;
  riseIsGood?: boolean;
}) {
  const tones = {
    blue: "bg-blue-50 dark:bg-blue-900/40 text-blue-600",
    orange: "bg-orange-50 dark:bg-orange-900/30 text-orange-600",
    emerald: "bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600",
    indigo: "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600",
    rose: "bg-rose-50 dark:bg-rose-900/30 text-rose-600",
  };

  const rising = (change ?? 0) > 0;
  const good = rising === riseIsGood;

  return (
    <div className="group bg-white dark:bg-[#111820] p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 dark:border-[#2a3442] transition-all hover:shadow-xl hover:-translate-y-1 dark:hover:border-[#3a4656]">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2.5 rounded-2xl transition-transform group-hover:scale-110 ${tones[tone]}`}>
          <span className="material-icons-round">{icon}</span>
        </div>
        {change !== null && change !== undefined ? (
          <span
            className={`inline-flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[10px] font-black ${
              good ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30" : "bg-rose-50 text-rose-600 dark:bg-rose-900/30"
            }`}
          >
            <span className="material-icons-round text-[13px]">
              {rising ? "arrow_upward" : "arrow_downward"}
            </span>
            {Math.abs(Math.round(change))}%
          </span>
        ) : null}
      </div>
      <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 leading-tight">{label}</p>
      <h3 className="text-base md:text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tighter italic break-words">
        RD${formatCurrency(value)}
      </h3>
    </div>
  );
}
