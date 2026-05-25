# 浏览器插件版

目录：`browser-extension/`

用途：把现有发票查验流程放到 Chrome 插件里运行。CSV 仍使用原字段，页面自动填表、手工输入验证码、提交查验、保存查验结果图片。

## 安装插件

1. 打开 Chrome：`chrome://extensions/`
2. 打开“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录：`browser-extension/`。

## 使用

1. 在暴露发票数据的页面点击插件图标。
2. 插件会尝试读取当前页面的全局变量并填入表单：
   - `window.invoiceCode`
   - `window.invoiceNumber`
   - `window.fpDate`
   - `window.fpAmount`
3. 也可以手工填写表单；当前表单字段顺序为发票代码、发票号码、开票日期、金额，每个字段都有示例。
4. 如需批量查验，可选择 CSV；选择 CSV 后优先按 CSV 批量查验。
5. 点击“开始查验”。
6. 输出会保存到浏览器下载目录的 `fp-check-extension/` 下。

## 内控易触发插件

插件安装后，会在普通 HTTP/HTTPS 页面注入 `neikongyi-bridge.js`。
内控易页面可以用 `window.postMessage` 通知插件开始查验：

```js
window.postMessage({
  source: 'neikongyi',
  target: 'fp-check-extension',
  type: 'startVerify',
  requestId: String(Date.now()),
  invoice: {
    invoiceCode: '',
    invoiceNumber: '26112000001697881801',
    invoiceDate: '20260428',
    amountWithoutTax: '100.00',
    checkCode: ''
  }
}, window.location.origin);
```

批量查验时把 `invoice` 换成 `invoices` 数组即可。

内控易接收插件返回：

```js
window.addEventListener('message', (event) => {
  if (event.data?.source !== 'fp-check-extension') return;
  if (event.data?.target !== 'neikongyi') return;

  console.log('插件返回：', event.data);
});
```

可用消息：

- `ping`：检测插件是否已注入。
- `startVerify`：启动查验。
- `stopVerify`：停止查验。
- `getStatus`：读取当前查验状态。

## 验证码

插件不调用 OCR。每张发票填表后会弹出输入框，用户查看页面验证码后手工输入。

## 与脚本版差异

- 脚本版输出在项目 `output/`。
- 插件版输出在浏览器下载目录 `fp-check-extension/`。
- 插件版不保存验证码图片和每票 `result.json`。
- 查验结果优先通过 `html2canvas` 保存为 `result-modal-full.png`；如果失败，会退回保存当前可视页面截图 `result-page.png`。
- 插件版验证码固定走人工输入。
# NKY-Fp-Check-Ext
