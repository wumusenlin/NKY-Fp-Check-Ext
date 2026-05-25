const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

async function handleMessage(message) {
  if (message.type === 'fillInvoice') {
    await fillInvoiceForm(message.invoice);
    return { ok: true };
  }
  if (message.type === 'prepareCaptcha') {
    return prepareCaptcha();
  }
  if (message.type === 'submitCaptcha') {
    await submitCaptcha(message.captcha);
    return { ok: true };
  }
  if (message.type === 'promptCaptcha') {
    await closeTeachYouReminder(500);
    await sleep(300);
    return {
      ok: true,
      captcha: await promptCaptchaInput(message.invoiceNumber, message.reason)
    };
  }
  if (message.type === 'waitForResult') {
    return waitForResult();
  }
  if (message.type === 'readPageMeta') {
    return {
      url: location.href,
      title: document.title,
      jqueryVersion: window.jQuery?.fn?.jquery || ''
    };
  }
  if (message.type === 'captureResultImage') {
    return captureResultImage();
  }
  throw new Error(`未知消息：${message.type}`);
}

async function fillInvoiceForm(invoice) {
  await setFieldValue('#fpdm', invoice.invoiceCode || '', true);
  await setFieldValue('#fphm', invoice.invoiceNumber || '');
  await setFieldValue('#kprq', invoice.invoiceDate || '');
  await setFieldValue('#kjje', invoice.amountWithoutTax || invoice.checkCode || '');
  await sleep(200);
  await closeTeachYouReminder(500);
}

async function setFieldValue(selector, value, optional = false) {
  const field = document.querySelector(selector);
  if (!field) {
    if (optional) {
      return;
    }
    throw new Error(`页面缺少输入框：${selector}`);
  }

  if (window.jQuery) {
    window.jQuery(field).val(value).trigger('input').trigger('change').trigger('blur');
  } else {
    field.focus();
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new Event('blur', { bubbles: true }));
  }
}

async function prepareCaptcha() {
  await closeTeachYouReminder(1000);
  return { ok: true };
}

async function closeTeachYouReminder(timeoutMs = 0) {
  const deadline = Date.now() + timeoutMs;
  do {
    const closeButton = Array.from(document.querySelectorAll('a.teachyou_close, .teachyou_close'))
      .find((element) => element.getClientRects().length > 0) ||
      document.querySelector('a.teachyou_close, .teachyou_close');

    if (closeButton) {
      clickElement(closeButton);
      await sleep(150);
      return true;
    }

    await sleep(150);
  } while (Date.now() < deadline);

  return false;
}

function clickElement(element) {
  if (window.jQuery) {
    window.jQuery(element).trigger('click');
    return;
  }

  for (const type of ['mouseover', 'mousedown', 'mouseup', 'click']) {
    element.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }
}

async function refreshCaptcha() {
  const trigger = findCaptchaRefreshTrigger();
  if (!trigger) {
    throw new Error('未找到验证码刷新入口。');
  }

  clickElement(trigger);
  await sleep(300);
  await closeTeachYouReminder(500);
}

function findCaptchaRefreshTrigger() {
  return (
    document.querySelector('#yzm_img') ||
    document.querySelector('#imgarea img') ||
    document.querySelector('#imgarea a') ||
    document.querySelector('#imgarea')
  );
}

