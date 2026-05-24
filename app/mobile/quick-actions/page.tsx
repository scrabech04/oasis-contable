import Link from "next/link";
import { getAccountProfiles, getActiveProfile } from "@/lib/account-profiles";
import { ProfileSwitcher } from "@/components/ProfileSwitcher";
import { Bot, Camera, CreditCard, ReceiptText, Repeat, ShoppingCart } from "lucide-react";

const actions = [
  {
    title: "Escanear comprobante",
    description: "Lee el QR DGII y abre la compra con el perfil correcto.",
    href: "/purchases?scan=qr",
    icon: Camera,
  },
  {
    title: "Compra rapida",
    description: "Gasto simple o menor sin entrar al formulario completo.",
    href: "/purchases/quick",
    icon: CreditCard,
  },
  {
    title: "Nueva compra",
    description: "Proveedor, NCF, proyecto, impuestos y soporte completo.",
    href: "/purchases/new",
    icon: ShoppingCart,
  },
  {
    title: "Importar con IA",
    description: "Sube PDF o imagen y deja el soporte adjunto.",
    href: "/purchases/ai-import",
    icon: Bot,
  },
  {
    title: "Facturas",
    description: "Ver o crear ventas desde el celular.",
    href: "/invoices",
    icon: ReceiptText,
  },
  {
    title: "Suscripciones",
    description: "Dominios, hosting y cobros recurrentes.",
    href: "/subscriptions",
    icon: Repeat,
  },
];

export default async function MobileQuickActionsPage() {
  const [profiles, activeProfile] = await Promise.all([
    getAccountProfiles(),
    getActiveProfile(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Acceso movil</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">Registrar rapido</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Antes de registrar, confirma el perfil activo para no mezclar compras entre persona y empresa.
        </p>
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 py-3 dark:border-slate-800 dark:bg-slate-950">
          <ProfileSwitcher profiles={profiles} activeProfileId={activeProfile.id} />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className="flex min-h-32 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-blue-950/30 sm:min-h-28 sm:flex-row"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black text-slate-900 dark:text-white">{action.title}</span>
                <span className="mt-1 block text-xs leading-snug text-slate-500 dark:text-slate-400 sm:text-sm">{action.description}</span>
              </span>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
