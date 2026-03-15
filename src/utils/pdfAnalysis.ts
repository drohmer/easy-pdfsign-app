import { pdfjs } from 'react-pdf'

export interface SignaturePlacement {
  x: number
  y: number
  width: number
  height: number
  page: number
  confidence: 'high' | 'medium' | 'low' | 'none'
  keyword?: string
  matchedText?: string
  debug: string[]
}

interface KeywordDef {
  keyword: string
  confidence: 'high' | 'medium'
}

interface TextBox {
  x: number
  y: number
  w: number
  h: number
}

const SIGNATURE_KEYWORDS: KeywordDef[] = [
  { keyword: 'signature', confidence: 'high' },
  { keyword: 'signé', confidence: 'high' },
  { keyword: 'signed', confidence: 'high' },
  { keyword: 'paraphe', confidence: 'high' },
  { keyword: 'visa', confidence: 'high' },
  { keyword: 'lu et approuvé', confidence: 'medium' },
  { keyword: 'bon pour accord', confidence: 'medium' },
  { keyword: 'fait à', confidence: 'medium' },
  { keyword: 'fait a', confidence: 'medium' },
  { keyword: 'done at', confidence: 'medium' },
  { keyword: 'signe', confidence: 'medium' },
]

const REF_FONT_SIZE = 11
const REF_SIG_WIDTH = 0.15
const REF_SIG_HEIGHT = 0.045
const RENDER_SCALE = 0.5 // low-res render for background analysis

function computeSigSize(medianFontSize: number): { width: number; height: number } {
  const scale = Math.max(0.7, Math.min(1.5, medianFontSize / REF_FONT_SIZE))
  return {
    width: REF_SIG_WIDTH * scale,
    height: REF_SIG_HEIGHT * scale,
  }
}

async function getMedianFontSize(doc: pdfjs.PDFDocumentProxy, pageNum: number): Promise<number> {
  const page = await doc.getPage(pageNum)
  const tc = await page.getTextContent()
  const sizes: number[] = []
  for (const item of tc.items) {
    if (!('str' in item) || !item.str.trim()) continue
    sizes.push(Math.abs(item.transform[3]))
  }
  page.cleanup()
  if (sizes.length === 0) return REF_FONT_SIZE
  sizes.sort((a, b) => a - b)
  return sizes[Math.floor(sizes.length / 2)]
}

/** Render a page to a low-res offscreen canvas for pixel analysis */
async function renderPageCanvas(
  doc: pdfjs.PDFDocumentProxy, pageNum: number
): Promise<{ canvas: HTMLCanvasElement; pageW: number; pageH: number }> {
  const page = await doc.getPage(pageNum)
  const viewport = page.getViewport({ scale: RENDER_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport, canvas } as never).promise
  page.cleanup()
  return {
    canvas,
    pageW: viewport.width / RENDER_SCALE,
    pageH: viewport.height / RENDER_SCALE,
  }
}

/**
 * Measure background homogeneity of a region (0 = very varied, 1 = perfectly uniform).
 * Samples a grid of pixels and computes color variance.
 */
function getHomogeneity(
  canvas: HTMLCanvasElement,
  rx: number, ry: number, rw: number, rh: number,
  pageW: number,
): number {
  const ctx = canvas.getContext('2d')!
  // Convert from our coords (fraction of pageW) to canvas pixels
  const px = Math.round(rx * pageW * RENDER_SCALE)
  const py = Math.round(ry * pageW * RENDER_SCALE) // y is also fraction of pageW
  const pw = Math.round(rw * pageW * RENDER_SCALE)
  const ph = Math.round(rh * pageW * RENDER_SCALE)

  // Clamp to canvas bounds
  const cx = Math.max(0, Math.min(canvas.width - 1, px))
  const cy = Math.max(0, Math.min(canvas.height - 1, py))
  const cw = Math.max(1, Math.min(canvas.width - cx, pw))
  const ch = Math.max(1, Math.min(canvas.height - cy, ph))

  const imageData = ctx.getImageData(cx, cy, cw, ch)
  const data = imageData.data

  // Sample every few pixels for speed
  const step = Math.max(1, Math.floor(data.length / 4 / 200)) // ~200 samples
  let sumR = 0, sumG = 0, sumB = 0, count = 0
  for (let i = 0; i < data.length; i += step * 4) {
    sumR += data[i]
    sumG += data[i + 1]
    sumB += data[i + 2]
    count++
  }
  if (count === 0) return 1

  const avgR = sumR / count, avgG = sumG / count, avgB = sumB / count

  // Compute variance
  let variance = 0
  for (let i = 0; i < data.length; i += step * 4) {
    variance += (data[i] - avgR) ** 2 + (data[i + 1] - avgG) ** 2 + (data[i + 2] - avgB) ** 2
  }
  variance /= count

  // Normalize: variance of 0 = perfect, map to 0-1 score
  // Max reasonable variance ~10000 (very colorful area)
  return Math.max(0, 1 - variance / 5000)
}