function promptCaptchaInput(invoiceNumber, reason) {
  return new Promise((resolve) => {
    document.querySelector('#fp-check-captcha-dialog')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'fp-check-captcha-dialog';
    overlay.innerHTML = `
      <div class="fp-check-dialog">
        <div class="fp-check-title">输入验证码</div>
        <div class="fp-check-desc">发票 ${escapeHtml(invoiceNumber)}：请查看页面验证码后手工输入。</div>
        <div class="fp-check-actions">
          <input class="fp-check-input" type="text" autocomplete="off" placeholder="请输入当前验证码">
          <button class="fp-check-refresh" type="button">刷新</button>
        </div>
        <div class="fp-check-footer">
          <button class="fp-check-skip" type="button">跳过</button>
          <button class="fp-check-submit" type="button">确定</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #fp-check-captcha-dialog {
        position: fixed;
        top: 72px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }
      #fp-check-captcha-dialog .fp-check-dialog {
        width: 360px;
        max-width: calc(100vw - 40px);
        box-sizing: border-box;
        padding: 18px;
        border-radius: 8px;
        background: #fff;
        color: #111827;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.25);
        pointer-events: auto;
      }
      #fp-check-captcha-dialog .fp-check-title {
        font-size: 18px;
        font-weight: 650;
        margin-bottom: 8px;
      }
      #fp-check-captcha-dialog .fp-check-desc {
        margin-bottom: 14px;
        color: #4b5563;
        line-height: 1.45;
      }
      #fp-check-captcha-dialog .fp-check-actions {
        display: grid;
        grid-template-columns: 1fr 64px;
        gap: 8px;
        margin-bottom: 14px;
      }
      #fp-check-captcha-dialog input,
      #fp-check-captcha-dialog button {
        box-sizing: border-box;
        min-height: 36px;
        border-radius: 6px;
        font-size: 14px;
      }
      #fp-check-captcha-dialog input {
        width: 100%;
        border: 1px solid #d1d5db;
        padding: 6px 9px;
      }
      #fp-check-captcha-dialog button {
        border: 0;
        padding: 0 12px;
        cursor: pointer;
      }
      #fp-check-captcha-dialog .fp-check-refresh,
      #fp-check-captcha-dialog .fp-check-skip {
        background: #e5e7eb;
        color: #1f2937;
      }
      #fp-check-captcha-dialog .fp-check-submit {
        background: #1f6feb;
        color: #fff;
        font-weight: 650;
      }
      #fp-check-captcha-dialog .fp-check-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
    `;

    document.documentElement.append(style);
    document.documentElement.append(overlay);

    const input = overlay.querySelector('.fp-check-input');
    const refresh = overlay.querySelector('.fp-check-refresh');
    const submit = overlay.querySelector('.fp-check-submit');
    const skip = overlay.querySelector('.fp-check-skip');

    const close = (value) => {
      overlay.remove();
      style.remove();
      resolve(String(value || '').trim());
    };

    refresh.addEventListener('click', async () => {
      refresh.disabled = true;
      refresh.textContent = '刷新中';
      try {
        await refreshCaptcha();
        input.value = '';
        input.focus();
      } catch (error) {
        refresh.textContent = '失败';
        await sleep(900);
      } finally {
        refresh.disabled = false;
        refresh.textContent = '刷新';
      }
    });
    submit.addEventListener('click', () => close(input.value));
    skip.addEventListener('click', () => close(''));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        close('');
      }
    });
    setTimeout(() => input.focus(), 0);
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

async function submitCaptcha(captcha) {
  await setFieldValue('#yzm', captcha);
  const button = document.querySelector('#checkfp');
  if (!button) {
    throw new Error('页面缺少查验按钮：#checkfp');
  }
  if (window.jQuery) {
    window.jQuery(button).trigger('click');
  } else {
    button.click();
  }
}

async function waitForResult() {
  const started = Date.now();
  let stableKey = '';
  let stableCount = 0;
  let lastResult = null;

  while (Date.now() - started < 1000) {
    const frameResult = findResultInFrames();
    if (frameResult) {
      const stable = await waitForStableResult(frameResult, () => findResultInFrames());
      return stable || frameResult;
    }

    const result = findResult();
    if (result) {
      const key = resultKey(result);
      if (key && key === stableKey) {
        stableCount += 1;
      } else {
        stableKey = key;
        stableCount = 1;
      }
      lastResult = result;
      if (isResultReady(result) && stableCount >= 2) {
        await sleep(200);
        return findResult() || result;
      }
    }
    await sleep(150);
  }
  if (lastResult) {
    return lastResult;
  }
  throw new Error('等待查验结果超时。');
}

