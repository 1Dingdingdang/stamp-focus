import type { StampCategory } from './types'

const STORAGE_KEY = 'stamp-focus-categories-v1'

export const loadSavedCategories = (): StampCategory[] => {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return []
    const parsed = JSON.parse(value) as StampCategory[]
    if (!Array.isArray(parsed)) return []

    const ids = new Set<string>()
    const names = new Set<string>()
    return parsed.flatMap((category) => {
      const id = typeof category?.id === 'string' ? category.id.trim() : ''
      const name = typeof category?.name === 'string' ? category.name.trim() : ''
      const normalizedName = name.toLocaleLowerCase()
      if (!id || !name || ids.has(id) || names.has(normalizedName)) return []

      ids.add(id)
      names.add(normalizedName)
      return [{
        id,
        name,
        createdAt:
          typeof category.createdAt === 'number' && Number.isFinite(category.createdAt)
            ? category.createdAt
            : Date.now(),
      }]
    })
  } catch {
    return []
  }
}

export const saveCategories = (categories: StampCategory[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories))
    return true
  } catch {
    return false
  }
}
