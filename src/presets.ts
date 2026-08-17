import type { UrlState } from './urlState'

export interface Preset {
  id: string
  name: string
  state: UrlState
  savedAt: string
}

const KEY = 'ai-pareto-presets'
const MAX_PRESETS = 20

export function listPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? (JSON.parse(raw) as Preset[]) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function write(presets: Preset[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(presets))
  } catch {
    /* storage unavailable (private mode, etc.) */
  }
}

export function savePreset(name: string, state: UrlState): Preset {
  const preset: Preset = {
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim().slice(0, 60),
    state: { ...state, families: state.families ? [...state.families] : null },
    savedAt: new Date().toISOString(),
  }
  write([preset, ...listPresets()].slice(0, MAX_PRESETS))
  return preset
}

export function deletePreset(id: string): void {
  write(listPresets().filter((p) => p.id !== id))
}

export function getPreset(id: string): Preset | null {
  return listPresets().find((p) => p.id === id) ?? null
}