async function waitForStableResult(initialResult, readResult) {
  let result = initialResult;
  let key = resultKey(result);
  let stableCount = 0;
  const started = Date.now();

  while (Date.now() - started < 1000) {
    await sleep(300);
    const next = readResult() || result;
    const nextKey = resultKey(next);
    if (nextKey && nextKey === key) {
      stableCount += 1;
    } else {
      key = nextKey;
      stableCount = 0;
    }
    result = next;
    if (isResultReady(result) && stableCount >= 2) {
      await sleep(200);
      return readResult() || result;
    }
  }

  return result;
}

function resultKey(result) {
  return String(result?.text || '').replace(/\s+/g, ' ').trim();
}

function isResultReady(result) {
  const text = resultKey(result);
  if (text.length < 60) {
    return false;
  }
  if (/加载中|正在查询|请稍候|请等待/.test(text)) {
    return false;
  }
  return /发票|查验|购买方|销售方|金额|税额|验证码/.test(text);
}

function findResult() {
  const selectors = [
    '#popup_container',
    '#popup_message',
    '#floatwin',
    '#floatwin1',
    '.layui-layer-content',
    '.ui-dialog',
    '.modal'
  ];

  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    for (const node of nodes) {
      const text = (node.innerText || '').trim();
      if (text && node.getClientRects().length > 0) {
        return {
          selectorHint: selector,
          text,
          html: node.outerHTML,
          parsed: parseTableText(text)
        };
      }
    }
  }

  for (const table of Array.from(document.querySelectorAll('table'))) {
    const text = (table.innerText || '').trim();
    if (table.getClientRects().length > 0 && text.length > 80 && !text.includes('请输入发票号码')) {
      return {
        selectorHint: 'table',
        text,
        html: table.outerHTML,
        parsed: parseTableText(text)
      };
    }
  }

  return null;
}

function findResultInFrames() {
  for (const iframe of Array.from(document.querySelectorAll('iframe'))) {
    let doc;
    try {
      doc = iframe.contentDocument;
    } catch {
      continue;
    }
    if (!doc?.body) {
      continue;
    }

    const selectors = ['#print_area', '#content', '#cms_r', 'body'];
    for (const selector of selectors) {
      const node = doc.querySelector(selector);
      const text = (node?.innerText || '').trim();
      if (
        node &&
        text.length > 80 &&
        (text.includes('发票查验') || text.includes('查验次数') || text.includes('发票号码'))
      ) {
        return {
          selectorHint: `iframe ${selector}`,
          text,
          html: node.outerHTML,
          parsed: parseTableText(text)
        };
      }
    }
  }

  return null;
}

function parseTableText(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const fields = {};
  for (const line of lines) {
    const match = line.replace(/\s+/g, ' ').match(/^(.{2,20}?)[：:]\s*(.+)$/);
    if (match) {
      fields[match[1].trim()] = match[2].trim();
    }
  }
  return { lines, fields };
}

async function captureResultImage() {
  if (!window.html2canvas) {
    throw new Error('html2canvas 未加载。');
  }

  await waitForResult();

  const iframeCapture = await captureResultIframe();
  if (iframeCapture?.dataUrl) {
    return iframeCapture;
  }

  const target = findResultTarget();
  if (!target) {
    throw new Error('未找到查验结果弹窗。');
  }

  const clone = target.cloneNode(true);
  const width = Math.max(target.scrollWidth, target.clientWidth, 700);
  const height = Math.max(target.scrollHeight, target.clientHeight, 300);
  clone.style.height = 'auto';
  clone.style.maxHeight = 'none';
  clone.style.overflow = 'visible';
  clone.style.minHeight = `${height}px`;
  clone.style.width = `${width}px`;
  clone.style.position = 'fixed';
  clone.style.left = '-20000px';
  clone.style.top = '0';
  clone.style.zIndex = '2147483647';
  clone.style.background = '#fff';

  document.body.appendChild(clone);
  expandScrollable(clone);

  try {
    const captureWidth = Math.max(clone.scrollWidth, clone.clientWidth, width);
    const captureHeight = Math.max(clone.scrollHeight, clone.clientHeight, height);
    const canvas = await window.html2canvas(clone, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight
    });
    return {
      ok: true,
      source: 'modal',
      dataUrl: canvas.toDataURL('image/png')
    };
  } finally {
    clone.remove();
  }
}

