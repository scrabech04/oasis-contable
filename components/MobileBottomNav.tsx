"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import {
  BarChart3,
  Building2,
  CreditCard,
  FileClock,
  FileText,
  FolderKanban,
  Home,
  Menu,
  MoonStar,
  Plus,
  Receipt,
  Repeat,
  Settings,
  ShoppingCart,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { ThemeToggle } from "./ThemeToggle";

type Profile = { id: number; name: string; taxId: string; type: string };

const primaryLinks = [
  { name: "Inicio", href: "/", icon: Home },
  { name: "Compras", href: "/purchases", icon: ShoppingCart },
  { name: "Acciones", href: "/mobile/quick-actions", icon: Plus, featured: true, iconOnly: true },
  { name: "Facturas", href: "/invoices", icon: Receipt },
];

const moreLinks = [
  { name: "Recurrentes", href: "/invoices/recurring", icon: FileClock },
  { name: "Prefacturas", href: "/proformas", icon: FileText },
  { name: "Por Cobrar", href: "/receivables", icon: Building2 },
  { name: "Por Pagar", href: "/payables", icon: WalletCards },
  { name: "Suscripciones", href: "/subscriptions", icon: Repeat },
  { name: "Proyectos", href: "/projects", icon: FolderKanban },
  { name: "Contactos", href: "/contacts", icon: Users },
  { name: "Reportes 606/7", href: "/reports", icon: BarChart3 },
  { name: "Declaración IT-1", href: "/reports/it1", icon: CreditCard },
  { name: "Configuración", href: "/settings", icon: Settings },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav({
  profiles,
  activeProfileId,
}: {
  profiles: Profile[];
  activeProfileId: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isMoreActive = moreLinks.some((link) => isActivePath(pathname, link.href));

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px] md:hidden" onClick={() => setOpen(false)}>
          <div
            className="absolute inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] max-h-[72vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-[calc(var(--spacing)*6)] shadow-2xl dark:border-slate-800 dark:bg-slate-950"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Navegación</p>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Más opciones</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300"
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 py-3 dark:border-slate-800 dark:bg-slate-900/70">
              <ProfileSwitcher profiles={profiles} activeProfileId={activeProfileId} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {moreLinks.map((link) => {
                const Icon = link.icon;
                const active = isActivePath(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={clsx(
                      "flex min-h-16 items-center gap-3 rounded-xl border px-3 py-3 text-sm font-semibold transition",
                      active
                        ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-300"
                        : "border-slate-100 bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{link.name}</span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                <MoonStar className="h-4 w-4" />
                Apariencia
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.10)] backdrop-blur-md pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-950/95 md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {primaryLinks.map((link) => {
            const Icon = link.icon;
            const active = isActivePath(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold transition",
                  active
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
                    : link.featured
                      ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20 dark:bg-white dark:text-slate-950"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                )}
              >
                <Icon className={clsx(link.iconOnly ? "h-7 w-7" : "h-5 w-5")} />
                {!link.iconOnly && <span className="leading-none">{link.name}</span>}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={clsx(
              "flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold transition",
              open || isMoreActive
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
            )}
            aria-expanded={open}
            aria-label="Abrir más opciones"
          >
            <Menu className="h-5 w-5" />
            <span className="leading-none">Más</span>
          </button>
        </div>
      </nav>
    </>
  );
}
