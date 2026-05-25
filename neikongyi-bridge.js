const NEIKONGYI_SOURCE = 'neikongyi';
const PLUGIN_SOURCE = 'fp-check-extension';

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
