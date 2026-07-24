import type { StampAsset } from './types'

const STORAGE_KEY = 'stamp-focus-assets-v1'

export const loadSavedAssets = (): StampAsset[] => {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return []
    const parsed = JSON.parse(value) as StampAsset[]
    return parsed.filter((asset) => asset.id && asset.dataUrl && asset.widthMm > 0)
  } catch {
    return []
  }
}

export const saveAssets = (assets: StampAsset[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets))
    return true
  } catch {
    return false
  }
}