/** Count text boxes overlapping a rectangle */
function countOverlap(boxes: TextBox[], rx: number, ry: number, rw: number, rh: number): number {
  let count = 0
  for (const b of boxes) {
    if (rx < b.x + b.w && rx + rw > b.x && ry < b.y + b.h && ry + rh > b.y) {
      count++
    }
  }
  return count
}

/** Check if the top or bottom edge of the rect cuts through the middle of a text line */
function countLineCuts(boxes: TextBox[], rx: number, ry: number, rw: number, rh: number): number {
  let cuts = 0
  const top = ry
  const bottom = ry + rh
  for (const b of boxes) {
    // Check horizontal overlap first
    if (rx >= b.x + b.w || rx + rw <= b.x) continue
    const lineTop = b.y
    const lineBottom = b.y + b.h
    // Top edge cuts through a text line
    if (top > lineTop && top < lineBottom) cuts++
    // Bottom edge cuts through a text line
    if (bottom > lineTop && bottom < lineBottom) cuts++
  }
  return cuts
}

/** Try to find the best position near (anchorX, anchorY) that avoids text and has clean background */
function findClearPosition(
  boxes: TextBox[],
  canvas: HTMLCanvasElement | null,
  pageW: number,
  anchorX: number, anchorY: number,
  sw: number, sh: number,
  pageHeightRatio: number,
  debug: string[],
  label: string,
): { x: number; y: number; score: number } {
  const candidates: Array<{ x: number; y: number; score: number; dist: number }> = []

  const offsets = [
    [0, 0],
    [0, sh + 0.01],
    [0, sh * 2 + 0.02],
    [sw + 0.02, 0],
    [-sw - 0.02, 0],
    [sw + 0.02, sh + 0.01],
    [0, -sh - 0.01],         // above
    [-sw - 0.02, sh + 0.01], // left + below
  ]

  for (const [dx, dy] of offsets) {
    const cx = Math.max(0.02, Math.min(1 - sw - 0.02, anchorX + dx))
    const cy = Math.max(0.02, Math.min(pageHeightRatio - sh - 0.01, anchorY + dy))
    const overlap = countOverlap(boxes, cx, cy, sw, sh)
    const lineCuts = countLineCuts(boxes, cx, cy, sw, sh)
    const homogeneity = canvas ? getHomogeneity(canvas, cx, cy, sw, sh, pageW) : 1
    const dist = Math.abs(dx) + Math.abs(dy)

    // Score: lower is better. Heavily penalize overlaps and line cuts, reward homogeneity
    const score = overlap * 100 + lineCuts * 50 + (1 - homogeneity) * 20 + dist * 5
    candidates.push({ x: cx, y: cy, score, dist })
  }

  candidates.sort((a, b) => a.score - b.score)

  const best = candidates[0]
  const overlap = countOverlap(boxes, best.x, best.y, sw, sh)
  const homogeneity = canvas ? getHomogeneity(canvas, best.x, best.y, sw, sh, pageW) : 1
  debug.push(`  ${label}: score=${best.score.toFixed(1)} overlap=${overlap} bg=${(homogeneity * 100).toFixed(0)}% @ x=${best.x.toFixed(2)} y=${best.y.toFixed(2)}`)
  return best
}

/** Extract all text bounding boxes from a page */
function extractTextBoxes(textContent: { items: Array<Record<string, unknown>> }, pageW: number, pageH: number): TextBox[] {
  const boxes: TextBox[] = []
  for (const item of textContent.items) {
    if (!('str' in item) || !(item.str as string).trim()) continue
    const transform = item.transform as number[]
    const tx = transform[4]
    const ty = transform[5]
    const fontSize = Math.abs(transform[3])
    const str = item.str as string
    const x = tx / pageW
    const y = (pageH - ty) / pageW
    const w = (str.length * fontSize * 0.6) / pageW
    const h = fontSize / pageW
    boxes.push({ x, y: y - h, w, h: h * 1.2 })
  }
  return boxes
}

