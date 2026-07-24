import type { ReferenceSizePreference } from './types'

const STORAGE_KEY = 'stamp-focus-reference-size-v1'

const emptyPreference = (): ReferenceSizePreference => ({ size: null, enabled: false })

export const loadReferenceSizePreference = (): ReferenceSizePreference => {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return emptyPreference()
    const parsed = JSON.parse(value) as ReferenceSizePreference
    const size = parsed?.size
    if (
      !size ||
      !Number.isFinite(size.widthMm) ||
      !Number.isFinite(size.heightMm) ||
      size.widthMm <= 0 ||
      size.heightMm <= 0
    ) {
      return emptyPreference()
    }
    return {
      size: {
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        sourceFileName: typeof size.sourceFileName === 'string' ? size.sourceFileName : '',
        capturedAt: Number.isFinite(size.capturedAt) ? size.capturedAt : Date.now(),
      },
      enabled: parsed.enabled !== false,
    }
  } catch {
    return emptyPreference()
  }
}

export const saveReferenceSizePreference = (preference: ReferenceSizePreference) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preference))
    return true
  } catch {
    return false
  }
}
