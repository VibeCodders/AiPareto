import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import type { Model, Point } from '../types'
import { formatTokens, formatUsd, niceCeil } from '../pareto'
import type { T } from '../i18n'

export const FRONTIER_COLOR = '#f59e0b'

export type SizeBy = 'none' | 'context' | 'speed'

interface Props {
  points: Point[]
  frontier: Point[]
  frontierSlugs: Set<string>
  logScale: boolean
  colorFor: (family: string) => string
  metricName: string
  /** Label for the X axis: the selected cost view or metric. */
  xName: string
  /** Unit suffix for X values (e.g. "/1M", "/task"; empty for metrics). */
  xUnit: string
  /** True when the X axis is a metric rather than a cost. */
  xIsMetric: boolean
  formatScore: (v: number) => string
  formatTick: (v: number) => string
  t: T
  onSelect: (modelId: string) => void
  /** Third dimension encoded as point radius. */
  sizeBy: SizeBy
  /** Show short model names next to frontier points. */
  showLabels: boolean
  /** Models that get a highlight ring (e.g. in the compare panel or selected). */
  highlightedSlugs: Set<string>
  /** Models whose plotted score is an estimate; drawn with a dashed border. */
  estimatedSlugs: Set<string>
  /** Whether estimation is active at all (controls the legend note). */
  estimatesActive: boolean
  /** Receives the live <svg> element so the host can export it as an image. */
  onSvgReady?: (svg: SVGSVGElement | null) => void
}

interface TooltipPayload {
  payload?: { model?: Model; x?: number; score?: number; scoreEstimated?: boolean }
}

function TooltipContent({ active, payload, t, xName, xUnit, formatX, formatScore }: { active?: boolean; payload?: TooltipPayload[]; t: T; xName: string; xUnit: string; formatX: (v: number) => string; formatScore: (v: number) => string }) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  const m = p?.model
  if (!m) return null
  const tags = [
    m.effort ?? null,
    m.isReasoning ? t.reasoning : null,
    m.openWeights ? t.openWeights : null,
  ].filter(Boolean) as string[]
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
        <span>{xName}:</span>
        <b>{p?.x != null ? formatX(p.x) : '—'}{xUnit}</b>
      </div>
      <div className="tooltip-row">
        <span>{t.score}:</span>
        <b>{p?.score != null ? formatScore(p.score) : '—'}</b>
      </div>
      {tags.length > 0 && (
        <div className="tooltip-row muted" style={{ fontSize: 11, marginTop: 4 }}>
          {tags.join(' · ')}
        </div>
      )}
      {p?.scoreEstimated && (
        <div className="tooltip-row" style={{ fontSize: 11, marginTop: 4 }}>
          <span>≈</span>
          <b style={{ fontWeight: 500 }}>{t.estimated}</b>
        </div>
      )}
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
  index?: number
}

// late-bound so the shape function can read fresh chart state without re-creating the series
const onSelectRef: { current?: (id: string) => void } = {}
const chartStateRef: { current: { sizeBy: SizeBy; showLabels: boolean; highlighted: Set<string>; estimated: Set<string>; width: number } } = {
  current: { sizeBy: 'none', showLabels: false, highlighted: new Set(), estimated: new Set(), width: 0 },
}

/** Radius of a point for a raw sizing value, mapped log-linearly across the domain. */
export function sizeFromValue(v: number, sizeBy: SizeBy): number {
  if (sizeBy === 'none' || v == null || v <= 0) return 5
  const domain: Record<'context' | 'speed', [number, number]> = {
    context: [16_000, 4_000_000],
    speed: [15, 600],
  }
  const [lo, hi] = domain[sizeBy]
  const t = Math.min(1, Math.max(0, (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))))
  return 4.5 + 12 * t
}

