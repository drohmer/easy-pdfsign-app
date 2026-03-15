import { useState, useCallback, useEffect, useMemo } from 'react'
import { PDFDropZone } from './components/PDFDropZone'
import { PDFViewer } from './components/PDFViewer'
import { SignaturePanel } from './components/SignaturePanel'
import { ExportButton } from './components/ExportButton'
import { useLanguage } from './i18n'
import { analyzePdfForSignature, type SignaturePlacement } from './utils/pdfAnalysis'

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

function App() {
  const { t, language, toggleLanguage } = useLanguage()
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null)
  const [signatureImage, setSignatureImage] = useState<string | null>(
    () => localStorage.getItem('autosign_signature_image')
  )
  const [elements, setElements] = useState<SignatureElement[]>([])
  const [numPages, setNumPages] = useState(0)
  const [visiblePage, setVisiblePage] = useState(1)
  const [pageWidth, setPageWidth] = useState(612)
  const [showOutlines, setShowOutlines] = useState(false)
  const [suggestedPlacements, setSuggestedPlacements] = useState<SignaturePlacement[]>([])
  const [zoom, setZoom] = useState(1)
  const [drawingMode, setDrawingMode] = useState(false)
  const [penColor, setPenColor] = useState('#1f2937')
  const [sidebarOpen, setSidebarOpen] = useState(true)

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

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom(z => Math.max(0.5, Math.min(2, z - e.deltaY * 0.002)))
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

  const handlePdfDrop = useCallback((file: File) => {
    setPdfFile(file)
    setElements([])
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as ArrayBuffer
      setPdfData(new Uint8Array(result))
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const handleSignatureDrop = useCallback((dataUrl: string) => {
    setSignatureImage(dataUrl)
    localStorage.setItem('autosign_signature_image', dataUrl)
  }, [])

  const addElement = useCallback((element: SignatureElement) => {
    setElements(prev => [...prev, element])
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
    setNumPages(0)
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
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2">Easy-pdfSign</h1>
        <p className="text-gray-500 mb-6 sm:mb-8 text-center text-sm sm:text-base">{t('app.subtitle')}</p>
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
          <h1 className="text-lg sm:text-xl font-bold text-gray-800 whitespace-nowrap">Easy-pdfSign</h1>
          <span className="text-sm text-gray-400 truncate max-w-32 sm:max-w-64 hidden sm:inline">{pdfFile?.name}</span>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            {t('app.newPdf')}
          </button>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Sidebar toggle on small screens */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="sm:hidden px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            ☰
          </button>
          <button
            onClick={() => setDrawingMode(d => !d)}
            className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm border rounded-lg transition-colors cursor-pointer ${
              drawingMode
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-gray-300 text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            {t('app.draw')}
          </button>
          <input
            type="color"
            value={penColor}
            onChange={(e) => setPenColor(e.target.value)}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded cursor-pointer border border-gray-300"
            title="Color"
          />
          <button
            onClick={() => setShowOutlines(o => !o)}
            className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm border rounded-lg transition-colors cursor-pointer ${
              showOutlines
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-gray-300 text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            {t('app.outlines')}
          </button>
          <div className="flex items-center gap-1 border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
              className="px-2 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              -
            </button>
            <span className="text-xs text-gray-500 w-9 sm:w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(2, z + 0.25))}
              className="px-2 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              +
            </button>
          </div>
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
              onSignatureDrop={handleSignatureDrop}
              onAddElement={addElement}
              elements={elements}
              onRemoveElement={removeElement}
              numPages={numPages}
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
            onNumPages={setNumPages}
            onVisiblePageChange={setVisiblePage}
            onAddElement={addElement}
            onSignatureImageSet={handleSignatureDrop}
            onPageWidthChange={setPageWidth}
            showOutlines={showOutlines}
            suggestedPlacements={filteredPlacements}
            signatureImage={signatureImage}
            zoom={zoom}
            drawingMode={drawingMode}
            penColor={penColor}
            onDrawingModeOff={handleDrawingModeOff}
          />
        </main>
      </div>
    </div>
  )
}

export default App
