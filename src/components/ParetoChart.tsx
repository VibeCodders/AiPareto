import { useMemo } from 'react'
import { CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import type { Model, Point } from '../types'
import { formatUsd, niceCeil } from '../pareto'
import type { T } from '../i18n'

export const FRONTIER_COLOR = '#f59e0b'

interface Props {
  points: Point[]
  frontier: Point[]
  frontierSlugs: Set<string>
  logScale: boolean
  colorFor: (family: string) => string
  metricName: string
  costName: string
  costUnit: string
  formatScore: (v: number) => string
  formatTick: (v: number) => string
  t: T
  onSelect: (modelId: string) => void
}

interface TooltipPayload {
  payload?: { model?: Model; cost?: number; score?: number }
}

function TooltipContent({ active, payload, t, costUnit, formatScore }: { active?: boolean; payload?: TooltipPayload[]; t: T; costUnit: string; formatScore: (v: number) => string }) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  const m = p?.model
  if (!m) return null
  return (
    <div className="tooltip">
      <div className="tooltip-title">{m.subscription ? `${m.subscription.name} (${m.name})` : m.id}</div>
      {m.isSubscription && m.subscription && (
        <div className="tooltip-row" style={{ color: '#eab308', fontWeight: 600 }}>
          <span>{t.priceMonthly}:</span>
          <b>${m.subscription.priceMonthly}/mo ({(m.subscription.estimatedTokensMonthly / 1e6).toFixed(1)}M tok/mo)</b>
        </div>
      )}
      {m.family && <div className="tooltip-row muted">{m.family}</div>}
      <div className="tooltip-row">
        <span>{t.cost}:</span>
        <b>{formatUsd(p?.cost)}{costUnit}</b>
      </div>
      <div className="tooltip-row">
        <span>{t.score}:</span>
        <b>{p?.score != null ? formatScore(p.score) : '—'}</b>
      </div>
      {m.subscription?.rateLimitDesc && (
        <div className="tooltip-row muted" style={{ fontSize: 11, marginTop: 4 }}>
          {m.subscription.rateLimitDesc}
        </div>
      )}
    </div>
  )
}

interface ShapeProps {
  cx?: number
  cy?: number
  fill?: string
  // Recharts merges `isActive` into every point's props whenever the Scatter has an activeShape
  // configured, regardless of which shape (active or not) ends up rendering — that's how we get
  // real per-point hover state without any manual mouse-tracking of our own.
  isActive?: boolean
  payload?: { model?: Model; isFrontier?: boolean }
}

function ScatterShape(props: ShapeProps) {
  const cx = props.cx ?? 0
  const cy = props.cy ?? 0
  const isSub = props.payload?.model?.isSubscription
  const isActive = props.isActive === true
  const select = () => props.payload?.model?.slug && onSelectRef.current?.(props.payload!.model!.slug)

  if (isSub) {
    // Render a prominent star/gem shape for subscriptions
    const scale = isActive ? 1.3 : 1
    return (
      <polygon
        points={`${cx},${cy - 8 * scale} ${cx + 2.5 * scale},${cy - 2.5 * scale} ${cx + 8 * scale},${cy - 2.5 * scale} ${cx + 3.5 * scale},${cy + 1.5 * scale} ${cx + 5.5 * scale},${cy + 7.5 * scale} ${cx},${cy + 4 * scale} ${cx - 5.5 * scale},${cy + 7.5 * scale} ${cx - 3.5 * scale},${cy + 1.5 * scale} ${cx - 8 * scale},${cy - 2.5 * scale} ${cx - 2.5 * scale},${cy - 2.5 * scale}`}
        fill="#eab308"
        stroke="#ffffff"
        strokeWidth={isActive ? 1.8 : 1.2}
        className="pt"
        style={{ filter: isActive ? 'drop-shadow(0 0 7px rgba(234,179,8,0.9))' : 'drop-shadow(0 0 4px rgba(234,179,8,0.6))' }}
        onClick={select}
      />
    )
  }

  if (props.payload?.isFrontier) {
    const r = isActive ? 9.5 : 7
    return (
      <path
        d={`M ${cx - r} ${cy} L ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} Z`}
        fill={props.fill}
        stroke={isActive ? '#ffffff' : 'var(--card)'}
        strokeWidth={isActive ? 2 : 1.2}
        className="pt"
        style={isActive ? { filter: `drop-shadow(0 0 6px ${props.fill})` } : undefined}
        onClick={select}
      />
    )
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isActive ? 7.5 : 5}
      fill={props.fill}
      stroke={isActive ? '#ffffff' : 'var(--card)'}
      strokeWidth={isActive ? 2 : 1.2}
      className="pt"
      style={isActive ? { filter: `drop-shadow(0 0 6px ${props.fill})` } : undefined}
      onClick={select}
    />
  )
}

