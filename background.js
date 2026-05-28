const DEFAULT_URL = 'https://inv-veri.chinatax.gov.cn/index.html';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let currentJob = null;
let stopRequested = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'startVerify') {
    startJob(message.invoices || [], message.url || DEFAULT_URL)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message?.type === 'startVerifyFromNeikongyi') {
    startJob(readNeikongyiInvoices(message), message.url || DEFAULT_URL, '内控易', {
      uploadTabId: sender.tab?.id || null
    })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message?.type === 'stopVerify') {
    stopRequested = true;
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === 'getStatus') {
    sendResponse(currentJob || makeInitialJob());
    return false;
  }

  return false;
});

async function startJob(invoices, url, source = '', options = {}) {
  if (currentJob?.running) {
    return { ok: false, error: '已有查验任务在运行。' };
  }
  if (!invoices.length) {
    return { ok: false, error: '没有可查验发票。' };
  }

  stopRequested = false;
  currentJob = {
    running: true,
    state: '运行中',
    outputHint: 'Chrome 下载目录/fp-check-extension',
    total: invoices.length,
    done: 0,
    success: 0,
    failed: 0,
    logs: [],
    summary: [],
    uploadTabId: options.uploadTabId || null
  };
  if (source) {
    appendLog(`来源：${source}`);
  }
  runJob(invoices, url, options).catch((error) => {
    appendLog(`任务失败：${error.message || String(error)}`);
    currentJob.running = false;
    currentJob.state = '失败';
  });
  return { ok: true };
}

function readNeikongyiInvoices(message) {
  const rows = Array.isArray(message.invoices)
    ? message.invoices
    : [message.invoice || message.payload].filter(Boolean);

  return rows.map(normalizeIncomingInvoice).filter((invoice) => invoice.invoiceNumber);
}

function normalizeIncomingInvoice(row) {
  const pick = (names) => {
    for (const name of names) {
      if (row?.[name] !== undefined && String(row[name]).trim()) {
        return String(row[name]).trim();
      }
    }
    return '';
  };
  const total = pick([
    'total',
    'fpAmount',
    '价税合计',
    '合计金额',
    'amount',
    'amountWithoutTax',
    'kjje',
    '开具金额',
    '金额',
    '不含税金额'
  ]).replace(/,/g, '');

  return {
    invoiceCode: pick(['invoiceCode', 'fpdm', '发票代码']),
    invoiceNumber: pick(['invoiceNumber', 'fphm', '发票号码']),
    invoiceDate: pick(['invoiceDate', 'kprq', 'fpDate', '开票日期']).replace(/\D/g, '').slice(0, 8),
    total,
    checkCode: pick(['checkCode', '校验码']),
    note: pick(['note', '备注']),
    raw: row
  };
}

async function runJob(invoices, url, options = {}) {
  const tab = await openOrReuseTaxTab(url);
  for (let index = 0; index < invoices.length; index += 1) {
    if (stopRequested) {
      appendLog('已停止。');
      break;
    }

    const invoice = invoices[index];
    appendLog(`[${index + 1}/${invoices.length}] ${invoice.invoiceNumber}`);
    await chrome.tabs.update(tab.id, { active: true, url });
    await showNoticeAfterNavigation(tab.id, '正在打开查验页面，请勿操作页面。');
    const result = await verifyOne(tab.id, invoice, index, options);
    currentJob.summary.push({
      invoiceNumber: invoice.invoiceNumber,
      status: result.status,
      errorStep: result.errorStep || '',
      errorMessage: result.errorMessage || '',
      checkedAt: result.checkedAt
    });
    currentJob.done += 1;
    if (result.status === 'success') {
      currentJob.success += 1;
    } else {
      currentJob.failed += 1;
    }
  }

  currentJob.running = false;
  currentJob.state = stopRequested ? '已停止' : '完成';
  appendLog(`保存位置：${currentJob.outputHint}`);
}

async function showNoticeAfterNavigation(tabId, text) {
  let completed = false;
  const completePromise = waitForTabComplete(tabId).then(() => {
    completed = true;
  });
  const started = Date.now();

  while (!completed && Date.now() - started < 15000) {
    await chrome.tabs.sendMessage(tabId, { type: 'showProcessingNotice', text }).catch(() => null);
    await sleep(120);
  }

  await completePromise;
  await chrome.tabs.sendMessage(tabId, { type: 'showProcessingNotice', text }).catch(() => null);
}

