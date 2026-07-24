import { degrees, PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { exportFlattenedPdf, exportStampedPdf, mapPlacementToPdf } from './pdfExport'
import type { PdfViewportTransform } from './pdfExport'
import type { Placement, StampAsset } from './types'
import { dataUrlToUint8Array, mmToPt } from './utils'

const onePixelPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('PDF export', () => {
  it('maps a placement through a normal PDF.js viewport', () => {
    const placement: Placement = {
      id: 'normal-placement',
      assetId: 'asset-1',
      pageIndex: 0,
      xPt: 70,
      yPt: 90,
      widthPt: 120,
      heightPt: 60,
      rotation: 0,
      opacity: 1,
    }
    const viewport: PdfViewportTransform = [1, 0, 0, -1, 0, 842]

    expect(mapPlacementToPdf(placement, viewport)).toEqual({
      x: 70,
      y: 692,
      width: 120,
      height: 60,
      rotation: 0,
    })
  })

  it('maps a placement through a 270-degree PDF.js viewport', () => {
    const placement: Placement = {
      id: 'rotated-placement',
      assetId: 'asset-1',
      pageIndex: 0,
      xPt: 100,
      yPt: 50,
      widthPt: 80,
      heightPt: 40,
      rotation: 0,
      opacity: 1,
    }
    const viewport: PdfViewportTransform = [0, -1, -1, 0, 842, 595]

    const mapped = mapPlacementToPdf(placement, viewport)
    expect(mapped.x).toBeCloseTo(505)
    expect(mapped.y).toBeCloseTo(742)
    expect(mapped.width).toBeCloseTo(80)
    expect(mapped.height).toBeCloseTo(40)
    expect(mapped.rotation).toBeCloseTo(-90)
  })

  it('writes a physical-size PNG placement into a readable PDF', async () => {
    const source = await PDFDocument.create()
    source.addPage([595.28, 841.89])
    const sourceBytes = await source.save()
    const asset: StampAsset = {
      id: 'asset-1',
      name: '40 mm test stamp',
      kind: 'stamp',
      dataUrl: onePixelPng,
      pixelWidth: 1,
      pixelHeight: 1,
      widthMm: 40,
      heightMm: 40,
      createdAt: 1,
    }
    const placement: Placement = {
      id: 'placement-1',
      assetId: asset.id,
      pageIndex: 0,
      xPt: mmToPt(25),
      yPt: mmToPt(30),
      widthPt: mmToPt(40),
      heightPt: mmToPt(40),
      rotation: 7,
      opacity: 0.86,
    }

    const output = await exportStampedPdf(sourceBytes.buffer as ArrayBuffer, [placement], [asset])
    const reopened = await PDFDocument.load(output)

    expect(reopened.getPageCount()).toBe(1)
    expect(reopened.getPage(0).node.Contents()).toBeDefined()
    expect(output.byteLength).toBeGreaterThan(sourceBytes.byteLength)
  })

  it('replaces only a signed page with a flattened image page', async () => {
    const source = await PDFDocument.create()
    const signedPage = source.addPage([300, 400])
    signedPage.setRotation(degrees(270))
    source.addPage([240, 500])
    const sourceBytes = await source.save()

    const output = await exportFlattenedPdf(sourceBytes.buffer as ArrayBuffer, [
      {
        pageIndex: 0,
        widthPt: 400,
        heightPt: 300,
        imageBytes: dataUrlToUint8Array(onePixelPng),
        imageFormat: 'png',
      },
    ])
    const reopened = await PDFDocument.load(output)

    expect(reopened.getPageCount()).toBe(2)
    expect(reopened.getPage(0).getSize()).toEqual({ width: 400, height: 300 })
    expect(reopened.getPage(0).getRotation().angle).toBe(0)
    expect(reopened.getPage(0).node.Contents()).toBeDefined()
    expect(reopened.getPage(1).getSize()).toEqual({ width: 240, height: 500 })
  })
})
