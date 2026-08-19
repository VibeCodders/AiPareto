/**
 * Serializes the live recharts <svg> to a standalone PNG download.
 *
 * Recharts styles elements with CSS variables (e.g. stroke="var(--axis)") that are
 * resolved by the page's stylesheet — those would render as black/invalid inside a
 * standalone SVG image. We walk the live DOM, resolve every var() attribute against
 * the computed style of the corresponding element, and write the concrete color
 * values onto the clone before rasterizing it to a canvas.
 */
export async function downloadChartPng(svgEl: SVGSVGElement, filename: string): Promise<void> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  const liveEls = svgEl.querySelectorAll('*')
  const cloneEls = clone.querySelectorAll('*')
  for (let i = 0; i < liveEls.length; i++) {
    const live = liveEls[i] as SVGElement
    const copy = cloneEls[i] as SVGElement
    for (const attr of ['fill', 'stroke']) {
      const raw = live.getAttribute(attr)
      if (raw && raw.includes('var(')) {
        const resolved = getComputedStyle(live)[attr as 'fill']
        if (resolved) copy.setAttribute(attr, resolved)
      }
    }
  }

  const rect = svgEl.getBoundingClientRect()
  clone.setAttribute('width', String(rect.width))
  clone.setAttribute('height', String(rect.height))
  const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#ffffff'
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('x', '0')
  bg.setAttribute('y', '0')
  bg.setAttribute('width', '100%')
  bg.setAttribute('height', '100%')
  bg.setAttribute('fill', bgColor)
  clone.insertBefore(bg, clone.firstChild)

  const svgStr = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to rasterize chart SVG'))
      img.src = url
    })
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(rect.width * scale))
    canvas.height = Math.max(1, Math.round(rect.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!pngBlob) throw new Error('Failed to encode PNG')
    const pngUrl = URL.createObjectURL(pngBlob)
    const a = document.createElement('a')
    a.href = pngUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(pngUrl)
  } finally {
    URL.revokeObjectURL(url)
  }
}
