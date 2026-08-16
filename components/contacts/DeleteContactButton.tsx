"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { deleteContact } from "@/app/actions";

type Option = { id: number; name: string };

/**
 * Borrar un contacto con documentos no puede ser un boton a secas: sus facturas y compras
 * apuntan a el y hay que decidir a quien pasan. Cuando eso ocurre, este boton pregunta a
 * donde moverlos en vez de fallar con un error y dejar al usuario sin salida.
 */
export function DeleteContactButton({
  id,
  name,
  contacts,
}: {
  id: number;
  name: string;
  contacts: Option[];
}) {
  const toast = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string>("");

  const others = contacts.filter((contact) => contact.id !== id);

  const run = async (reassignToId?: number) => {
    setIsDeleting(true);
    try {
      const result = await deleteContact(id, reassignToId);
      if (!result.success) {
        if ("linked" in result && result.linked) {
          // Tiene documentos: se pregunta a donde van en vez de rendirse.
          setBlocked(result.error || "Tiene documentos asociados.");
        } else {
          toast.error("No se pudo eliminar", result.error);
        }
        return;
      }

      const moved = "moved" in result ? result.moved : 0;
      toast.success(
        "Contacto eliminado",
        moved ? `Se movieron ${moved} documento${moved === 1 ? "" : "s"} al contacto elegido.` : undefined
      );
      setBlocked(null);
    } catch {
      toast.error("No se pudo eliminar", "Revisa tu conexión e intenta de nuevo.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (blocked) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="text-xs text-amber-800 dark:text-amber-300">{blocked}</p>
        {others.length === 0 ? (
          <p className="text-xs text-slate-500">No hay otro contacto al que moverlos. Crea uno primero.</p>
        ) : (
          <>
            <select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">Mover los documentos a...</option>
              {others.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
                disabled={!targetId || isDeleting}
                onClick={() => {
                  if (!confirm(`Se moverán los documentos de "${name}" al contacto elegido y "${name}" se eliminará. Esta acción no se puede deshacer.`)) return;
                  run(Number(targetId));
                }}
              >
                Mover y eliminar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBlocked(null)} disabled={isDeleting}>
                Cancelar
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
      disabled={isDeleting}
      onClick={() => {
        if (!confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`)) return;
        run();
      }}
      aria-label={`Eliminar ${name}`}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
