import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  Copy,
  Crosshair,
  Download,
  FileText,
  Focus,
  Hand,
  ImagePlus,
  Info,
  LayoutTemplate,
  LoaderCircle,
  Lock,
  Minus,
  MousePointer2,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Ruler,
  Save,
  ShieldCheck,
  Sparkles,
  Stamp,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { loadSavedAssets, saveAssets, updateAssetDefaultSize } from './assetStorage'
import { renderFlattenedPages } from './flattenExport'
import { processSignatureImage } from './imageProcessing'
import { exportFlattenedPdf, exportStampedPdf } from './pdfExport'
import type { PdfViewportTransform } from './pdfExport'
import { PdfStage } from './PdfStage'
import { ReferencePdfPicker } from './ReferencePdfPicker'
import {
  loadReferenceSizePreference,
  saveReferenceSizePreference,
} from './referenceSizeStorage'
import {
  createStampTemplate,
  instantiateStampTemplate,
  loadSavedTemplates,
  saveTemplates,
} from './templateStorage'
import type {
  AssetKind,
  EditorTool,
  LoadedPdf,
  PageSize,
  Placement,
  StampAsset,
  StampTemplate,
  TargetRect,
} from './types'
import {
  createId,
  fitPlacementToTarget,
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  mmToPt,
  moveTargetRect,
  ptToMm,
  roundTo,
  zoomPercentToScale,
} from './utils'

GlobalWorkerOptions.workerSrc = workerUrl

const pdfResourceUrl = (directory: string) =>
  new URL(`./pdfjs/${directory}/`, window.location.href).href

interface AssetDraft {
  id?: string
  file?: File
  name: string
  kind: AssetKind
  dataUrl: string
  pixelWidth: number
  pixelHeight: number
  widthMm: number
  removeWhite: boolean
}

type ToastKind = 'success' | 'info' | 'error'

const kindLabel: Record<AssetKind, string> = {
  signature: '签名',
  stamp: '印章',
}

const defaultAssetName = (fileName: string) => fileName.replace(/\.[^.]+$/, '') || '我的签名'

