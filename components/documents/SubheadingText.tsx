import { splitSubheading } from "@/lib/subheading";

// Version web del subtitulo "ROTULO: explicacion": rotulo en negrita, explicacion en peso
// normal, igual que en el PDF.
export function SubheadingText({ text }: { text: string }) {
    const parts = splitSubheading(text);
    if (!parts) return <>{text}</>;
    return (
        <>
            <span className="font-semibold">{parts.label}:</span>{" "}
            <span className="font-normal">{parts.body}</span>
        </>
    );
}
