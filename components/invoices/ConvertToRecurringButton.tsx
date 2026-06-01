"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Repeat } from "lucide-react";
import { createRecurringInvoiceFromInvoice } from "@/app/actions";
import { Button } from "@/components/ui/button";

interface ConvertToRecurringButtonProps {
    invoiceId: number;
    mode?: "button" | "icon";
}

export function ConvertToRecurringButton({ invoiceId, mode = "button" }: ConvertToRecurringButtonProps) {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);

    const handleConvert = async (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (submitting) return;

        const confirmed = confirm(
            "Se creara una plantilla recurrente mensual usando esta factura como base. La factura original no se modifica. Deseas continuar?"
        );
        if (!confirmed) return;

        setSubmitting(true);
        try {
            const result = await createRecurringInvoiceFromInvoice(invoiceId);
            if (result.success) {
                router.push("/invoices/recurring");
                router.refresh();
            } else {
                alert(result.error || "No se pudo convertir la factura en recurrente.");
            }
        } catch (error) {
            console.error("Error converting invoice to recurring:", error);
            alert("Error inesperado al convertir la factura.");
        } finally {
            setSubmitting(false);
        }
    };

    if (mode === "icon") {
        return (
            <button
                type="button"
                className="p-1.5 md:p-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 rounded-lg transition-all disabled:opacity-50"
                onClick={handleConvert}
                disabled={submitting}
                title="Hacer recurrente"
            >
                <span className={clsx("material-icons-round text-[18px] md:text-[20px]", { "animate-spin": submitting })}>
                    {submitting ? "sync" : "event_repeat"}
                </span>
            </button>
        );
    }

    return (
        <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={handleConvert}
            disabled={submitting}
        >
            <Repeat className={clsx("h-4 w-4", { "animate-spin": submitting })} />
            {submitting ? "Creando..." : "Hacer recurrente"}
        </Button>
    );
}
