import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { AlertTriangle, Check, RefreshCw, RotateCw, X } from 'lucide-react'
import type {
  EditorTool,
  PageSize,
  Placement,
  StampAsset,
  TargetRect,
  TargetResizeHandle,
} from './types'
import { formatMm, moveTargetRect, normalizeAngle, resizeTargetRect } from './utils'

interface PdfStageProps {
  document: PDFDocumentProxy
  pageIndex: number
  zoom: number
  placements: Placement[]
  assets: StampAsset[]
  selectedId: string | null
  tool: EditorTool
  targetRect: TargetRect | null
  targetDraftRect: TargetRect | null
  onSizeChange: (size: PageSize) => void
  onSelect: (id: string | null) => void
  onPlacementChange: (id: string, patch: Partial<Placement>) => void
  onTargetComplete: (target: TargetRect) => void
  onTargetDraftChange: (target: TargetRect) => void
  onTargetConfirm: () => void
  onTargetCancel: () => void
}

const pointInStage = (event: PointerEvent | React.PointerEvent, element: HTMLElement, zoom: number) => {
  const bounds = element.getBoundingClientRect()
  return {
    x: (event.clientX - bounds.left) / zoom,
    y: (event.clientY - bounds.top) / zoom,
  }
}

function PlacementBox({
  placement,
  asset,
  zoom,
  selected,
  disabled,
  onSelect,
  onChange,
}: {
  placement: Placement
  asset: StampAsset
  zoom: number
  selected: boolean
  disabled: boolean
  onSelect: () => void
  onChange: (patch: Partial<Placement>) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)

  const startDrag = (event: React.PointerEvent) => {
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    onSelect()
    const startX = event.clientX
    const startY = event.clientY
    const originX = placement.xPt
    const originY = placement.yPt

    const move = (moveEvent: PointerEvent) => {
      onChange({
        xPt: originX + (moveEvent.clientX - startX) / zoom,
        yPt: originY + (moveEvent.clientY - startY) / zoom,
      })
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
  }

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const originWidth = placement.widthPt
    const originHeight = placement.heightPt
    const ratio = originWidth / originHeight

    const move = (moveEvent: PointerEvent) => {
      const projectedDelta =
        Math.abs(moveEvent.clientX - startX) > Math.abs(moveEvent.clientY - startY)
          ? (moveEvent.clientX - startX) / zoom
          : ((moveEvent.clientY - startY) / zoom) * ratio
      const widthPt = Math.max(14, originWidth + projectedDelta)
      onChange({ widthPt, heightPt: widthPt / ratio })
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
  }

  const startRotate = (event: React.PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const stage = boxRef.current?.parentElement
    if (!stage) return
    const bounds = stage.getBoundingClientRect()
    const centerX = bounds.left + (placement.xPt + placement.widthPt / 2) * zoom
    const centerY = bounds.top + (placement.yPt + placement.heightPt / 2) * zoom

    const move = (moveEvent: PointerEvent) => {
      const angle = (Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180) / Math.PI + 90
      onChange({ rotation: normalizeAngle(angle) })
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
  }

  return (
    <div
      ref={boxRef}
      className={`placement ${selected ? 'is-selected' : ''}`}
      style={{
        left: placement.xPt * zoom,
        top: placement.yPt * zoom,
        width: placement.widthPt * zoom,
        height: placement.heightPt * zoom,
        transform: `rotate(${placement.rotation}deg)`,
        opacity: placement.opacity,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
      onPointerDown={startDrag}
      role="button"
      aria-label={`${asset.name}，拖动调整位置`}
      tabIndex={disabled ? -1 : 0}
    >
      <img src={asset.dataUrl} alt="" draggable={false} />
      {selected && !disabled && (
        <>
          <button className="rotation-handle" onPointerDown={startRotate} aria-label="旋转">
            <RotateCw size={13} strokeWidth={2.2} />
          </button>
          <button className="resize-handle" onPointerDown={startResize} aria-label="等比例缩放" />
        </>
      )}
    </div>
  )
}

const targetHandleLabels: Record<TargetResizeHandle, string> = {
  nw: '调整左上角',
  n: '调整上边',
  ne: '调整右上角',
  e: '调整右边',
  se: '调整右下角',
  s: '调整下边',
  sw: '调整左下角',
  w: '调整左边',
}

export function EditableTargetBox({
  target,
  zoom,
  pageSize,
  onChange,
  onConfirm,
  onCancel,
  testIdPrefix = 'target',
}: {
  target: TargetRect
  zoom: number
  pageSize: PageSize
  onChange: (target: TargetRect) => void
  onConfirm: () => void
  onCancel: () => void
  testIdPrefix?: string
}) {
  const startMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const origin = target
    const move = (moveEvent: PointerEvent) => {
      onChange(moveTargetRect(origin, (moveEvent.clientX - startX) / zoom, (moveEvent.clientY - startY) / zoom, pageSize))
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const startResize = (event: React.PointerEvent<HTMLButtonElement>, handle: TargetResizeHandle) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const origin = target
    const move = (moveEvent: PointerEvent) => {
      onChange(resizeTargetRect(origin, handle, (moveEvent.clientX - startX) / zoom, (moveEvent.clientY - startY) / zoom, pageSize))
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  return (
    <div
      className="target-rect is-editing"
      data-testid={`${testIdPrefix}-draft`}
      style={{
        left: target.xPt * zoom,
        top: target.yPt * zoom,
        width: target.widthPt * zoom,
        height: target.heightPt * zoom,
      }}
      onPointerDown={startMove}
    >
      <span data-testid={`${testIdPrefix}-draft-size`}>
        {formatMm(target.widthPt)} × {formatMm(target.heightPt)}
      </span>
      {(Object.keys(targetHandleLabels) as TargetResizeHandle[]).map((handle) => (
        <button
          key={handle}
          type="button"
          className={`target-resize-handle handle-${handle}`}
          data-testid={`${testIdPrefix}-resize-${handle}`}
          aria-label={targetHandleLabels[handle]}
          onPointerDown={(event) => startResize(event, handle)}
        />
      ))}
      <div className="target-confirm-bar" onPointerDown={(event) => event.stopPropagation()}>
        <small>拖动微调 · Enter 确认</small>
        <button type="button" className="cancel" data-testid={`${testIdPrefix}-cancel`} onClick={onCancel} aria-label="取消框选">
          <X size={14} />
        </button>
        <button type="button" className="confirm" data-testid={`${testIdPrefix}-confirm`} onClick={onConfirm} aria-label="确认框选">
          <Check size={15} />
        </button>
      </div>
    </div>
  )
}

export function PdfStage({
  document,
  pageIndex,
  zoom,
  placements,
  assets,
  selectedId,
  tool,
  targetRect,
  targetDraftRect,
  onSizeChange,
  onSelect,
  onPlacementChange,
  onTargetComplete,
  onTargetDraftChange,
  onTargetConfirm,
  onTargetCancel,
}: PdfStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [draftTarget, setDraftTarget] = useState<TargetRect | null>(null)
  const [rendering, setRendering] = useState(true)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [renderAttempt, setRenderAttempt] = useState(0)

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
        if (!canvasContext) throw new Error('无法创建 PDF 页面画布')
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
        console.error('PDF page render failed', error)
        if (!disposed) {
          setRendering(false)
          setRenderError(error instanceof Error ? error.message : '未知渲染错误')
        }
      }
    }
    void render()
    return () => {
      disposed = true
      renderTaskRef.current?.cancel()
    }
  }, [document, pageIndex, zoom, onSizeChange, renderAttempt])

  const startTarget = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== 'target' || !stageRef.current) {
      if (event.target === event.currentTarget || event.target === canvasRef.current) onSelect(null)
      return
    }
    event.preventDefault()
    const start = pointInStage(event, stageRef.current, zoom)
    const move = (moveEvent: PointerEvent) => {
      if (!stageRef.current) return
      const current = pointInStage(moveEvent, stageRef.current, zoom)
      setDraftTarget({
        xPt: Math.min(start.x, current.x),
        yPt: Math.min(start.y, current.y),
        widthPt: Math.abs(current.x - start.x),
        heightPt: Math.abs(current.y - start.y),
      })
    }
    const end = (endEvent: PointerEvent) => {
      if (stageRef.current) {
        const current = pointInStage(endEvent, stageRef.current, zoom)
        const target = {
          xPt: Math.min(start.x, current.x),
          yPt: Math.min(start.y, current.y),
          widthPt: Math.abs(current.x - start.x),
          heightPt: Math.abs(current.y - start.y),
        }
        if (target.widthPt > 8 && target.heightPt > 8) onTargetComplete(target)
      }
      setDraftTarget(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
  }

  const pagePlacements = placements.filter((placement) => placement.pageIndex === pageIndex)
  const basePageSize = { widthPt: viewportSize.width / zoom, heightPt: viewportSize.height / zoom }

  return (
    <div className="page-shell">
      <div
        ref={stageRef}
        className={`pdf-stage tool-${tool}`}
        style={{ width: viewportSize.width, height: viewportSize.height }}
        onPointerDown={startTarget}
      >
        <canvas ref={canvasRef} />
        {rendering && <div className="page-loading">正在铺开页面…</div>}
        {renderError && (
          <div className="page-error" role="alert">
            <AlertTriangle size={25} />
            <strong>这一页暂时无法显示</strong>
            <span>{renderError}</span>
            <button onClick={() => setRenderAttempt((attempt) => attempt + 1)}>
              <RefreshCw size={14} /> 重新加载本页
            </button>
          </div>
        )}
        {pagePlacements.map((placement) => {
          const asset = assets.find((item) => item.id === placement.assetId)
          if (!asset) return null
          return (
            <PlacementBox
              key={placement.id}
              placement={placement}
              asset={asset}
              zoom={zoom}
              selected={placement.id === selectedId}
              disabled={tool !== 'select'}
              onSelect={() => onSelect(placement.id)}
              onChange={(patch) => onPlacementChange(placement.id, patch)}
            />
          )
        })}
        {targetDraftRect && !draftTarget && (
          <EditableTargetBox
            target={targetDraftRect}
            zoom={zoom}
            pageSize={basePageSize}
            onChange={onTargetDraftChange}
            onConfirm={onTargetConfirm}
            onCancel={onTargetCancel}
          />
        )}
        {(draftTarget ?? (!targetDraftRect ? targetRect : null)) && (
          <div
            className={`target-rect ${draftTarget ? 'is-drawing' : ''}`}
            style={{
              left: (draftTarget ?? targetRect)!.xPt * zoom,
              top: (draftTarget ?? targetRect)!.yPt * zoom,
              width: (draftTarget ?? targetRect)!.widthPt * zoom,
              height: (draftTarget ?? targetRect)!.heightPt * zoom,
            }}
          >
            <span>
              {formatMm((draftTarget ?? targetRect)!.widthPt)} × {formatMm((draftTarget ?? targetRect)!.heightPt)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
