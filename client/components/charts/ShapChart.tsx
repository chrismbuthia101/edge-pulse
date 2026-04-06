"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"

interface ShapFeature {
    feature_name: string
    feature_value: number
    attribution_score: number
    contribution_type: "positive" | "negative"
    rank: number
}

interface ShapChartProps {
    data: ShapFeature[]
}

export function ShapChart({ data }: ShapChartProps) {
    const sorted = [...data].sort(
        (a, b) => Math.abs(b.attribution_score) - Math.abs(a.attribution_score)
    ).slice(0, 10)

    const chartData = sorted.map((f) => ({
        name: f.feature_name.length > 20 ? f.feature_name.slice(0, 20) + "…" : f.feature_name,
        value: f.attribution_score,
        abs: Math.abs(f.attribution_score),
        positive: f.contribution_type === "positive",
    }))

    return (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 12 }} />
                <Tooltip
                    formatter={(value) => [typeof value === 'number' ? value.toFixed(4) : String(value || "0"), "Attribution Score"]}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                        <Cell
                            key={`cell-${index}`}
                            fill={entry.positive ? "#ef4444" : "#22c55e"}
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    )
}