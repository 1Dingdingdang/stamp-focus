import type { PDFDocumentProxy } from 'pdfjs-dist'

export type AssetKind = 'signature' | 'stamp'

export interface StampCategory {
  id: string
  name: string
  createdAt: number
}

export interface StampAsset {
  id: string
  name: string
  kind: AssetKind
  categoryId?: string
  dataUrl: string
  pixelWidth: number
  pixelHeight: number
  widthMm: number
  heightMm: number
  createdAt: number
}

export interface Placement {
  id: string
  assetId: string
  pageIndex: number
  xPt: number
  yPt: number
  widthPt: number
  heightPt: number
  rotation: number
  opacity: number
  imageCrop?: PlacementImageCrop
  seam?: SeamStampInfo
  renderDataUrl?: string
}

export interface PlacementImageCrop {
  xRatio: number
  yRatio: number
  widthRatio: number
  heightRatio: number
}

export interface SeamStampInfo {
  groupId: string
  index: number
  count: number
  edge: 'left' | 'right'
  reversed: boolean
}

export interface TemplatePlacement {
  assetId: string
  assetName: string
  assetKind: AssetKind
  pageIndex: number
  xRatio: number
  yRatio: number
  widthMm: number
  heightMm: number
  rotation: number
  opacity: number
  imageCrop?: PlacementImageCrop
  seam?: SeamStampInfo
}

export interface StampTemplate {
  id: string
  name: string
  sourceFileName: string
  sourcePageCount: number
  placements: TemplatePlacement[]
  createdAt: number
  updatedAt: number
}

export interface PageSize {
  widthPt: number
  heightPt: number
}

export interface TargetRect {
  xPt: number
  yPt: number
  widthPt: number
  heightPt: number
}

export type TargetResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface LoadedPdf {
  fileName: string
  bytes: ArrayBuffer
  document: PDFDocumentProxy
}

export interface SavedReferenceSize {
  widthMm: number
  heightMm: number
  sourceFileName: string
  capturedAt: number
}

export interface ReferenceSizePreference {
  size: SavedReferenceSize | null
  enabled: boolean
}

export type EditorTool = 'select' | 'hand' | 'target'
