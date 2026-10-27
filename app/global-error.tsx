"use client";

import "./globals.css";
import { RecoverableError } from "@/components/RecoverableError";

/** Cubre los fallos del propio layout, que app/error.tsx no alcanza. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="es">
      <body className="bg-slate-50 dark:bg-[#0b1016]">
        <RecoverableError error={error} />
      </body>
    </html>
  );
}