// late-bound so the shape function can call onSelect without re-creating series
const onSelectRef: { current?: (id: string) => void } = {}

export default function ParetoChart({ points, frontier, frontierSlugs, logScale, colorFor, metricName, costName, costUnit, formatScore, formatTick, t, onSelect }: Props) {
  onSelectRef.current = onSelect

  const data = useMemo(
    () =>
      [...points]
        .sort((a, b) => a.cost - b.cost)
        .map((p) => ({ ...p, key: `${p.model.id}:${p.model.slug}`, isFrontier: frontierSlugs.has(p.model.slug) })),
    [points, frontierSlugs],
  )
  const frontierSorted = useMemo(() => [...frontier].sort((a, b) => a.cost - b.cost), [frontier])
  const yDomain: [number, number] = useMemo(() => {
    const max = points.reduce((m, p) => Math.max(m, p.score), 0)
    return [0, niceCeil(max)]
  }, [points])

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        <span className="legend-dot" style={{ background: FRONTIER_COLOR }} />
        {t.frontier}
        <span className="legend-muted">— {t.frontierNote}</span>
      </div>
      <ResponsiveContainer width="100%" height={540}>
        <ComposedChart data={data} margin={{ top: 12, right: 18, bottom: 8, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" />
          <XAxis
            dataKey="cost"
            type="number"
            scale={logScale ? 'log' : 'linear'}
            domain={logScale ? ['auto', 'auto'] : [0, 'auto']}
            allowDataOverflow
            tickFormatter={(v: number) => formatUsd(v, v < 0.01 ? 4 : v < 1 ? 3 : 1)}
            stroke="var(--axis)"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{ value: costName, position: 'insideBottom', offset: -4, fill: 'var(--text-muted)', fontSize: 12 }}
          />
          <YAxis
            dataKey="score"
            type="number"
            domain={yDomain}
            tickFormatter={(v: number) => formatTick(v)}
            stroke="var(--axis)"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{ value: metricName, angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--text-muted)', fontSize: 12 }}
          />
          <Tooltip
            content={<TooltipContent t={t} costUnit={costUnit} formatScore={formatScore} />}
            cursor={{ strokeDasharray: '4 4', stroke: 'var(--axis)' }}
            isAnimationActive={false}
          />
          {/* Its own `data` so the frontier step-line only ever traces the frontier points,
              even though the chart's shared data (above) is now the full point set. */}
          <Line data={frontierSorted} dataKey="score" type="stepAfter" stroke={FRONTIER_COLOR} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
          {/* activeShape must be set (even to the same shape) for recharts to track real
              per-point hover state at all — without it every point's `isActive` stays false. */}
          <Scatter name="models" data={data} isAnimationActive={false} shape={<ScatterShape />} activeShape={<ScatterShape />}>
            {data.map((p) => (
              <Cell
                key={p.key}
                fill={p.isFrontier ? FRONTIER_COLOR : colorFor(p.model.family)}
              />
            ))}
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
