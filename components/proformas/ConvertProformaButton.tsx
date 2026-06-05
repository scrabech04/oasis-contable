"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { convertProformaToInvoice } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { FileCheck2 } from "lucide-react";

export function ConvertProformaButton({ proformaId, disabled }: { proformaId: number; disabled?: boolean }) {
  const router = useRouter();
  const [isConverting, setIsConverting] = useState(false);

  const convert = async () => {
    if (disabled || isConverting) return;
    const ncf = prompt("NCF/e-NCF de la factura fiscal final. Puedes dejarlo vacio y asignarlo/editarlos despues.");
    if (ncf === null) return;
    setIsConverting(true);
    const formData = new FormData();
    formData.set("ncf", ncf.trim());
    formData.set("date", new Date().toISOString().slice(0, 10));
    formData.set("dueDate", new Date().toISOString().slice(0, 10));
    formData.set("incomeType", "01");
    const result = await convertProformaToInvoice(proformaId, formData);
    setIsConverting(false);
    if (!result.success) {
      alert(result.error);
      return;
    }
    router.push(`/invoices/${result.invoiceId || result.id}`);
    router.refresh();
  };

  return (
    <Button onClick={convert} disabled={disabled || isConverting} size="sm" className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
      <FileCheck2 className="h-4 w-4" />
      {isConverting ? "Convirtiendo..." : "Convertir a factura"}
    </Button>
  );
}
