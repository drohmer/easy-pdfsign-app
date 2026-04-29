import { useRef, useCallback, useEffect } from 'react'

interface Props {
  pageWidth: number
  pageHeight: number
  color: string
  onDrawingComplete: (dataUrl: string, x: number, y: number, width: number, height: number) => void
  onCancel: () => void
}

export function DrawingCanvas({ pageWidth, pageHeight, color, onDrawingComplete, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const points = useRef<Array<{ x: number; y: number }>>([])
  const minX = useRef(Infinity)
  const minY = useRef(Infinity)
  const maxX = useRef(-Infinity)
  const maxY = useRef(-Infinity)

  // Scale for retina displays
  const scale = window.devicePixelRatio || 1

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = pageWidth * scale
    canvas.height = pageHeight * scale
    const ctx = canvas.getContext('2d')!
    ctx.scale(scale, scale)
  }, [pageWidth, pageHeight, scale])

  const getPos = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isDrawing.current = true
    points.current = []
    minX.current = Infinity
    minY.current = Infinity
    maxX.current = -Infinity
    maxY.current = -Infinity

    const pos = getPos(e)
    points.current.push(pos)

    const ctx = canvasRef.current!.getContext('2d')!
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }, [getPos, color])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing.current) return
    e.preventDefault()

    const pos = getPos(e)
    points.current.push(pos)

    // Track bounding box
    minX.current = Math.min(minX.current, pos.x)
    minY.current = Math.min(minY.current, pos.y)
    maxX.current = Math.max(maxX.current, pos.x)
    maxY.current = Math.max(maxY.current, pos.y)

    const ctx = canvasRef.current!.getContext('2d')!
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }, [getPos])

  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const canvas = canvasRef.current
        if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
        isDrawing.current = false
        onCancelRef.current()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const handleMouseUp = useCallback(() => {
    if (!isDrawing.current) return
    isDrawing.current = false

    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!

    if (points.current.length < 3) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      onCancel()
      return
    }

    // Add padding around the bounding box
    const pad = 4
    const bx = Math.max(0, minX.current - pad)
    const by = Math.max(0, minY.current - pad)
    const bw = Math.min(pageWidth, maxX.current + pad) - bx
    const bh = Math.min(pageHeight, maxY.current + pad) - by

    if (bw < 5 || bh < 5) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      onCancel()
      return
    }

    // Extract the drawn region to a new canvas
    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = bw * scale
    cropCanvas.height = bh * scale
    const cropCtx = cropCanvas.getContext('2d')!
    cropCtx.drawImage(
      canvas,
      bx * scale, by * scale, bw * scale, bh * scale,
      0, 0, bw * scale, bh * scale,
    )

    const dataUrl = cropCanvas.toDataURL('image/png')

    // Convert to our coordinate system (fraction of pageWidth)
    const x = bx / pageWidth
    const y = by / pageWidth
    const w = bw / pageWidth
    const h = bh / pageWidth

    onDrawingComplete(dataUrl, x, y, w, h)

    // Clear the drawing canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [pageWidth, pageHeight, scale, onDrawingComplete, onCancel])

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className="absolute inset-0 cursor-crosshair"
      style={{ width: pageWidth, height: pageHeight }}
    />
  )
}
