import type { PDFDocumentProxy } from 'pdfjs-dist'

export type AssetKind = 'signature' | 'stamp'

export interface StampAsset {
  id: string
  name: string
  kind: AssetKind
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