export async function analyzePdfForSignature(
  pdfData: Uint8Array
): Promise<SignaturePlacement[]> {
  const debug: string[] = []

  let defaultY = 1.2
  let totalPages = 1
  let sigSize = { width: REF_SIG_WIDTH, height: REF_SIG_HEIGHT }

  try {
    const doc = await pdfjs.getDocument({ data: pdfData.slice() }).promise
    const numPages = doc.numPages
    totalPages = numPages
    debug.push(`PDF: ${numPages} page(s)`)

    const medianFont = await getMedianFontSize(doc, numPages)
    sigSize = computeSigSize(medianFont)
    debug.push(`Police médiane: ${medianFont.toFixed(1)}pt → cadre ${sigSize.width.toFixed(2)}×${sigSize.height.toFixed(2)}`)

    const matches: Array<{
      keyword: string
      confidence: 'high' | 'medium'
      text: string
      x: number
      y: number
      score: number
      page: number
    }> = []

    // Cache rendered canvases per page
    const pageCanvases: Map<number, { canvas: HTMLCanvasElement; pageW: number; pageH: number }> = new Map()

    for (let p = numPages; p >= 1; p--) {
      const page = await doc.getPage(p)
      const textContent = await page.getTextContent()
      const viewport = page.getViewport({ scale: 1 })
      const pageW = viewport.width
      const pageH = viewport.height
      const pageHeightRatio = pageH / pageW
      let pageHasMatch = false

      const textBoxes = extractTextBoxes(
        textContent as unknown as { items: Array<Record<string, unknown>> },
        pageW, pageH
      )

      // Lazy render canvas only when we find a keyword on this page
      let pageCanvas: { canvas: HTMLCanvasElement; pageW: number; pageH: number } | null = null

      for (const item of textContent.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const text = item.str.toLowerCase()

        for (const kw of SIGNATURE_KEYWORDS) {
          if (!text.includes(kw.keyword)) continue

          // Render canvas for this page on first match
          if (!pageCanvas) {
            if (pageCanvases.has(p)) {
              pageCanvas = pageCanvases.get(p)!
            } else {
              pageCanvas = await renderPageCanvas(doc, p)
              pageCanvases.set(p, pageCanvas)
            }
          }

          const tx = item.transform[4]
          const ty = item.transform[5]
          const rawX = tx / pageW
          const fontSize = Math.abs(item.transform[3])
          const textHeight = fontSize / pageW
          const yFromTop = (pageH - ty) / pageW
          const textWidthApprox = (item.str.length * fontSize * 0.6) / pageW

          const yBelow = yFromTop + textHeight + 0.01
          const spaceBelow = pageHeightRatio - yBelow - sigSize.height

          let anchorX: number, anchorY: number
          if (spaceBelow >= 0.05) {
            const textCenter = rawX + textWidthApprox / 2
            anchorX = Math.max(0.05, Math.min(1 - sigSize.width - 0.02, textCenter - sigSize.width / 2))
            anchorY = yBelow
          } else {
            anchorX = Math.max(0.05, Math.min(1 - sigSize.width - 0.02, rawX + textWidthApprox + 0.02))
            anchorY = Math.min(yFromTop, pageHeightRatio - sigSize.height - 0.01)
          }

          const best = findClearPosition(
            textBoxes, pageCanvas.canvas, pageCanvas.pageW,
            anchorX, anchorY,
            sigSize.width, sigSize.height,
            pageHeightRatio, debug,
            `"${item.str.trim()}"`,
          )

          matches.push({
            keyword: kw.keyword, confidence: kw.confidence, text: item.str.trim(),
            x: best.x, y: best.y, score: best.score,
            page: p,
          })
          debug.push(`p.${p}: "${item.str.trim()}" → "${kw.keyword}" (${kw.confidence}) score=${best.score.toFixed(1)}`)
          pageHasMatch = true
          break
        }
      }

      if (!pageHasMatch) debug.push(`p.${p}: aucun mot-clé trouvé`)
      page.cleanup()
    }

    const lastPage = await doc.getPage(numPages)
    const lastViewport = lastPage.getViewport({ scale: 1 })
    defaultY = (lastViewport.height * 0.85) / lastViewport.width
    lastPage.cleanup()

    doc.destroy()

    if (matches.length > 0) {
      // Sort by score (lower is better), then confidence, then page
      matches.sort((a, b) => {
        if (Math.abs(a.score - b.score) > 10) return a.score - b.score
        const confOrder = { high: 0, medium: 1 }
        if (confOrder[a.confidence] !== confOrder[b.confidence]) return confOrder[a.confidence] - confOrder[b.confidence]
        if (a.page !== b.page) return b.page - a.page
        return b.y - a.y
      })

      // Filter out frames that overlap already-accepted frames
      const accepted: typeof matches = []
      for (const m of matches) {
        const overlapsAccepted = accepted.some(a =>
          a.page === m.page &&
          m.x < a.x + sigSize.width && m.x + sigSize.width > a.x &&
          m.y < a.y + sigSize.height && m.y + sigSize.height > a.y
        )
        if (!overlapsAccepted) accepted.push(m)
      }

      debug.push(`→ ${matches.length} match(es), ${accepted.length} retenu(s)`)

      return accepted.map(m => ({
        x: m.x,
        y: m.y,
        width: sigSize.width,
        height: sigSize.height,
        page: m.page,
        confidence: m.confidence,
        keyword: m.keyword,
        matchedText: m.text,
        debug,
      }))
    }

    debug.push('→ Aucun mot-clé trouvé, placement par défaut')
  } catch (err) {
    debug.push(`Erreur: ${err instanceof Error ? err.message : String(err)}`)
  }

  return [{
    x: 0.65,
    y: defaultY,
    width: sigSize.width,
    height: sigSize.height,
    page: totalPages,
    confidence: 'none',
    debug,
  }]
}
