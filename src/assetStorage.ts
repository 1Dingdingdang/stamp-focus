import type { StampAsset } from './types'

const STORAGE_KEY = 'stamp-focus-assets-v1'

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

export const loadSavedAssets = (): StampAsset[] => {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return []
    const parsed = JSON.parse(value) as StampAsset[]
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap((asset) => {
      if (
        !asset ||
        typeof asset.id !== 'string' ||
        !asset.id ||
        typeof asset.dataUrl !== 'string' ||
        !asset.dataUrl ||
        !isPositiveNumber(asset.widthMm) ||
        !isPositiveNumber(asset.pixelWidth) ||
        !isPositiveNumber(asset.pixelHeight)
      ) {
        return []
      }

      const heightMm = isPositiveNumber(asset.heightMm)
        ? asset.heightMm
        : asset.widthMm / (asset.pixelWidth / asset.pixelHeight)

      return [{ ...asset, heightMm }]
    })
  } catch {
    return []
  }
}

export const updateAssetDefaultSize = (
  assets: StampAsset[],
  assetId: string,
  widthMm: number,
  heightMm: number,
) => {
  if (!assetId || !isPositiveNumber(widthMm) || !isPositiveNumber(heightMm)) return assets

  let changed = false
  const nextAssets = assets.map((asset) => {
    if (asset.id !== assetId) return asset
    if (asset.widthMm === widthMm && asset.heightMm === heightMm) return asset
    changed = true
    return { ...asset, widthMm, heightMm }
  })

  return changed ? nextAssets : assets
}

export const saveAssets = (assets: StampAsset[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets))
    return true
  } catch {
    return false
  }
}
