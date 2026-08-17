import type { CostView, MetricKey, Model } from './types'
import type { T } from './i18n'
import { valueScoreOf } from './pareto'

function num(n: number | null | undefined): string {
  if (n == null) return ''
  return String(Number(n.toFixed(6)))
}

function cell(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/**
 * Downloads the visible model list as a CSV file.
 * Semicolon-separated with a UTF-8 BOM so it opens correctly in Excel (it-IT).
 */
export function exportModelsCsv(models: Model[], metric: MetricKey, costView: CostView, taskInput: number, taskOutput: number, t: T): void {
  const headers = ['id', t.model, t.family, t.effort, t.score, t.input, t.output, t.cache, t.blended, t.context, t.release, t.openWeights]

  const rows = models.map((m) => {
    const blended = m.inputPerM != null && m.outputPerM != null ? 0.8 * m.inputPerM + 0.2 * m.outputPerM : null
    return [
      m.id,
      m.aaName,
      m.family,
      m.effort ?? '',
      metric === 'valueScore' ? num(valueScoreOf(m, costView, taskInput, taskOutput)) : num(m[metric]),
      num(m.inputPerM),
      num(m.outputPerM),
      num(m.cacheReadPerM),
      num(blended),
      m.contextTokens != null ? String(m.contextTokens) : '',
      m.released ?? '',
      m.openWeights ? 'yes' : 'no',
    ]
  })

  const csv = [headers, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ai-pareto-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
