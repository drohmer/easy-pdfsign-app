import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { DraggableElement } from './DraggableElement'
import { DrawingCanvas } from './DrawingCanvas'
import type { SignatureElement } from '../App'
import type { SignaturePlacement } from '../utils/pdfAnalysis'
import { useLanguage } from '../i18n'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface Props {
  pdfData: Uint8Array
  elements: SignatureElement[]
  onUpdateElement: (id: string, updates: Partial<SignatureElement>) => void
  onRemoveElement: (id: string) => void
  onNumPages: (n: number) => void
  onVisiblePageChange: (page: number) => void
  onAddElement: (element: SignatureElement) => void
  onSignatureImageSet: (dataUrl: string) => void
  onPageWidthChange: (width: number) => void
  showOutlines: boolean
  suggestedPlacements: SignaturePlacement[]
  signatureImage: string | null
  zoom: number
  drawingMode: boolean
  penColor: string
  onDrawingModeOff: () => void
}

function PageDrawingOverlay({ pageNumber, pageWidth, penColor, onDrawingComplete, onCancel }: {
  pageNumber: number
  pageWidth: number
  penColor: string
  onDrawingComplete: (page: number, dataUrl: string, x: number, y: number, w: number, h: number) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (ref.current?.parentElement) {
      setHeight(ref.current.parentElement.clientHeight)
    }
  }, [pageWidth])

  const handleComplete = useCallback(
    (dataUrl: string, x: number, y: number, w: number, h: number) => onDrawingComplete(pageNumber, dataUrl, x, y, w, h),
    [pageNumber, onDrawingComplete],
  )

  return (
    <div ref={ref} className="absolute inset-0">
      {height > 0 && (
        <DrawingCanvas
          pageWidth={pageWidth}
          pageHeight={height}
          color={penColor}
          onDrawingComplete={handleComplete}
          onCancel={onCancel}
        />
      )}
    </div>
  )
}

