const NEIKONGYI_SOURCE = 'neikongyi';
const PLUGIN_SOURCE = 'fp-check-extension';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleRuntimeMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

window.addEventListener('message', (event) => {
  if (event.source !== window) {
    return;
  }

  const message = event.data;
  if (!isNeikongyiMessage(message)) {
    return;
  }

  handleNeikongyiMessage(message)
    .then((response) => postPluginResult(message, response))
    .catch((error) => postPluginResult(message, {
      ok: false,
      error: error.message || String(error)
    }));
});

function isNeikongyiMessage(message) {
  return (
    message &&
    typeof message === 'object' &&
    message.source === NEIKONGYI_SOURCE &&
    message.target === PLUGIN_SOURCE &&
    typeof message.type === 'string'
  );
}

async function handleNeikongyiMessage(message) {
  if (message.type === 'ping') {
    return { ok: true, installed: true };
  }

  if (message.type === 'startVerify') {
    return chrome.runtime.sendMessage({
      type: 'startVerifyFromNeikongyi',
      requestId: message.requestId || '',
      url: message.url || '',
      invoice: message.invoice || null,
      invoices: Array.isArray(message.invoices) ? message.invoices : null,
      payload: message
    });
  }

  if (message.type === 'stopVerify') {
    return chrome.runtime.sendMessage({ type: 'stopVerify' });
  }

  if (message.type === 'getStatus') {
    return chrome.runtime.sendMessage({ type: 'getStatus' });
  }

  return { ok: false, error: `未知内控易消息：${message.type}` };
}

function postPluginResult(request, response) {
  window.postMessage({
    source: PLUGIN_SOURCE,
    target: NEIKONGYI_SOURCE,
    requestId: request.requestId || '',
    type: `${request.type}Result`,
    ...response
  }, window.location.origin);
}

async function handleRuntimeMessage(message) {
  if (message?.type === 'uploadResultImage') {
    return uploadResultImage(message);
  }

  return { ok: false, error: `未知插件消息：${message?.type || ''}` };
}

async function uploadResultImage(message) {
  const selector = message.selector || '.ant-upload.ant-upload-drag';
  const uploadTarget = document.querySelector(selector);
  if (!uploadTarget) {
    throw new Error(`未找到上传控件：${selector}`);
  }

  const fileName = getBaseFileName(message.filename || 'fp-check-result.png');
  const file = dataUrlToFile(message.dataUrl, fileName);
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  dispatchDragEvent(uploadTarget, 'dragenter', dataTransfer);
  dispatchDragEvent(uploadTarget, 'dragover', dataTransfer);
  dispatchDragEvent(uploadTarget, 'drop', dataTransfer);

  window.postMessage({
    source: PLUGIN_SOURCE,
    target: NEIKONGYI_SOURCE,
    type: 'uploadResultImageResult',
    ok: true,
    fileName
  }, window.location.origin);

  return { ok: true, fileName };
}

function dataUrlToFile(dataUrl, fileName) {
  const matched = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(dataUrl || '');
  if (!matched) {
    throw new Error('图片数据格式错误。');
  }

  const mimeType = matched[1] || 'image/png';
  const isBase64 = Boolean(matched[2]);
  const body = isBase64 ? atob(matched[3]) : decodeURIComponent(matched[3]);
  const bytes = new Uint8Array(body.length);
  for (let index = 0; index < body.length; index += 1) {
    bytes[index] = body.charCodeAt(index);
  }

  return new File([bytes], fileName, {
    type: mimeType,
    lastModified: Date.now()
  });
}

function dispatchDragEvent(target, type, dataTransfer) {
  const event = new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    dataTransfer
  });
  target.dispatchEvent(event);
}

function getBaseFileName(filename) {
  return String(filename || 'fp-check-result.png').split('/').pop() || 'fp-check-result.png';
}
