import type { PageSize, Placement } from './types'
import { createId, mmToPt } from './utils'

export interface PageSelectionResult {
  pageIndices: number[]
  invalidTokens: string[]
}

const addPage = (pages: Set<number>, pageNumber: number, pageCount: number) => {
  if (pageNumber < 1 || pageNumber > pageCount) return false
  pages.add(pageNumber - 1)
  return true
}

export const parsePageSelection = (input: string, pageCount: number): PageSelectionResult => {
  if (!Number.isInteger(pageCount) || pageCount <= 0) return { pageIndices: [], invalidTokens: [] }

  const normalized = input
    .trim()
    .replace(/\s*(?:-|–|—|~|～|至)\s*/g, '-')
  if (!normalized) return { pageIndices: [], invalidTokens: [] }

  const pages = new Set<number>()
  const invalidTokens: string[] = []
  const tokens = normalized.split(/[,，、;；\s]+/).filter(Boolean)

  tokens.forEach((token) => {
    if (token === '全部' || token === '全部页') {
      for (let page = 1; page <= pageCount; page += 1) pages.add(page - 1)
      return
    }
    if (token === '奇数' || token === '奇数页') {
      for (let page = 1; page <= pageCount; page += 2) pages.add(page - 1)
      return
    }
    if (token === '偶数' || token === '偶数页') {
      for (let page = 2; page <= pageCount; page += 2) pages.add(page - 1)
      return
    }

    const singlePage = /^(\d+)$/.exec(token)
    if (singlePage) {
      if (!addPage(pages, Number(singlePage[1]), pageCount)) invalidTokens.push(token)
      return
    }

    const range = /^(\d+)-(\d+)$/.exec(token)
    if (!range) {
      invalidTokens.push(token)
      return
    }
    const start = Number(range[1])
    const end = Number(range[2])
    if (start < 1 || end > pageCount || start > end) {
      invalidTokens.push(token)
      return
    }
    for (let page = start; page <= end; page += 1) pages.add(page - 1)
  })

  return {
    pageIndices: [...pages].sort((left, right) => left - right),
    invalidTokens,
  }
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

export const projectPlacementToPage = (
  source: Placement,
  sourcePageSize: PageSize,
  targetPageSize: PageSize,
  targetPageIndex: number,
): Placement => {
  const sourceTravelX = Math.max(0, sourcePageSize.widthPt - source.widthPt)
  const sourceTravelY = Math.max(0, sourcePageSize.heightPt - source.heightPt)
  const xRatio = sourceTravelX > 0 ? clamp(source.xPt / sourceTravelX, 0, 1) : 0.5
  const yRatio = sourceTravelY > 0 ? clamp(source.yPt / sourceTravelY, 0, 1) : 0.5
  const targetTravelX = Math.max(0, targetPageSize.widthPt - source.widthPt)
  const targetTravelY = Math.max(0, targetPageSize.heightPt - source.heightPt)

  return {
    ...source,
    id: createId(),
    pageIndex: targetPageIndex,
    xPt: targetTravelX * xRatio,
    yPt: targetTravelY * yRatio,
  }
}

export const isRepeatedPlacementDuplicate = (
  candidate: Placement,
  existing: Placement[],
  tolerancePt = mmToPt(1),
) => existing.some((placement) =>
  placement.assetId === candidate.assetId &&
  placement.pageIndex === candidate.pageIndex &&
  Math.abs(placement.xPt - candidate.xPt) <= tolerancePt &&
  Math.abs(placement.yPt - candidate.yPt) <= tolerancePt &&
  Math.abs(placement.widthPt - candidate.widthPt) <= tolerancePt &&
  Math.abs(placement.heightPt - candidate.heightPt) <= tolerancePt,
)