export const PDFViewer = memo(function PDFViewer({ pdfData, elements, onUpdateElement, onRemoveElement, onNumPages, onVisiblePageChange, onAddElement, onSignatureImageSet, onPageWidthChange, showOutlines, suggestedPlacements, signatureImage, zoom, drawingMode, penColor, onDrawingModeOff }: Props) {
  const { t } = useLanguage()
  const [numPages, setNumPages] = useState(0)
  const [pageWidth, setPageWidth] = useState(612)
  const [sigRatio, setSigRatio] = useState(0.4) // height/width ratio of signature image
  const containerRef = useRef<HTMLDivElement>(null)

  // Compute signature image aspect ratio
  useEffect(() => {
    if (!signatureImage) return
    const img = new Image()
    img.onload = () => setSigRatio(img.naturalHeight / img.naturalWidth)
    img.src = signatureImage
  }, [signatureImage])

  // Panning (grab to scroll) — only when zoomed in and not drawing
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, scrollX: 0, scrollY: 0 })

  useEffect(() => {
    if (drawingMode) return
    const scrollEl = containerRef.current?.closest('main') as HTMLElement | null
    if (!scrollEl) return

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      // Don't pan when clicking on interactive elements
      if (target.closest('[data-resize]') || target.closest('[data-fontsize]') ||
          target.closest('button') || target.closest('input') ||
          target.closest('canvas.cursor-crosshair') || // only block drawing canvas, not PDF canvas
          target.closest('[data-draggable]')) return

      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY, scrollX: scrollEl.scrollLeft, scrollY: scrollEl.scrollTop }
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isPanning.current) return
      e.preventDefault()
      scrollEl.scrollLeft = panStart.current.scrollX - (e.clientX - panStart.current.x)
      scrollEl.scrollTop = panStart.current.scrollY - (e.clientY - panStart.current.y)
    }

    const onMouseUp = () => {
      if (!isPanning.current) return
      isPanning.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    scrollEl.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      scrollEl.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [drawingMode])

  // Pass a copy to react-pdf so the original Uint8Array isn't detached by the worker
  const pdfFile = useMemo(() => ({ data: pdfData.slice() }), [pdfData])

  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n)
    onNumPages(n)
  }, [onNumPages])

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const available = containerRef.current.clientWidth - 48
        const base = Math.min(available, 800)
        const w = Math.round(base * zoom)
        setPageWidth(w)
        onPageWidthChange(w)
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [onPageWidthChange, zoom])

  // Track which page is most visible in the viewport
  useEffect(() => {
    if (numPages === 0) return
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        let bestPage = 1
        let bestRatio = 0
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page)
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio
            bestPage = page
          }
        }
        if (bestRatio > 0) onVisiblePageChange(bestPage)
      },
      { root: container.closest('main'), threshold: [0, 0.25, 0.5, 0.75, 1] }
    )

    const pageDivs = container.querySelectorAll('[data-page]')
    pageDivs.forEach(div => observer.observe(div))
    return () => observer.disconnect()
  }, [numPages, onVisiblePageChange])

  const handlePageDrop = useCallback((e: React.DragEvent, pageNumber: number) => {
    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('image/')) return // let non-image drops (PDF) bubble up
    e.preventDefault()
    e.stopPropagation()

    // Capture drop coordinates now (event will be recycled)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const cursorX = (e.clientX - rect.left) / pageWidth
    const cursorY = (e.clientY - rect.top) / pageWidth

    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      onSignatureImageSet(dataUrl)

      // Load the image to get its natural aspect ratio
      const img = new Image()
      img.onload = () => {
        const sigWidth = 0.18
        const sigHeight = sigWidth * (img.naturalHeight / img.naturalWidth)

        onAddElement({
          id: `sig-${Date.now()}`,
          type: 'signature',
          x: Math.max(0, Math.min(1 - sigWidth, cursorX - sigWidth / 2)),
          y: Math.max(0, cursorY - sigHeight / 2),
          width: sigWidth,
          height: sigHeight,
          content: dataUrl,
          page: pageNumber,
        })
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }, [pageWidth, onAddElement, onSignatureImageSet])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrawingComplete = useCallback((pageNumber: number, dataUrl: string, x: number, y: number, w: number, h: number) => {
    onAddElement({
      id: `draw-${Date.now()}`,
      type: 'drawing',
      x, y,
      width: w,
      height: h,
      content: dataUrl,
      page: pageNumber,
    })
  }, [onAddElement])

  return (
    <div ref={containerRef} className={`flex flex-col items-center gap-6 ${!drawingMode && zoom > 1 ? 'cursor-grab' : ''}`}>
      <Document
        file={pdfFile}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
          </div>
        }
      >
        {Array.from({ length: numPages }, (_, i) => (
          <div
            key={i}
            data-page={i + 1}
            className="relative mb-6 shadow-lg bg-white"
            style={{ width: pageWidth }}
            onDrop={(e) => handlePageDrop(e, i + 1)}
            onDragOver={handleDragOver}
          >
            <Page
              pageNumber={i + 1}
              width={pageWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
            {suggestedPlacements
              .filter(sp => sp.page === i + 1)
              .map((sp, idx) => {
                const sw = sp.width ?? 0.2
                const sh = signatureImage ? sw * sigRatio : (sp.height ?? 0.06)
                return (
                  <div
                    key={`sp-${idx}`}
                    onClick={() => {
                      if (!signatureImage) return
                      onAddElement({
                        id: `sig-${Date.now()}`,
                        type: 'signature',
                        x: sp.x,
                        y: sp.y,
                        width: sw,
                        height: sh,
                        content: signatureImage,
                        page: sp.page,
                      })
                    }}
                    className={`absolute border-2 border-dashed rounded flex items-center justify-center transition-all duration-150 ${
                      signatureImage
                        ? 'border-blue-400 bg-blue-50/30 cursor-pointer hover:bg-blue-100/50 hover:border-blue-500 hover:shadow-md hover:scale-[1.03]'
                        : 'border-gray-300 bg-gray-50/20'
                    }`}
                    style={{
                      left: sp.x * pageWidth,
                      top: sp.y * pageWidth,
                      width: sw * pageWidth,
                      height: sh * pageWidth,
                    }}
                  >
                    <span className={`text-[10px] whitespace-nowrap ${signatureImage ? 'text-blue-400' : 'text-gray-400'}`}>
                      {signatureImage ? t('signature.place') : t('signature.title')}
                    </span>
                  </div>
                )
              })}
            {elements
              .filter(el => el.page === i + 1)
              .map(el => (
                <DraggableElement
                  key={el.id}
                  element={el}
                  containerWidth={pageWidth}
                  onUpdate={(updates) => onUpdateElement(el.id, updates)}
                  onDelete={() => onRemoveElement(el.id)}
                  showOutline={showOutlines}
                />
              ))
            }
            {drawingMode && (
              <PageDrawingOverlay
                pageNumber={i + 1}
                pageWidth={pageWidth}
                penColor={penColor}
                onDrawingComplete={handleDrawingComplete}
                onCancel={onDrawingModeOff}
              />
            )}
          </div>
        ))}
      </Document>
    </div>
  )
})
