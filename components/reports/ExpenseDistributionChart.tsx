"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface ExpenseDistributionChartProps {
    data: {
        name: string;
        value: number;
    }[];
}

const COLORS = ["#3b82f6", "#f97316", "#10b981", "#8b5cf6", "#f43f5e", "#eab308", "#06b6d4", "#ec4899"];

export function ExpenseDistributionChart({ data }: ExpenseDistributionChartProps) {
    if (!data || data.length === 0) {
        return <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">No hay datos de gastos suficientes.</div>;
    }

    return (
        <ResponsiveContainer width="100%" height={350}>
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                >
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip
                    formatter={(value: number | string | any) => `RD$${new Intl.NumberFormat('en-US').format(Number(value) || 0)}`}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                />
                <Legend
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    wrapperStyle={{ fontSize: '11px', paddingLeft: '20px' }}
                />
            </PieChart>
        </ResponsiveContainer>
    );
}
