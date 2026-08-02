import type { PageSize, Placement, PlacementImageCrop, StampAsset } from './types'
import { createId } from './utils'

export type SeamStampEdge = 'left' | 'right'

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

const validCrop = (crop: PlacementImageCrop) =>
  crop.xRatio >= 0 &&
  crop.yRatio >= 0 &&
  crop.widthRatio > 0 &&
  crop.heightRatio > 0 &&
  crop.xRatio + crop.widthRatio <= 1.000001 &&
  crop.yRatio + crop.heightRatio <= 1.000001

export const createSeamStampPlacements = ({
  source,
  sourcePageSize,
  targetPageIndices,
  pageSizes,
  edge,
  reversed,
  groupId = createId(),
}: {
  source: Placement
  sourcePageSize: PageSize
  targetPageIndices: number[]
  pageSizes: Map<number, PageSize>
  edge: SeamStampEdge
  reversed: boolean
  groupId?: string
}): Placement[] => {
  const pages = [...new Set(targetPageIndices)]
    .filter((pageIndex) => Number.isInteger(pageIndex) && pageSizes.has(pageIndex))
    .sort((left, right) => left - right)
  if (pages.length < 2 || sourcePageSize.heightPt <= 0 || source.widthPt <= 0 || source.heightPt <= 0) return []

  const count = pages.length
  const sliceWidthPt = source.widthPt / count
  const sliceWidthRatio = 1 / count
  const sourceCenterYRatio = clamp(
    (source.yPt + source.heightPt / 2) / sourcePageSize.heightPt,
    0,
    1,
  )

  return pages.flatMap<Placement>((targetPageIndex, pageOrder) => {
    const pageSize = pageSizes.get(targetPageIndex)
    if (!pageSize) return []
    const imageIndex = reversed ? count - pageOrder - 1 : pageOrder
    const imageCrop: PlacementImageCrop = {
      xRatio: imageIndex / count,
      yRatio: 0,
      widthRatio: sliceWidthRatio,
      heightRatio: 1,
    }
    if (!validCrop(imageCrop)) return []

    return [{
      id: createId(),
      assetId: source.assetId,
      pageIndex: targetPageIndex,
      xPt: edge === 'right' ? Math.max(0, pageSize.widthPt - sliceWidthPt) : 0,
      yPt: clamp(
        pageSize.heightPt * sourceCenterYRatio - source.heightPt / 2,
        0,
        Math.max(0, pageSize.heightPt - source.heightPt),
      ),
      widthPt: sliceWidthPt,
      heightPt: source.heightPt,
      rotation: 0,
      opacity: source.opacity,
      imageCrop,
      seam: {
        groupId,
        index: pageOrder,
        count,
        edge,
        reversed,
      },
    }]
  })
}

const loadImage = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('骑缝章图片无法载入'))
    image.src = dataUrl
  })

const cropImage = async (image: HTMLImageElement, crop: PlacementImageCrop) => {
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sourceWidth * crop.widthRatio))
  canvas.height = Math.max(1, Math.round(sourceHeight * crop.heightRatio))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法生成骑缝章切片')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    sourceWidth * crop.xRatio,
    sourceHeight * crop.yRatio,
    sourceWidth * crop.widthRatio,
    sourceHeight * crop.heightRatio,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvas.toDataURL('image/png')
}

export const materializeCroppedPlacements = async (
  placements: readonly Placement[],
  assets: readonly StampAsset[],
) => {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]))
  const imageCache = new Map<string, Promise<HTMLImageElement>>()
  const cropCache = new Map<string, Promise<string>>()

  return Promise.all(placements.map(async (placement) => {
    if (!placement.imageCrop) return placement
    const asset = assetMap.get(placement.assetId)
    if (!asset) return placement
    const cropKey = `${asset.id}:${placement.imageCrop.xRatio}:${placement.imageCrop.yRatio}:${placement.imageCrop.widthRatio}:${placement.imageCrop.heightRatio}`
    let cropped = cropCache.get(cropKey)
    if (!cropped) {
      let image = imageCache.get(asset.id)
      if (!image) {
        image = loadImage(asset.dataUrl)
        imageCache.set(asset.id, image)
      }
      cropped = image.then((loaded) => cropImage(loaded, placement.imageCrop!))
      cropCache.set(cropKey, cropped)
    }
    return { ...placement, renderDataUrl: await cropped }
  }))
}
