"use client";

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ComposedChart, Area } from "recharts";

interface OverviewChartProps {
    data: {
        name: string;
        ingresos: number;
        gastos: number;
        margen?: number;
    }[];
}

export function OverviewChart({ data }: OverviewChartProps) {
    return (
        <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                    <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                    dataKey="name"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                />
                <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `RD$${new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value)}`}
                />
                <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', padding: '12px' }}
                />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '12px', fontWeight: 600 }} />

                <Bar
                    dataKey="ingresos"
                    fill="#3b82f6"
                    radius={[6, 6, 0, 0]}
                    name="Ingresos"
                    barSize={24}
                />
                <Bar
                    dataKey="gastos"
                    fill="#f97316"
                    radius={[6, 6, 0, 0]}
                    name="Gastos"
                    barSize={24}
                />
                <Area
                    type="monotone"
                    dataKey="margen"
                    fill="url(#colorIngresos)"
                    stroke="#10b981"
                    strokeWidth={3}
                    name="Margen Neto"
                />
            </ComposedChart>
        </ResponsiveContainer>
    );
}
