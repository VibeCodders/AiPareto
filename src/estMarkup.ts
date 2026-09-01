/**
 * Shared markup helpers for cells whose value is an estimate (imputed ≈ value).
 *
 * The app marks estimated values the same way everywhere — an `est` CSS class
 * (italic + dotted underline), a tooltip explaining the value is estimated, and a
 * leading `≈` glyph. Tables used to repeat that trio inline for every estimated
 * column; these helpers keep the three pieces in one place so the markup can't
 * drift between the model table, the top-value panel and the compare panel.
 */

/** CSS class suffix for a <td> whose value is estimated (' est' when estimated, '' otherwise). */
export function estClass(est: boolean): string {
  return est ? ' est' : ''
}

/** Tooltip title for an estimated cell: only set when the value really is an estimate. */
export function estTitle(est: boolean, title: string): string | undefined {
  return est ? title : undefined
}

/**
 * Renders the ≈ marker in front of an already-formatted value (which may be a
 * dash for missing values — an estimate and a missing value are never the same).
 */
export function estMark(est: boolean, value: string): string {
  return est ? `≈ ${value}` : value
}
