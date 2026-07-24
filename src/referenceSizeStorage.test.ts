import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadReferenceSizePreference,
  saveReferenceSizePreference,
} from './referenceSizeStorage'

const values = new Map<string, string>()

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  },
})

describe('reference size storage', () => {
  beforeEach(() => values.clear())

  it('persists a measured PDF frame and its enabled state', () => {
    const preference = {
      size: {
        widthMm: 40,
        heightMm: 40,
        sourceFileName: 'reference.pdf',
        capturedAt: 123,
      },
      enabled: true,
    }

    expect(saveReferenceSizePreference(preference)).toBe(true)
    expect(loadReferenceSizePreference()).toEqual(preference)
  })

  it('rejects invalid saved dimensions', () => {
    values.set(
      'stamp-focus-reference-size-v1',
      JSON.stringify({ size: { widthMm: 0, heightMm: 40 }, enabled: true }),
    )

    expect(loadReferenceSizePreference()).toEqual({ size: null, enabled: false })
  })
})
