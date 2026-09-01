import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import type { Model, Point } from '../types'
import { formatTokens, formatUsd, niceCeil } from '../pareto'
import { shortNameOf } from '../modelMeta'
import type { T } from '../i18n'

export const FRONTIER_COLOR = '#f59e0b'

export type SizeBy = 'none' | 'context' | 'speed' | 'downloads'

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
  payload?: { model?: Model; x?: number; score?: number; scoreEstimated?: boolean; xEstimated?: boolean }
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
        <b className={p?.xEstimated ? 'est' : ''}>
          {p?.xEstimated ? '≈ ' : ''}{p?.x != null ? formatX(p.x) : '—'}{xUnit}
        </b>
      </div>
      <div className="tooltip-row">
        <span>{t.score}:</span>
        <b className={p?.scoreEstimated ? 'est' : ''}>
          {p?.scoreEstimated ? '≈ ' : ''}{p?.score != null ? formatScore(p.score) : '—'}
        </b>
      </div>
      {tags.length > 0 && (
        <div className="tooltip-row muted" style={{ fontSize: 11, marginTop: 4 }}>
          {tags.join(' · ')}
        </div>
      )}
      {(p?.scoreEstimated || p?.xEstimated) && (
        <div className="tooltip-row" style={{ fontSize: 11, marginTop: 4, color: 'var(--accent)' }}>
          <span>≈</span>
          <b style={{ fontWeight: 500 }}>
            {p?.scoreEstimated && p?.xEstimated
              ? `${t.estimated} (X & Y)`
              : p?.scoreEstimated
              ? `${t.estimated} (${t.score})`
              : `${t.estimated} (${xName})`}
          </b>
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
  const domain: Record<'context' | 'speed' | 'downloads', [number, number]> = {
    context: [16_000, 4_000_000],
    speed: [15, 600],
    downloads: [5_000, 40_000_000],
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

  const raw = model
    ? st.sizeBy === 'context'
      ? model.contextTokens
      : st.sizeBy === 'speed'
      ? model.outputSpeed
      : st.sizeBy === 'downloads'
      ? model.hfDownloads
      : null
    : null
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
    const name = shortNameOf(model)
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
  if (sizeBy === 'downloads') {
    return [
      { value: 5_000, label: formatTokens(5_000) },
      { value: 1_000_000, label: formatTokens(1_000_000) },
      { value: 40_000_000, label: formatTokens(40_000_000) },
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

  // ---- Zoom & pan -------------------------------------------------------------
  // null domains mean "full view"; once zoomed they hold the visible data-space range.
  const [zoom, setZoom] = useState<{ x: [number, number] | null; y: [number, number] | null }>({ x: null, y: null })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ clientX: number; clientY: number; x0: [number, number]; y0: [number, number] } | null>(null)

  const xFull = useMemo<[number, number]>(() => {
    if (points.length === 0) return [0, 1]
    let min = Infinity
    let max = -Infinity
    for (const p of points) {
      if (p.x < min) min = p.x
      if (p.x > max) max = p.x
    }
    if (!xIsMetric && logScale) return [min, max]
    return [0, niceCeil(max)]
  }, [points, xIsMetric, logScale])

  const yFull = useMemo<[number, number]>(() => {
    const max = points.reduce((m, p) => Math.max(m, p.score), 0)
    return [0, niceCeil(max)]
  }, [points])

  const resetZoom = () => setZoom({ x: null, y: null })
  const zoomed = zoom.x != null || zoom.y != null

  // Reset automatically whenever the underlying data or axes change (filters, metric, scale…).
  useEffect(() => {
    resetZoom()
  }, [points, xIsMetric, logScale])

  const clampDomain = (d: [number, number], full: [number, number]): [number, number] => {
    const [lo, hi] = d
    const [flo, fhi] = full
    if (hi - lo >= fhi - flo) return [flo, fhi]
    if (lo < flo) return [flo, flo + (hi - lo)]
    if (hi > fhi) return [fhi - (hi - lo), fhi]
    return [lo, hi]
  }

  const pxToDataX = (px: number, domain: [number, number], width: number): number => {
    const t = px / width
    if (!xIsMetric && logScale) {
      const [lo, hi] = domain
      return Math.pow(10, Math.log10(lo) + t * (Math.log10(hi) - Math.log10(lo)))
    }
    return domain[0] + t * (domain[1] - domain[0])
  }

  const pxToDataY = (py: number, domain: [number, number], height: number): number => domain[1] - (py / height) * (domain[1] - domain[0])

  // The recharts grid group's bounding box is exactly the plot area, so pixel↔data
  // conversions stay exact regardless of axis widths or margins.
  const getPlotRect = () => {
    const grid = wrapRef.current?.querySelector('.recharts-cartesian-grid') as SVGGraphicsElement | null
    if (!grid) return null
    const r = grid.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  }

  const handleWheel = (e: WheelEvent) => {
    const rect = getPlotRect()
    if (!rect) return
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    if (px < 0 || px > rect.width || py < 0 || py > rect.height) return
    const curX = zoom.x ?? xFull
    const curY = zoom.y ?? yFull
    const factor = e.deltaY < 0 ? 1 / 1.25 : 1.25
    // Stop zooming in once the view is extremely narrow.
    const minSpan = (full: [number, number]) => (full[1] - full[0]) * 0.01
    if (factor < 1 && (curX[1] - curX[0] <= minSpan(xFull) || curY[1] - curY[0] <= minSpan(yFull))) return
    const cx = pxToDataX(px, curX, rect.width)
    const cy = pxToDataY(py, curY, rect.height)
    const nx: [number, number] = [cx - (cx - curX[0]) * factor, cx + (curX[1] - cx) * factor]
    const ny: [number, number] = [cy - (cy - curY[0]) * factor, cy + (curY[1] - cy) * factor]
    setZoom({ x: clampDomain(nx, xFull), y: clampDomain(ny, yFull) })
  }

  // Native non-passive listener so we can preventDefault() and stop the page from
  // scrolling while zooming over the chart (React's synthetic wheel is passive).
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {})
  wheelRef.current = handleWheel
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => wheelRef.current(e)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragRef.current = { clientX: e.clientX, clientY: e.clientY, x0: zoom.x ?? xFull, y0: zoom.y ?? yFull }
    setDragging(true)
    e.preventDefault()
  }

  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current
    if (!d) return
    const rect = getPlotRect()
    if (!rect) return
    const dxPx = e.clientX - d.clientX
    const dyPx = e.clientY - d.clientY
    let nx: [number, number]
    if (!xIsMetric && logScale) {
      const [lo, hi] = d.x0
      const shift = (dxPx / rect.width) * (Math.log10(hi) - Math.log10(lo))
      nx = [Math.pow(10, Math.log10(lo) - shift), Math.pow(10, Math.log10(hi) - shift)]
    } else {
      const shift = (dxPx / rect.width) * (d.x0[1] - d.x0[0])
      nx = [d.x0[0] - shift, d.x0[1] - shift]
    }
    const yShift = (dyPx / rect.height) * (d.y0[1] - d.y0[0])
    const ny: [number, number] = [d.y0[0] + yShift, d.y0[1] + yShift]
    setZoom({ x: clampDomain(nx, xFull), y: clampDomain(ny, yFull) })
  }

  const endDrag = () => {
    dragRef.current = null
    setDragging(false)
  }
  // ----------------------------------------------------------------------------

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

  return (
    <div
      className={`chart-wrap${dragging ? ' dragging' : ''}`}
      ref={wrapRef}
      style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onDoubleClick={resetZoom}
    >
      {zoomed && (
        <button className="zoom-reset" onClick={resetZoom} title={t.resetZoom}>
          ↺ {t.resetZoom}
        </button>
      )}
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
            domain={zoom.x ?? xFull}
            allowDataOverflow
            tickFormatter={xTickFormatter}
            stroke="var(--axis)"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{ value: xName, position: 'insideBottom', offset: -4, fill: 'var(--text-muted)', fontSize: 12 }}
          />
          <YAxis
            dataKey="score"
            type="number"
            domain={zoom.y ?? yFull}
            tickFormatter={(v: number) => formatTick(v)}
            stroke="var(--axis)"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{ value: metricName, angle: -90, position: 'insideLeft', offset: 12, fill: 'var(--text-muted)', fontSize: 12 }}
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
