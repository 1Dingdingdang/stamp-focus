import { degrees, PDFDocument } from 'pdf-lib'
import type { Placement, StampAsset } from './types'
import { dataUrlToUint8Array } from './utils'

export type PdfViewportTransform = readonly [number, number, number, number, number, number]

interface PdfPoint {
  x: number
  y: number
}

export interface PdfDrawPlacement {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface FlattenedPdfPage {
  pageIndex: number
  widthPt: number
  heightPt: number
  imageBytes: Uint8Array
  imageFormat: 'jpeg' | 'png'
}

const displayPointToPdf = (
  transform: PdfViewportTransform,
  x: number,
  y: number,
): PdfPoint => {
  const [a, b, c, d, e, f] = transform
  const determinant = a * d - b * c
  if (Math.abs(determinant) < Number.EPSILON) {
    throw new Error('Invalid PDF page viewport transform')
  }

  const translatedX = x - e
  const translatedY = y - f
  return {
    x: (d * translatedX - c * translatedY) / determinant,
    y: (-b * translatedX + a * translatedY) / determinant,
  }
}

export const mapPlacementToPdf = (
  placement: Placement,
  transform: PdfViewportTransform,
): PdfDrawPlacement => {
  const radians = (placement.rotation * Math.PI) / 180
  const centerX = placement.xPt + placement.widthPt / 2
  const centerY = placement.yPt + placement.heightPt / 2
  const center = displayPointToPdf(transform, centerX, centerY)
  const right = displayPointToPdf(
    transform,
    centerX + Math.cos(radians) * (placement.widthPt / 2),
    centerY + Math.sin(radians) * (placement.widthPt / 2),
  )
  const up = displayPointToPdf(
    transform,
    centerX + Math.sin(radians) * (placement.heightPt / 2),
    centerY - Math.cos(radians) * (placement.heightPt / 2),
  )
  const rightHalf = { x: right.x - center.x, y: right.y - center.y }
  const upHalf = { x: up.x - center.x, y: up.y - center.y }

  return {
    x: center.x - rightHalf.x - upHalf.x,
    y: center.y - rightHalf.y - upHalf.y,
    width: Math.hypot(rightHalf.x, rightHalf.y) * 2,
    height: Math.hypot(upHalf.x, upHalf.y) * 2,
    rotation: (Math.atan2(rightHalf.y, rightHalf.x) * 180) / Math.PI,
  }
}

export const exportStampedPdf = async (
  sourceBytes: ArrayBuffer,
  placements: Placement[],
  assets: StampAsset[],
  pageTransforms: readonly PdfViewportTransform[] = [],
) => {
  const pdf = await PDFDocument.load(sourceBytes.slice(0))
  const pages = pdf.getPages()
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]))
  const embedded = new Map<string, Awaited<ReturnType<PDFDocument['embedPng']>>>()

  for (const placement of placements) {
    const page = pages[placement.pageIndex]
    const asset = assetMap.get(placement.assetId)
    if (!page || !asset) continue

    let image = embedded.get(asset.id)
    if (!image) {
      image = await pdf.embedPng(dataUrlToUint8Array(asset.dataUrl))
      embedded.set(asset.id, image)
    }

    const { height: pageHeight } = page.getSize()
    const transform = pageTransforms[placement.pageIndex] ?? [1, 0, 0, -1, 0, pageHeight]
    const drawPlacement = mapPlacementToPdf(placement, transform)

    page.drawImage(image, {
      x: drawPlacement.x,
      y: drawPlacement.y,
      width: drawPlacement.width,
      height: drawPlacement.height,
      rotate: degrees(drawPlacement.rotation),
      opacity: placement.opacity,
    })
  }

  return pdf.save()
}

export const exportFlattenedPdf = async (
  sourceBytes: ArrayBuffer,
  flattenedPages: readonly FlattenedPdfPage[],
) => {
  const pdf = await PDFDocument.load(sourceBytes.slice(0))
  const pageCount = pdf.getPageCount()
  const pagesByIndex = new Map(
    flattenedPages
      .filter(
        (page) =>
          page.pageIndex >= 0 &&
          page.pageIndex < pageCount &&
          Number.isFinite(page.widthPt) &&
          Number.isFinite(page.heightPt) &&
          page.widthPt > 0 &&
          page.heightPt > 0,
      )
      .map((page) => [page.pageIndex, page]),
  )

  for (const pageIndex of [...pagesByIndex.keys()].sort((left, right) => left - right)) {
    const flattenedPage = pagesByIndex.get(pageIndex)
    if (!flattenedPage) continue
    const image =
      flattenedPage.imageFormat === 'jpeg'
        ? await pdf.embedJpg(flattenedPage.imageBytes)
        : await pdf.embedPng(flattenedPage.imageBytes)

    pdf.removePage(pageIndex)
    const page = pdf.insertPage(pageIndex, [flattenedPage.widthPt, flattenedPage.heightPt])
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: flattenedPage.widthPt,
      height: flattenedPage.heightPt,
    })
  }

  return pdf.save()
}
