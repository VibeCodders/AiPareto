import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CostView, Model, ValueScoreBase } from '../types'
import { valueScoreOf } from '../pareto'
import type { T } from '../i18n'

interface Props {
  models: Model[]
  costView: CostView
  taskInput: number
  taskOutput: number
  valueScoreBase: ValueScoreBase
  t: T
}

interface TrendPoint {
  released: string
  best: number
  name: string
}

/**
 * Plots how the best achievable Value Score (benchmark/$) has improved over time: for each
 * release date, the highest Value Score reached by any model released on or before that date.
 * Shows the "frontier over time" rather than a single point-in-time snapshot.
 */
export default function TrendChart({ models, costView, taskInput, taskOutput, valueScoreBase, t }: Props) {
  const data = useMemo<TrendPoint[]>(() => {
    const withScore = models
      .filter((m): m is Model & { released: string } => m.released != null)
      .map((m) => ({ released: m.released, score: valueScoreOf(m, costView, taskInput, taskOutput, valueScoreBase), name: m.aaName }))
      .filter((d): d is { released: string; score: number; name: string } => d.score != null)
      .sort((a, b) => a.released.localeCompare(b.released))

    let best = 0
    let bestName = ''
    const points: TrendPoint[] = []
    for (const d of withScore) {
      if (d.score > best) {
        best = d.score
        bestName = d.name
      }
      points.push({ released: d.released, best, name: bestName })
    }
    return points
  }, [models, costView, taskInput, taskOutput, valueScoreBase])

  if (data.length === 0) return null

  return (
    <div className="trend-wrap">
      <div className="chart-legend">
        {t.trendTitle}
        <span className="legend-muted">— {t.trendHint}</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 18, bottom: 8, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" />
          <XAxis dataKey="released" stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} minTickGap={40} />
          <YAxis stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: number) => v.toFixed(1)} />
          <Tooltip
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--grid)', borderRadius: 8, fontSize: 12 }}
            formatter={(value, _name, item) => {
              const payload = (item as { payload?: TrendPoint })?.payload
              return [typeof value === 'number' ? value.toFixed(2) : String(value ?? ''), payload?.name ?? t.valueScore]
            }}
          />
          <Line dataKey="best" type="stepAfter" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
