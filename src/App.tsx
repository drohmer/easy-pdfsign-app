import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { PDFDropZone } from './components/PDFDropZone'
import { PDFViewer } from './components/PDFViewer'
import { SignaturePanel } from './components/SignaturePanel'
import { ExportButton } from './components/ExportButton'
import { useLanguage } from './i18n'
import { analyzePdfForSignature, type SignaturePlacement } from './utils/pdfAnalysis'
import { safeGet, safeSet } from './utils/storage'
import { DEFAULT_TEXT_COLOR } from './utils/constants'

export interface SignatureElement {
  id: string
  type: 'signature' | 'drawing' | 'name' | 'date' | 'location' | 'text' | 'check' | 'cross'
  x: number
  y: number
  width: number
  height: number
  content: string
  page: number
  fontSize?: number
  color?: string
}

const SITE_URL = import.meta.env.VITE_SITE_URL as string | undefined

function App() {
  const { t, language, toggleLanguage } = useLanguage()
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null)
  const [signatureImage, setSignatureImage] = useState<string | null>(
    () => safeGet('autosign_signature_image')
  )
  const [sigRatio, setSigRatio] = useState(0.4)
  const [elements, setElements] = useState<SignatureElement[]>([])
  const [visiblePage, setVisiblePage] = useState(1)
  const visiblePageRef = useRef(visiblePage)
  visiblePageRef.current = visiblePage
  const [pageWidth, setPageWidth] = useState(612)
  const [showOutlines, setShowOutlines] = useState(false)
  const [suggestedPlacements, setSuggestedPlacements] = useState<SignaturePlacement[]>([])
  const [zoom, setZoom] = useState(1)
  const [drawingMode, setDrawingMode] = useState(false)
  const [penColor, setPenColor] = useState(DEFAULT_TEXT_COLOR)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [copiedElement, setCopiedElement] = useState<SignatureElement | null>(null)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const pasteSourceRef = useRef<SignatureElement | null>(null)
  const lastPastedIdRef = useRef<string | null>(null)
  const elementsRef = useRef(elements)
  useEffect(() => { elementsRef.current = elements }, [elements])
  useEffect(() => {
    pasteSourceRef.current = copiedElement
    lastPastedIdRef.current = null
  }, [copiedElement])

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-draggable]')) {
        setSelectedElementId(null)
      }
    }
    window.addEventListener('mousedown', handleMouseDown)
    return () => window.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const handleDrawingModeOff = useCallback(() => setDrawingMode(false), [])

  const hasSignature = useMemo(() => elements.some(e => e.type === 'signature'), [elements])
  const filteredPlacements = useMemo(
    () => hasSignature ? [] : suggestedPlacements,
    [hasSignature, suggestedPlacements],
  )

  useEffect(() => {
    if (!pdfData) return
    analyzePdfForSignature(pdfData).then(setSuggestedPlacements)
  }, [pdfData])

  // Compute signature image aspect ratio (height/width) — used for placement sizing.
  useEffect(() => {
    if (!signatureImage) return
    const img = new Image()
    img.onload = () => setSigRatio(img.naturalHeight / img.naturalWidth)
    img.src = signatureImage
  }, [signatureImage])

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom(z => Math.max(0.5, Math.min(2, z - e.deltaY * 0.002)))
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

  const addElement = useCallback((element: SignatureElement) => {
    setElements(prev => [...prev, element])
    if (visiblePageRef.current !== element.page) {
      document.querySelector(`[data-page="${element.page}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  useEffect(() => {
    if (!copiedElement) return
    const handlePaste = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'v') return
      if (!pasteSourceRef.current) return
      e.preventDefault()
      const lastPasted = lastPastedIdRef.current
        ? elementsRef.current.find(el => el.id === lastPastedIdRef.current) ?? pasteSourceRef.current
        : pasteSourceRef.current
      const newX = Math.min(0.9, lastPasted.x + 0.02)
      const newY = Math.min(0.9, lastPasted.y + 0.02)
      const id = crypto.randomUUID()
      const pasted = { ...lastPasted, id, x: newX, y: newY }
      lastPastedIdRef.current = id
      pasteSourceRef.current = pasted
      setElements(prev => [...prev, pasted])
    }
    window.addEventListener('keydown', handlePaste)
    return () => window.removeEventListener('keydown', handlePaste)
  }, [copiedElement])

  const handlePdfDrop = useCallback((file: File) => {
    setPdfFile(file)
    setElements([])
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as ArrayBuffer
      setPdfData(new Uint8Array(result))
    }
    reader.onerror = () => alert(t('error.readFile'))
    reader.readAsArrayBuffer(file)
  }, [t])

  const handleSignatureDrop = useCallback((dataUrl: string) => {
    setSignatureImage(dataUrl)
    safeSet('autosign_signature_image', dataUrl)
  }, [])

  const updateElement = useCallback((id: string, updates: Partial<SignatureElement>) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el))
  }, [])

  const removeElement = useCallback((id: string) => {
    setElements(prev => prev.filter(el => el.id !== id))
  }, [])

  const handleReset = useCallback(() => {
    setPdfFile(null)
    setPdfData(null)
    setSignatureImage(null)
    setElements([])
  }, [])

  // Language toggle pill (reused in both views)
  const langToggle = (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-1 px-1 py-0.5 rounded-full bg-gray-100 text-xs font-medium cursor-pointer hover:bg-gray-200 transition-colors"
    >
      <span className={`px-2 py-1 rounded-full transition-colors ${language === 'fr' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400'}`}>FR</span>
      <span className={`px-2 py-1 rounded-full transition-colors ${language === 'en' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400'}`}>EN</span>
    </button>
  )

  if (!pdfData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 relative">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">{langToggle}</div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2">
          {SITE_URL ? <a href={SITE_URL} className="text-inherit no-underline hover:text-blue-600 transition-colors" style={{textDecoration:'none',color:'inherit'}}>Easy-pdfSign</a> : 'Easy-pdfSign'}
        </h1>
        <p className="text-gray-500 mb-3 text-center text-sm sm:text-base">{t('app.subtitle')}</p>
        {SITE_URL && <p className="mb-6 sm:mb-8 text-xs text-center"><a href={SITE_URL} className="text-gray-500 hover:text-blue-600 hover:border-blue-400 transition-colors border border-gray-300 rounded-full px-4 py-1.5" style={{textDecoration:'none'}}>graphicscomputing.fr</a></p>}
        {!SITE_URL && <div className="mb-3 sm:mb-5" />}
        <PDFDropZone onFileDrop={handlePdfDrop} />
        <p className="mt-6 sm:mt-8 text-xs text-gray-400 flex items-center gap-1.5 text-center">
          <span>&#x1F512;</span> {t('app.security')}
        </p>
      </div>
    )
  }

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
      onDrop={(e) => {
        const file = e.dataTransfer.files[0]
        if (file?.type === 'application/pdf') {
          e.preventDefault()
          e.stopPropagation()
          handlePdfDrop(file)
        }
      }}
    >
      {/* Header — wraps on small screens */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-2 sm:py-3 flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 mr-auto">
          <h1 className="text-lg sm:text-xl font-bold text-gray-800 whitespace-nowrap">
            {SITE_URL ? <a href={SITE_URL} style={{textDecoration:'none',color:'inherit'}}>Easy-pdfSign</a> : 'Easy-pdfSign'}
          </h1>
          <span className="text-sm text-gray-400 truncate max-w-32 sm:max-w-64 hidden sm:inline">{pdfFile?.name}</span>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            {t('app.newPdf')}
          </button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Sidebar toggle — mobile only */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="sm:hidden px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            ☰
          </button>

          {/* Drawing tools */}
          <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1">
            <button
              onClick={() => setDrawingMode(d => !d)}
              className={`px-2.5 py-1 text-xs sm:text-sm rounded transition-colors cursor-pointer ${
                drawingMode
                  ? 'bg-blue-100 text-blue-600 font-medium'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              {t('app.draw')}
            </button>
            <div className="w-px h-4 bg-gray-200" />
            <input
              type="color"
              value={penColor}
              onChange={(e) => setPenColor(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
              title="Color"
            />
          </div>

          {/* View options */}
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowOutlines(o => !o)}
              className={`px-2.5 py-1.5 text-xs sm:text-sm transition-colors cursor-pointer ${
                showOutlines
                  ? 'bg-blue-100 text-blue-600 font-medium'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              {t('app.outlines')}
            </button>
            <div className="w-px h-4 bg-gray-200" />
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
              className="px-2 py-1.5 text-xs sm:text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              −
            </button>
            <span className="text-xs text-gray-500 w-9 sm:w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(2, z + 0.25))}
              className="px-2 py-1.5 text-xs sm:text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              +
            </button>
          </div>

          {/* Actions */}
          <ExportButton pdfData={pdfData} elements={elements} fileName={pdfFile?.name || 'signed.pdf'} displayPageWidth={pageWidth} />
          {langToggle}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — collapsible on mobile */}
        <aside className={`${sidebarOpen ? 'w-64 sm:w-72' : 'w-0'} bg-white border-r border-gray-200 overflow-y-auto overflow-x-hidden shrink-0 transition-all duration-200`}>
          <div className="p-4 min-w-64 sm:min-w-72">
            <SignaturePanel
              signatureImage={signatureImage}
              sigRatio={sigRatio}
              onSignatureDrop={handleSignatureDrop}
              onAddElement={addElement}
              elements={elements}
              onRemoveElement={removeElement}
              visiblePage={visiblePage}
              suggestedPlacements={suggestedPlacements}
              penColor={penColor}
            />
          </div>
        </aside>

        <main className="flex-1 overflow-auto bg-gray-100 p-3 sm:p-6 relative">
          <p className="fixed bottom-2 left-[60%] -translate-x-1/2 z-10 text-[10px] text-gray-400 flex items-center gap-1 pointer-events-none">
            <span>&#x1F512;</span> {t('app.security')}
          </p>
          <PDFViewer
            pdfData={pdfData}
            elements={elements}
            onUpdateElement={updateElement}
            onRemoveElement={removeElement}
            onVisiblePageChange={setVisiblePage}
            onAddElement={addElement}
            onSignatureImageSet={handleSignatureDrop}
            onPageWidthChange={setPageWidth}
            showOutlines={showOutlines}
            suggestedPlacements={filteredPlacements}
            signatureImage={signatureImage}
            sigRatio={sigRatio}
            zoom={zoom}
            drawingMode={drawingMode}
            penColor={penColor}
            onDrawingModeOff={handleDrawingModeOff}
            onCopy={setCopiedElement}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
          />
        </main>
      </div>
    </div>
  )
}

export default App
