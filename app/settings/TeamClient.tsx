"use client";

import { useState } from "react";
import { Check, Copy, Link2, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteTeamMember, inviteAccountant, revokeTeamMember, type TeamMember } from "@/app/team-actions";
import { primaryActionClass } from "@/lib/ui-styles";

type Profile = { id: number; name: string };

const STATUS_LABEL: Record<string, string> = {
  INVITED: "Invitación pendiente",
  ACTIVE: "Activo",
  DISABLED: "Revocado",
};

export default function TeamClient({ members, profiles }: { members: TeamMember[]; profiles: Profile[] }) {
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ url: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <CardHeader className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Users className="h-5 w-5" />
            <CardTitle>Acceso de terceros</CardTitle>
          </div>
          <CardDescription>
            Invita a tu contador con acceso de solo lectura a compras, gastos y reportes. No podrá crear,
            editar ni eliminar nada.
          </CardDescription>
        </div>
        {!isInviting ? (
          <Button onClick={() => { setIsInviting(true); setInvite(null); setError(null); }} size="sm" className={primaryActionClass}>
            <UserPlus className="h-4 w-4" /> Invitar
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {isInviting ? (
          <div className="rounded-xl border bg-slate-50 dark:bg-slate-900/50 p-4">
            <h4 className="font-bold mb-4">Nueva invitación</h4>
            <form
              action={async (fd) => {
                setError(null);
                const result = await inviteAccountant(fd);
                if (result.success) {
                  setInvite({ url: result.url, email: result.email });
                  setIsInviting(false);
                } else {
                  setError(result.error);
                }
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Correo del contador</Label>
                <Input name="email" type="email" required placeholder="contador@ejemplo.com" />
                <p className="text-xs text-slate-500">
                  Tendrá que entrar con la cuenta de Google de este mismo correo. El enlace no funciona con
                  otra cuenta.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Perfiles a los que tendrá acceso</Label>
                <div className="space-y-2">
                  {profiles.map((profile) => (
                    <label key={profile.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="profileIds" value={profile.id} className="h-4 w-4" />
                      {profile.name}
                    </label>
                  ))}
                </div>
              </div>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <div className="flex gap-2">
                <Button type="submit" size="sm" className={primaryActionClass}>Generar enlace</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => { setIsInviting(false); setError(null); }}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        ) : null}

        {invite ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
              <Link2 className="h-4 w-4" /> Enlace listo para {invite.email}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Cópialo y envíaselo tú por WhatsApp o correo. Vence en 7 días y solo sirve una vez.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={invite.url} className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
              <Button type="button" size="sm" variant="outline" onClick={() => copyLink(invite.url)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ) : null}

        {members.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no has invitado a nadie.</p>
        ) : (
          <div className="divide-y">
            {members.map((member) => (
              <div key={member.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4 text-slate-400" />
                    {member.name || member.email}
                  </div>
                  <p className="text-xs text-slate-500">
                    {member.email} · {STATUS_LABEL[member.status] || member.status} ·{" "}
                    {member.profileNames.join(", ") || "sin perfiles"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {member.status !== "DISABLED" ? (
                    <form action={async () => { await revokeTeamMember(member.id); }}>
                      <Button type="submit" size="sm" variant="outline">Revocar</Button>
                    </form>
                  ) : null}
                  <form action={async () => { await deleteTeamMember(member.id); }}>
                    <Button type="submit" size="sm" variant="ghost" className="text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
