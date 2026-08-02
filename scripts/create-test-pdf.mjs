import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { mkdir, writeFile } from 'node:fs/promises'

const pdf = await PDFDocument.create()
const font = await pdf.embedFont(StandardFonts.Helvetica)
const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

for (let pageNumber = 1; pageNumber <= 5; pageNumber += 1) {
  const page = pdf.addPage([595.28, 841.89])
  page.drawText('STAMP FOCUS — PHYSICAL SIZE TEST', { x: 54, y: 775, size: 17, font: bold, color: rgb(0.15, 0.16, 0.14) })
  page.drawText('This fixture contains a 50 × 20 mm target box.', { x: 54, y: 744, size: 10, font, color: rgb(0.38, 0.39, 0.35) })
  page.drawRectangle({ x: 54, y: 620, width: (50 / 25.4) * 72, height: (20 / 25.4) * 72, borderWidth: 1, borderColor: rgb(0.76, 0.28, 0.18), color: rgb(0.98, 0.94, 0.91), opacity: 0.5 })
  page.drawText('50 mm', { x: 54, y: 604, size: 8, font, color: rgb(0.67, 0.24, 0.16) })
  page.drawLine({ start: { x: 54, y: 420 }, end: { x: 541, y: 420 }, thickness: 0.7, color: rgb(0.75, 0.74, 0.69) })
  page.drawText('Signature', { x: 54, y: 394, size: 10, font: bold, color: rgb(0.25, 0.26, 0.23) })
  page.drawRectangle({ x: 160, y: 362, width: 190, height: 55, borderWidth: 0.8, borderColor: rgb(0.65, 0.64, 0.59) })
  page.drawText('Place signature here', { x: 196, y: 384, size: 9, font, color: rgb(0.6, 0.59, 0.54) })
  page.drawText(`Page ${pageNumber}`, { x: 280, y: 35, size: 8, font, color: rgb(0.6, 0.6, 0.56) })
}

await mkdir(new URL('../fixtures/', import.meta.url), { recursive: true })
await writeFile(new URL('../fixtures/size-test.pdf', import.meta.url), await pdf.save())
