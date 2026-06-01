"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteProject } from "@/app/actions";

export function ProjectDeleteButton({ id, redirectTo = "/projects" }: { id: number; redirectTo?: string }) {
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
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="h-9 px-4 border-red-200 text-red-600 hover:bg-red-50"
        >
            <span className="material-icons-outlined mr-2 text-[18px]">delete</span>
            {isDeleting ? "Eliminando..." : "Eliminar"}
        </Button>
    );
}
