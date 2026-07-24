export interface ProcessedImage {
  dataUrl: string
  pixelWidth: number
  pixelHeight: number
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片无法读取，请换一张 PNG、JPG 或 WebP 图片。'))
    image.src = src
  })

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('读取图片失败。'))
    reader.readAsDataURL(file)
  })

export const processSignatureImage = async (
  file: File,
  options: { removeWhite: boolean; trim: boolean } = { removeWhite: true, trim: true },
): Promise<ProcessedImage> => {
  const source = await readFileAsDataUrl(file)
  const image = await loadImage(source)

  const maxDimension = 2400
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('无法处理图片。')
  context.drawImage(image, 0, 0, width, height)

  const imageData = context.getImageData(0, 0, width, height)
  const pixels = imageData.data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const red = pixels[offset]
      const green = pixels[offset + 1]
      const blue = pixels[offset + 2]
      const originalAlpha = pixels[offset + 3]

      if (options.removeWhite) {
        const colorDistanceFromWhite = 255 - Math.min(red, green, blue)
        const newAlpha = Math.round((originalAlpha * colorDistanceFromWhite) / 255)
        pixels[offset + 3] = newAlpha < 8 ? 0 : newAlpha
      }

      if (pixels[offset + 3] > 16) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }

  context.putImageData(imageData, 0, 0)
  if (maxX < minX || maxY < minY) throw new Error('没有识别到签名或印章内容，请关闭“自动去白底”后重试。')

  if (!options.trim) {
    return { dataUrl: canvas.toDataURL('image/png'), pixelWidth: width, pixelHeight: height }
  }

  const contentWidth = maxX - minX + 1
  const contentHeight = maxY - minY + 1
  const padding = Math.max(3, Math.round(Math.max(contentWidth, contentHeight) * 0.025))
  const cropX = Math.max(0, minX - padding)
  const cropY = Math.max(0, minY - padding)
  const cropWidth = Math.min(width - cropX, contentWidth + padding * 2)
  const cropHeight = Math.min(height - cropY, contentHeight + padding * 2)

  const cropped = document.createElement('canvas')
  cropped.width = cropWidth
  cropped.height = cropHeight
  const croppedContext = cropped.getContext('2d')
  if (!croppedContext) throw new Error('无法裁剪图片。')
  croppedContext.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

  return {
    dataUrl: cropped.toDataURL('image/png'),
    pixelWidth: cropWidth,
    pixelHeight: cropHeight,
  }
}
