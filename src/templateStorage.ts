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
  isFiniteNumber(placement.opacity)

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
    })
  })

  return {
    placements,
    missingAssets: [...missingAssets],
    missingPages: [...missingPages].sort((a, b) => a - b),
  }
}
