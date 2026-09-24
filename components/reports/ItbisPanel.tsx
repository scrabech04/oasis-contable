import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import type { ItbisWindow } from "@/lib/itbis";

/**
 * El ITBIS del tramo elegido, con el saldo a favor que venia arrastrado.
 *
 * Se muestra el desglose y no solo el total porque el saldo a favor no es un dato del mes:
 * viene de meses anteriores. Un numero suelto llamado "a favor" se lee como si lo hubieras
 * generado este mes, y se presta a declarar de menos.
 */
export function ItbisPanel({
  data,
  label,
  href,
  className = "",
}: {
  data: ItbisWindow;
  label: string;
  /** La IT-1 del mes que corresponda al tramo. */
  href: string;
  className?: string;
}) {
  const aFavor = data.saldoAFavor > 0;

  return (
    <section className={`${className} flex flex-col`}>
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase italic opacity-20 leading-none mb-1">
            Impuestos
          </h2>
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">ITBIS</h3>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">{label}</p>
        </div>
        <div className="p-2.5 rounded-2xl bg-violet-50 dark:bg-violet-900/30 text-violet-600">
          <span className="material-icons-round">receipt_long</span>
        </div>
      </div>

      {data.months === 0 && data.saldoAFavorPrevio === 0 ? (
        <p className="text-sm text-slate-400 italic py-8 text-center">
          No hay movimiento de ITBIS en {label.toLowerCase()}.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <Row label="Facturado" value={data.itbisFacturado} />
          <Row label="(−) Deducible" value={-data.itbisPagado} />
          <Row label="(−) Retenido" value={-data.retencionesITBIS} />
          <Row label="(−) A favor de antes" value={-data.saldoAFavorPrevio} muted />
        </div>
      )}

      <div className="mt-auto pt-5 border-t border-slate-100 dark:border-slate-800">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
          {aFavor ? "Saldo a favor" : "Saldo a pagar"}
        </p>
        <p
          className={`text-2xl font-black font-mono tracking-tighter italic ${
            aFavor ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"
          }`}
        >
          RD${formatCurrency(aFavor ? data.saldoAFavor : data.aPagar)}
        </p>
        <p className="text-[11px] font-medium text-slate-400 mt-1 leading-snug">
          {aFavor
            ? "Se arrastra al proximo periodo."
            : data.saldoAFavorPrevio > 0
              ? `Ya descontado RD$${formatCurrency(data.saldoAFavorPrevio)} que venia a favor.`
              : "Sin saldo a favor pendiente."}
        </p>

        <Link
          href={href}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 transition-all hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95"
        >
          <span className="material-icons-round text-base">assessment</span>
          Ver IT-1
        </Link>
      </div>
    </section>
  );
}

function Row({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span
        className={`text-[11px] font-bold uppercase tracking-wider ${
          muted ? "text-slate-300 dark:text-slate-600" : "text-slate-400"
        }`}
      >
        {label}
      </span>
      <span
        className={`text-sm font-black font-mono tracking-tighter shrink-0 ${
          muted ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"
        }`}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}
