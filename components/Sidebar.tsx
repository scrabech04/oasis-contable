"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ThemeToggle } from "./ThemeToggle";
import { ProfileSwitcher } from "./ProfileSwitcher";

const links = [
  { name: "Resumen", href: "/", icon: "dashboard" },
  { name: "Facturación", href: "/invoices", icon: "receipt_long" },
  { name: "Facturac. Recurrente", href: "/invoices/recurring", icon: "update" },
  { name: "Cotizaciones", href: "/quotations", icon: "request_quote" },
  { name: "Por Cobrar", href: "/receivables", icon: "account_balance" },
  { name: "Compras", href: "/purchases", icon: "shopping_cart" },
  { name: "Por Pagar", href: "/payables", icon: "payments" },
  { name: "Suscripciones", href: "/subscriptions", icon: "subscriptions" },
  { name: "Proyectos", href: "/projects", icon: "folder_special" },
  { name: "Contactos", href: "/contacts", icon: "contacts" },
];

const reportLinks = [
  { name: "Reportes 606/7", href: "/reports", icon: "description" },
  { name: "Declaración IT-1", href: "/reports/it1", icon: "assessment" },
  { name: "Configuración", href: "/settings", icon: "settings" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  profiles,
  activeProfileId,
}: {
  profiles: Array<{ id: number; name: string; taxId: string; type: string }>;
  activeProfileId: number;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-full flex-col bg-white transition-colors duration-200 dark:bg-[#151b23]">
      <div className="p-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="material-icons-round text-3xl text-primary dark:text-[#a9c2ff]">account_balance_wallet</span>
          <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Contable<span className="font-normal text-slate-500 dark:text-[#9aa8bd]">App</span>
          </span>
        </Link>
      </div>

      <ProfileSwitcher profiles={profiles} activeProfileId={activeProfileId} />

      <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-4">
        {links.map((link) => {
          const isActive = isActivePath(pathname, link.href);
          return (
            <Link
              key={link.name}
              href={link.href}
              className={clsx(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all",
                {
                  "bg-slate-100 font-medium text-primary dark:bg-[#252c37] dark:text-[#c4d6ff]": isActive,
                  "text-slate-600 hover:bg-slate-50 dark:text-[#c5cedd] dark:hover:bg-[#202733]": !isActive,
                }
              )}
            >
              <span
                className={clsx("material-icons-round text-[20px]", {
                  "text-primary dark:text-[#a9c2ff]": isActive,
                  "group-hover:text-primary dark:group-hover:text-[#a9c2ff]": !isActive,
                })}
              >
                {link.icon}
              </span>
              <span className="text-sm">{link.name}</span>
            </Link>
          );
        })}

        <div className="px-3 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Reportes
        </div>

        {reportLinks.map((link) => {
          const isActive = isActivePath(pathname, link.href);
          return (
            <Link
              key={link.name}
              href={link.href}
              className={clsx(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all",
                {
                  "bg-slate-100 font-medium text-primary dark:bg-[#252c37] dark:text-[#c4d6ff]": isActive,
                  "text-slate-600 hover:bg-slate-50 dark:text-[#c5cedd] dark:hover:bg-[#202733]": !isActive,
                }
              )}
            >
              <span
                className={clsx("material-icons-round text-[20px]", {
                  "text-primary dark:text-[#a9c2ff]": isActive,
                  "group-hover:text-primary dark:group-hover:text-[#a9c2ff]": !isActive,
                })}
              >
                {link.icon}
              </span>
              <span className="text-sm">{link.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <ThemeToggle />
      </div>
    </div>
  );
}
