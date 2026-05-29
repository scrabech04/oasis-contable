import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AUTH_SESSION_COOKIE, getAuthSecret, getAllowedAuthEmails, verifySessionToken } from "@/lib/auth";

const errorMessages: Record<string, string> = {
  auth_config: "Falta configurar Google Login en el servidor.",
  invalid_state: "La sesion de login expiro. Intenta otra vez.",
  token_exchange: "Google no pudo completar el login.",
  missing_identity: "Google no devolvio la identidad de la cuenta.",
  invalid_identity: "No se pudo validar esa cuenta de Google.",
  not_allowed: "Esa cuenta de Google no esta autorizada para entrar.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(AUTH_SESSION_COOKIE)?.value, getAuthSecret());
  if (session) redirect("/");

  const params = await searchParams;
  const error = params?.error ? errorMessages[params.error] || "No se pudo iniciar sesion." : "";
  const authReady = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && getAuthSecret() && getAllowedAuthEmails().length > 0);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-black/40">
        <div className="mb-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500 text-white">
            <span className="material-icons-round">account_balance_wallet</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">ContableApp</h1>
          <p className="mt-2 text-sm text-slate-300">
            Entra con tu cuenta autorizada de Google para ver tu contabilidad.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {!authReady && (
          <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Configura GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET y AUTH_ALLOWED_EMAILS para activar el acceso.
          </div>
        )}

        <Link
          href={authReady ? "/api/auth/google" : "#"}
          aria-disabled={!authReady}
          className={`flex w-full items-center justify-center gap-3 rounded-xl px-5 py-3 text-sm font-semibold transition ${
            authReady
              ? "bg-white text-slate-950 hover:bg-blue-50"
              : "pointer-events-none bg-slate-700 text-slate-400"
          }`}
        >
          <span className="material-icons-round text-lg">login</span>
          Continuar con Google
        </Link>
      </section>
    </main>
  );
}
