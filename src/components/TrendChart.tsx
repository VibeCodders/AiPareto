import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CostView, MetricKey, Model, ValueScoreBase } from '../types'
import { computeMetric, formatAxisTick, formatMetric, type EfficiencyOpts } from '../pareto'
import { isLowerBetter } from '../urlState'
import type { T } from '../i18n'

interface Props {
  models: Model[]
  metric: MetricKey
  metricName: string
  costView: CostView
  taskInput: number
  taskOutput: number
  valueScoreBase: ValueScoreBase
  efficiencyOpts: EfficiencyOpts
  t: T
}

interface TrendPoint {
  released: string
  best: number
  name: string
}

/**
 * Plots how the best achievable value for the selected metric has improved over time: for each
 * release date, the best value reached by any model released on or before that date (the highest
 * value, or the lowest for lower-is-better metrics like latency). Shows the "frontier over time"
 * rather than a single point-in-time snapshot.
 */
export default function TrendChart({ models, metric, metricName, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts, t }: Props) {
  const lower = isLowerBetter(metric)
  const data = useMemo<TrendPoint[]>(() => {
    const withScore = models
      .filter((m): m is Model & { released: string } => m.released != null)
      .map((m) => ({
        released: m.released as string,
        score: computeMetric(m, metric, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts),
        name: m.aaName,
      }))
      .filter((d): d is { released: string; score: number; name: string } => d.score != null)
      .sort((a, b) => a.released.localeCompare(b.released))

    let best = lower ? Infinity : -Infinity
    let bestName = ''
    const points: TrendPoint[] = []
    for (const d of withScore) {
      if (lower ? d.score < best : d.score > best) {
        best = d.score
        bestName = d.name
      }
      points.push({ released: d.released, best, name: bestName })
    }
    return points
  }, [models, metric, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts, lower])

  if (data.length === 0) return null

  return (
    <div className="trend-wrap">
      <div className="chart-legend">
        {t.trendTitle}
        <span className="legend-muted">— {metricName} · {t.trendHint}</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 18, bottom: 8, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" />
          <XAxis dataKey="released" stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} minTickGap={40} />
          <YAxis stroke="var(--axis)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: number) => formatAxisTick(metric, v)} />
          <Tooltip
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--grid)', borderRadius: 8, fontSize: 12 }}
            formatter={(value, _name, item) => {
              const payload = (item as { payload?: TrendPoint })?.payload
              return [typeof value === 'number' ? formatMetric(metric, value) : String(value ?? ''), payload?.name ?? metricName]
            }}
          />
          <Line dataKey="best" type="stepAfter" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
