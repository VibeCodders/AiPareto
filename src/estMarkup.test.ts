import { describe, it, expect } from 'vitest'
import { estClass, estMark, estTitle } from './estMarkup'

describe('estMarkup', () => {
  it('appends the est class only when estimated', () => {
    expect(estClass(true)).toBe(' est')
    expect(estClass(false)).toBe('')
  })
  it('sets the tooltip title only when estimated', () => {
    expect(estTitle(true, 'stimato')).toBe('stimato')
    expect(estTitle(false, 'stimato')).toBeUndefined()
  })
  it('prefixes the ≈ marker only when estimated, keeping the formatted value as-is', () => {
    expect(estMark(true, '12.5')).toBe('≈ 12.5')
    expect(estMark(false, '12.5')).toBe('12.5')
    expect(estMark(false, '—')).toBe('—')
  })
})
