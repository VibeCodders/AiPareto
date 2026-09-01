// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadBlob } from './download'

// jsdom does not implement URL.createObjectURL/revokeObjectURL or anchor navigation,
// so we stub the browser pieces downloadBlob touches and observe them.
const created: string[] = []
const revoked: string[] = []
let clicked = 0

beforeEach(() => {
  created.length = 0
  revoked.length = 0
  clicked = 0
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn((u: string) => {
      revoked.push(u)
    }),
  })
  // Anchor .click() triggers a navigation jsdom can't do — make it a no-op counter.
  HTMLAnchorElement.prototype.click = vi.fn(() => {
    clicked++
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('downloadBlob', () => {
  it('creates a temp anchor, sets download/href, clicks it, detaches it and revokes the URL', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' })
    downloadBlob(blob, 'out.txt')

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(created.length).toBe(0) // since we mocked createObjectURL directly
    expect(clicked).toBe(1)

    // The anchor should be appended to the body, then removed.
    expect(document.querySelectorAll('a').length).toBe(0)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revoked).toEqual(['blob:mock'])
  })
})