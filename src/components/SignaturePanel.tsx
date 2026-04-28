import { useState, useCallback, useRef } from 'react'
import type { SignatureElement } from '../App'
import type { SignaturePlacement } from '../utils/pdfAnalysis'
import { useLanguage } from '../i18n'
import type { TranslationKey } from '../i18n/translations'

function FieldInput({ label, value, onChange, onAdd, placeholder, onKeyDown }: {
  label: TranslationKey
  value: string
  onChange: (v: string) => void
  onAdd: () => void
  placeholder: TranslationKey
  onKeyDown?: (e: React.KeyboardEvent) => void
}) {
  const { t } = useLanguage()
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">{t(label)}</h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder={t(placeholder)}
        />
        <button
          onClick={onAdd}
          className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors cursor-pointer"
        >
          +
        </button>
      </div>
    </section>
  )
}

interface Props {
  signatureImage: string | null
  onSignatureDrop: (dataUrl: string) => void
  onAddElement: (element: SignatureElement) => void
  elements: SignatureElement[]
  onRemoveElement: (id: string) => void
  visiblePage: number
  suggestedPlacements: SignaturePlacement[]
  penColor: string
}

export function SignaturePanel({
  signatureImage,
  onSignatureDrop,
  onAddElement,
  elements,
  onRemoveElement,
  visiblePage,
  suggestedPlacements,
  penColor,
}: Props) {
  const suggestedPlacement = suggestedPlacements[0] ?? null
  const hasDetection = suggestedPlacement !== null && suggestedPlacement.confidence !== 'none'
  const { t, language } = useLanguage()
  const [isDragOver, setIsDragOver] = useState(false)
  const [dateText, setDateText] = useState(
    new Date().toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB')
  )
  const [nameText, setNameText] = useState(
    () => localStorage.getItem('autosign_name') || ''
  )
  const [locationText, setLocationText] = useState(
    () => localStorage.getItem('autosign_location') || ''
  )
  const [freeText, setFreeText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      onSignatureDrop(dataUrl)
    }
    reader.readAsDataURL(file)
  }, [onSignatureDrop])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleImageFile(file)
  }, [handleImageFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleImageFile(file)
  }, [handleImageFile])

  const placeSignature = useCallback(() => {
    if (!signatureImage) return
    const placement = hasDetection ? suggestedPlacement! : { x: 0.6, y: 0.82, page: visiblePage || 1 }
    const sw = hasDetection ? suggestedPlacement!.width : 0.2
    // Load image to get aspect ratio for correct height
    const img = new Image()
    img.onload = () => {
      const sh = sw * (img.naturalHeight / img.naturalWidth)
      onAddElement({
        id: `sig-${Date.now()}`,
        type: 'signature',
        x: placement.x,
        y: placement.y,
        width: sw,
        height: sh,
        content: signatureImage,
        page: placement.page,
      })
    }
    img.src = signatureImage
  }, [signatureImage, hasDetection, visiblePage, onAddElement, suggestedPlacement])

  const getVisibleY = useCallback(() => {
    const scrollContainer = document.querySelector('main')
    const pageEl = document.querySelector(`[data-page="${visiblePage}"]`)
    if (!scrollContainer || !pageEl) return 0.45
    const scrollRect = scrollContainer.getBoundingClientRect()
    const pageRect = pageEl.getBoundingClientRect()
    const viewportCenterY = scrollRect.top + scrollRect.height / 2
    return Math.max(0.05, (viewportCenterY - pageRect.top) / pageRect.width)
  }, [visiblePage])

  const addDate = useCallback(() => {
    if (!dateText.trim()) return
    onAddElement({
      id: `date-${Date.now()}`,
      type: 'date',
      x: 0.1,
      y: getVisibleY(),
      width: 0.2,
      height: 0.025,
      content: dateText,
      page: visiblePage,
      color: penColor,
    })
  }, [dateText, visiblePage, onAddElement, getVisibleY, penColor])

  const addName = useCallback(() => {
    if (!nameText.trim()) return
    localStorage.setItem('autosign_name', nameText.trim())
    onAddElement({
      id: `name-${Date.now()}`,
      type: 'name',
      x: 0.1,
      y: getVisibleY(),
      width: 0.25,
      height: 0.025,
      content: nameText,
      page: visiblePage,
      color: penColor,
    })
  }, [nameText, visiblePage, onAddElement, getVisibleY, penColor])

  const addLocation = useCallback(() => {
    if (!locationText.trim()) return
    localStorage.setItem('autosign_location', locationText.trim())
    onAddElement({
      id: `loc-${Date.now()}`,
      type: 'location',
      x: 0.1,
      y: getVisibleY(),
      width: 0.25,
      height: 0.025,
      content: locationText,
      page: visiblePage,
      color: penColor,
    })
  }, [locationText, visiblePage, onAddElement, getVisibleY, penColor])

  const addCheck = useCallback((type: 'check' | 'cross') => {
    onAddElement({
      id: `${type}-${Date.now()}`,
      type,
      x: 0.1,
      y: getVisibleY(),
      width: 0.025,
      height: 0.025,
      content: type === 'check' ? '✓' : '✗',
      page: visiblePage,
      color: penColor,
    })
  }, [visiblePage, onAddElement, getVisibleY, penColor])

  const addFreeText = useCallback(() => {
    if (!freeText.trim()) return
    onAddElement({
      id: `txt-${Date.now()}`,
      type: 'text',
      x: 0.1,
      y: getVisibleY(),
      width: 0.3,
      height: 0.025,
      content: freeText,
      page: visiblePage,
      color: penColor,
    })
    setFreeText('')
  }, [freeText, visiblePage, onAddElement, getVisibleY, penColor])

  const signatures = elements.filter(e => e.type === 'signature')

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">{t('signature.title')}</h3>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`
            p-4 rounded-xl border-2 border-dashed cursor-pointer text-center transition-all
            ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          {signatureImage ? (
            <img
              src={signatureImage}
              alt="Signature"
              className="max-h-16 mx-auto cursor-grab"
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/x-signature', signatureImage)}
            />
          ) : (
            <div>
              <p className="text-sm text-gray-500">{t('signature.dropHint')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('signature.format')}</p>
            </div>
          )}
        </div>
        {signatureImage && (
          <button
            onClick={placeSignature}
            className="mt-2 w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer"
          >
            {signatures.length > 0 ? t('signature.placeAnother') : hasDetection ? t('signature.place') : t('signature.placeOnPage')}
          </button>
        )}
        {suggestedPlacement && (
          <details className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-2 text-xs">
            <summary className="flex items-center gap-1.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                suggestedPlacement.confidence === 'high' ? 'bg-green-500' :
                suggestedPlacement.confidence === 'medium' ? 'bg-yellow-500' :
                suggestedPlacement.confidence === 'low' ? 'bg-orange-500' : 'bg-gray-400'
              }`} />
              <span className="text-gray-500 flex-1">{t(`analysis.${suggestedPlacement.confidence}` as 'analysis.high')}</span>
              <span className="text-gray-400 text-[10px]">&#9660;</span>
            </summary>
            <p className="text-[10px] text-gray-500 mt-1">
              {suggestedPlacement.keyword
                ? t('analysis.reason')
                    .replace('{keyword}', suggestedPlacement.keyword)
                    .replace('{text}', suggestedPlacement.matchedText ?? '')
                    .replace('{page}', String(suggestedPlacement.page))
                : t('analysis.noMatch')}
            </p>
            <pre className="mt-1 text-[10px] text-gray-400 leading-tight whitespace-pre-wrap max-h-32 overflow-y-auto">
              {suggestedPlacement.debug.join('\n')}
            </pre>
          </details>
        )}
        <p className="mt-2 text-[11px] text-gray-400 text-center">{t('signature.dragHint')}</p>
      </section>

      <FieldInput label="name.title" value={nameText} onChange={setNameText} onAdd={addName} placeholder="name.placeholder" />
      <FieldInput label="date.title" value={dateText} onChange={setDateText} onAdd={addDate} placeholder="date.placeholder" />
      <FieldInput label="location.title" value={locationText} onChange={setLocationText} onAdd={addLocation} placeholder="location.placeholder" />
      <FieldInput label="text.title" value={freeText} onChange={setFreeText} onAdd={addFreeText} placeholder="text.placeholder" onKeyDown={(e) => { if (e.key === 'Enter') addFreeText() }} />

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">{t('checkbox.title')}</h3>
        <div className="flex gap-2">
          <button
            onClick={() => addCheck('check')}
            className="w-8 h-8 flex items-center justify-center bg-green-600 text-white rounded text-base font-bold hover:bg-green-700 transition-colors cursor-pointer"
          >
            ✓
          </button>
          <button
            onClick={() => addCheck('cross')}
            className="w-8 h-8 flex items-center justify-center bg-red-500 text-white rounded text-base font-bold hover:bg-red-600 transition-colors cursor-pointer"
          >
            ✗
          </button>
        </div>
      </section>

      {elements.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">{t('elements.title')}</h3>
          <div className="space-y-1">
            {elements.map(el => (
              <div key={el.id} className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
                <span className="truncate mr-2">
                  {el.type === 'signature' ? t('signature.label')
                    : el.type === 'drawing' ? t('drawing.label')
                    : el.content + ' p.'}
                  {el.page}
                </span>
                <button onClick={() => onRemoveElement(el.id)} className="text-red-400 hover:text-red-600 cursor-pointer shrink-0">{t('remove')}</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
