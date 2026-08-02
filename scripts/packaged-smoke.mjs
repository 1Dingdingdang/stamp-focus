const endpoint = process.argv[2] ?? 'http://127.0.0.1:9222'
const pdfPath = process.argv[3]
const seamStampPath = process.argv[4]
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
const runtimeEvents = []
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') {
    runtimeEvents.push({
      method: message.method,
      text: message.params?.exceptionDetails?.text,
      description: message.params?.exceptionDetails?.exception?.description,
    })
  } else if (message.method === 'Runtime.consoleAPICalled') {
    runtimeEvents.push({
      method: message.method,
      type: message.params?.type,
      values: message.params?.args?.map((argument) => argument.value ?? argument.description),
    })
  }
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

const evaluate = async (expression) => {
  const response = await call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  return response.result.value
}

const waitFor = async (expression, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

const findInputNode = async (selector) => {
  const documentResult = await call('DOM.getDocument', { depth: 2 })
  const inputResult = await call('DOM.querySelector', {
    nodeId: documentResult.root.nodeId,
    selector,
  })
  return inputResult.nodeId
}

await call('Runtime.enable')
await call('DOM.enable')
let pdfInputNodeId = 0
const inputDeadline = Date.now() + 10000
while (!pdfInputNodeId && Date.now() < inputDeadline) {
  const documentResult = await call('DOM.getDocument', { depth: 2 })
  const inputResult = await call('DOM.querySelector', {
    nodeId: documentResult.root.nodeId,
    selector: 'input[type="file"][accept="application/pdf,.pdf"]',
  })
  pdfInputNodeId = inputResult.nodeId
  if (!pdfInputNodeId) await new Promise((resolve) => setTimeout(resolve, 100))
}
if (!pdfInputNodeId) throw new Error('PDF input not found')
await call('DOM.setFileInputFiles', { nodeId: pdfInputNodeId, files: [pdfPath] })

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
        const saveTemplateButton = document.querySelector('[data-testid="save-template-button"]');
        const categoryAddButton = document.querySelector('[data-testid="category-add-button"]');
        const pageIndicator = Array.from(document.querySelectorAll('.page-controls span')).map((item) => item.textContent);
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
            Boolean(targetToolButton) &&
            Boolean(saveTemplateButton) &&
            Boolean(categoryAddButton) &&
            pageIndicator.some((text) => text?.includes('1 / 5')),
          title: document.title,
          canvas: { width: canvas.width, height: canvas.height, darkSamples },
          secureExport: { present: Boolean(secureExport), checked: secureExport?.checked ?? false },
          referenceSizing: { buttonPresent: Boolean(referencePdfButton) },
          viewportControls: {
            zoomInputPresent: Boolean(zoomInput),
            handToolPresent: Boolean(handToolButton),
            editableTargetToolPresent: Boolean(targetToolButton),
          },
          templates: { saveButtonPresent: Boolean(saveTemplateButton) },
          categories: { addButtonPresent: Boolean(categoryAddButton) },
          decoderAsset: assetResult,
          pageIndicator,
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

const value = result.result.value
let seamFeature
if (value?.ok && seamStampPath) {
  const imageInputNodeId = await findInputNode('input[type="file"][accept^="image/"]')
  if (!imageInputNodeId) {
    seamFeature = { ok: false, error: 'Stamp image input not found' }
  } else {
    await call('DOM.setFileInputFiles', { nodeId: imageInputNodeId, files: [seamStampPath] })
    const modalReady = await waitFor(`Boolean(document.querySelector('.asset-modal'))`)
    if (!modalReady) {
      seamFeature = { ok: false, error: 'Stamp calibration modal did not open' }
    } else {
      await evaluate(`(() => {
        const button = Array.from(document.querySelectorAll('.kind-picker button')).find((item) => item.textContent?.includes('印章'));
        button?.click();
        return Boolean(button);
      })()`)
      const saveReady = await waitFor(`Boolean(document.querySelector('.modal-submit:not(:disabled)'))`, 30000)
      if (!saveReady) {
        seamFeature = { ok: false, error: 'Stamp image processing did not finish' }
      } else {
        await evaluate(`document.querySelector('.modal-submit')?.click()`)
        const assetReady = await waitFor(`Boolean(document.querySelector('.asset-main'))`)
        if (!assetReady) {
          seamFeature = { ok: false, error: 'Saved stamp asset did not appear' }
        } else {
          await evaluate(`document.querySelector('.asset-main')?.click()`)
          const seamButtonReady = await waitFor(`Boolean(document.querySelector('[data-testid="seam-stamp-button"]'))`)
          if (!seamButtonReady) {
            seamFeature = { ok: false, error: 'Seam stamp action did not appear' }
          } else {
            await evaluate(`document.querySelector('[data-testid="seam-stamp-button"]')?.click()`)
            const seamModalReady = await waitFor(`Boolean(document.querySelector('.seam-stamp-modal'))`)
            if (!seamModalReady) {
              seamFeature = { ok: false, error: 'Seam stamp modal did not open' }
            } else {
              await evaluate(`document.querySelector('[data-testid="confirm-seam-stamp"]')?.click()`)
              const seamCreated = await waitFor(
                `!document.querySelector('.seam-stamp-modal') && Boolean(document.querySelector('.placement.is-locked'))`,
              )
              if (!seamCreated) {
                seamFeature = { ok: false, error: 'Seam stamp slices were not created' }
              } else {
                const slices = []
                for (let pageNumber = 1; pageNumber <= 5; pageNumber += 1) {
                  const slice = await evaluate(`(() => {
                    const placement = document.querySelector('.placement.is-locked');
                    const image = placement?.querySelector('.placement-image-crop img');
                    return {
                      page: document.querySelector('.page-controls span:last-of-type')?.textContent ?? '',
                      placementCount: document.querySelectorAll('.placement').length,
                      locked: Boolean(placement),
                      imageWidth: image?.style.width ?? '',
                      imageLeft: image?.style.left ?? '',
                      inspector: document.querySelector('.inspector-content')?.textContent ?? '',
                    };
                  })()`)
                  slices.push(slice)
                  if (pageNumber < 5) {
                    await evaluate(`document.querySelector('button[aria-label="下一页"]')?.click()`)
                    await waitFor(`Array.from(document.querySelectorAll('.page-controls span')).some((item) => item.textContent?.includes('${pageNumber + 1} / 5'))`)
                  }
                }
                const expectedLeft = ['0%', '-100%', '-200%', '-300%', '-400%']
                seamFeature = {
                  ok:
                    slices.length === 5 &&
                    slices.every((slice, index) =>
                      slice.placementCount === 1 &&
                      slice.locked &&
                      slice.imageWidth === '500%' &&
                      slice.imageLeft === expectedLeft[index]
                    ) &&
                    slices[0].inspector.includes('骑缝切片 1/5'),
                  slices,
                }
              }
            }
          }
        }
      }
    }
  }
}

socket.close()
const output = { ...value, seamFeature, runtimeEvents }
console.log(JSON.stringify(output, null, 2))
if (!value?.ok || (seamStampPath && !seamFeature?.ok)) process.exitCode = 1
