import { useCallback, useRef, useEffect, useState, memo } from 'react'
import type { SignatureElement } from '../App'
import { DEFAULT_RECT_COLOR, DEFAULT_TEXT_COLOR } from '../utils/constants'

interface Props {
  element: SignatureElement
  containerWidth: number
  onUpdate: (updates: Partial<SignatureElement>) => void
  onDelete: () => void
  onCopy: (element: SignatureElement) => void
  onSelect: () => void
  onDeselect: () => void
  isSelected: boolean
  showOutline: boolean
}

const DEFAULT_FONT_SIZE = 14
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 32

export const DraggableElement = memo(function DraggableElement({ element, containerWidth, onUpdate, onDelete, onCopy, onSelect, onDeselect, isSelected, showOutline }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [isNew, setIsNew] = useState(true)
  const [editText, setEditText] = useState(element.content)
  const inputRef = useRef<HTMLInputElement>(null)
  const elementRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef({ x: 0, y: 0, elX: 0, elY: 0 })
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 })

  // Always-fresh callback refs — updated synchronously each render, safe to call from event handlers
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate
  const onDeleteRef = useRef(onDelete)
  onDeleteRef.current = onDelete
  const onCopyRef = useRef(onCopy)
  onCopyRef.current = onCopy
  const onDeselectRef = useRef(onDeselect)
  onDeselectRef.current = onDeselect
  const elementDataRef = useRef(element)
  elementDataRef.current = element

  useEffect(() => {
    const timer = setTimeout(() => setIsNew(false), 1500)
    return () => clearTimeout(timer)
  }, [])

  // Handle Delete/Backspace/Escape/Copy key when selected
  useEffect(() => {
    if (!isSelected) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement?.tagName === 'INPUT') return
        e.preventDefault()
        onDeleteRef.current()
      }
      if (e.key === 'Escape') onDeselectRef.current()
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        e.preventDefault()
        onCopyRef.current(elementDataRef.current)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isSelected])

  const isRect = element.type === 'rect'
  // "Box" elements carry an explicit width/height and get a resize handle;
  // text elements are sized by their content instead.
  const isText = element.type !== 'signature' && element.type !== 'drawing' && !isRect
  const fontSize = element.fontSize ?? DEFAULT_FONT_SIZE

  const pixelX = element.x * containerWidth
  const pixelY = element.y * containerWidth
  const pixelW = element.width * containerWidth
  const pixelH = element.height * containerWidth

  const isCheckbox = element.type === 'check' || element.type === 'cross'

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (element.type === 'signature' || element.type === 'drawing' || isCheckbox || isRect) return
    e.preventDefault()
    e.stopPropagation()
    setEditText(element.content)
    setIsEditing(true)
  }, [element.type, element.content, isCheckbox, isRect])

  // Focus the input when entering edit mode (after React commits the input to the DOM)
  useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  const commitEdit = useCallback(() => {
    setIsEditing(false)
    if (editText.trim() && editText !== element.content) {
      onUpdateRef.current({ content: editText.trim() })
    } else {
      setEditText(element.content)
    }
  }, [editText, element.content])

  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    onSelectRef.current()
    if (isEditing) return
    if ((e.target as HTMLElement).dataset.resize) return
    if ((e.target as HTMLElement).dataset.fontsize) return
    e.preventDefault()
    const el = elementRef.current
    if (!el) return

    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      elX: el.offsetLeft,
      elY: el.offsetTop,
    }

    const cw = containerWidth
    const w = el.offsetWidth

    const handleMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStart.current.x
      const dy = ev.clientY - dragStart.current.y
      const newX = Math.max(0, Math.min(cw - w, dragStart.current.elX + dx))
      const newY = dragStart.current.elY + dy
      el.style.left = `${newX}px`
      el.style.top = `${newY}px`
    }

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)

      const elRect = el.getBoundingClientRect()
      const centerY = elRect.top + elRect.height / 2

      const pageDivs = Array.from(document.querySelectorAll('[data-page]'))
      let pageContainer: Element | undefined
      let closestContainer: Element | undefined
      let closestDist = Infinity

      for (const div of pageDivs) {
        const rect = div.getBoundingClientRect()
        if (centerY >= rect.top && centerY <= rect.bottom) {
          pageContainer = div
          break
        }
        const dist = Math.min(Math.abs(centerY - rect.top), Math.abs(centerY - rect.bottom))
        if (dist < closestDist) {
          closestDist = dist
          closestContainer = div
        }
      }

      const target = pageContainer ?? closestContainer

      if (target) {
        const targetPage = parseInt((target as HTMLElement).dataset.page!, 10)
        const pageRect = target.getBoundingClientRect()
        onUpdateRef.current({
          x: Math.max(0, (elRect.left - pageRect.left) / cw),
          y: Math.max(0, (elRect.top - pageRect.top) / cw),
          page: targetPage,
        })
      } else {
        onUpdateRef.current({
          x: Math.max(0, el.offsetLeft / cw),
          y: Math.max(0, el.offsetTop / cw),
        })
      }
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [containerWidth, isEditing])

  const handleResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const el = elementRef.current
    if (!el) return

    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      w: el.offsetWidth,
      h: el.offsetHeight,
    }

    const cw = containerWidth
    // A mask rectangle may legitimately be tiny (covering a single character),
    // whereas an image needs enough room to stay recognisable.
    const minW = isRect ? 8 : 40
    const minH = isRect ? 8 : 20

    const sizeFor = (ev: MouseEvent) => ({
      w: Math.max(minW, resizeStart.current.w + ev.clientX - resizeStart.current.x),
      h: Math.max(minH, resizeStart.current.h + ev.clientY - resizeStart.current.y),
    })

    const handleMove = (ev: MouseEvent) => {
      const { w, h } = sizeFor(ev)
      el.style.width = `${w}px`
      el.style.height = `${h}px`
    }

    const handleUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      const { w, h } = sizeFor(ev)
      onUpdateRef.current({ width: w / cw, height: h / cw })
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [containerWidth, isRect])

  // Sync DOM with React state when not dragging
  useEffect(() => {
    const el = elementRef.current
    if (!el) return
    el.style.left = `${pixelX}px`
    el.style.top = `${pixelY}px`
    if (!isText) {
      el.style.width = `${pixelW}px`
      el.style.height = `${pixelH}px`
    }
  }, [pixelX, pixelY, pixelW, pixelH, isText])

  const changeFontSize = useCallback((delta: number) => {
    const newSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, fontSize + delta))
    onUpdateRef.current({ fontSize: newSize })
  }, [fontSize])

  const renderContent = () => {
    // The rectangle is painted as the root element's background so that the fill
    // covers the exact box the export draws (background-clip defaults to border-box).
    if (isRect) return null
    if (element.type === 'signature') {
      return (
        <img
          src={element.content}
          alt="Signature"
          className="w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
        />
      )
    }
    if (element.type === 'drawing') {
      return (
        <div
          className="w-full h-full pointer-events-none select-none"
          style={{
            backgroundColor: element.color || DEFAULT_TEXT_COLOR,
            maskImage: `url(${element.content})`,
            maskSize: 'contain',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskImage: `url(${element.content})`,
            WebkitMaskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
          }}
        />
      )
    }
    if (isEditing) {
      return (
        <input
          ref={inputRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') { setEditText(element.content); setIsEditing(false) }
          }}
          className="w-full h-full bg-white/80 border-none outline-none px-1"
          style={{ fontSize, color: element.color || DEFAULT_TEXT_COLOR }}
        />
      )
    }
    return (
      <span
        className="leading-normal whitespace-nowrap select-none pointer-events-none px-1 py-0.5"
        style={{ fontSize, color: element.color || DEFAULT_TEXT_COLOR }}
      >
        {element.content}
      </span>
    )
  }

  const isImage = element.type === 'signature' || element.type === 'drawing'
  // Written out in full: Tailwind only sees class names that appear literally in the source.
  const hoverBorder = isRect ? 'hover:border-purple-400' : isImage ? 'hover:border-blue-400' : 'hover:border-green-400'
  const activeBorder = isRect ? 'border-purple-400' : isImage ? 'border-blue-400' : 'border-green-400'

  const borderClass = (isSelected || showOutline)
    ? activeBorder
    : isNew ? 'animate-highlight' : 'border-transparent'

  return (
    <div
      ref={elementRef}
      data-draggable
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      className={`absolute border-2 ${borderClass} ${hoverBorder} ${isEditing ? 'cursor-text' : 'cursor-move'} group hover:shadow-md transition-[border-color,box-shadow] ${isRect ? '' : 'rounded'}`}
      style={{
        left: pixelX,
        top: pixelY,
        ...(isText ? {} : { width: pixelW, height: pixelH }),
        ...(isRect ? { backgroundColor: element.color || DEFAULT_RECT_COLOR } : {}),
      }}
    >
      {renderContent()}
      {/* Resize handle — box elements only (signature, drawing, rectangle) */}
      {!isText && (
        <div
          data-resize="true"
          onMouseDown={handleResizeDown}
          className="absolute bottom-0 right-0 w-3 h-3 bg-white border border-gray-400 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
        />
      )}
      {/* Controls toolbar (font size + color) — not for signatures */}
      {!isEditing && element.type !== 'signature' && (
        <div className="absolute -top-6 left-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {isText && (
            <>
              <button
                data-fontsize="true"
                onMouseDown={(e) => { e.stopPropagation(); changeFontSize(-2) }}
                className="w-5 h-5 flex items-center justify-center bg-white border border-gray-300 rounded text-[10px] font-bold text-gray-600 hover:bg-gray-100 cursor-pointer leading-none"
              >
                A-
              </button>
              <span className="text-[10px] text-gray-500 min-w-[20px] text-center">{fontSize}</span>
              <button
                data-fontsize="true"
                onMouseDown={(e) => { e.stopPropagation(); changeFontSize(2) }}
                className="w-5 h-5 flex items-center justify-center bg-white border border-gray-300 rounded text-[10px] font-bold text-gray-600 hover:bg-gray-100 cursor-pointer leading-none"
              >
                A+
              </button>
            </>
          )}
          <input
            type="color"
            value={element.color || DEFAULT_TEXT_COLOR}
            onChange={(e) => onUpdateRef.current({ color: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-5 h-5 rounded cursor-pointer border border-gray-300 p-0"
          />
        </div>
      )}
    </div>
  )
})
