import Link from "next/link";
import { ROLE_ACCOUNTANT } from "@/lib/auth";
import { previewInvite } from "@/lib/invite-flow";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await previewInvite(token);

  if (!invite) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold">Invitación no válida</h1>
        <p className="text-sm text-muted-foreground">
          Este enlace ya se usó, se venció o no existe. Pídele a quien te invitó que te genere uno nuevo.
        </p>
      </main>
    );
  }

  const roleLabel =
    invite.role === ROLE_ACCOUNTANT ? "solo lectura de compras, gastos y reportes" : "acceso completo";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Te invitaron a oFlow</h1>
        <p className="text-sm text-muted-foreground">
          {invite.invitedByEmail ? `${invite.invitedByEmail} te dio acceso ` : "Tienes acceso "}
          con <strong>{roleLabel}</strong>.
        </p>
      </div>

      <div className="rounded-lg border p-4 text-sm">
        <p className="mb-2">
          <span className="text-muted-foreground">Correo invitado:</span> <strong>{invite.email}</strong>
        </p>
        <p>
          <span className="text-muted-foreground">
            {invite.profileNames.length === 1 ? "Perfil:" : "Perfiles:"}
          </span>{" "}
          <strong>{invite.profileNames.join(", ") || "ninguno asignado"}</strong>
        </p>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Para aceptar, inicia sesión con la cuenta de Google de <strong>{invite.email}</strong>. El enlace no
        funciona con ninguna otra cuenta.
      </p>

      <Link
        href={`/api/auth/google?invite=${encodeURIComponent(token)}`}
        className="rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground"
      >
        Continuar con Google
      </Link>
    </main>
  );
}
