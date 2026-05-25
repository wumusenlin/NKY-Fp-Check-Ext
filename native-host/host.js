#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const OCR_SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'ocr-captcha.py');

process.stdin.on('readable', () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    buffer = Buffer.concat([buffer, chunk]);
    readMessages();
  }
});

let buffer = Buffer.alloc(0);

function readMessages() {
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (buffer.length < 4 + length) {
      return;
    }
    const body = buffer.subarray(4, 4 + length).toString('utf8');
    buffer = buffer.subarray(4 + length);
    handle(JSON.parse(body)).then(writeMessage).catch((error) => {
      writeMessage({ ok: false, reason: error.message || String(error) });
    });
  }
}

async function handle(message) {
  if (message.type !== 'recognizeCaptcha') {
    return { ok: false, reason: `unknown_type: ${message.type}` };
  }

  const captchaPath = writeCaptcha(message.captchaDataUrl);
  try {
    const result = await runOcr(captchaPath, message.requirement || 'plain');
    return result;
  } finally {
    fs.rm(captchaPath, { force: true }, () => {});
  }
}

function writeCaptcha(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1];
  if (!base64) {
    throw new Error('captcha_data_url_empty');
  }
  const file = path.join(os.tmpdir(), `fp-yzm-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  return file;
}

function runOcr(captchaPath, requirement) {
  return new Promise((resolve) => {
    const python = findPython();
    const child = execFile(python, [OCR_SCRIPT, captchaPath, requirement], {
      cwd: PROJECT_ROOT,
      timeout: 20000,
      maxBuffer: 1024 * 1024
    }, (error, stdout) => {
      if (error) {
        resolve({ ok: false, reason: error.message });
        return;
      }
      try {
        const parsed = JSON.parse(String(stdout || '{}').trim() || '{}');
        const text = normalizeCaptchaText(parsed.text);
        resolve(text ? { ok: true, text, raw: parsed } : { ok: false, reason: parsed.reason || 'ocr_empty' });
      } catch (parseError) {
        resolve({ ok: false, reason: parseError.message });
      }
    });
    child.on('error', (error) => resolve({ ok: false, reason: error.message }));
  });
}

function findPython() {
  const local = process.platform === 'win32'
    ? path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe')
    : path.join(PROJECT_ROOT, '.venv', 'bin', 'python');
  if (fs.existsSync(local)) {
    return local;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function normalizeCaptchaText(value) {
  return Array.from(String(value || '').toUpperCase())
    .filter((char) => /[\p{L}\p{N}]/u.test(char))
    .join('')
    .trim();
}

function writeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}
