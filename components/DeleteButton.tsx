"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface DeleteButtonProps {
    id: number;
    action: (id: number) => Promise<{ success: boolean; error?: string }>;
    label?: string;
    variant?: "default" | "ghost_icon" | "outline";
    /**
     * A donde ir despues de borrar. Necesario cuando el boton vive en el detalle del
     * registro: la lista se revalida sola, pero la pagina del registro borrado no.
     */
    redirectTo?: string;
}

export function DeleteButton({ id, action, label, variant = "default", redirectTo }: DeleteButtonProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();

    const handleDelete = async () => {
        if (!confirm(`¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.`)) {
            return;
        }

        setIsDeleting(true);
        try {
            const result = await action(id);
            if (!result.success) {
                alert(result.error || "Error al eliminar");
                setIsDeleting(false);
                return;
            }

            if (redirectTo) {
                router.push(redirectTo);
                router.refresh();
            }
        } catch (error) {
            console.error(error);
            alert("Error de conexión");
            setIsDeleting(false);
        }
    };

    if (variant === "outline") {
        return (
            <Button
                variant="outline"
                size="sm"
                className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={handleDelete}
                disabled={isDeleting}
            >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? "Eliminando..." : label || "Eliminar"}
            </Button>
        );
    }

    if (variant === "ghost_icon") {
        return (
            <button
                className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 rounded-lg transition-all text-slate-400 disabled:opacity-50"
                onClick={handleDelete}
                disabled={isDeleting}
                title={label || "Eliminar"}
            >
                <span className="material-icons-round text-[20px]">delete</span>
            </button>
        );
    }

    return (
        <Button
            variant="ghost"
            className="h-9 w-9 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={handleDelete}
            disabled={isDeleting}
            title={label || "Eliminar"}
        >
            <span className="material-icons-round">delete</span>
        </Button>
    );
}
