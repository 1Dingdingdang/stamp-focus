/// <reference types="vite/client" />

interface Window {
  stampFocus?: {
    savePdf: (
      bytes: Uint8Array,
      suggestedName: string,
    ) => Promise<{ canceled: boolean; filePath?: string }>
  }
}
