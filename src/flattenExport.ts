import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { FlattenedPdfPage } from './pdfExport'
import type { Placement, StampAsset } from './types'

const FLATTEN_SCALE = 2.5
const JPEG_QUALITY = 0.95

const loadImage = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('签章图片无法载入'))
    image.src = dataUrl
  })

const canvasToJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('签章页面无法生成'))
          return
        }
        resolve(new Uint8Array(await blob.arrayBuffer()))
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })

export const renderFlattenedPages = async (
  pdfDocument: PDFDocumentProxy,
  placements: readonly Placement[],
  assets: readonly StampAsset[],
): Promise<FlattenedPdfPage[]> => {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]))
  const imageCache = new Map<string, Promise<HTMLImageElement>>()
  const pageIndexes = [
    ...new Set(
      placements
        .filter((placement) => assetMap.has(placement.assetId))
        .map((placement) => placement.pageIndex),
    ),
  ].sort((left, right) => left - right)
  const flattenedPages: FlattenedPdfPage[] = []

  for (const pageIndex of pageIndexes) {
    if (pageIndex < 0 || pageIndex >= pdfDocument.numPages) continue
    const page = await pdfDocument.getPage(pageIndex + 1)
    const baseViewport = page.getViewport({ scale: 1 })
    const renderViewport = page.getViewport({ scale: FLATTEN_SCALE })
    const canvas = window.document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(renderViewport.width))
    canvas.height = Math.max(1, Math.ceil(renderViewport.height))
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('无法创建页面画布')

    await page.render({
      canvas,
      canvasContext: context,
      viewport: renderViewport,
      background: '#ffffff',
    }).promise

    const scaleX = canvas.width / baseViewport.width
    const scaleY = canvas.height / baseViewport.height
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'

    for (const placement of placements) {
      if (placement.pageIndex !== pageIndex) continue
      const asset = assetMap.get(placement.assetId)
      if (!asset) continue
      let imagePromise = imageCache.get(asset.id)
      if (!imagePromise) {
        imagePromise = loadImage(asset.dataUrl)
        imageCache.set(asset.id, imagePromise)
      }
      const image = await imagePromise
      const centerX = (placement.xPt + placement.widthPt / 2) * scaleX
      const centerY = (placement.yPt + placement.heightPt / 2) * scaleY

      context.save()
      context.globalAlpha = placement.opacity
      context.translate(centerX, centerY)
      context.rotate((placement.rotation * Math.PI) / 180)
      context.drawImage(
        image,
        (-placement.widthPt * scaleX) / 2,
        (-placement.heightPt * scaleY) / 2,
        placement.widthPt * scaleX,
        placement.heightPt * scaleY,
      )
      context.restore()
    }

    const imageBytes = await canvasToJpeg(canvas)
    flattenedPages.push({
      pageIndex,
      widthPt: baseViewport.width,
      heightPt: baseViewport.height,
      imageBytes,
      imageFormat: 'jpeg',
    })
    canvas.width = 1
    canvas.height = 1
  }

  return flattenedPages
}
