/**
 * Triggers a browser download of `blob` under `filename`, then cleans up.
 *
 * Centralizes the "create a temp <a>, click it, detach it, revoke the object URL"
 * sequence shared by the CSV export and the chart-PNG export — so the two don't
 * drift or forget to revoke the object URL.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}