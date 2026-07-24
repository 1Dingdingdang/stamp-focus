import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { EditableTargetBox } from './PdfStage'
import type { PageSize, TargetRect } from './types'
import { formatMm } from './utils'

interface ReferencePdfPickerProps {
  document: PDFDocumentProxy
  pageIndex: number
  zoom: number
  selection: TargetRect | null
  draftSelection: TargetRect | null
  onSizeChange: (size: PageSize) => void
  onSelectionStart: () => void
  onSelectionComplete: (selection: TargetRect) => void
  onDraftChange: (selection: TargetRect) => void
  onConfirm: () => void
  onCancel: () => void
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

export function ReferencePdfPicker({
  document,
  pageIndex,
  zoom,
  selection,
  draftSelection,
  onSizeChange,
  onSelectionStart,
  onSelectionComplete,
  onDraftChange,
  onConfirm,
  onCancel,
}: ReferencePdfPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [drawingRect, setDrawingRect] = useState<TargetRect | null>(null)
  const [rendering, setRendering] = useState(true)
  const [renderError, setRenderError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    setRendering(true)
    setRenderError(null)
    const render = async () => {
      try {
        renderTaskRef.current?.cancel()
        const page = await document.getPage(pageIndex + 1)
        if (disposed) return
        const baseViewport = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: zoom })
        onSizeChange({ widthPt: baseViewport.width, heightPt: baseViewport.height })
        setViewportSize({ width: viewport.width, height: viewport.height })
        const canvas = canvasRef.current
        if (!canvas) return
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.ceil(viewport.width * pixelRatio)
        canvas.height = Math.ceil(viewport.height * pixelRatio)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        const canvasContext = canvas.getContext('2d')
        if (!canvasContext) throw new Error('无法创建参考 PDF 画布')
        const task = page.render({
          canvas,
          canvasContext,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        })
        renderTaskRef.current = task
        await task.promise
        if (!disposed) setRendering(false)
      } catch (error) {
        if ((error as { name?: string }).name === 'RenderingCancelledException') return
        if (!disposed) {
          setRendering(false)
          setRenderError(error instanceof Error ? error.message : '参考页渲染失败')
        }
      }
    }
    void render()
    return () => {
      disposed = true
      renderTaskRef.current?.cancel()
    }
  }, [document, onSizeChange, pageIndex, zoom])

  const pointInStage = (event: PointerEvent | React.PointerEvent) => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    const bounds = stage.getBoundingClientRect()
    return {
      x: clamp((event.clientX - bounds.left) / zoom, 0, viewportSize.width / zoom),
      y: clamp((event.clientY - bounds.top) / zoom, 0, viewportSize.height / zoom),
    }
  }

  const startSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (rendering || renderError) return
    event.preventDefault()
    const start = pointInStage(event)
    onSelectionStart()
    setDrawingRect({ xPt: start.x, yPt: start.y, widthPt: 0, heightPt: 0 })

    const move = (moveEvent: PointerEvent) => {
      const current = pointInStage(moveEvent)
      setDrawingRect({
        xPt: Math.min(start.x, current.x),
        yPt: Math.min(start.y, current.y),
        widthPt: Math.abs(current.x - start.x),
        heightPt: Math.abs(current.y - start.y),
      })
    }
    const end = (endEvent: PointerEvent) => {
      const current = pointInStage(endEvent)
      const nextSelection = {
        xPt: Math.min(start.x, current.x),
        yPt: Math.min(start.y, current.y),
        widthPt: Math.abs(current.x - start.x),
        heightPt: Math.abs(current.y - start.y),
      }
      setDrawingRect(null)
      if (nextSelection.widthPt >= 3 && nextSelection.heightPt >= 3) {
        onSelectionComplete(nextSelection)
      }
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const pageSize = {
    widthPt: viewportSize.width / zoom,
    heightPt: viewportSize.height / zoom,
  }
  const visibleSelection = drawingRect ?? (!draftSelection ? selection : null)

  return (
    <div className="reference-page-shell">
      <div
        ref={stageRef}
        className="reference-pdf-stage"
        data-testid="reference-pdf-stage"
        style={{ width: viewportSize.width, height: viewportSize.height }}
        onPointerDown={startSelection}
      >
        <canvas ref={canvasRef} />
        {visibleSelection && visibleSelection.widthPt > 0 && visibleSelection.heightPt > 0 && (
          <div
            className={`reference-selection ${drawingRect ? 'is-drawing' : ''}`}
            data-testid="reference-selection"
            style={{
              left: visibleSelection.xPt * zoom,
              top: visibleSelection.yPt * zoom,
              width: visibleSelection.widthPt * zoom,
              height: visibleSelection.heightPt * zoom,
            }}
          >
            <span>{formatMm(visibleSelection.widthPt)} × {formatMm(visibleSelection.heightPt)}</span>
          </div>
        )}
        {draftSelection && !drawingRect && (
          <EditableTargetBox
            target={draftSelection}
            zoom={zoom}
            pageSize={pageSize}
            onChange={onDraftChange}
            onConfirm={onConfirm}
            onCancel={onCancel}
            testIdPrefix="reference"
          />
        )}
        {rendering && <div className="reference-page-loading">正在铺开参考页…</div>}
        {renderError && <div className="reference-page-error">{renderError}</div>}
      </div>
    </div>
  )
}