function findResultTarget() {
  const selectors = [
    '#popup_container',
    '.layui-layer',
    '#floatwin',
    '#floatwin1',
    '.layui-layer-content',
    '.ui-dialog',
    '.modal'
  ];

  if (window.jQuery) {
    for (const selector of selectors) {
      const node = window.jQuery(selector).filter(function filterVisible() {
        return window.jQuery(this).is(':visible') && window.jQuery(this).text().trim().length > 0;
      }).first()[0];
      if (node) {
        return node;
      }
    }
  }

  for (const selector of selectors) {
    for (const node of Array.from(document.querySelectorAll(selector))) {
      if (node.getClientRects().length > 0 && (node.innerText || '').trim()) {
        return node;
      }
    }
  }

  return null;
}

async function captureResultIframe() {
  for (const iframe of Array.from(document.querySelectorAll('iframe'))) {
    let doc;
    try {
      doc = iframe.contentDocument;
    } catch {
      continue;
    }
    if (!doc?.body) {
      continue;
    }

    const text = (doc.body.innerText || '').trim();
    if (
      text.length <= 80 ||
      (!text.includes('发票查验') && !text.includes('查验次数') && !text.includes('发票号码'))
    ) {
      continue;
    }

    const target =
      doc.querySelector('#print_area') ||
      doc.querySelector('#content') ||
      doc.querySelector('#cms_r') ||
      doc.body;

    const clone = target.cloneNode(true);
    clone.style.height = 'auto';
    clone.style.maxHeight = 'none';
    clone.style.overflow = 'visible';
    clone.style.width = `${Math.max(target.scrollWidth, target.clientWidth, 1000)}px`;
    clone.style.minHeight = `${Math.max(target.scrollHeight, target.clientHeight, 300)}px`;
    clone.style.position = 'fixed';
    clone.style.left = '-20000px';
    clone.style.top = '0';
    clone.style.zIndex = '2147483647';
    clone.style.background = '#fff';
    copyDocumentStyles(doc, clone);
    document.body.appendChild(clone);
    expandScrollable(clone);

    try {
      const captureWidth = Math.max(clone.scrollWidth, clone.clientWidth, 1000);
      const captureHeight = Math.max(clone.scrollHeight, clone.clientHeight, 300);
      const canvas = await window.html2canvas(clone, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        width: captureWidth,
        height: captureHeight,
        windowWidth: captureWidth,
        windowHeight: captureHeight
      });
      return {
        ok: true,
        source: 'iframe',
        dataUrl: canvas.toDataURL('image/png')
      };
    } finally {
      clone.remove();
    }
  }

  return null;
}

function copyDocumentStyles(sourceDocument, targetNode) {
  const styleWrap = document.createElement('div');
  styleWrap.style.display = 'none';

  for (const styleSheet of Array.from(sourceDocument.querySelectorAll('style'))) {
    styleWrap.appendChild(styleSheet.cloneNode(true));
  }

  for (const link of Array.from(sourceDocument.querySelectorAll('link[rel="stylesheet"]'))) {
    const clonedLink = link.cloneNode(true);
    if (clonedLink.href) {
      styleWrap.appendChild(clonedLink);
    }
  }

  if (styleWrap.childNodes.length > 0) {
    targetNode.prepend(styleWrap);
  }
}

function expandScrollable(root) {
  root.querySelectorAll('*').forEach((node) => {
    const style = getComputedStyle(node);
    const hasVerticalScroll = node.scrollHeight > node.clientHeight;
    const hasHorizontalScroll = node.scrollWidth > node.clientWidth;

    if (hasVerticalScroll || style.overflowY === 'auto' || style.overflowY === 'scroll') {
      node.style.overflowY = 'visible';
      node.style.maxHeight = 'none';
      node.style.height = `${Math.max(node.scrollHeight, node.clientHeight)}px`;
    }

    if (hasHorizontalScroll || style.overflowX === 'auto' || style.overflowX === 'scroll') {
      node.style.overflowX = 'visible';
      node.style.maxWidth = 'none';
      node.style.width = `${Math.max(node.scrollWidth, node.clientWidth)}px`;
    }
  });
}
