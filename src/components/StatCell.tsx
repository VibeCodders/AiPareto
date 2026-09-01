import type { ReactNode } from 'react'

interface Props {
  /** Muted label shown above the value. */
  label: string
  /** Displayed value (may be a formatted number, token string, fragment, etc.). */
  value: ReactNode
  /** Marks the value as an estimate: adds a ≈ prefix and an optional tooltip. */
  estimated?: boolean
  /** Tooltip text, only applied when the value is estimated. */
  title?: string
}

/**
 * One dotted label + value pair in a compact stat grid (used by the model card).
 * Collapses the repeated label/estimate-markup pattern shared by every stat row:
 * muted label above a bold value, with the ≈ glyph and tooltip handled in one place.
 */
export default function StatCell({ label, value, estimated = false, title }: Props) {
  return (
    <div>
      <span className="muted">{label}</span>
      <b className={estimated ? 'est' : ''} title={estimated ? title : undefined}>
        {estimated ? '≈ ' : ''}{value}
      </b>
    </div>
  )
}