const downloadBytes = (bytes: Uint8Array, fileName: string) => {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function App() {
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const referencePdfInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const canvasScrollRef = useRef<HTMLDivElement>(null)
  const panStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    scrollLeft: number
    scrollTop: number
  } | null>(null)
  const didLoadAssets = useRef(false)
  const didLoadTemplates = useRef(false)
  const [pdf, setPdf] = useState<LoadedPdf | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [assets, setAssets] = useState<StampAsset[]>(loadSavedAssets)
  const [templates, setTemplates] = useState<StampTemplate[]>(loadSavedTemplates)
  const [placements, setPlacements] = useState<Placement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState<PageSize | null>(null)
  const [zoom, setZoom] = useState(1.08)
  const [zoomInput, setZoomInput] = useState('108')
  const [isPanning, setIsPanning] = useState(false)
  const [tool, setTool] = useState<EditorTool>('select')
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [targetDraftRect, setTargetDraftRect] = useState<TargetRect | null>(null)
  const [draft, setDraft] = useState<AssetDraft | null>(null)
  const [draftBusy, setDraftBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [secureExport, setSecureExport] = useState(true)
  const [referencePreference, setReferencePreference] = useState(loadReferenceSizePreference)
  const [referencePdf, setReferencePdf] = useState<LoadedPdf | null>(null)
  const [referencePdfLoading, setReferencePdfLoading] = useState(false)
  const [referencePageIndex, setReferencePageIndex] = useState(0)
  const [referencePageSize, setReferencePageSize] = useState<PageSize | null>(null)
  const [referenceZoom, setReferenceZoom] = useState(0.9)
  const [referenceRect, setReferenceRect] = useState<TargetRect | null>(null)
  const [referenceDraftRect, setReferenceDraftRect] = useState<TargetRect | null>(null)
  const [showReferencePicker, setShowReferencePicker] = useState(false)
  const [showTemplateSave, setShowTemplateSave] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateBusy, setTemplateBusy] = useState(false)
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  const selectedPlacement = useMemo(
    () => placements.find((placement) => placement.id === selectedId) ?? null,
    [placements, selectedId],
  )
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedPlacement?.assetId) ?? null,
    [assets, selectedPlacement],
  )

  const notify = useCallback((message: string, kind: ToastKind = 'info') => {
    setToast({ message, kind })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (!didLoadAssets.current) {
      didLoadAssets.current = true
      return
    }
    if (!saveAssets(assets)) notify('素材已加入本次使用，但图片太大，未能保存到本机素材库。', 'info')
  }, [assets, notify])

  useEffect(() => {
    if (!didLoadTemplates.current) {
      didLoadTemplates.current = true
      return
    }
    if (!saveTemplates(templates)) notify('范式已加入本次使用，但本机存储空间不足，未能永久保存。', 'info')
  }, [notify, templates])

  useEffect(() => {
    saveReferenceSizePreference(referencePreference)
  }, [referencePreference])

  useEffect(() => {
    setZoomInput(String(roundTo(zoom * 100, 1)))
  }, [zoom])

  const changeZoom = (delta: number) => {
    setZoom((value) => Math.min(MAX_ZOOM_PERCENT / 100, Math.max(MIN_ZOOM_PERCENT / 100, value + delta)))
  }

  const applyZoomInput = () => {
    const nextZoom = zoomPercentToScale(zoomInput, zoom)
    setZoom(nextZoom)
    setZoomInput(String(roundTo(nextZoom * 100, 1)))
  }

  const startCanvasPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== 'hand' || event.button !== 0) return
    event.preventDefault()
    const viewport = event.currentTarget
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    }
    viewport.setPointerCapture(event.pointerId)
    setIsPanning(true)
  }

  const moveCanvasPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panStateRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    event.currentTarget.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX)
    event.currentTarget.scrollTop = pan.scrollTop - (event.clientY - pan.startY)
  }

  const finishCanvasPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panStateRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    panStateRef.current = null
    setIsPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const loadPdf = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      notify('请选择 PDF 文件。', 'error')
      return
    }
    setPdfLoading(true)
    try {
      const bytes = await file.arrayBuffer()
      const document = await getDocument({
        data: new Uint8Array(bytes.slice(0)),
        cMapUrl: pdfResourceUrl('cmaps'),
        cMapPacked: true,
        standardFontDataUrl: pdfResourceUrl('standard_fonts'),
        wasmUrl: pdfResourceUrl('wasm'),
        iccUrl: pdfResourceUrl('iccs'),
        useWorkerFetch: false,
      }).promise
      if (pdf) void pdf.document.cleanup().catch(() => undefined)
      setPdf({ fileName: file.name, bytes, document })
      setPlacements([])
      setSelectedId(null)
      setPageIndex(0)
      setTargetRect(null)
      setTargetDraftRect(null)
      notify(`已打开 ${file.name}`, 'success')
    } catch {
      notify('这个 PDF 无法打开，可能已加密或文件损坏。', 'error')
    } finally {
      setPdfLoading(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  const loadReferencePdf = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      notify('请选择作为尺寸参考的 PDF 文件。', 'error')
      return
    }
    setReferencePdfLoading(true)
    try {
      const bytes = await file.arrayBuffer()
      const document = await getDocument({
        data: new Uint8Array(bytes.slice(0)),
        cMapUrl: pdfResourceUrl('cmaps'),
        cMapPacked: true,
        standardFontDataUrl: pdfResourceUrl('standard_fonts'),
        wasmUrl: pdfResourceUrl('wasm'),
        iccUrl: pdfResourceUrl('iccs'),
        useWorkerFetch: false,
      }).promise
      if (referencePdf) void referencePdf.document.cleanup().catch(() => undefined)
      setReferencePdf({ fileName: file.name, bytes, document })
      setReferencePageIndex(0)
      setReferencePageSize(null)
      setReferenceRect(null)
      setReferenceDraftRect(null)
      notify(`参考 PDF 已打开：${file.name}`, 'success')
    } catch {
      notify('参考 PDF 无法打开，可能已加密或文件损坏。', 'error')
    } finally {
      setReferencePdfLoading(false)
      if (referencePdfInputRef.current) referencePdfInputRef.current.value = ''
    }
  }

  const startImageImport = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      notify('请选择 PNG、JPG 或 WebP 图片。', 'error')
      return
    }
    setDraftBusy(true)
    try {
      const processed = await processSignatureImage(file)
      const guessedKind = /章|印|stamp|seal/i.test(file.name) ? 'stamp' : 'signature'
      setDraft({
        file,
        name: defaultAssetName(file.name),
        kind: guessedKind,
        dataUrl: processed.dataUrl,
        pixelWidth: processed.pixelWidth,
        pixelHeight: processed.pixelHeight,
        widthMm: guessedKind === 'stamp' ? 40 : 42,
        removeWhite: true,
      })
    } catch (error) {
      notify((error as Error).message, 'error')
    } finally {
      setDraftBusy(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const updateDraftBackground = async (removeWhite: boolean) => {
    if (!draft) return
    if (!draft.file) {
      setDraft({ ...draft, removeWhite })
      return
    }
    setDraftBusy(true)
    try {
      const processed = await processSignatureImage(draft.file, { removeWhite, trim: true })
      setDraft({
        ...draft,
        removeWhite,
        dataUrl: processed.dataUrl,
        pixelWidth: processed.pixelWidth,
        pixelHeight: processed.pixelHeight,
      })
    } catch (error) {
      notify((error as Error).message, 'error')
    } finally {
      setDraftBusy(false)
    }
  }

  const commitAsset = () => {
    if (!draft || !draft.name.trim() || draft.widthMm <= 0) return
    const aspect = draft.pixelWidth / draft.pixelHeight
    const asset: StampAsset = {
      id: draft.id ?? createId(),
      name: draft.name.trim(),
      kind: draft.kind,
      dataUrl: draft.dataUrl,
      pixelWidth: draft.pixelWidth,
      pixelHeight: draft.pixelHeight,
      widthMm: draft.widthMm,
      heightMm: draft.widthMm / aspect,
      createdAt: Date.now(),
    }
    setAssets((current) => {
      const index = current.findIndex((item) => item.id === asset.id)
      if (index === -1) return [asset, ...current]
      return current.map((item) => (item.id === asset.id ? { ...asset, createdAt: item.createdAt } : item))
    })
    setDraft(null)
    notify(draft.id ? '常用尺寸已更新。' : '已保存到常用素材，下次可直接使用。', 'success')
  }

  const editAsset = (asset: StampAsset) => {
    setDraft({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      dataUrl: asset.dataUrl,
      pixelWidth: asset.pixelWidth,
      pixelHeight: asset.pixelHeight,
      widthMm: asset.widthMm,
      removeWhite: true,
    })
  }

  const deleteDraftAsset = () => {
    if (!draft?.id) return
    const accepted = window.confirm(`从常用素材中删除“${draft.name}”？页面上已经放置的同类签章也会一起移除。`)
    if (!accepted) return
    const assetId = draft.id
    setAssets((current) => current.filter((asset) => asset.id !== assetId))
    setPlacements((current) => current.filter((placement) => placement.assetId !== assetId))
    if (selectedPlacement?.assetId === assetId) setSelectedId(null)
    setDraft(null)
    notify('常用素材已删除。')
  }

  const rememberAssetDefaultSize = useCallback((
    asset: Pick<StampAsset, 'id' | 'name'>,
    widthPt: number,
    heightPt: number,
    announce = true,
  ) => {
    const widthMm = ptToMm(widthPt)
    const heightMm = ptToMm(heightPt)
    setAssets((current) => updateAssetDefaultSize(current, asset.id, widthMm, heightMm))
    if (announce) {
      notify(
        `已记住“${asset.name}”的专属默认尺寸：${roundTo(widthMm, 1)} × ${roundTo(heightMm, 1)} mm。`,
        'success',
      )
    }
  }, [notify])

  const addPlacement = (asset: StampAsset) => {
    if (!pdf || !pageSize) {
      notify('先打开一份 PDF，再放置签名或印章。')
      return
    }
    const widthPt = mmToPt(asset.widthMm)
    const heightPt = mmToPt(asset.heightMm)
    let placement: Placement = {
      id: createId(),
      assetId: asset.id,
      pageIndex,
      xPt: (pageSize.widthPt - widthPt) / 2,
      yPt: (pageSize.heightPt - heightPt) / 2,
      widthPt,
      heightPt,
      rotation: 0,
      opacity: 1,
    }
    const savedReference = referencePreference.enabled ? referencePreference.size : null
    if (savedReference) {
      const frameWidthPt = mmToPt(savedReference.widthMm)
      const frameHeightPt = mmToPt(savedReference.heightMm)
      placement = fitPlacementToTarget(placement, {
        xPt: (pageSize.widthPt - frameWidthPt) / 2,
        yPt: (pageSize.heightPt - frameHeightPt) / 2,
        widthPt: frameWidthPt,
        heightPt: frameHeightPt,
      })
    }
    if (targetRect) {
      placement = fitPlacementToTarget(placement, targetRect)
      rememberAssetDefaultSize(asset, placement.widthPt, placement.heightPt, false)
    } else if (savedReference) {
      rememberAssetDefaultSize(asset, placement.widthPt, placement.heightPt, false)
    }
    setPlacements((current) => [...current, placement])
    setSelectedId(placement.id)
    notify(
      targetRect
        ? `已按目标框匹配，并记住“${asset.name}”的专属默认尺寸。`
        : savedReference
          ? `已按参考尺寸放置，并记住“${asset.name}”的专属默认尺寸。`
          : '已放到页面中央，拖到签字位置即可。',
      'success',
    )
  }

  const updatePlacement = useCallback((id: string, patch: Partial<Placement>) => {
    setPlacements((current) =>
      current.map((placement) => (placement.id === id ? { ...placement, ...patch } : placement)),
    )
  }, [])

  const removePlacement = useCallback((id: string) => {
    setPlacements((current) => current.filter((placement) => placement.id !== id))
    setSelectedId((current) => (current === id ? null : current))
  }, [])

  const duplicatePlacement = () => {
    if (!selectedPlacement) return
    const copy: Placement = {
      ...selectedPlacement,
      id: createId(),
      xPt: selectedPlacement.xPt + mmToPt(4),
      yPt: selectedPlacement.yPt + mmToPt(4),
    }
    setPlacements((current) => [...current, copy])
    setSelectedId(copy.id)
  }

  const handleTargetComplete = (target: TargetRect) => {
    setTargetDraftRect(target)
    notify('可拖动框体或八个控制点微调，按 Enter 确认。')
  }

  const confirmTargetSelection = useCallback(() => {
    if (!targetDraftRect) return
    setTargetRect(targetDraftRect)
    setTargetDraftRect(null)
    setTool('select')
    if (selectedPlacement && selectedAsset && selectedPlacement.pageIndex === pageIndex) {
      const fitted = fitPlacementToTarget(selectedPlacement, targetDraftRect)
      updatePlacement(selectedPlacement.id, fitted)
      rememberAssetDefaultSize(selectedAsset, fitted.widthPt, fitted.heightPt, false)
      notify(`目标框已确认，并记住“${selectedAsset.name}”的专属默认尺寸。`, 'success')
    } else {
      notify('目标框已确认，现在从左侧点一个签名或印章。', 'success')
    }
  }, [
    notify,
    pageIndex,
    rememberAssetDefaultSize,
    selectedAsset,
    selectedPlacement,
    targetDraftRect,
    updatePlacement,
  ])

  const cancelTargetSelection = useCallback(() => {
    setTargetDraftRect(null)
    setTool('select')
    notify('已取消本次框选。')
  }, [notify])

  const changeSelectedWidth = (widthMm: number) => {
    if (!selectedPlacement || !selectedAsset || widthMm <= 0) return
    const ratio = selectedPlacement.widthPt / selectedPlacement.heightPt
    const widthPt = mmToPt(widthMm)
    const heightPt = widthPt / ratio
    updatePlacement(selectedPlacemen…8793 tokens truncated…edAsset.name}</strong><span>第 {selectedPlacement.pageIndex + 1} 页</span></div>
                <Check size={16} />
              </div>

              <div className="field-section">
                <label>实际宽度</label>
                <div className="number-field emphasized">
                  <button onClick={() => changeSelectedWidth(Math.max(1, ptToMm(selectedPlacement.widthPt) - 1))}><Minus size={14} /></button>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    value={roundTo(ptToMm(selectedPlacement.widthPt), 1)}
                    onChange={(event) => changeSelectedWidth(Number(event.target.value))}
                  />
                  <span>mm</span>
                  <button onClick={() => changeSelectedWidth(ptToMm(selectedPlacement.widthPt) + 1)}><Plus size={14} /></button>
                </div>
                <div className="locked-ratio"><Lock size={12} /> 已锁定比例 · 高 {roundTo(ptToMm(selectedPlacement.heightPt), 1)} mm</div>
                <div className="asset-default-size-note">
                  <BadgeCheck size={13} />
                  <span>
                    “{selectedAsset.name}”专属默认：
                    <strong>{roundTo(selectedAsset.widthMm, 1)} × {roundTo(selectedAsset.heightMm, 1)} mm</strong>
                    <small>框选确认、拖拽缩放或输入宽度后自动更新</small>
                  </span>
                </div>
              </div>

              <div className="field-grid">
                <label><span>旋转角度</span><div className="compact-input"><RotateCcw size={14} /><input type="number" value={roundTo(selectedPlacement.rotation, 1)} onChange={(event) => updatePlacement(selectedPlacement.id, { rotation: Number(event.target.value) })} /><b>°</b></div></label>
                <label><span>不透明度</span><div className="compact-input"><input type="number" min="10" max="100" value={Math.round(selectedPlacement.opacity * 100)} onChange={(event) => updatePlacement(selectedPlacement.id, { opacity: Math.min(1, Math.max(0.1, Number(event.target.value) / 100)) })} /><b>%</b></div></label>
              </div>

              <label className="range-field">
                <span>浓淡</span>
                <input type="range" min="10" max="100" value={selectedPlacement.opacity * 100} onChange={(event) => updatePlacement(selectedPlacement.id, { opacity: Number(event.target.value) / 100 })} />
              </label>

              <div className="quick-actions">
                <button onClick={duplicatePlacement}><Copy size={15} /> 复制</button>
                <button className="danger" onClick={() => removePlacement(selectedPlacement.id)}><Trash2 size={15} /> 删除</button>
              </div>

              <div className="tip-card">
                <Sparkles size={16} />
                <div><strong>每枚签章都有自己的默认尺寸</strong><span>点“框选匹配”校准一次，确认后会自动记住，以后直接点选即可复用。</span></div>
              </div>
            </div>
          ) : (
            <div className="inspector-empty">
              <MousePointer2 size={30} strokeWidth={1.35} />
              <p>选中页面上的签章</p>
              <span>这里可以精确调整毫米尺寸、角度和浓淡</span>
              <button className="text-button" onClick={() => setShowGuide((value) => !value)}><Info size={14} /> {showGuide ? '收起操作说明' : '查看操作说明'} <ChevronDown size={14} /></button>
              {showGuide && (
                <ol className="mini-guide">
                  <li><b>1</b><span>打开 PDF</span></li>
                  <li><b>2</b><span>添加签名并输入真实宽度</span></li>
                  <li><b>3</b><span>点选放置，拖到签字栏</span></li>
                </ol>
              )}
            </div>
          )}
        </aside>
      </main>

      {showTemplateSave && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !templateBusy) setShowTemplateSave(false)
          }}
        >
          <div className="template-save-modal" role="dialog" aria-modal="true" aria-label="保存签章范式">
            <button
              className="modal-close"
              onClick={() => setShowTemplateSave(false)}
              disabled={templateBusy}
              aria-label="关闭"
            >
              <X size={18} />
            </button>
            <span className="eyebrow">LAYOUT PRESET</span>
            <h2>保存当前签章范式</h2>
            <p>会记住每一个章和签名所在的页码、位置、毫米尺寸、旋转与透明度。以后打开同类 PDF 即可一键套用。</p>
            <div className="template-save-summary">
              <LayoutTemplate size={20} />
              <span>
                <strong>{placements.length} 个签章</strong>
                <small>分布在 {new Set(placements.map((placement) => placement.pageIndex)).size} 页 · 素材仍保存在本机</small>
              </span>
            </div>
            <label className="template-name-field">
              <span>范式名称</span>
              <input
                data-testid="template-name-input"
                autoFocus
                value={templateName}
                placeholder="例如：采购审批表标准签章"
                onChange={(event) => setTemplateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void commitTemplate()
                  }
                  if (event.key === 'Escape' && !templateBusy) setShowTemplateSave(false)
                }}
              />
              <small>使用相同名称保存时，会更新原来的范式。</small>
            </label>
            <div className="template-modal-actions">
              <button className="button secondary" onClick={() => setShowTemplateSave(false)} disabled={templateBusy}>取消</button>
              <button
                className="button primary"
                data-testid="confirm-save-template"
                onClick={() => void commitTemplate()}
                disabled={templateBusy || !templateName.trim()}
              >
                {templateBusy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
                {templates.some((template) => template.name === templateName.trim()) ? '更新这个范式' : '保存并记住'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReferencePicker && (
        <div className="modal-backdrop reference-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeReferencePicker()}>
          <div className="reference-modal" role="dialog" aria-modal="true" aria-label="从参考 PDF 获取签章尺寸">
            <button className="modal-close" onClick={closeReferencePicker} aria-label="关闭参考 PDF"><X size={18} /></button>
            <div className="reference-modal-heading">
              <div>
                <span className="eyebrow">REFERENCE PDF</span>
                <h2>从正确样本取签章尺寸</h2>
                <p>在已有签名或印章外围拖框，再拖动框体或八个控制点微调，按 Enter 确认后保存。</p>
              </div>
              {referencePdf && (
                <button className="button secondary" onClick={() => referencePdfInputRef.current?.click()} disabled={referencePdfLoading}>
                  {referencePdfLoading ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />} 更换参考 PDF
                </button>
              )}
            </div>

            {referencePdf ? (
              <>
                <div className="reference-toolbar">
                  <div className="reference-file-name"><FileText size={14} /><span>{referencePdf.fileName}</span></div>
                  <div className="reference-toolbar-controls">
                    <button className="icon-button compact" onClick={() => setReferenceZoom((value) => Math.max(0.5, value - 0.1))} aria-label="缩小参考页"><ZoomOut size={15} /></button>
                    <span>{Math.round(referenceZoom * 100)}%</span>
                    <button className="icon-button compact" onClick={() => setReferenceZoom((value) => Math.min(1.8, value + 0.1))} aria-label="放大参考页"><ZoomIn size={15} /></button>
                    <i />
                    <button className="icon-button compact" onClick={() => changeReferencePage(referencePageIndex - 1)} disabled={referencePageIndex === 0} aria-label="参考 PDF 上一页"><ArrowLeft size={15} /></button>
                    <span>{referencePageIndex + 1} / {referencePdf.document.numPages}</span>
                    <button className="icon-button compact" onClick={() => changeReferencePage(referencePageIndex + 1)} disabled={referencePageIndex === referencePdf.document.numPages - 1} aria-label="参考 PDF 下一页"><ArrowRight size={15} /></button>
                  </div>
                </div>
                <div className="reference-canvas-scroll">
                  <ReferencePdfPicker
                    document={referencePdf.document}
                    pageIndex={referencePageIndex}
                    zoom={referenceZoom}
                    selection={referenceRect}
                    draftSelection={referenceDraftRect}
                    onSizeChange={setReferencePageSize}
                    onSelectionStart={handleReferenceSelectionStart}
                    onSelectionComplete={handleReferenceSelectionComplete}
                    onDraftChange={setReferenceDraftRect}
                    onConfirm={confirmReferenceSelection}
                    onCancel={cancelReferenceSelection}
                  />
                </div>
                <div className="reference-modal-footer">
                  <div className="reference-size-readout">
                    <Ruler size={18} />
                    {referenceDraftRect && referenceDraftRect.widthPt > 0 && referenceDraftRect.heightPt > 0 ? (
                      <span><small>正在微调 · Enter 确认</small><strong>{roundTo(ptToMm(referenceDraftRect.widthPt), 1)} × {roundTo(ptToMm(referenceDraftRect.heightPt), 1)} mm</strong></span>
                    ) : referenceRect && referenceRect.widthPt > 0 && referenceRect.heightPt > 0 ? (
                      <span><small>已确认真实尺寸</small><strong>{roundTo(ptToMm(referenceRect.widthPt), 1)} × {roundTo(ptToMm(referenceRect.heightPt), 1)} mm</strong></span>
                    ) : (
                      <span><small>在参考页拖出方框</small><strong>框住正确签名或印章</strong></span>
                    )}
                  </div>
                  <div className="reference-footer-actions">
                    {referencePreference.size && (
                      <button className="button secondary" onClick={() => {
                        setReferencePreference({ size: null, enabled: false })
                        notify('已清除保存的参考尺寸。')
                      }}>清除已保存尺寸</button>
                    )}
                    <button className="button secondary" onClick={resetReferenceSelection} disabled={!referenceRect && !referenceDraftRect}>重新框选</button>
                    <button
                      className="button primary"
                      data-testid="save-reference-size"
                      onClick={saveReferenceSize}
                      disabled={Boolean(referenceDraftRect) || !referenceRect || referenceRect.widthPt < 3 || referenceRect.heightPt < 3}
                    >
                      <Check size={16} /> {referenceDraftRect ? '先确认框选' : '保存尺寸并应用'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="reference-empty-state">
                <div className="reference-empty-icon"><Ruler size={30} /></div>
                <h3>打开一份已有正确签章的 PDF</h3>
                <p>目标 PDF 不会关闭。参考 PDF 只用于量取尺寸，不会被修改。</p>
                <button className="button primary large" data-testid="open-reference-pdf" onClick={() => referencePdfInputRef.current?.click()} disabled={referencePdfLoading}>
                  {referencePdfLoading ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />} 打开参考 PDF
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {draft && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDraft(null)}>
          <div className="asset-modal" role="dialog" aria-modal="true" aria-label="设置签章实际尺寸">
            <button className="modal-close" onClick={() => setDraft(null)} aria-label="关闭"><X size={18} /></button>
            <span className="eyebrow">ONE-TIME CALIBRATION</span>
            <h2>{draft.id ? '编辑常用尺寸' : '只需校准这一次'}</h2>
            <p>这里填写的是它在纸上看起来舒服的真实宽度。保存后，每次放置都会保持这个尺寸。</p>
            <div className="draft-preview"><img src={draft.dataUrl} alt="签章预览" /></div>
            <div className="modal-fields">
              <label><span>素材名称</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <div className="kind-picker">
                <button className={draft.kind === 'signature' ? 'active' : ''} onClick={() => setDraft({ ...draft, kind: 'signature' })}>手写签名</button>
                <button className={draft.kind === 'stamp' ? 'active' : ''} onClick={() => setDraft({ ...draft, kind: 'stamp' })}>印章 / 签字章</button>
              </div>
              <label>
                <span>纸上的实际宽度</span>
                <div className="modal-size-input"><input type="number" min="1" step="0.5" value={draft.widthMm} onChange={(event) => setDraft({ ...draft, widthMm: Number(event.target.value) })} /><b>mm</b></div>
                <small>等比例高度约 {roundTo(draft.widthMm / (draft.pixelWidth / draft.pixelHeight), 1)} mm</small>
              </label>
              <label className="check-field">
                <input type="checkbox" checked={draft.removeWhite} disabled={!draft.file || draftBusy} onChange={(event) => void updateDraftBackground(event.target.checked)} />
                <span><strong>自动去掉白色背景</strong><small>适合扫描或截图的签名；透明 PNG 也可以直接使用</small></span>
              </label>
            </div>
            <div className={`modal-footer ${draft.id ? 'with-delete' : ''}`}>
              {draft.id && <button className="button delete-asset" onClick={deleteDraftAsset}><Trash2 size={15} /> 删除素材</button>}
              <button className="button primary modal-submit" onClick={commitAsset} disabled={draftBusy || !draft.name.trim() || draft.widthMm <= 0}>
                {draftBusy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                保存这个真实尺寸
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.kind}`}><span>{toast.kind === 'success' ? <Check size={15} /> : toast.kind === 'error' ? <X size={15} /> : <Info size={15} />}</span>{toast.message}</div>}
    </div>
  )
}

export default App
