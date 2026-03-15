import { useState, useCallback, useRef } from 'react'
import { useLanguage } from '../i18n'

interface Props {
  onFileDrop: (file: File) => void
}

export function PDFDropZone({ onFileDrop }: Props) {
  const { t } = useLanguage()
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type === 'application/pdf') {
      onFileDrop(file)
    }
  }, [onFileDrop])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type === 'application/pdf') {
      onFileDrop(file)
    }
  }, [onFileDrop])

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        w-full max-w-lg p-8 sm:p-16 rounded-2xl border-3 border-dashed cursor-pointer
        transition-all duration-200 text-center
        ${isDragOver
          ? 'border-blue-500 bg-blue-50 scale-[1.02] shadow-lg shadow-blue-100'
          : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileSelect}
        className="hidden"
      />
      <div className={`text-4xl sm:text-5xl mb-3 sm:mb-4 transition-transform duration-200 ${isDragOver ? 'scale-110' : ''}`}>
        {isDragOver ? '\u2B07\uFE0F' : '\u{1F4C4}'}
      </div>
      <p className={`text-base sm:text-lg font-medium mb-1 transition-colors duration-200 ${isDragOver ? 'text-blue-600' : 'text-gray-700'}`}>
        {isDragOver ? t('dropzone.drop') : t('dropzone.drag')}
      </p>
      <p className={`text-sm text-gray-400 ${isDragOver ? 'invisible' : ''}`}>
        {t('dropzone.browse')}
      </p>
    </div>
  )
}