async function verifyOne(tabId, invoice, index, options = {}) {
  try {
    await sendToTab(tabId, { type: 'fillInvoice', invoice });
    await sendToTab(tabId, { type: 'prepareCaptcha' });

    const prompted = await sendToTab(tabId, {
      type: 'promptCaptcha',
      invoiceNumber: invoice.invoiceNumber
    });
    const captcha = prompted.captcha || '';

    if (!captcha) {
      return saveResult(tabId, index, invoice, 'skipped', '用户跳过当前发票。', {}, options);
    }

    await sendToTab(tabId, { type: 'submitCaptcha', captcha });
    const result = await sendToTab(tabId, { type: 'waitForResult' });
    return saveResult(tabId, index, invoice, 'success', '', result, options);
  } catch (error) {
    return saveResult(tabId, index, invoice, 'failed', error.message || String(error), {}, options);
  }
}

async function saveResult(tabId, index, invoice, status, errorMessage, result = {}, options = {}) {
  const checkedAt = new Date().toISOString();
  const page = await sendToTab(tabId, { type: 'readPageMeta' }).catch(() => ({}));
  const meta = {
    status,
    errorMessage,
    errorStep: status === 'failed' ? '插件查验流程' : '',
    checkedAt,
    invoice,
    page,
    result
  };
  if (status === 'skipped') {
    appendLog(`${invoice.invoiceNumber}: skipped，未保存结果图片`);
    return meta;
  }

  const capture = await sendToTab(tabId, { type: 'captureResultImage' }).catch((error) => ({
    ok: false,
    error: error.message || String(error)
  }));
  let dataUrl = '';
  let filename = '';
  if (capture?.dataUrl) {
    dataUrl = capture.dataUrl;
    filename = buildFileName(index, invoice, 'result-modal-full.png');
    await downloadDataUrl(filename, dataUrl);
    appendLog(`${invoice.invoiceNumber}: 已保存 ${filename}`);
  } else {
    dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' });
    filename = buildFileName(index, invoice, 'result-page.png');
    await downloadDataUrl(filename, dataUrl);
    appendLog(`${invoice.invoiceNumber}: html2canvas 失败：${capture?.error || 'unknown'}`);
    appendLog(`${invoice.invoiceNumber}: 已保存 ${filename}`);
  }
  await uploadResultImageToSourceTab(options.uploadTabId, invoice, filename, dataUrl);
  appendLog(`${invoice.invoiceNumber}: ${status}`);
  return meta;
}

async function uploadResultImageToSourceTab(tabId, invoice, filename, dataUrl) {
  if (!tabId || !dataUrl) {
    return;
  }

  try {
    await chrome.tabs.update(tabId, { active: true });
    const response = await sendToTab(tabId, {
      type: 'uploadResultImage',
      invoice,
      filename,
      dataUrl,
      selector: '.ant-upload.ant-upload-drag'
    });
    appendLog(`${invoice.invoiceNumber}: 已回传上传控件 ${response.fileName || filename}`);
  } catch (error) {
    appendLog(`${invoice.invoiceNumber}: 回传上传控件失败：${error.message || String(error)}`);
  }
}

async function openOrReuseTaxTab(url) {
  const tabs = await chrome.tabs.query({ url: 'https://inv-veri.chinatax.gov.cn/*' });
  if (tabs[0]) {
    await chrome.tabs.update(tabs[0].id, { active: true, url });
    return tabs[0];
  }
  return chrome.tabs.create({ active: true, url });
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, 15000);
    const listener = (changedTabId, info) => {
      if (changedTabId === tabId && info.status === 'complete') {
        done();
      }
    };
    function done() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(resolve, 800);
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function sendToTab(tabId, message) {
  const response = await chrome.tabs.sendMessage(tabId, message);
  if (response?.ok === false) {
    throw new Error(response.error || 'content_script_failed');
  }
  return response;
}

async function downloadDataUrl(filename, dataUrl) {
  await chrome.downloads.download({ url: dataUrl, filename, conflictAction: 'uniquify', saveAs: false });
}

function buildFileName(index, invoice, fileName) {
  const prefix = `${String(index + 1).padStart(3, '0')}_${safeName(invoice.invoiceDate)}_${safeName(invoice.invoiceNumber)}`;
  return `fp-check-extension/${prefix}_${fileName}`;
}

function safeName(value) {
  return String(value || 'unknown').replace(/[^\w.-]+/g, '_');
}

function appendLog(text) {
  currentJob.logs.push(text);
  if (currentJob.logs.length > 80) {
    currentJob.logs.shift();
  }
}

function makeInitialJob() {
  return {
    running: false,
    state: '未开始',
    outputHint: 'Chrome 下载目录/fp-check-extension',
    total: 0,
    done: 0,
    success: 0,
    failed: 0,
    logs: [],
    summary: []
  };
}
