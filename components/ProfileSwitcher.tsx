"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, UserRound, Building2 } from "lucide-react";
import { setActiveProfile } from "@/app/actions";

type Profile = {
  id: number;
  name: string;
  taxId: string;
  type: string;
};

export function ProfileSwitcher({
  profiles,
  activeProfileId,
}: {
  profiles: Profile[];
  activeProfileId: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0];

  if (!activeProfile) return null;

  return (
    <div className="px-4 pb-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/60">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {activeProfile.type === "PERSON" ? <UserRound className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
          Perfil activo
        </div>
        <div className="relative">
          <select
            value={activeProfileId}
            disabled={isPending}
            onChange={(event) => {
              const nextProfileId = Number(event.target.value);
              startTransition(async () => {
                await setActiveProfile(nextProfileId);
                router.refresh();
              });
            }}
            className="h-11 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-9 text-sm font-semibold text-slate-800 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-wait disabled:opacity-70 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {activeProfile.taxId || "Sin RNC/Cédula"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
            <Check className="h-3 w-3" />
            Activo
          </span>
        </div>
      </div>
    </div>
  );
}
