import { beforeEach, describe, expect, it } from 'vitest'
import type { StampCategory } from './types'
import { loadSavedCategories, saveCategories } from './categoryStorage'

const values = new Map<string, string>()

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  },
})

describe('stamp category storage', () => {
  beforeEach(() => values.clear())

  it('persists locally created categories', () => {
    const categories: StampCategory[] = [
      { id: 'company', name: '公司印章', createdAt: 1 },
      { id: 'signature', name: '个人签名', createdAt: 2 },
    ]

    expect(saveCategories(categories)).toBe(true)
    expect(loadSavedCategories()).toEqual(categories)
  })

  it('repairs names and rejects invalid or duplicate categories', () => {
    values.set('stamp-focus-categories-v1', JSON.stringify([
      { id: ' company ', name: ' 公司印章 ', createdAt: 1 },
      { id: 'company', name: '重复编号', createdAt: 2 },
      { id: 'other', name: '公司印章', createdAt: 3 },
      { id: '', name: '无编号', createdAt: 4 },
      null,
    ]))

    expect(loadSavedCategories()).toEqual([
      { id: 'company', name: '公司印章', createdAt: 1 },
    ])
  })
})
