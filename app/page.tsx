import { Activity, ArrowUpRight, PieChart as PieIcon } from "lucide-react";
import { getDashboardStats, processRecurringInvoices } from "@/app/actions";
import { OverviewChart } from "@/components/reports/OverviewChart";
import { ExpenseDistributionChart } from "@/components/reports/ExpenseDistributionChart";
import { formatCurrency } from "@/lib/format";
import { getActiveProfile } from "@/lib/account-profiles";

export default async function DashboardPage() {
  await processRecurringInvoices();
  const [stats, activeProfile] = await Promise.all([
    getDashboardStats(),
    getActiveProfile(),
  ]);

  return (
    <div className="flex flex-col gap-6 md:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            {activeProfile.name}
          </h1>
          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Análisis avanzado de tu salud financiera.
          </p>
        </div>
        <div className="flex w-fit items-center gap-2 md:gap-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-3 md:px-4 py-2 rounded-2xl shadow-sm text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">
          <Activity className="w-4 h-4 text-emerald-500" />
          Actualizado: {new Date().toLocaleDateString()}
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-6">
        <StatCard
          label="Ingresos"
          value={stats.totalIncome}
          icon="trending_up"
          tone="blue"
          showArrow
        />
        <StatCard
          label="Gastos"
          value={stats.totalExpenses}
          icon="trending_down"
          tone="orange"
        />
        <StatCard
          label="Utilidad"
          value={stats.netProfit}
          icon="account_balance"
          tone="emerald"
        />
        <StatCard
          label="Cuentas por Cobrar"
          value={stats.totalReceivable}
          icon="request_quote"
          tone="indigo"
        />
        <StatCard
          label="Cuentas por Pagar"
          value={stats.totalPayable}
          icon="payment"
          tone="rose"
          className="lg:col-span-1"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        <section className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-[2.5rem] p-5 md:p-10 border border-slate-100 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-6 md:mb-10">
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase italic opacity-20 leading-none mb-1">
                Finanzas
              </h2>
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">
                Ingresos vs Gastos
              </h3>
            </div>
          </div>
          <div className="h-72 md:h-80 -ml-4">
            <OverviewChart data={stats.monthlyData} />
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-[2.5rem] p-5 md:p-10 border border-slate-100 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-6 md:mb-10">
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase italic opacity-20 leading-none mb-1">
                Egresos
              </h2>
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">
                Distribución por Categoría
              </h3>
            </div>
            <PieIcon className="w-6 h-6 text-slate-300" />
          </div>
          <div className="h-72 md:h-80">
            <ExpenseDistributionChart data={stats.categoryData as { name: string; value: number }[]} />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 pb-12">
        <section className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl md:rounded-[2.5rem] p-5 md:p-10 border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-6 md:mb-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-icons-round text-blue-500">history</span>
              Actividad Reciente
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {stats.activity.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8 lg:col-span-2">
                No hay actividad reciente.
              </p>
            ) : (
              stats.activity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 md:gap-4 group p-3 md:p-4 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl md:rounded-3xl border border-transparent hover:border-slate-100 dark:hover:border-slate-700 transition-all cursor-pointer"
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

        <aside className="flex flex-col gap-6">
          <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] text-white shadow-xl shadow-indigo-500/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 transition-transform">
              <span className="material-icons-round text-9xl">auto_awesome</span>
            </div>
            <div className="relative z-10">
              <div className="bg-white/20 w-fit p-3 rounded-2xl backdrop-blur-md mb-6">
                <span className="material-icons-round">insights</span>
              </div>
              <h3 className="text-xl font-bold mb-2">Sugerencia IA</h3>
              <p className="text-sm text-indigo-100 leading-relaxed font-medium">
                Tu margen neto ha aumentado un 15% este mes. Considera reinvertir en
                "Adquisición de Activos" para optimizar tu carga fiscal.
              </p>
              <button className="mt-8 px-6 py-3 bg-white text-indigo-600 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg hover:shadow-white/20 active:scale-95 transition-all w-full">
                Ver análisis detallado
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
              Meta Mensual
            </p>
            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: "75%" }} />
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                75% del objetivo
              </span>
              <span className="text-xs font-mono text-slate-400">
                RD$ {formatCurrency(stats.totalIncome)} / 500k
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
  showArrow,
  className = "",
}: {
  label: string;
  value: number;
  icon: string;
  tone: "blue" | "orange" | "emerald" | "indigo" | "rose";
  showArrow?: boolean;
  className?: string;
}) {
  const tones = {
    blue: "bg-blue-50 dark:bg-blue-900/40 text-blue-600",
    orange: "bg-orange-50 dark:bg-orange-900/30 text-orange-600",
    emerald: "bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600",
    indigo: "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600",
    rose: "bg-rose-50 dark:bg-rose-900/30 text-rose-600",
  };

  return (
    <div
      className={`group bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 transition-all hover:shadow-xl hover:-translate-y-1 ${className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2.5 rounded-2xl transition-transform group-hover:scale-110 ${tones[tone]}`}>
          <span className="material-icons-round">{icon}</span>
        </div>
        {showArrow && (
          <ArrowUpRight className="w-4 h-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 leading-tight">{label}</p>
      <h3 className="text-base md:text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tighter italic break-words">
        RD${formatCurrency(value)}
      </h3>
    </div>
  );
}
