"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface ReceivableAgingChartProps {
    data: { name: string; value: number; count: number }[];
}

// Verde lo que todavia esta a tiempo y rojo lo que lleva mas de tres meses: el color dice
// solo la urgencia, sin tener que leer los rotulos.
const BUCKET_COLORS = ["#10b981", "#facc15", "#fb923c", "#f43f5e", "#9f1239"];

/** El conteo viaja en el punto del grafico; recharts lo entrega sin tipar. */
function countOf(item: { payload?: { count?: number } } | undefined) {
    return item?.payload?.count ?? 0;
}

export function ReceivableAgingChart({ data }: ReceivableAgingChartProps) {
    const total = data.reduce((sum, bucket) => sum + bucket.value, 0);

    if (total <= 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                <span className="material-icons-round text-4xl text-emerald-400">task_alt</span>
                <p className="text-sm italic">No tienes nada pendiente de cobro.</p>
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `RD$${new Intl.NumberFormat("en-US", { notation: "compact" }).format(value)}`}
                />
                <Tooltip
                    cursor={{ fill: "#f8fafc" }}
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", padding: "12px" }}
                    formatter={(value, _name, item) => [
                        `RD$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`,
                        `${countOf(item) ?? 0} ${countOf(item) === 1 ? "factura" : "facturas"}`,
                    ]}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={38} name="Pendiente">
                    {data.map((entry, index) => (
                        <Cell key={entry.name} fill={BUCKET_COLORS[index % BUCKET_COLORS.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
