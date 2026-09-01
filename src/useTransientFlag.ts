import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Boolean flag that automatically resets to false after `ms` milliseconds.
 * Replaces the repeated `setX(true); setTimeout(() => setX(false), 1500)` pattern.
 * Re-triggering cancels the pending reset, so rapid repeated actions (e.g. clicking
 * "Copy link" twice quickly) don't clear the flag early — a latent bug in the
 * inline setTimeout version.
 */
export function useTransientFlag(ms = 1500): [boolean, () => void] {
  const [value, setValue] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current != null) clearTimeout(timer.current)
  }, [])

  const trigger = useCallback(() => {
    setValue(true)
    if (timer.current != null) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      setValue(false)
    }, ms)
  }, [ms])

  return [value, trigger]
}
