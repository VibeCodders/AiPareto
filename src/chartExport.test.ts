// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadChartPng } from './chartExport'

// Capture the final PNG download.
const downloads: Array<{ blob: Blob; filename: string }> = []
vi.mock('./download', () => ({
  downloadBlob: (blob: Blob, filename: string) => {
    downloads.push({ blob, filename })
  },
}))

// Record every createObjectURL blob so we can inspect the intermediate SVG string.
const createdUrls: Array<{ blob: Blob; url: string }> = []
let revoked = 0

// Image that "loads" the moment its src is set.
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''
  set src(_v: string) {
    this._src = _v
    Promise.resolve().then(() => this.onload?.())
  }
  get src() {
    return this._src
  }
}

const ctxStub = {
  fillStyle: '',
  fillRect: vi.fn(),
  drawImage: vi.fn(),
}

// getComputedStyle: expose a resolved value for fill, empty for everything else.
const csStub = (): CSSStyleDeclaration =>
  ({
    getPropertyValue: () => '',
    fill: 'rgb(13, 13, 13)',
    stroke: '',
  }) as unknown as CSSStyleDeclaration

function makeSvg(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  const rect = document.createElementNS(ns, 'rect')
  rect.setAttribute('fill', 'var(--card)')
  svg.appendChild(rect)
  document.body.appendChild(svg)
  svg.getBoundingClientRect = () => ({ width: 300, height: 200, top: 0, left: 0, right: 300, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  return svg
}

beforeEach(() => {
  downloads.length = 0
  createdUrls.length = 0
  revoked = 0
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('getComputedStyle', vi.fn(() => csStub()))
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn((blob: Blob) => {
      const url = `blob:${createdUrls.length}`
      createdUrls.push({ blob, url })
      return url
    }),
    revokeObjectURL: vi.fn(() => {
      revoked++
    }),
  })
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ctxStub as unknown as CanvasRenderingContext2D,
  ) as unknown as HTMLCanvasElement['getContext']
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) => {
    cb(new Blob(['fake-png'], { type: 'image/png' }))
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('downloadChartPng', () => {
  it('resolves var() colors, rasterizes and downloads a PNG with the given filename', async () => {
    const svg = makeSvg()
    await downloadChartPng(svg, 'out.png')

    // The intermediate SVG carried the resolved fill color for the var(--card) element.
    const svgBlob = createdUrls[0].blob
    expect(svgBlob.type).toBe('image/svg+xml;charset=utf-8')
    expect(await svgBlob.text()).toContain('fill="rgb(13, 13, 13)"')

    // The rasterized PNG was handed to downloadBlob.
    expect(downloads.length).toBe(1)
    expect(downloads[0].filename).toBe('out.png')
    expect(downloads[0].blob.type).toBe('image/png')

    // chartExport revokes its own SVG object URL (downloadBlob's internal cleanup is tested in download.test.ts).
    expect(revoked).toBe(1)
    expect(ctxStub.fillRect).toHaveBeenCalled()
    expect(ctxStub.drawImage).toHaveBeenCalled()
  })
})