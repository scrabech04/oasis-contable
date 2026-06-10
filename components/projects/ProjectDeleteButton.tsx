"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteProject } from "@/app/actions";

export function ProjectDeleteButton({ id, redirectTo = "/projects", compact = false }: { id: number; redirectTo?: string; compact?: boolean }) {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        const confirmed = confirm("¿Seguro que deseas eliminar este proyecto? Las facturas, compras, cotizaciones y suscripciones no se borrarán; solo se desvincularán del proyecto.");
        if (!confirmed) return;

        setIsDeleting(true);
        const result = await deleteProject(id);
        if (!result.success) {
            alert(result.error || "No fue posible eliminar el proyecto.");
            setIsDeleting(false);
            return;
        }

        router.push(redirectTo);
        router.refresh();
    };

    return (
        <Button
            type="button"
            variant="outline"
            size={compact ? "icon" : "sm"}
            onClick={handleDelete}
            disabled={isDeleting}
            className={compact ? "h-9 w-9 border-red-100 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30" : "h-9 px-4 border-red-200 text-red-600 hover:bg-red-50"}
            title="Eliminar proyecto"
        >
            <span className={`material-icons-outlined text-[18px] ${compact ? "" : "mr-2"}`}>delete</span>
            {compact ? null : isDeleting ? "Eliminando..." : "Eliminar"}
        </Button>
    );
}
