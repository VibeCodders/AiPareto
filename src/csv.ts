import type { CostView, Model } from './types'
import type { T } from './i18n'
import { contextValueOf, costOf, efficiencyScoreOf, speedAdjustedScoreOf, valueScoreOf } from './pareto'

function num(n: number | null | undefined): string {
  if (n == null) return ''
  return String(Number(n.toFixed(6)))
}

function bool(b: boolean): string {
  return b ? 'yes' : 'no'
}

function cell(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/**
 * Downloads the visible model list as a CSV file.
 * Always exports every field of the Model, regardless of the metric/cost view
 * currently selected in the UI, so the file is self-contained and never needs
 * a re-export to get a column that happens to not be on screen.
 * Semicolon-separated with a UTF-8 BOM so it opens correctly in Excel (it-IT).
 * `filterSummary`, if given, is written as a leading `#`-commented line so the file
 * self-documents which filters were active when it was generated.
 */
export function exportModelsCsv(models: Model[], costView: CostView, taskInput: number, taskOutput: number, t: T, filterSummary?: string, filenameSuffix = ''): void {
  const headers = [
    'id',
    t.model,
    t.family,
    t.effort,
    t.reasoning,
    t.release,
    t.openWeights,
    t.intel,
    t.coding,
    t.agentic,
    t.tau2,
    t.hle,
    t.omniscience,
    t.outputSpeed,
    t.latency,
    t.context,
    t.input,
    t.output,
    t.cache,
    t.cacheWrite,
    t.blended,
    t.taskCost,
    t.valueScore,
    t.codingValue,
    t.agenticValue,
    t.speedAdjustedScore,
    t.contextValue,
    t.efficiencyScore,
  ]

  // Self-contained normalization reference for the Efficiency Score, local to this export's model set.
  const norm = {
    value: Math.max(1, ...models.map((m) => valueScoreOf(m, costView, taskInput, taskOutput) ?? 0)),
    speed: Math.max(1, ...models.map((m) => speedAdjustedScoreOf(m) ?? 0)),
    context: Math.max(1, ...models.map((m) => contextValueOf(m) ?? 0)),
  }
  const weights = { value: 1, speed: 1, context: 1 }

  const rows = models.map((m) => {
    const blended = m.inputPerM != null && m.outputPerM != null ? 0.8 * m.inputPerM + 0.2 * m.outputPerM : null
    const taskCost = costOf(m, 'task', taskInput, taskOutput)
    return [
      m.id,
      m.aaName,
      m.family,
      m.effort ?? '',
      bool(m.isReasoning),
      m.released ?? '',
      bool(m.openWeights),
      num(m.intelligenceIndex),
      num(m.codingIndex),
      num(m.agenticIndex),
      num(m.tau2),
      num(m.hle),
      num(m.omniscience),
      num(m.outputSpeed),
      num(m.latencySeconds),
      m.contextTokens != null ? String(m.contextTokens) : '',
      num(m.inputPerM),
      num(m.outputPerM),
      num(m.cacheReadPerM),
      num(m.cacheWritePerM),
      num(blended),
      num(taskCost),
      num(valueScoreOf(m, costView, taskInput, taskOutput)),
      num(valueScoreOf(m, costView, taskInput, taskOutput, 'codingIndex')),
      num(valueScoreOf(m, costView, taskInput, taskOutput, 'agenticIndex')),
      num(speedAdjustedScoreOf(m)),
      num(contextValueOf(m)),
      num(efficiencyScoreOf(m, costView, taskInput, taskOutput, { weights, norm })),
    ]
  })

  const lines = [headers, ...rows].map((r) => r.map(cell).join(';'))
  if (filterSummary) lines.unshift(`# ${filterSummary}`)
  const csv = lines.join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ai-pareto-${new Date().toISOString().slice(0, 10)}${filenameSuffix}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
