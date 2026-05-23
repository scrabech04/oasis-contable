"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    // Avoid hydration mismatch
    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <Button variant="ghost" size="icon" className="w-9 px-0">
                <span className="sr-only">Cambiar tema</span>
            </Button>
        );
    }

    return (
        <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="flex items-center gap-3 w-full px-3 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-all group"
        >
            {theme === "light" ? (
                <>
                    <span className="material-icons-round text-[20px] group-hover:text-primary">dark_mode</span>
                    <span className="text-sm">Modo Oscuro</span>
                </>
            ) : (
                <>
                    <span className="material-icons-round text-[20px] group-hover:text-primary">light_mode</span>
                    <span className="text-sm">Modo Claro</span>
                </>
            )}
        </button>
    );
}
