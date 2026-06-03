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
    logo?: string | null;
    logoUrl?: string | null;
    coverImageUrl?: string | null;
    coverImageFit?: string | null;
    coverImagePosition?: string | null;
    coverOverlayOpacity?: number | null;
    coverTextPosition?: string | null;
    coverTextColor?: string | null;
    coverAccentColor?: string | null;
    coverShowLogo?: boolean | null;
    coverShowClient?: boolean | null;
    coverShowDocumentNumber?: boolean | null;
    coverShowDate?: boolean | null;
    coverShowProject?: boolean | null;
};

const defaultTerms = [
    "Este documento se emite segun los servicios o productos descritos.",
    "Los pagos, entregas y aprobaciones deben realizarse segun las fechas acordadas.",
    "Cualquier cambio, reclamacion o ajuste debe solicitarse por escrito.",
].join("\n");

function imagePosition(value?: string | null) {
    const map: Record<string, string> = {
        TOP: "center top",
        BOTTOM: "center bottom",
        LEFT: "left center",
        RIGHT: "right center",
        CENTER: "center center",
    };
    return map[value || "CENTER"] || map.CENTER;
}

function textPositionClass(value?: string | null) {
    const map: Record<string, string> = {
        TOP_LEFT: "items-start justify-start text-left",
        TOP_RIGHT: "items-end justify-start text-right",
        CENTER: "items-center justify-center text-center",
        BOTTOM_LEFT: "items-start justify-end text-left",
        BOTTOM_RIGHT: "items-end justify-end text-right",
    };
    return map[value || "BOTTOM_LEFT"] || map.BOTTOM_LEFT;
}

export function PrintableCoverPage({
    document,
    company,
    label,
}: {
    document: PrintableDocument;
    company: Company;
    label: string;
}) {
    const accentColor = company.coverAccentColor || "#2563eb";
    const textColor = company.coverTextColor || "#ffffff";
    const overlayOpacity = typeof company.coverOverlayOpacity === "number" ? company.coverOverlayOpacity : 0.35;
    const fit = company.coverImageFit === "CONTAIN" ? "contain" : "cover";

    return (
        <section
            className={`relative flex min-h-[297mm] overflow-hidden bg-slate-950 px-14 py-16 print:min-h-screen ${textPositionClass(company.coverTextPosition)}`}
            style={{ breakAfter: "page" }}
        >
            {company.coverImageUrl ? (
                <img
                    src={company.coverImageUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full"
                    style={{ objectFit: fit, objectPosition: imagePosition(company.coverImagePosition) }}
                />
            ) : null}
            <div className="absolute inset-0 bg-black" style={{ opacity: overlayOpacity }} />

            <div className="relative z-10 flex min-h-[250mm] flex-col justify-between" style={{ color: textColor }}>
                <div className="max-w-3xl">
                    {company.coverShowLogo !== false && (
                        <p className="text-sm font-black uppercase tracking-[0.35em]" style={{ color: accentColor }}>
                            {company.name || "oFlow by Oasis"}
                        </p>
                    )}
                    <div className="mt-20 h-1 w-28 rounded-full" style={{ backgroundColor: accentColor }} />
                    <div className="mt-10">
                        <p className="text-xs font-black uppercase tracking-[0.35em]" style={{ color: accentColor }}>{label}</p>
                        <h1 className="mt-5 text-5xl font-black leading-tight tracking-tight">
                            {document.title || document.number || label}
                        </h1>
                        {document.subtitle && (
                            <p className="mt-4 text-lg font-medium leading-relaxed opacity-85">{document.subtitle}</p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-10 border-t border-white/25 pt-8 text-sm opacity-90">
                    {company.coverShowClient !== false && (
                        <div className="space-y-2">
                            <p className="text-xs font-black uppercase tracking-[0.25em] opacity-60">Preparado para</p>
                            <p className="text-xl font-bold">{document.contact?.name || "Sin cliente"}</p>
                            {company.coverShowProject !== false && document.project?.name && <p>Proyecto: {document.project.name}</p>}
                        </div>
                    )}
                    <div className="space-y-2 text-right">
                        <p className="text-xs font-black uppercase tracking-[0.25em] opacity-60">Documento</p>
                        {company.coverShowDocumentNumber !== false && <p className="text-xl font-bold">{document.number || document.id}</p>}
                        {company.coverShowDate !== false && document.date && <p>Fecha: {formatDate(document.date)}</p>}
                        {document.dueDate && <p>Vence: {formatDate(document.dueDate)}</p>}
                        {document.validUntil && <p>Valido hasta: {formatDate(document.validUntil)}</p>}
                    </div>
                </div>

                <div className="text-xs opacity-65">
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
