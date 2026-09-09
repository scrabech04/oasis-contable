"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TopSuppliersChartProps {
    data: { name: string; total: number; count: number }[];
}

// Del mas oscuro al mas claro: el orden del ranking se lee tambien en el color.
const SHADES = ["#f97316", "#fb923c", "#fdba74", "#fed7aa", "#ffedd5", "#fff7ed"];

/** El conteo viaja en el punto del grafico; recharts lo entrega sin tipar. */
function countOf(item: { payload?: { count?: number } } | undefined) {
    return item?.payload?.count ?? 0;
}

function shorten(name: string) {
    return name.length > 22 ? `${name.slice(0, 21)}...` : name;
}

export function TopSuppliersChart({ data }: TopSuppliersChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-sm italic text-slate-400">
                No hay compras registradas en este periodo.
            </div>
        );
    }

    const chartData = data.map((supplier) => ({ ...supplier, label: shorten(supplier.name) }));

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <XAxis
                    type="number"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `RD$${new Intl.NumberFormat("en-US", { notation: "compact" }).format(value)}`}
                />
                <YAxis
                    type="category"
                    dataKey="label"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={140}
                />
                <Tooltip
                    cursor={{ fill: "#f8fafc" }}
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", padding: "12px" }}
                    formatter={(value, _name, item) => [
                        `RD$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`,
                        `${countOf(item) ?? 0} ${countOf(item) === 1 ? "compra" : "compras"}`,
                    ]}
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.name ?? ""}
                />
                <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={22} name="Gastado">
                    {chartData.map((entry, index) => (
                        <Cell key={entry.name} fill={SHADES[index % SHADES.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
