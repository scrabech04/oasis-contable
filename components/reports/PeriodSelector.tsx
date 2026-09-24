"use client";

import { Calendar } from "lucide-react";
import { useRouter } from "next/navigation";

interface PeriodSelectorProps {
    currentPeriod: string;
    tab: string;
    /**
     * La pantalla a la que se vuelve al cambiar de mes. Hacia falta porque estaba fijo en
     * "/reports": desde la IT-1, elegir otro mes te sacaba al 606/607, asi que la IT-1 solo se
     * podia ver en el mes en curso.
     */
    basePath?: string;
}

export function PeriodSelector({ currentPeriod, tab, basePath = "/reports" }: PeriodSelectorProps) {
    const router = useRouter();
    const go = (value: string) => router.push(`${basePath}?period=${value}&tab=${tab}`);

    const formatPeriod = (p: string) => {
        const year = p.substring(0, 4);
        const month = p.substring(4, 6);
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    };

    const periods = Array.from({ length: 12 }).map((_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const p = d.getFullYear() + (d.getMonth() + 1).toString().padStart(2, '0');
        return { value: p, label: formatPeriod(p), short: d.toLocaleString('es-ES', { month: 'short' }) };
    });

    return (
        <div className="flex items-center gap-2 bg-muted/20 p-2 rounded-lg border">
            <Calendar className="h-4 w-4 text-muted-foreground ml-2" />
            <select
                value={currentPeriod}
                className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer"
                onChange={(e) => go(e.target.value)}
            >
                {periods.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                ))}
            </select>

            <div className="flex gap-1 ml-2 border-l pl-2">
                {periods.slice(0, 4).reverse().map((p) => (
                    <button
                        key={p.value}
                        onClick={() => go(p.value)}
                        className={`px-2 py-1 rounded text-xs transition-colors ${currentPeriod === p.value ? 'bg-blue-600 text-white' : 'hover:bg-muted text-muted-foreground'}`}
                    >
                        {p.short}
                    </button>
                ))}
            </div>
        </div>
    );
}
