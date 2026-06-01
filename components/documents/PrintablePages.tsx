import { formatDate } from "@/lib/format";

type PrintableDocument = {
    id: number;
    number?: string | null;
    title?: string | null;
    subtitle?: string | null;
    date?: Date | string | null;
    dueDate?: Date | string | null;
    validUntil?: Date | string | null;
    termsAndConditions?: string | null;
    contact?: {
        name?: string | null;
    } | null;
    project?: {
        name?: string | null;
    } | null;
};

type Company = {
    name?: string | null;
    taxId?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
};

const defaultTerms = [
    "Este documento se emite segun los servicios o productos descritos.",
    "Los pagos, entregas y aprobaciones deben realizarse segun las fechas acordadas.",
    "Cualquier cambio, reclamacion o ajuste debe solicitarse por escrito.",
].join("\n");

export function PrintableCoverPage({
    document,
    company,
    label,
}: {
    document: PrintableDocument;
    company: Company;
    label: string;
}) {
    return (
        <section
            className="min-h-[297mm] bg-slate-950 px-14 py-16 text-white print:min-h-screen"
            style={{ breakAfter: "page" }}
        >
            <div className="flex min-h-[250mm] flex-col justify-between">
                <div>
                    <p className="text-sm font-black uppercase tracking-[0.35em] text-blue-200">
                        {company.name || "oFlow by Oasis"}
                    </p>
                    <div className="mt-28 max-w-3xl">
                        <p className="text-xs font-black uppercase tracking-[0.35em] text-blue-300">{label}</p>
                        <h1 className="mt-5 text-5xl font-black leading-tight tracking-tight">
                            {document.title || document.number || label}
                        </h1>
                        {document.subtitle && (
                            <p className="mt-4 text-lg font-medium leading-relaxed text-slate-300">{document.subtitle}</p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-10 border-t border-white/15 pt-8 text-sm text-slate-300">
                    <div className="space-y-2">
                        <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Preparado para</p>
                        <p className="text-xl font-bold text-white">{document.contact?.name || "Sin cliente"}</p>
                        {document.project?.name && <p>Proyecto: {document.project.name}</p>}
                    </div>
                    <div className="space-y-2 text-right">
                        <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Documento</p>
                        <p className="text-xl font-bold text-white">{document.number || document.id}</p>
                        {document.date && <p>Fecha: {formatDate(document.date)}</p>}
                        {document.dueDate && <p>Vence: {formatDate(document.dueDate)}</p>}
                        {document.validUntil && <p>Valido hasta: {formatDate(document.validUntil)}</p>}
                    </div>
                </div>

                <div className="text-xs text-slate-500">
                    {[company.taxId && `RNC: ${company.taxId}`, company.email, company.phone, company.address]
                        .filter(Boolean)
                        .join(" | ")}
                </div>
            </div>
        </section>
    );
}

export function PrintableTermsPage({
    document,
    company,
    title = "Terminos y condiciones",
}: {
    document: PrintableDocument;
    company: Company;
    title?: string;
}) {
    const terms = document.termsAndConditions || defaultTerms;

    return (
        <section
            className="min-h-[297mm] bg-white px-14 py-16 text-slate-900 print:min-h-screen"
            style={{ breakBefore: "page" }}
        >
            <div className="mb-12 flex items-start justify-between border-b border-slate-200 pb-8">
                <div>
                    <p className="text-xl font-black">{company.name || "oFlow by Oasis"}</p>
                    {company.taxId && <p className="mt-1 text-sm text-slate-500">RNC: {company.taxId}</p>}
                </div>
                <div className="text-right">
                    <p className="text-sm font-bold text-slate-500">{document.number || document.id}</p>
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Anexo</p>
                </div>
            </div>

            <h2 className="mb-8 text-3xl font-black tracking-tight">{title}</h2>
            <div className="space-y-4 text-sm leading-7 text-slate-600">
                {terms.split(/\r?\n/).filter(Boolean).map((line, index) => (
                    <p key={index}>{line}</p>
                ))}
            </div>
        </section>
    );
}
