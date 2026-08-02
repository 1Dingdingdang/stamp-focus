import type {
  PageSize,
  Placement,
  StampAsset,
  StampTemplate,
  TemplatePlacement,
} from './types'
import { createId, mmToPt, ptToMm } from './utils'

const STORAGE_KEY = 'stamp-focus-templates-v1'

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isPositiveNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value > 0

const isValidImageCrop = (crop: TemplatePlacement['imageCrop']) =>
  crop === undefined || (
    isFiniteNumber(crop.xRatio) &&
    isFiniteNumber(crop.yRatio) &&
    isPositiveNumber(crop.widthRatio) &&
    isPositiveNumber(crop.heightRatio) &&
    crop.xRatio >= 0 &&
    crop.yRatio >= 0 &&
    crop.xRatio + crop.widthRatio <= 1.000001 &&
    crop.yRatio + crop.heightRatio <= 1.000001
  )

const isValidSeamInfo = (seam: TemplatePlacement['seam']) =>
  seam === undefined || (
    typeof seam.groupId === 'string' &&
    seam.groupId.length > 0 &&
    Number.isInteger(seam.index) &&
    seam.index >= 0 &&
    Number.isInteger(seam.count) &&
    seam.count >= 2 &&
    seam.index < seam.count &&
    (seam.edge === 'left' || seam.edge === 'right') &&
    typeof seam.reversed === 'boolean'
  )

const isValidTemplatePlacement = (placement: TemplatePlacement) =>
  placement &&
  typeof placement.assetId === 'string' &&
  typeof placement.assetName === 'string' &&
  (placement.assetKind === 'signature' || placement.assetKind === 'stamp') &&
  Number.isInteger(placement.pageIndex) &&
  placement.pageIndex >= 0 &&
  isFiniteNumber(placement.xRatio) &&
  isFiniteNumber(placement.yRatio) &&
  isPositiveNumber(placement.widthMm) &&
  isPositiveNumber(placement.heightMm) &&
  isFiniteNumber(placement.rotation) &&
  isFiniteNumber(placement.opacity) &&
  isValidImageCrop(placement.imageCrop) &&
  isValidSeamInfo(placement.seam)

export const loadSavedTemplates = (): StampTemplate[] => {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return []
    const parsed = JSON.parse(value) as StampTemplate[]
    if (!Array.isArray(parsed)) return []

    return parsed.filter(
      (template) =>
        template &&
        typeof template.id === 'string' &&
        template.id &&
        typeof template.name === 'string' &&
        template.name.trim() &&
        Number.isInteger(template.sourcePageCount) &&
        template.sourcePageCount > 0 &&
        Array.isArray(template.placements) &&
        template.placements.length > 0 &&
        template.placements.every(isValidTemplatePlacement),
    )
  } catch {
    return []
  }
}

export const saveTemplates = (templates: StampTemplate[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
    return true
  } catch {
    return false
  }
}

export const createStampTemplate = ({
  id,
  name,
  sourceFileName,
  sourcePageCount,
  placements,
  assets,
  pageSizes,
  createdAt = Date.now(),
  updatedAt = Date.now(),
}: {
  id: string
  name: string
  sourceFileName: string
  sourcePageCount: number
  placements: Placement[]
  assets: StampAsset[]
  pageSizes: Map<number, PageSize>
  createdAt?: number
  updatedAt?: number
}): StampTemplate | null => {
  const templatePlacements = placements.flatMap<TemplatePlacement>((placement) => {
    const asset = assets.find((item) => item.id === placement.assetId)
    const pageSize = pageSizes.get(placement.pageIndex)
    if (!asset || !pageSize || pageSize.widthPt <= 0 || pageSize.heightPt <= 0) return []

    return [{
      assetId: asset.id,
      assetName: asset.name,
      assetKind: asset.kind,
      pageIndex: placement.pageIndex,
      xRatio: placement.xPt / pageSize.widthPt,
      yRatio: placement.yPt / pageSize.heightPt,
      widthMm: ptToMm(placement.widthPt),
      heightMm: ptToMm(placement.heightPt),
      rotation: placement.rotation,
      opacity: placement.opacity,
      imageCrop: placement.imageCrop ? { ...placement.imageCrop } : undefined,
      seam: placement.seam ? { ...placement.seam } : undefined,
    }]
  })

  if (!id || !name.trim() || sourcePageCount <= 0 || templatePlacements.length === 0) return null

  return {
    id,
    name: name.trim(),
    sourceFileName,
    sourcePageCount,
    placements: templatePlacements,
    createdAt,
    updatedAt,
  }
}

export interface TemplateApplyResult {
  placements: Placement[]
  missingAssets: string[]
  missingPages: number[]
}

export const instantiateStampTemplate = (
  template: StampTemplate,
  assets: StampAsset[],
  pageSizes: Map<number, PageSize>,
): TemplateApplyResult => {
  const missingAssets = new Set<string>()
  const missingPages = new Set<number>()
  const placements: Placement[] = []

  template.placements.forEach((saved) => {
    const asset =
      assets.find((item) => item.id === saved.assetId) ??
      assets.find((item) => item.name === saved.assetName && item.kind === saved.assetKind)
    if (!asset) {
      missingAssets.add(saved.assetName)
      return
    }

    const pageSize = pageSizes.get(saved.pageIndex)
    if (!pageSize) {
      missingPages.add(saved.pageIndex + 1)
      return
    }

    const widthPt = mmToPt(saved.widthMm)
    const heightPt = mmToPt(saved.heightMm)
    const desiredX = saved.xRatio * pageSize.widthPt
    const desiredY = saved.yRatio * pageSize.heightPt

    placements.push({
      id: createId(),
      assetId: asset.id,
      pageIndex: saved.pageIndex,
      xPt: Math.min(Math.max(0, desiredX), Math.max(0, pageSize.widthPt - widthPt)),
      yPt: Math.min(Math.max(0, desiredY), Math.max(0, pageSize.heightPt - heightPt)),
      widthPt,
      heightPt,
      rotation: saved.rotation,
      opacity: Math.min(1, Math.max(0.1, saved.opacity)),
      imageCrop: saved.imageCrop ? { ...saved.imageCrop } : undefined,
      seam: saved.seam ? { ...saved.seam } : undefined,
    })
  })

  return {
    placements,
    missingAssets: [...missingAssets],
    missingPages: [...missingPages].sort((a, b) => a - b),
  }
}
