const DEFAULT_URL = 'https://inv-veri.chinatax.gov.cn/index.html';

const elements = {
  url: document.querySelector('#url'),
  readCurrentPage: document.querySelector('#readCurrentPage'),
  invoiceCode: document.querySelector('#invoiceCode'),
  invoiceNumber: document.querySelector('#invoiceNumber'),
  invoiceDate: document.querySelector('#invoiceDate'),
  total: document.querySelector('#total'),
  start: document.querySelector('#start'),
  stop: document.querySelector('#stop'),
  state: document.querySelector('#state'),
  readStatus: document.querySelector('#readStatus'),
  outputHint: document.querySelector('#outputHint')
};

let stopped = false;
let statusTimer = null;

elements.start.addEventListener('click', startVerify);
elements.readCurrentPage.addEventListener('click', readCurrentPageInvoice);
elements.stop.addEventListener('click', async () => {
  stopped = true;
  await chrome.runtime.sendMessage({ type: 'stopVerify' });
  setState('已请求停止');
});
refreshStatus();
readCurrentPageInvoice();
statusTimer = setInterval(refreshStatus, 1000);

async function startVerify() {
  stopped = false;
  resetStats();
  const invoices = [readInvoiceFromForm()].filter((invoice) => invoice.invoiceNumber);
  if (!invoices.length) {
    appendLog('请填写发票号码。');
    return;
  }

  const missing = validateInvoice(invoices[0]);
  if (missing.length > 0) {
    appendLog(`缺少必填字段：${missing.join('、')}`);
    return;
  }

  elements.start.disabled = true;
  setState('运行中');

  const url = elements.url.value.trim() || DEFAULT_URL;
  const response = await chrome.runtime.sendMessage({ type: 'startVerify', invoices, url });
  if (!response?.ok) {
    appendLog(response?.error || '启动失败。');
    elements.start.disabled = false;
  }
}

function normalizeInvoice(row) {
  const pick = (names) => {
    for (const name of names) {
      if (row[name] !== undefined && String(row[name]).trim()) {
        return String(row[name]).trim();
      }
    }
    return '';
  };
  const total = pick(['total', 'fpAmount', '价税合计', '合计金额', 'amount', 'amountWithoutTax', 'kjje', '开具金额', '金额', '不含税金额']).replace(/,/g, '');

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

function readInvoiceFromForm() {
  return {
    invoiceCode: elements.invoiceCode.value.trim(),
    invoiceNumber: elements.invoiceNumber.value.trim(),
    invoiceDate: elements.invoiceDate.value.replace(/\D/g, '').slice(0, 8),
    total: elements.total.value.replace(/,/g, '').trim(),
    checkCode: '',
    note: '',
    raw: {
      source: 'popup-form'
    }
  };
}

async function readCurrentPageInvoice(options = {}) {
  const { silent = false } = options;
  setReadStatus('正在读取当前页数据...');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('未找到当前页面。');
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => ({
        ...(() => {
          console.log('[fp-check] window:', window);
          console.log('[fp-check] invoice globals:', {
            invoiceCode: window.invoiceCode,
            invoiceNumber: window.invoiceNumber,
            fpDate: window.fpDate,
            total: window.total,
            fpAmount: window.fpAmount,
            checkCode: window.checkCode
          });

          return {
            invoiceCode: window.invoiceCode || '',
            invoiceNumber: window.invoiceNumber || '',
            invoiceDate: window.fpDate || '',
            total: window.total || window.fpAmount || '',
            checkCode: window.checkCode || '',
            debugWindowKeys: Object.keys(window).slice(0, 300)
          };
        })()
      })
    });

    const invoice = normalizeInvoice({
      invoiceCode: result?.result?.invoiceCode,
      invoiceNumber: result?.result?.invoiceNumber,
      fpDate: result?.result?.invoiceDate,
      total: result?.result?.total,
      checkCode: result?.result?.checkCode
    });

    fillForm(invoice);
    setReadStatus(invoice.invoiceNumber ? '已读取当前页发票信息。' : '当前页未读取到发票信息。');
    if (!silent) {
      appendLog(invoice.invoiceNumber ? '已读取当前页发票信息。' : '当前页未读取到发票信息。');
    }
  } catch (error) {
    const message = `读取当前页失败：${error.message || String(error)}`;
    setReadStatus(message);
    if (!silent) appendLog(message);
  }
}

function fillForm(invoice) {
  if (invoice.invoiceCode) {
    elements.invoiceCode.value = invoice.invoiceCode;
  }
  if (invoice.invoiceNumber) {
    elements.invoiceNumber.value = invoice.invoiceNumber;
  }
  if (invoice.invoiceDate) {
    elements.invoiceDate.value = invoice.invoiceDate;
  }
  if (invoice.total) {
    elements.total.value = invoice.total;
  }
}

function validateInvoice(invoice) {
  const missing = [];
  if (!invoice.invoiceNumber) missing.push('发票号码');
  if (!invoice.invoiceDate) missing.push('开票日期');
  if (!invoice.total) missing.push('金额');
  return missing;
}

function setReadStatus(text) {
  elements.readStatus.textContent = text;
}

function appendLog(text) {
  setReadStatus(text);
}

function setState(text) {
  elements.state.textContent = text;
}

function resetStats() {
  setReadStatus('');
}

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ type: 'getStatus' }).catch(() => null);
  if (!status) {
    return;
  }
  elements.outputHint.textContent = `保存位置：${status.outputHint || 'Chrome 下载目录/fp-check-extension'}`;
  elements.start.disabled = Boolean(status.running);
  setState(status.state || '未开始');
  if (status.running && (status.logs || []).length > 0) {
    setReadStatus(status.logs[status.logs.length - 1]);
  }
}
