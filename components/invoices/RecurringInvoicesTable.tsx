"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MoreHorizontal,
  Play,
  Pause,
  Trash2,
  Calendar,
  Repeat,
  FilePlus2,
  ExternalLink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  deleteRecurringInvoice,
  generateRecurringInvoiceNow,
  toggleRecurringInvoiceStatus,
} from "@/app/actions";

interface RecurringInvoicesTableProps {
  invoices: any[];
}

const frequencyLabels: Record<string, string> = {
  DAILY: "Diaria",
  WEEKLY: "Semanal",
  MONTHLY: "Mensual",
  YEARLY: "Anual",
};

export function RecurringInvoicesTable({ invoices }: RecurringInvoicesTableProps) {
  return (
    <div>
      <div className="space-y-3 md:hidden">
        {invoices.map((invoice) => (
          <article key={invoice.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900 dark:text-white">{invoice.client.name}</p>
                {invoice.project && <p className="mt-1 truncate text-xs text-slate-500">{invoice.project.name}</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Repeat className="h-3.5 w-3.5" />
                    {frequencyLabels[invoice.frequency] || invoice.frequency}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(invoice.nextGeneration)}
                  </span>
                </div>
              </div>
              <StatusBadge status={invoice.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Monto</p>
                <p className="mt-1 font-mono text-sm font-black text-slate-900 dark:text-white">
                  {formatCurrency(invoice.items.reduce((acc: number, item: any) => acc + item.total, 0))}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Emitidas</p>
                <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{invoice.generatedCount || 0}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
              {invoice.latestGeneratedInvoice ? (
                <Link href={`/invoices/${invoice.latestGeneratedInvoice.id}`} className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-blue-600">
                  <span className="truncate">{invoice.latestGeneratedInvoice.number}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </Link>
              ) : (
                <span className="text-xs text-slate-400">Sin emisiones</span>
              )}
              <ActionsMenu invoice={invoice} />
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 dark:bg-slate-800/50">
              <TableHead>Cliente</TableHead>
              <TableHead>Frecuencia</TableHead>
              <TableHead>Próxima Emisión</TableHead>
              <TableHead>Monto Estimado</TableHead>
              <TableHead>Historial</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <TableCell className="font-medium">
                  <div>
                    <p className="text-slate-900 dark:text-white">{invoice.client.name}</p>
                    {invoice.project && <p className="text-xs text-slate-500">{invoice.project.name}</p>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-slate-400" />
                    <span className="text-sm">{frequencyLabels[invoice.frequency] || invoice.frequency}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <span className="text-sm">{formatDate(invoice.nextGeneration)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatCurrency(invoice.items.reduce((acc: number, item: any) => acc + item.total, 0))}
                  </span>
                </TableCell>
                <TableCell>
                  {invoice.latestGeneratedInvoice ? (
                    <div className="space-y-1">
                      <Link href={`/invoices/${invoice.latestGeneratedInvoice.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700">
                        {invoice.latestGeneratedInvoice.number}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                      <p className="text-xs text-slate-500">
                        {formatDate(invoice.latestGeneratedInvoice.date)} · {invoice.generatedCount} emitidas
                      </p>
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Total: {formatCurrency(invoice.generatedTotal || 0)}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Sin emisiones</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={invoice.status} />
                </TableCell>
                <TableCell className="text-right">
                  <ActionsMenu invoice={invoice} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={status === "ACTIVE" ? "default" : "secondary"}
      className={
        status === "ACTIVE"
          ? "bg-green-100 text-green-700 hover:bg-green-200 border-none px-2.5 py-0.5"
          : "px-2.5 py-0.5"
      }
    >
      {status === "ACTIVE" ? "Activa" : status === "COMPLETED" ? "Completada" : "Pausada"}
    </Badge>
  );
}

function ActionsMenu({ invoice }: { invoice: any }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          className="gap-2"
          onClick={async () => {
            await generateRecurringInvoiceNow(invoice.id);
            window.location.reload();
          }}
        >
          <FilePlus2 className="h-4 w-4 text-blue-500" /> Generar ahora
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2"
          onClick={async () => {
            await toggleRecurringInvoiceStatus(invoice.id, invoice.status);
            window.location.reload();
          }}
        >
          {invoice.status === "ACTIVE" ? (
            <>
              <Pause className="h-4 w-4 text-amber-500" /> Pausar Recurrencia
            </>
          ) : (
            <>
              <Play className="h-4 w-4 text-green-500" /> Activar Recurrencia
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-red-600 focus:text-red-600"
          onClick={async () => {
            if (confirm("¿Estás seguro de eliminar esta plantilla recurrente?")) {
              await deleteRecurringInvoice(invoice.id);
              window.location.reload();
            }
          }}
        >
          <Trash2 className="h-4 w-4" /> Eliminar Plantilla
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
