const NEIKONGYI_SOURCE = 'neikongyi';
const PLUGIN_SOURCE = 'fp-check-extension';
const UPLOAD_CREDENTIAL_ID = 'fp-check-upload-credential';
const DEFAULT_UPLOAD_SELECTOR = '.ant-upload.ant-upload-drag';
const UPLOAD_TARGET_WAIT_MS = 5000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleRuntimeMessage(message)
    .then(sendResponse)
    .catch((error) => {
      const errorMessage = error.message || String(error);
      if (message?.type === 'uploadResultImage') {
        showUploadNotice(`上传查验图片失败：${errorMessage}`, 'error');
      }
      sendResponse({ ok: false, error: errorMessage });
    });
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
  const selector = message.selector || DEFAULT_UPLOAD_SELECTOR;
  const uploadTarget = await waitForUploadTarget(selector);
  if (!uploadTarget) {
    throw new Error(`未找到上传控件：#${UPLOAD_CREDENTIAL_ID} 或 ${selector}`);
  }

  const fileName = getBaseFileName(message.filename || 'fp-check-result.png');
  const file = dataUrlToFile(message.dataUrl, fileName);
  const uploadedBy = uploadFile(uploadTarget, file);

  window.postMessage({
    source: PLUGIN_SOURCE,
    target: NEIKONGYI_SOURCE,
    type: 'uploadResultImageResult',
    ok: true,
    fileName
  }, window.location.origin);

  showUploadNotice(`已上传查验图片：${fileName}`, 'success');
  return { ok: true, fileName, uploadedBy };
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

function waitForUploadTarget(selector) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const target = findUploadTarget(selector);
      if (target || Date.now() - startedAt >= UPLOAD_TARGET_WAIT_MS) {
        resolve(target);
        return;
      }
      window.setTimeout(tick, 200);
    };
    tick();
  });
}

function findUploadTarget(selector) {
  return document.getElementById(UPLOAD_CREDENTIAL_ID)
    || document.querySelector(selector)
    || document.querySelector(DEFAULT_UPLOAD_SELECTOR);
}

function uploadFile(uploadTarget, file) {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  dispatchMouseEvent(uploadTarget, 'click');

  const fileInput = resolveFileInput(uploadTarget);
  if (fileInput) {
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    return 'file-input';
  }

  dispatchDragEvent(uploadTarget, 'dragenter', dataTransfer);
  dispatchDragEvent(uploadTarget, 'dragover', dataTransfer);
  dispatchDragEvent(uploadTarget, 'drop', dataTransfer);
  return 'drag-drop';
}

function resolveFileInput(uploadTarget) {
  if (uploadTarget.matches?.('input[type="file"]')) {
    return uploadTarget;
  }

  const nestedInput = uploadTarget.querySelector?.('input[type="file"]');
  if (nestedInput) {
    return nestedInput;
  }

  const labelTargetId = uploadTarget.getAttribute?.('for');
  if (labelTargetId) {
    const labeledInput = document.getElementById(labelTargetId);
    if (labeledInput?.matches?.('input[type="file"]')) {
      return labeledInput;
    }
  }

  return null;
}

function dispatchMouseEvent(target, type) {
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window
  }));
}

function getBaseFileName(filename) {
  return String(filename || 'fp-check-result.png').split('/').pop() || 'fp-check-result.png';
}

function showUploadNotice(text, type) {
  const existing = document.querySelector('#fp-check-upload-notice');
  existing?.remove();

  const style = document.querySelector('#fp-check-upload-notice-style') || document.createElement('style');
  style.id = 'fp-check-upload-notice-style';
  style.textContent = `
    #fp-check-upload-notice {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 2147483647;
      max-width: min(420px, calc(100vw - 48px));
      padding: 12px 14px;
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
      font-size: 14px;
      line-height: 1.5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #fff;
      white-space: pre-wrap;
    }
    #fp-check-upload-notice.fp-check-upload-error {
      background: #b42318;
    }
    #fp-check-upload-notice.fp-check-upload-success {
      background: #067647;
    }
  `;
  document.documentElement.appendChild(style);

  const notice = document.createElement('div');
  notice.id = 'fp-check-upload-notice';
  notice.className = type === 'success' ? 'fp-check-upload-success' : 'fp-check-upload-error';
  notice.textContent = text;
  document.documentElement.appendChild(notice);

  if (type === 'success') {
    window.setTimeout(() => notice.remove(), 3000);
  }
}
