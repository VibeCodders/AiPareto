import { useMemo } from 'react'
import { CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import type { Model, Point } from '../types'
import { formatUsd } from '../pareto'
import type { T } from '../i18n'

interface Props {
  points: Point[]
  frontier: Point[]
  logScale: boolean
  colorFor: (family: string) => string
  metricName: string
  costName: string
  t: T
  onSelect: (modelId: string) => void
}

const FRONTIER_COLOR = '#f59e0b'

interface TooltipPayload {
  payload?: { model?: Model; cost?: number; score?: number }
}

function TooltipContent({ active, payload, t }: { active?: boolean; payload?: TooltipPayload[]; t: T }) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  const m = p?.model
  if (!m) return null
  return (
    <div className="tooltip">
      <div className="tooltip-title">{m.id}</div>
      {m.family && <div className="tooltip-row muted">{m.family}</div>}
      <div className="tooltip-row">
        <span>{t.cost}:</span>
        <b>{formatUsd(p?.cost)}/1M</b>
      </div>
      <div className="tooltip-row">
        <span>{t.score}:</span>
        <b>{p?.score != null ? p.score.toFixed(1) : '—'}</b>
      </div>
    </div>
  )
}

export default function ParetoChart({ points, frontier, logScale, colorFor, metricName, costName, t, onSelect }: Props) {
  const sorted = useMemo(() => [...points].sort((a, b) => a.cost - b.cost), [points])
  const frontierSorted = useMemo(() => [...frontier].sort((a, b) => a.cost - b.cost), [frontier])

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        <span className="legend-dot" style={{ background: FRONTIER_COLOR }} />
        {t.frontier}
        <span className="legend-muted">— {t.frontierNote}</span>
      </div>
      <ResponsiveContainer width="100%" height={540}>
        <ComposedChart data={frontierSorted} margin={{ top: 12, right: 18, bottom: 8, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" />
          <XAxis
            dataKey="cost"
            type="number"
            scale={logScale ? 'log' : 'linear'}
            domain={logScale ? ['auto', 'auto'] : [0, 'auto']}
            allowDataOverflow
            tickFormatter={(v: number) => formatUsd(v, v < 1 ? 3 : 1)}
            stroke="var(--axis)"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{ value: costName, position: 'insideBottom', offset: -4, fill: 'var(--text-muted)', fontSize: 12 }}
          />
          <YAxis
            type="number"
            domain={[0, (dataMax: number) => Math.ceil((dataMax + 2) / 5) * 5]}
            tickFormatter={(v: number) => String(v)}
            stroke="var(--axis)"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{ value: metricName, angle: -90, position: 'insideLeft', offset: 10, fill: 'var(--text-muted)', fontSize: 12 }}
          />
          <Tooltip content={<TooltipContent t={t} />} cursor={{ strokeDasharray: '4 4', stroke: 'var(--axis)' }} />
          <Line
            dataKey="score"
            type="stepAfter"
            stroke={FRONTIER_COLOR}
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Scatter
            name="models"
            data={sorted}
            isAnimationActive={false}
            onClick={(e: unknown) => {
              const ev = e as { payload?: { model?: { id: string } } }
              if (ev?.payload?.model?.id) onSelect(ev.payload.model.id)
            }}
            shape={(props: { cx?: number; cy?: number; fill?: string; payload?: { model?: { id: string } } }) => (
              <circle
                cx={props.cx}
                cy={props.cy}
                r={5}
                fill={props.fill}
                stroke="var(--card)"
                strokeWidth={1.2}
                className="pt"
                onClick={() => props.payload?.model?.id && onSelect(props.payload.model.id)}
              />
            )}
          >
            {sorted.map((p) => (
              <Cell key={p.model.id} fill={colorFor(p.model.family)} />
            ))}
          </Scatter>
          <Scatter
            name="frontier"
            data={frontierSorted}
            isAnimationActive={false}
            onClick={(e: unknown) => {
              const ev = e as { payload?: { model?: { id: string } } }
              if (ev?.payload?.model?.id) onSelect(ev.payload.model.id)
            }}
            shape={(props: { cx?: number; cy?: number; payload?: { model?: { id: string } } }) => (
              <path
                d={`M ${(props.cx ?? 0) - 7} ${props.cy} L ${props.cx} ${(props.cy ?? 0) - 7} L ${(props.cx ?? 0) + 7} ${props.cy} L ${props.cx} ${(props.cy ?? 0) + 7} Z`}
                fill={FRONTIER_COLOR}
                stroke="var(--card)"
                strokeWidth={1.2}
                className="pt"
                onClick={() => props.payload?.model?.id && onSelect(props.payload.model.id)}
              />
            )}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
