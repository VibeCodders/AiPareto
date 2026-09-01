import { describe, it, expect } from 'vitest'
import { DEFAULT_COLS, pickVisibleCols } from './components/ModelTable'

const VALID = ['subscription', 'outputSpeed', 'arenaElo', 'hfDownloads']

describe('pickVisibleCols', () => {
  it('falls back to the default set when the URL carries no selection', () => {
    expect(pickVisibleCols([], VALID)).toEqual(DEFAULT_COLS) // ['subscription']
  })
  it('uses the explicit selection when present', () => {
    expect(pickVisibleCols(['outputSpeed', 'arenaElo'], VALID)).toEqual(['outputSpeed', 'arenaElo'])
  })
  it('drops invalid keys', () => {
    expect(pickVisibleCols(['outputSpeed', 'bogus'], VALID)).toEqual(['outputSpeed'])
  })
  it('still shows nothing when an explicit non-empty selection has only invalid keys', () => {
    expect(pickVisibleCols(['nope'], VALID)).toEqual([])
  })
})