function ScatterShape(props: ShapeProps) {
  const cx = props.cx ?? 0
  const cy = props.cy ?? 0
  const isSub = props.payload?.model?.isSubscription
  const isActive = props.isActive === true
  const model = props.payload?.model
  const st = chartStateRef.current
  const label = model?.aaName ?? model?.id ?? ''
  const isHighlighted = model != null && st.highlighted.has(model.slug)
  const isEstimated = model != null && st.estimated.has(model.slug)
  const select = () => model?.slug && onSelectRef.current?.(model.slug)
  const keyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      select()
    }
  }
  const a11y = { tabIndex: 0, role: 'button' as const, 'aria-label': label, onKeyDown: keyDown }

  // Ring around compared/selected models, so the chart and the compare panel stay in sync.
  const ring = isHighlighted && (
    <circle
      cx={cx}
      cy={cy}
      r={isSub ? 11 : 10}
      fill="none"
      stroke="var(--accent)"
      strokeWidth={1.6}
      strokeDasharray="3 2"
      style={{ pointerEvents: 'none' }}
    />
  )

  if (isSub) {
    // Render a prominent star/gem shape for subscriptions
    const scale = isActive ? 1.3 : 1
    return (
      <>
        {ring}
        <polygon
          {...a11y}
          points={`${cx},${cy - 8 * scale} ${cx + 2.5 * scale},${cy - 2.5 * scale} ${cx + 8 * scale},${cy - 2.5 * scale} ${cx + 3.5 * scale},${cy + 1.5 * scale} ${cx + 5.5 * scale},${cy + 7.5 * scale} ${cx},${cy + 4 * scale} ${cx - 5.5 * scale},${cy + 7.5 * scale} ${cx - 3.5 * scale},${cy + 1.5 * scale} ${cx - 8 * scale},${cy - 2.5 * scale} ${cx - 2.5 * scale},${cy - 2.5 * scale}`}
          fill="#eab308"
          stroke="#ffffff"
          strokeWidth={isActive ? 1.8 : 1.2}
          className="pt"
          style={{ filter: isActive ? 'drop-shadow(0 0 7px rgba(234,179,8,0.9))' : 'drop-shadow(0 0 4px rgba(234,179,8,0.6))' }}
          onClick={select}
        />
      </>
    )
  }

  const raw = model ? (st.sizeBy === 'context' ? model.contextTokens : st.sizeBy === 'speed' ? model.outputSpeed : null) : null
  const size = sizeFromValue(raw ?? 0, st.sizeBy)
  const r = isActive ? size * 1.25 + 1 : size

  const shape = props.payload?.isFrontier ? (
    <path
      {...a11y}
      d={`M ${cx - r} ${cy} L ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} Z`}
      fill={props.fill}
      stroke={isActive ? '#ffffff' : 'var(--card)'}
      strokeWidth={isActive ? 2 : 1.2}
      strokeDasharray={isEstimated && !isActive ? '3 3' : undefined}
      className="pt"
      style={isActive ? { filter: `drop-shadow(0 0 6px ${props.fill})` } : undefined}
      onClick={select}
    />
  ) : (
    <circle
      {...a11y}
      cx={cx}
      cy={cy}
      r={r}
      fill={props.fill}
      stroke={isActive ? '#ffffff' : 'var(--card)'}
      strokeWidth={isActive ? 2 : 1.2}
      strokeDasharray={isEstimated && !isActive ? '3 3' : undefined}
      className="pt"
      style={isActive ? { filter: `drop-shadow(0 0 6px ${props.fill})` } : undefined}
      onClick={select}
    />
  )

  // Short name next to frontier points (alternating above/below to reduce overlap).
  let nameLabel: React.ReactNode = null
  if (model && props.payload?.isFrontier && st.showLabels) {
    const nearRight = st.width > 0 && cx > st.width - 110
    const above = (props.index ?? 0) % 2 === 0
    const name = model.subscription ? model.subscription.name : model.name
    nameLabel = (
      <text
        x={nearRight ? cx - r - 7 : cx + r + 7}
        y={above ? cy - 7 : cy + 15}
        fontSize={10}
        fill="var(--text-muted)"
        textAnchor={nearRight ? 'end' : 'start'}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {name}
      </text>
    )
  }

  return (
    <>
      {ring}
      {shape}
      {nameLabel}
    </>
  )
}

/** The three sample sizes shown in the legend under the chart, per size-by mode. */
function sizeLegendItems(sizeBy: SizeBy): { value: number; label: string }[] {
  if (sizeBy === 'context') {
    return [
      { value: 16_000, label: formatTokens(16_000) },
      { value: 250_000, label: formatTokens(250_000) },
      { value: 4_000_000, label: formatTokens(4_000_000) },
    ]
  }
  if (sizeBy === 'speed') {
    return [
      { value: 15, label: '15 tok/s' },
      { value: 100, label: '100 tok/s' },
      { value: 600, label: '600 tok/s' },
    ]
  }
  return []
}

