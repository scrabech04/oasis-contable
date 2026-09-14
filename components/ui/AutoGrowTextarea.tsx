"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows">;

// Textarea de una linea que crece con el contenido, para que los titulos y
// descripciones largas de las lineas se lean completos en vez de cortarse
// como en un <input>. Enter agrega salto de linea (el PDF los respeta).
const AutoGrowTextarea = React.forwardRef<HTMLTextAreaElement, Props>(
    ({ className, value, onChange, ...props }, ref) => {
        const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

        const resize = React.useCallback(() => {
            const el = innerRef.current;
            if (!el) return;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
        }, []);

        React.useLayoutEffect(() => {
            resize();
        }, [value, resize]);

        return (
            <textarea
                ref={(el) => {
                    innerRef.current = el;
                    if (typeof ref === "function") ref(el);
                    else if (ref) ref.current = el;
                }}
                rows={1}
                value={value}
                onChange={(e) => {
                    resize();
                    onChange?.(e);
                }}
                className={cn("block resize-none overflow-hidden leading-snug", className)}
                {...props}
            />
        );
    }
);
AutoGrowTextarea.displayName = "AutoGrowTextarea";

export { AutoGrowTextarea };
