"use client";

import { useId, useState } from "react";

interface PurchaseTagsInputProps {
    value: string[];
    onChange: (tags: string[]) => void;
    /** Etiquetas ya usadas en otras compras del perfil. */
    suggestions?: string[];
}

/**
 * Etiquetas libres de una compra. Enter o coma agregan la etiqueta; si ya existe una igual
 * en otra compra (sin importar mayusculas) se reusa esa forma, para que "comic-con" y
 * "Comic-Con" no terminen como dos grupos distintos en el filtro.
 */
export function PurchaseTagsInput({ value, onChange, suggestions = [] }: PurchaseTagsInputProps) {
    const [draft, setDraft] = useState("");
    const listId = useId();

    const addTag = (raw: string) => {
        const cleaned = raw.replace(/\s+/g, " ").trim();
        if (!cleaned) return;
        const key = cleaned.toLocaleLowerCase("es");
        if (value.some((tag) => tag.toLocaleLowerCase("es") === key)) {
            setDraft("");
            return;
        }
        const existing = suggestions.find((tag) => tag.toLocaleLowerCase("es") === key);
        onChange([...value, existing || cleaned]);
        setDraft("");
    };

    const available = suggestions.filter(
        (tag) => !value.some((current) => current.toLocaleLowerCase("es") === tag.toLocaleLowerCase("es"))
    );

    return (
        <div className="space-y-2">
            {value.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {value.map((tag) => (
                        <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 py-1 pl-3 pr-1.5 text-xs font-bold text-violet-700 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-300"
                        >
                            {tag}
                            <button
                                type="button"
                                onClick={() => onChange(value.filter((current) => current !== tag))}
                                className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-violet-200 dark:hover:bg-violet-800"
                                aria-label={`Quitar etiqueta ${tag}`}
                            >
                                <span className="material-icons-round text-[12px]">close</span>
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div className="flex gap-2">
                <input
                    list={listId}
                    value={draft}
                    placeholder="Ej: Evento Comic-Con"
                    className="w-full bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg py-2.5 px-3 text-sm focus:ring-blue-600 focus:border-blue-600 transition-all"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === ",") {
                            event.preventDefault();
                            addTag(draft);
                        } else if (event.key === "Backspace" && !draft && value.length > 0) {
                            onChange(value.slice(0, -1));
                        }
                    }}
                    onBlur={() => addTag(draft)}
                />
                <button
                    type="button"
                    onClick={() => addTag(draft)}
                    disabled={!draft.trim()}
                    className="shrink-0 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                    Agregar
                </button>
                <datalist id={listId}>
                    {available.map((tag) => (
                        <option key={tag} value={tag} />
                    ))}
                </datalist>
            </div>
        </div>
    );
}