// Kept in a ref so the MutationObserver below always reports to the latest callback without re-subscribing.
const onSvgReadyRef: { current?: (svg: SVGSVGElement | null) => void } = {}

export default function ParetoChart({ points, frontier, frontierSlugs, logScale, colorFor, metricName, xName, xUnit, xIsMetric, formatScore, formatTick, t, onSelect, sizeBy, showLabels, highlightedSlugs, estimatedSlugs, estimatesActive, onSvgReady }: Props) {
  const [wrapWidth, setWrapWidth] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  onSelectRef.current = onSelect
  onSvgReadyRef.current = onSvgReady
  chartStateRef.current = { sizeBy, showLabels, highlighted: highlightedSlugs, estimated: estimatedSlugs, width: wrapWidth }

  // Track the wrapper's pixel width so labels near the right edge can flip to anchor-end.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const update = () => setWrapWidth(wrap.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // Keep the host app's SVG reference fresh (recharts renders its <svg> asynchronously on
  // mount/resize and swaps the node), so the PNG export always serializes the current chart.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const report = () => {
      const svg = wrap.querySelector('svg') ?? null
      onSvgReadyRef.current?.(svg)
    }
    report()
    const mo = new MutationObserver(report)
    mo.observe(wrap, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])

  const data = useMemo(
    () =>
      [...points]
        .sort((a, b) => a.x - b.x)
        .map((p) => ({ ...p, key: `${p.model.id}:${p.model.slug}`, isFrontier: frontierSlugs.has(p.model.slug) })),
    [points, frontierSlugs],
  )
  const frontierSorted = useMemo(() => [...frontier].sort((a, b) => a.x - b.x), [frontier])
  const xTickFormatter = (v: number) => (xIsMetric ? formatTick(v) : formatUsd(v, v < 0.01 ? 4 : v < 1 ? 3 : 1))
  const yDomain: [number, number] = useMemo(() => {
    const max = points.reduce((m, p) => Math.max(m, p.score), 0)
    return [0, niceCeil(max)]
  }, [points])

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <div className="chart-legend">
        <span className="legend-dot" style={{ background: FRONTIER_COLOR }} />
        {t.frontier}
        <span className="legend-muted">— {t.frontierNote}</span>
        {estimatesActive && (
          <>
            <span className="legend-dash" aria-hidden />
            <span className="legend-muted">≈ {t.estimated}</span>
          </>
        )}
      </div>
      <ResponsiveContainer width="100%" height={540}>
        <ComposedChart data={data} margin={{ top: 12, right: 18, bottom: 8, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            type="number"
            scale={xIsMetric ? 'linear' : logScale ? 'log' : 'linear'}
            domain={xIsMetric ? [0, 'auto'] : logScale ? ['auto', 'auto'] : [0, 'auto']}
            allowDataOverflow
            tickFormatter={xTickFormatter}
            stroke="var(--axis)"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{ value: xName, position: 'insideBottom', offset: -4, fill: 'var(--text-muted)', fontSize: 12 }}
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
            content={<TooltipContent t={t} xName={xName} xUnit={xUnit} formatX={xTickFormatter} formatScore={formatScore} />}
            cursor={{ strokeDasharray: '4 4', stroke: 'var(--axis)' }}
            isAnimationActive={false}
          />
          {/* Soft fill under the frontier so the "best region" reads at a glance. */}
          <Area data={frontierSorted} dataKey="score" type="stepAfter" stroke="none" fill={FRONTIER_COLOR} fillOpacity={0.07} isAnimationActive={false} />
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
      {sizeBy !== 'none' && (
        <div className="size-legend">
          <span className="legend-muted">{t.pointSize}:</span>
          {sizeLegendItems(sizeBy).map((item) => (
            <span key={item.label} className="size-legend-item" title={item.label}>
              <span
                className="size-dot"
                style={{ width: sizeFromValue(item.value, sizeBy) * 2.4, height: sizeFromValue(item.value, sizeBy) * 2.4 }}
              />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
