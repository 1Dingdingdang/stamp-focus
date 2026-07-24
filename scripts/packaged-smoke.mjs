const endpoint = process.argv[2] ?? 'http://127.0.0.1:9222'
const pdfPath = process.argv[3]
if (!pdfPath) throw new Error('Usage: node scripts/packaged-smoke.mjs <debug-url> <pdf-path>')

const pages = await fetch(`${endpoint}/json/list`).then((response) => response.json())
const page = pages.find((entry) => entry.type === 'page')
if (!page?.webSocketDebuggerUrl) throw new Error('No packaged app page found')

const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let messageId = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  const waiter = pending.get(message.id)
  if (!waiter) return
  pending.delete(message.id)
  if (message.error) waiter.reject(new Error(message.error.message))
  else waiter.resolve(message.result)
})

const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++messageId
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })

await call('DOM.enable')
const documentResult = await call('DOM.getDocument', { depth: 2 })
const inputResult = await call('DOM.querySelector', {
  nodeId: documentResult.root.nodeId,
  selector: 'input[type="file"][accept="application/pdf,.pdf"]',
})
if (!inputResult.nodeId) throw new Error('PDF input not found')
await call('DOM.setFileInputFiles', { nodeId: inputResult.nodeId, files: [pdfPath] })

const result = await call('Runtime.evaluate', {
  expression: `(async () => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (document.querySelector('.page-error')) {
        return { ok: false, error: document.querySelector('.page-error').innerText };
      }
      const canvas = document.querySelector('.pdf-stage canvas');
      if (canvas && !document.querySelector('.page-loading') && canvas.width > 0 && canvas.height > 0) {
        const context = canvas.getContext('2d');
        const secureExport = document.querySelector('[data-testid="secure-export-toggle"]');
        const referencePdfButton = document.querySelector('[data-testid="reference-pdf-button"]');
        const zoomInput = document.querySelector('[data-testid="zoom-input"]');
        const handToolButton = document.querySelector('[data-testid="hand-tool-button"]');
        const targetToolButton = document.querySelector('[data-testid="target-tool-button"]');
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let darkSamples = 0;
        const stride = Math.max(4, Math.floor(pixels.length / 12000 / 4) * 4);
        for (let index = 0; index < pixels.length; index += stride) {
          if (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245) darkSamples += 1;
        }
        const assetResult = await new Promise((resolve) => {
          const request = new XMLHttpRequest();
          request.open('GET', new URL('./pdfjs/wasm/openjpeg.wasm', location.href), true);
          request.responseType = 'arraybuffer';
          request.onload = () => resolve({ status: request.status, bytes: request.response?.byteLength ?? 0 });
          request.onerror = () => resolve({ status: -1, bytes: 0 });
          request.send();
        });
        return {
          ok:
            darkSamples > 0 &&
            assetResult.bytes > 0 &&
            secureExport?.checked === true &&
            Boolean(referencePdfButton) &&
            Boolean(zoomInput) &&
            Boolean(handToolButton) &&
            Boolean(targetToolButton),
          title: document.title,
          canvas: { width: canvas.width, height: canvas.height, darkSamples },
          secureExport: { present: Boolean(secureExport), checked: secureExport?.checked ?? false },
          referenceSizing: { buttonPresent: Boolean(referencePdfButton) },
          viewportControls: {
            zoomInputPresent: Boolean(zoomInput),
            handToolPresent: Boolean(handToolButton),
            editableTargetToolPresent: Boolean(targetToolButton),
          },
          decoderAsset: assetResult,
          pageIndicator: Array.from(document.querySelectorAll('.page-controls span')).map((item) => item.textContent),
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return {
      ok: false,
      error: 'Timed out waiting for PDF render',
      state: {
        documentName: document.querySelector('.document-name')?.innerText ?? '',
        pageLoading: document.querySelector('.page-loading')?.innerText ?? '',
        pageError: document.querySelector('.page-error')?.innerText ?? '',
        canvases: Array.from(document.querySelectorAll('.pdf-stage canvas')).map((canvas) => ({
          width: canvas.width,
          height: canvas.height,
        })),
      },
    };
  })()`,
  awaitPromise: true,
  returnByValue: true,
})

socket.close()
const value = result.result.value
console.log(JSON.stringify(value, null, 2))
if (!value?.ok) process.exitCode = 1
