import { useCallback, useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import { pdfjs } from 'react-pdf'
import type { SignatureElement } from '../App'
import { useLanguage } from '../i18n'

interface Props {
  pdfData: Uint8Array
  elements: SignatureElement[]
  fileName: string
  displayPageWidth: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

export function ExportButton({ pdfData, elements, fileName, displayPageWidth }: Props) {
  const { t } = useLanguage()
  const [exporting, setExporting] = useState(false)

  const handleExport = useCallback(async () => {
    setExporting(true)

    try {
      const srcDoc = await pdfjs.getDocument({ data: pdfData.slice() }).promise
      const numPages = srcDoc.numPages

      // Render the export canvas at the SAME proportions as the display,
      // but at higher resolution (qualityScale multiplier).
      const qualityScale = 3
      const outDoc = await PDFDocument.create()

      for (let i = 1; i <= numPages; i++) {
        const pdfPage = await srcDoc.getPage(i)
        const nativeViewport = pdfPage.getViewport({ scale: 1 })
        const nativeW = nativeViewport.width
        const nativeH = nativeViewport.height

        // The display renders at displayPageWidth pixels wide.
        // displayScale = displayPageWidth / nativeW
        // We render the canvas at qualityScale × display size.
        const canvasScale = (displayPageWidth / nativeW) * qualityScale
        const renderViewport = pdfPage.getViewport({ scale: canvasScale })
        const canvas = document.createElement('canvas')
        canvas.width = renderViewport.width
        canvas.height = renderViewport.height
        const ctx = canvas.getContext('2d')!
        await pdfPage.render({ canvasContext: ctx, viewport: renderViewport, canvas } as never).promise

        // Element coordinates are fractions of displayPageWidth.
        // On this canvas: pixel = fraction * displayPageWidth * qualityScale
        const cw = displayPageWidth * qualityScale

        const pageElements = elements.filter((el) => el.page === i)
        for (const el of pageElements) {
          const x = el.x * cw
          const y = el.y * cw
          const w = el.width * cw
          const h = el.height * cw

          if (el.type === 'signature' || el.type === 'drawing') {
            const img = await loadImage(el.content)
            // Preserve aspect ratio like CSS object-contain
            const imgRatio = img.naturalWidth / img.naturalHeight
            const boxRatio = w / h
            let drawW = w, drawH = h, drawX = x, drawY = y
            if (imgRatio > boxRatio) {
              drawH = w / imgRatio
              drawY = y + (h - drawH) / 2
            } else {
              drawW = h * imgRatio
              drawX = x + (w - drawW) / 2
            }

            // For drawings with a custom color, recolor the image
            if (el.type === 'drawing' && el.color) {
              const recolor = document.createElement('canvas')
              recolor.width = img.naturalWidth
              recolor.height = img.naturalHeight
              const rctx = recolor.getContext('2d')!
              rctx.drawImage(img, 0, 0)
              const idata = rctx.getImageData(0, 0, recolor.width, recolor.height)
              const r = parseInt(el.color.slice(1, 3), 16)
              const g = parseInt(el.color.slice(3, 5), 16)
              const b = parseInt(el.color.slice(5, 7), 16)
              for (let p = 0; p < idata.data.length; p += 4) {
                if (idata.data[p + 3] > 0) {
                  idata.data[p] = r
                  idata.data[p + 1] = g
                  idata.data[p + 2] = b
                }
              }
              rctx.putImageData(idata, 0, 0)
              ctx.drawImage(recolor, drawX, drawY, drawW, drawH)
            } else {
              ctx.drawImage(img, drawX, drawY, drawW, drawH)
            }
          } else {
            const fontSize = (el.fontSize ?? 14) * qualityScale
            ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
            ctx.fillStyle = el.color || '#1f2937'
            ctx.textBaseline = 'top'
            // Match CSS offsets: border-2 (2px) + px-1 (4px) = 6px horizontal,
            // border-2 (2px) + py-0.5 (2px) + half-leading (3.5px) = 7.5px vertical
            ctx.fillText(el.content, x + 6 * qualityScale, y + 7.5 * qualityScale)
          }
        }

        // Embed as high-res image on a native-sized PDF page (= high DPI)
        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), 'image/png')
        )
        const png = await blob.arrayBuffer()
        const pageImage = await outDoc.embedPng(png)
        const page = outDoc.addPage([nativeW, nativeH])
        page.drawImage(pageImage, { x: 0, y: 0, width: nativeW, height: nativeH })
      }

      const pdfBytes = await outDoc.save()
      const blob = new Blob([pdfBytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName.replace(/\.pdf$/i, '') + t('export.fileSuffix') + '.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
      alert(`${t('export.error')}: ${err instanceof Error ? err.message : err}`)
    } finally {
      setExporting(false)
    }
  }, [pdfData, elements, fileName, displayPageWidth, t])

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
    >
      {exporting ? t('export.exporting') : t('export.button')}
    </button>
  )
}
