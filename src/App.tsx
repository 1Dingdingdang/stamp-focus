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
  LoaderCircle,
  Lock,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  RotateCcw,
  Ruler,
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
import { loadSavedAssets, saveAssets } from './assetStorage'
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
import type {
  AssetKind,
  EditorTool,
  LoadedPdf,
  PageSize,
  Placement,
  StampAsset,
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
  const [pdf, setPdf] = useState<LoadedPdf | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [assets, setAssets] = useState<StampAsset[]>(loadSavedAssets)
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
    if (targetRect) placement = fitPlacementToTarget(placement, targetRect)
    setPlacements((current) => [...current, placement])
    setSelectedId(placement.id)
    notify(
      targetRect
        ? '已按目标框等比例匹配。'
        : savedReference
          ? `已按参考尺寸 ${roundTo(savedReference.widthMm, 1)} × ${roundTo(savedReference.heightMm, 1)} mm 放置。`
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
    if (selectedPlacement && selectedPlacement.pageIndex === pageIndex) {
      updatePlacement(selectedPlacement.id, fitPlacementToTarget(selectedPlacement, targetDraftRect))
      notify('目标框已确认并完成匹配。', 'success')
    } else {
      notify('目标框已确认，现在从左侧点一个签名或印章。', 'success')
    }
  }, [notify, pageIndex, selectedPlacement, targetDraftRect, updatePlacement])

  const cancelTargetSelection = useCallback(() => {
    setTargetDraftRect(null)
    setTool('select')
    notify('已取消本次框选。')
  }, [notify])

  const changeSelectedWidth = (widthMm: number) => {
    if (!selectedPlacement || widthMm <= 0) return
    const ratio = selectedPlacement.widthPt / selectedPlacement.heightPt
    const widthPt = mmToPt(widthMm)
    updatePlacement(selectedPlacement.id, { widthPt, heightPt: widthPt / ratio })
  }

  const changePage = (nextPage: number) => {
    if (!pdf || nextPage < 0 || nextPage >= pdf.document.numPages) return
    setPageIndex(nextPage)
    setSelectedId(null)
    setTargetRect(null)
    setTargetDraftRect(null)
  }

  const changeReferencePage = (nextPage: number) => {
    if (!referencePdf || nextPage < 0 || nextPage >= referencePdf.document.numPages) return
    setReferencePageIndex(nextPage)
    setReferencePageSize(null)
    setReferenceRect(null)
    setReferenceDraftRect(null)
  }

  const handleReferenceSelectionStart = useCallback(() => {
    setReferenceRect(null)
    setReferenceDraftRect(null)
  }, [])

  const handleReferenceSelectionComplete = useCallback((selection: TargetRect) => {
    setReferenceDraftRect(selection)
    notify('可拖动参考框或八个控制点微调，按 Enter 确认。')
  }, [notify])

  const confirmReferenceSelection = useCallback(() => {
    if (!referenceDraftRect) return
    setReferenceRect(referenceDraftRect)
    setReferenceDraftRect(null)
    notify('参考框已确认，现在可以保存这个尺寸。', 'success')
  }, [notify, referenceDraftRect])

  const cancelReferenceSelection = useCallback(() => {
    if (!referenceDraftRect) return
    setReferenceDraftRect(null)
    notify('已取消本次参考框选。')
  }, [notify, referenceDraftRect])

  const resetReferenceSelection = useCallback(() => {
    setReferenceRect(null)
    setReferenceDraftRect(null)
  }, [])

  const closeReferencePicker = useCallback(() => {
    setReferenceDraftRect(null)
    setShowReferencePicker(false)
  }, [])

  const saveReferenceSize = () => {
    if (!referencePdf || !referenceRect || referenceRect.widthPt <= 0 || referenceRect.heightPt <= 0) return
    const size = {
      widthMm: ptToMm(referenceRect.widthPt),
      heightMm: ptToMm(referenceRect.heightPt),
      sourceFileName: referencePdf.fileName,
      capturedAt: Date.now(),
    }
    setReferencePreference({ size, enabled: true })

    if (selectedPlacement && selectedAsset) {
      const centerX = selectedPlacement.xPt + selectedPlacement.widthPt / 2
      const centerY = selectedPlacement.yPt + selectedPlacement.heightPt / 2
      const fitted = fitPlacementToTarget(selectedPlacement, {
        xPt: centerX - referenceRect.widthPt / 2,
        yPt: centerY - referenceRect.heightPt / 2,
        widthPt: referenceRect.widthPt,
        heightPt: referenceRect.heightPt,
      })
      updatePlacement(selectedPlacement.id, fitted)
      setAssets((current) =>
        current.map((asset) =>
          asset.id === selectedAsset.id
            ? {
                ...asset,
                widthMm: ptToMm(fitted.widthPt),
                heightMm: ptToMm(fitted.heightPt),
              }
            : asset,
        ),
      )
      notify(
        `已保存参考框 ${roundTo(size.widthMm, 1)} × ${roundTo(size.heightMm, 1)} mm，并更新“${selectedAsset.name}”的常用尺寸。`,
        'success',
      )
    } else {
      notify(
        `已保存参考框 ${roundTo(size.widthMm, 1)} × ${roundTo(size.heightMm, 1)} mm，以后放置签章会自动套入。`,
        'success',
      )
    }
    closeReferencePicker()
  }

  const exportPdf = async () => {
    if (!pdf || placements.length === 0) return
    setExporting(true)
    try {
      let bytes: Uint8Array
      if (secureExport) {
        const flattenedPages = await renderFlattenedPages(pdf.document, placements, assets)
        bytes = await exportFlattenedPdf(pdf.bytes, flattenedPages)
      } else {
        const pageTransforms = await Promise.all(
          Array.from({ length: pdf.document.numPages }, async (_, index) => {
            const page = await pdf.document.getPage(index + 1)
            const [a, b, c, d, e, f] = page.getViewport({ scale: 1 }).transform
            return [a, b, c, d, e, f] as PdfViewportTransform
          }),
        )
        bytes = await exportStampedPdf(pdf.bytes, placements, assets, pageTransforms)
      }
      const baseName = pdf.fileName.replace(/\.pdf$/i, '')
      const outputName = `${baseName}-已签章.pdf`
      if (window.stampFocus) {
        const result = await window.stampFocus.savePdf(bytes, outputName)
        if (!result.canceled) {
          notify(
            secureExport
              ? `签章已安全嵌入并导出到 ${result.filePath ?? outputName}`
              : `已导出到 ${result.filePath ?? outputName}`,
            'success',
          )
        }
      } else {
        downloadBytes(bytes, outputName)
        notify(secureExport ? '签章已安全嵌入并导出。' : 'PDF 已导出。', 'success')
      }
    } catch {
      notify('导出失败，请确认 PDF 没有编辑保护。', 'error')
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.matches('input, textarea, select, [contenteditable="true"]')) return
      if (showReferencePicker) return
      if (tool === 'target') {
        if (event.key === 'Enter' && targetDraftRect) {
          event.preventDefault()
          confirmTargetSelection()
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelTargetSelection()
          return
        }
        const movement = event.shiftKey ? mmToPt(2) : mmToPt(0.5)
        const delta =
          event.key === 'ArrowLeft'
            ? { xPt: -movement, yPt: 0 }
            : event.key === 'ArrowRight'
              ? { xPt: movement, yPt: 0 }
              : event.key === 'ArrowUp'
                ? { xPt: 0, yPt: -movement }
                : event.key === 'ArrowDown'
                  ? { xPt: 0, yPt: movement }
                  : null
        if (delta && targetDraftRect && pageSize) {
          event.preventDefault()
          setTargetDraftRect((current) => current && moveTargetRect(current, delta.xPt, delta.yPt, pageSize))
        }
        return
      }
      if (!selectedPlacement) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        removePlacement(selectedPlacement.id)
        return
      }
      const movement = event.shiftKey ? mmToPt(2) : mmToPt(0.5)
      const delta =
        event.key === 'ArrowLeft'
          ? { xPt: selectedPlacement.xPt - movement }
          : event.key === 'ArrowRight'
            ? { xPt: selectedPlacement.xPt + movement }
            : event.key === 'ArrowUp'
              ? { yPt: selectedPlacement.yPt - movement }
              : event.key === 'ArrowDown'
                ? { yPt: selectedPlacement.yPt + movement }
                : null
      if (delta) {
        event.preventDefault()
        updatePlacement(selectedPlacement.id, delta)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cancelTargetSelection, confirmTargetSelection, pageSize, removePlacement, selectedPlacement, showReferencePicker, targetDraftRect, tool, updatePlacement])

  useEffect(() => {
    if (!showReferencePicker) return
    const onReferenceKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'Enter' && referenceDraftRect) {
        event.preventDefault()
        confirmReferenceSelection()
        return
      }
      if (event.key === 'Escape' && referenceDraftRect) {
        event.preventDefault()
        cancelReferenceSelection()
        return
      }
      const movement = event.shiftKey ? mmToPt(2) : mmToPt(0.5)
      const delta =
        event.key === 'ArrowLeft'
          ? { xPt: -movement, yPt: 0 }
          : event.key === 'ArrowRight'
            ? { xPt: movement, yPt: 0 }
            : event.key === 'ArrowUp'
              ? { xPt: 0, yPt: -movement }
              : event.key === 'ArrowDown'
                ? { xPt: 0, yPt: movement }
                : null
      if (delta && referenceDraftRect && referencePageSize) {
        event.preventDefault()
        setReferenceDraftRect((current) =>
          current && moveTargetRect(current, delta.xPt, delta.yPt, referencePageSize),
        )
      }
    }
    window.addEventListener('keydown', onReferenceKeyDown)
    return () => window.removeEventListener('keydown', onReferenceKeyDown)
  }, [
    cancelReferenceSelection,
    confirmReferenceSelection,
    referenceDraftRect,
    referencePageSize,
    showReferencePicker,
  ])

  return (
    <div className="app" data-testid="stamp-focus-app">
      <input
        ref={pdfInputRef}
        className="sr-only"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => event.target.files?.[0] && void loadPdf(event.target.files[0])}
      />
      <input
        ref={referencePdfInputRef}
        className="sr-only"
        data-testid="reference-pdf-input"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => event.target.files?.[0] && void loadReferencePdf(event.target.files[0])}
      />
      <input
        ref={imageInputRef}
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => event.target.files?.[0] && void startImageImport(event.target.files[0])}
      />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Focus size={20} strokeWidth={2.4} /></div>
          <div>
            <div className="brand-name">章准 <span>Stamp Focus</span></div>
            <div className="brand-tagline">让每一次签章，尺寸刚刚好</div>
          </div>
        </div>
        <div className="document-name">
          {pdf ? <><FileText size={15} /> <span>{pdf.fileName}</span></> : <span>尚未打开 PDF</span>}
        </div>
        <div className="top-actions">
          <label
            className={`secure-export-option ${secureExport ? 'active' : ''}`}
            title="开启后，有签章的页面会转成高清页面图像，签章无法被单独选中或删除；该页文字搜索和链接可能不可用。"
          >
            <input
              data-testid="secure-export-toggle"
              type="checkbox"
              checked={secureExport}
              disabled={exporting}
              onChange={(event) => setSecureExport(event.target.checked)}
            />
            <ShieldCheck size={15} />
            <span><strong>安全嵌入</strong><small>签章与页面合成</small></span>
          </label>
          <button className="button secondary" onClick={() => pdfInputRef.current?.click()} disabled={pdfLoading}>
            {pdfLoading ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}
            {pdf ? '更换 PDF' : '打开 PDF'}
          </button>
          <button
            className="button primary"
            onClick={() => void exportPdf()}
            disabled={!pdf || placements.length === 0 || exporting}
          >
            {exporting ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
            导出已签章 PDF
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="asset-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">MY MARKS</span>
              <h2>常用签章</h2>
            </div>
            <button className="icon-button" onClick={() => imageInputRef.current?.click()} aria-label="添加签章图片">
              <Plus size={18} />
            </button>
          </div>

          <button className="import-card" onClick={() => imageInputRef.current?.click()} disabled={draftBusy}>
            {draftBusy ? <LoaderCircle className="spin" size={21} /> : <ImagePlus size={21} />}
            <span><strong>添加签名或印章</strong><small>自动去白底并裁掉空白</small></span>
          </button>

          <div className="asset-list">
            {assets.length === 0 ? (
              <div className="asset-empty">
                <Stamp size={30} strokeWidth={1.4} />
                <p>还没有常用素材</p>
                <span>添加一次、记住尺寸，以后直接点选</span>
              </div>
            ) : (
              assets.map((asset) => (
                <div className="asset-card" key={asset.id}>
                  <button className="asset-main" onClick={() => addPlacement(asset)}>
                    <span className="asset-preview"><img src={asset.dataUrl} alt={asset.name} /></span>
                    <span className="asset-meta">
                      <strong>{asset.name}</strong>
                      <span>{kindLabel[asset.kind]} · {roundTo(asset.widthMm, 1)} × {roundTo(asset.heightMm, 1)} mm</span>
                    </span>
                  </button>
                  <button className="asset-edit" onClick={() => editAsset(asset)} aria-label={`编辑${asset.name}`}>
                    <Pencil size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="privacy-note"><ShieldCheck size={15} /><span>所有文件仅在本机处理<br />不会上传到服务器</span></div>
        </aside>

        <section className="canvas-panel">
          {pdf ? (
            <>
              <div className="canvas-toolbar">
                <div className="tool-group">
                  <button className={tool === 'select' ? 'tool-button active' : 'tool-button'} onClick={() => {
                    setTool('select')
                    setTargetDraftRect(null)
                  }}>
                    <MousePointer2 size={15} /> 选择
                  </button>
                  <button
                    className={tool === 'hand' ? 'tool-button active hand-tool-button' : 'tool-button hand-tool-button'}
                    data-testid="hand-tool-button"
                    onClick={() => {
                      setTool('hand')
                      setTargetDraftRect(null)
                    }}
                    title="拖动放大后的 PDF 移动视野"
                  >
                    <Hand size={15} /> 抓手
                  </button>
                  <button
                    className={tool === 'target' ? 'tool-button active accent' : 'tool-button accent'}
                    data-testid="target-tool-button"
                    onClick={() => {
                      setTool('target')
                      setTargetRect(null)
                      setTargetDraftRect(null)
                      notify('先拖出签字栏，再微调框体，按 Enter 确认。')
                    }}
                  >
                    <Crosshair size={15} /> 框选匹配
                  </button>
                  {targetRect && (
                    <button className="tool-button" onClick={() => setTargetRect(null)}>
                      <X size={14} /> 清除参考框
                    </button>
                  )}
                  <button
                    className="tool-button reference-pdf-button"
                    data-testid="reference-pdf-button"
                    onClick={() => setShowReferencePicker(true)}
                  >
                    <Ruler size={15} /> 参考 PDF 取尺寸
                  </button>
                  {referencePreference.size && (
                    <button
                      className={referencePreference.enabled ? 'tool-button reference-size-chip active' : 'tool-button reference-size-chip'}
                      data-testid="reference-size-toggle"
                      title={referencePreference.enabled ? '点击暂停使用已保存参考尺寸' : '点击继续使用已保存参考尺寸'}
                      onClick={() => {
                        setReferencePreference((current) => ({ ...current, enabled: !current.enabled }))
                        notify(referencePreference.enabled ? '已暂停使用参考尺寸。' : '已恢复使用参考尺寸。')
                      }}
                    >
                      <Check size={13} />
                      {referencePreference.enabled
                        ? `${roundTo(referencePreference.size.widthMm, 1)} × ${roundTo(referencePreference.size.heightMm, 1)} mm`
                        : '参考尺寸已暂停'}
                    </button>
                  )}
                </div>
                <div className="toolbar-hint">
                  {tool === 'target'
                    ? targetDraftRect
                      ? <><Sparkles size={14} /> 拖动框体或控制点微调 · Enter 确认 · Esc 取消</>
                      : <><Sparkles size={14} /> 拖出签字栏，松开后可以继续微调</>
                    : tool === 'hand'
                      ? <><Hand size={14} /> 按住并拖动页面，移动查看区域</>
                      : selectedPlacement
                        ? '拖动位置 · 右下角缩放 · 上方旋转'
                        : '从左侧点选一个签章'}
                </div>
                <div className="tool-group page-controls">
                  <button className="icon-button compact" onClick={() => changeZoom(-0.1)} aria-label="缩小"><ZoomOut size={15} /></button>
                  <label className="zoom-input-wrap" title={`输入 ${MIN_ZOOM_PERCENT}–${MAX_ZOOM_PERCENT}，按 Enter 应用`}>
                    <input
                      data-testid="zoom-input"
                      type="number"
                      min={MIN_ZOOM_PERCENT}
                      max={MAX_ZOOM_PERCENT}
                      step="1"
                      inputMode="numeric"
                      aria-label="缩放百分比"
                      value={zoomInput}
                      onChange={(event) => setZoomInput(event.target.value)}
                      onFocus={(event) => event.currentTarget.select()}
                      onBlur={applyZoomInput}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          applyZoomInput()
                          event.currentTarget.blur()
                        }
                        if (event.key === 'Escape') {
                          setZoomInput(String(roundTo(zoom * 100, 1)))
                          event.currentTarget.blur()
                        }
                      }}
                    />
                    <span>%</span>
                  </label>
                  <button className="icon-button compact" onClick={() => changeZoom(0.1)} aria-label="放大"><ZoomIn size={15} /></button>
                  <i />
                  <button className="icon-button compact" onClick={() => changePage(pageIndex - 1)} disabled={pageIndex === 0} aria-label="上一页"><ArrowLeft size={15} /></button>
                  <span>{pageIndex + 1} / {pdf.document.numPages}</span>
                  <button className="icon-button compact" onClick={() => changePage(pageIndex + 1)} disabled={pageIndex === pdf.document.numPages - 1} aria-label="下一页"><ArrowRight size={15} /></button>
                </div>
              </div>
              <div
                ref={canvasScrollRef}
                className={`canvas-scroll ${tool === 'hand' ? 'hand-active' : ''} ${isPanning ? 'is-panning' : ''}`}
                data-testid="canvas-scroll"
                onPointerDown={startCanvasPan}
                onPointerMove={moveCanvasPan}
                onPointerUp={finishCanvasPan}
                onPointerCancel={finishCanvasPan}
                onLostPointerCapture={() => {
                  panStateRef.current = null
                  setIsPanning(false)
                }}
              >
                <PdfStage
                  document={pdf.document}
                  pageIndex={pageIndex}
                  zoom={zoom}
                  placements={placements}
                  assets={assets}
                  selectedId={selectedId}
                  tool={tool}
                  targetRect={targetRect}
                  targetDraftRect={targetDraftRect}
                  onSizeChange={setPageSize}
                  onSelect={setSelectedId}
                  onPlacementChange={updatePlacement}
                  onTargetComplete={handleTargetComplete}
                  onTargetDraftChange={setTargetDraftRect}
                  onTargetConfirm={confirmTargetSelection}
                  onTargetCancel={cancelTargetSelection}
                />
              </div>
            </>
          ) : (
            <div
              className="welcome"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const file = event.dataTransfer.files[0]
                if (file) void loadPdf(file)
              }}
            >
              <div className="welcome-visual">
                <div className="paper-card paper-back" />
                <div className="paper-card paper-front">
                  <span /><span /><span />
                  <div className="sample-sign">毅仁</div>
                  <div className="sample-measure">42.0 mm</div>
                </div>
                <div className="measure-line"><i /><b>真实尺寸</b><i /></div>
              </div>
              <span className="eyebrow">PHYSICAL SIZE, NOT PIXELS</span>
              <h1>签名多大，落在 PDF 里就多大</h1>
              <p>打开 PDF，选择保存过的签章尺寸，直接拖到位置。<br />也可以框住原签名区域，一次自动匹配。</p>
              <button className="button primary large" onClick={() => pdfInputRef.current?.click()}>
                <Upload size={18} /> 打开一份 PDF
              </button>
              <small>也可以把 PDF 拖到这里</small>
              <div className="feature-row">
                <span><BadgeCheck size={16} /> 毫米级尺寸</span>
                <span><Crosshair size={16} /> 框选即匹配</span>
                <span><ShieldCheck size={16} /> 完全离线</span>
              </div>
            </div>
          )}
        </section>

        <aside className="inspector-panel">
          <div className="panel-heading inspector-heading">
            <div><span className="eyebrow">INSPECTOR</span><h2>尺寸与位置</h2></div>
          </div>
          {selectedPlacement && selectedAsset ? (
            <div className="inspector-content">
              <div className="selected-summary">
                <span className="selected-thumb"><img src={selectedAsset.dataUrl} alt="" /></span>
                <div><strong>{selectedAsset.name}</strong><span>第 {selectedPlacement.pageIndex + 1} 页</span></div>
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
                <div><strong>还在反复试大小？</strong><span>点“框选匹配”，把自然签名区域框起来，软件会自动等比例套入。</span></div>
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
