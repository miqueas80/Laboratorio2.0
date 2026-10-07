/* Real browser acceptance: local models, cold process restart, no network.
 * Requires Playwright and a Chromium executable; no production dependency.
 * Optional: CHROMIUM_PATH, CHROMIUM_ARGS_JSON, PLAYWRIGHT_MODULE.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-offline-'));
const fixtures = path.join(root, 'tests/fixtures');
const failures = [];
let context;
const server = require('node:http').createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let relative = decodeURIComponent(url.pathname).replace(/^\/Laboratorio2\.0\//, '');
  if (!relative || relative.endsWith('/')) relative += 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end(); return;
  }
  res.setHeader('Content-Type', ({'.html':'text/html', '.js':'application/javascript', '.mjs':'application/javascript', '.wasm':'application/wasm', '.json':'application/json'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
async function launch(offline) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    permissions: ['microphone', 'camera'],
    args: [...JSON.parse(process.env.CHROMIUM_ARGS_JSON || '[]'),
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--use-file-for-fake-audio-capture=' + path.join(fixtures, 'voice-command-16k.wav')],
  });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.setOffline(offline);
  const page = context.pages()[0] || await context.newPage();
  page.on('pageerror', error => failures.push(error.message));
  return page;
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/Laboratorio2.0/`;
  let page = await launch(false);
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  assert.equal(await page.locator('#statInventory').innerText(), '111');
  await page.evaluate(() => NexusOffline.prepare('voice'));
  await page.evaluate(() => NexusOffline.prepare('vision'));
  assert.equal((await page.evaluate(() => NexusOffline.cacheStatus())).ready, true);
  await page.waitForFunction(() => document.querySelector('#taskDocs').textContent === '6', {}, {timeout:90000});
  await context.close(); context = null;

  // A new Chromium process must boot from its persistent service worker/cache.
  page = await launch(true);
  await page.goto(url);
  assert.equal(await page.evaluate(() => navigator.onLine), false);
  await page.waitForFunction(() => document.querySelector('#statInventory').textContent === '111');
  await page.waitForFunction(() => document.querySelector('#taskDocs').textContent === '6');
  assert.equal((await page.evaluate(() => NexusOffline.cacheStatus())).ready, true);
  console.log('PASS cold offline reopen: shell, 111 inventory, 6 documents, model cache');
  const engine = await page.evaluate(() => NexusOffline.prepareVision({forceWasm:true}));
  console.log('PASS real local visual runtime', JSON.stringify(engine));
  const ocr = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 300;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111'; ctx.font = 'bold 100px Arial'; ctx.textBaseline = 'middle';
    ctx.fillText('NEXUS-X-0001', 40, 150);
    const result = await NexusOffline.recognizeText(canvas);
    return {backend:result.backend, lines:result.lines, code:result.lines.map(line => normalizeLensNexusCode(line.text)).find(Boolean) || ''};
  });
  assert.equal(ocr.code, 'NEXUS-X-0001', `Local PP-OCRv6 Tiny did not read the synthetic label: ${JSON.stringify(ocr)}`);
  console.log('PASS local PP-OCRv6 Tiny label OCR', JSON.stringify(ocr));
  await page.locator('[data-view="lens"]').click();
  for (const [file, label] of [['erlenmeyer.jpg', 'Erlenmeyer'], ['beaker.jpg', 'Vaso de precipitados'], ['nexus-qr.png', 'CONFIRMADO']]) {
    await page.locator('#lensImageInput').setInputFiles(path.join(fixtures, file));
    await page.waitForFunction(() => document.querySelector('#lensImageInput').value === '', {}, {timeout:90000});
    const result = await page.locator('#lensResult').innerText();
    assert.ok(result.toLowerCase().includes(label.toLowerCase()), `${file}: ${result}`);
    if (file !== 'nexus-qr.png') assert.match(result, /HIPÓTESIS/i);
    else {
      assert.match(result, /NEXUS-X-0001/);
      assert.match(result, /[1-9]\d* documentos/);
      assert.equal(await page.locator('#lensFichaBtn').isEnabled(), true);
    }
    console.log('PASS actual offline image:', file, label);
  }
  await page.locator('[data-view="ai"]').click();
  await page.locator('#voiceToggleBtn').click();
  await page.waitForFunction(() => document.querySelector('#inventorySearch').value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('nitrico'), {}, {timeout:60000});
  assert.match(await page.locator('#voiceTranscript').innerText(), /inventario/i);
  console.log('PASS Vosk audio → wake word → agent → inventory search:', await page.locator('#voiceTranscript').innerText());
  // A stop/start must release and recreate the local worker and microphone.
  await page.locator('[data-view="ai"]').click();
  await page.locator('#voiceToggleBtn').click();
  await page.waitForFunction(() => /detenid|desactivad/i.test(document.querySelector('#voiceStatusText').textContent));
  await page.locator('#voiceToggleBtn').click();
  await page.waitForFunction(() => /local activo|offline activa/i.test(document.querySelector('#voiceStatusText').textContent), {}, {timeout:60000});
  console.log('PASS offline microphone stop/restart (synthetic audio device)');
  assert.deepEqual(failures, [], 'Uncaught browser errors');
  console.log('PHYSICAL ANDROID NOT TESTED: human speech, TTS, camera, heat, latency, hardware WebGPU');
})().catch(async error => {
  console.error(error);
  if (context) console.error('Browser diagnostics:', await context.pages().at(-1)?.evaluate(() => ({
    documents: document.querySelector('#taskDocs')?.textContent,
    repository: document.querySelector('#repoStatus')?.textContent,
    repositoryError: document.querySelector('#repoStatus')?.title,
    voice: document.querySelector('#voiceStatusText')?.textContent,
    transcript: document.querySelector('#voiceTranscript')?.textContent,
  })).catch(() => ({})), failures);
  process.exitCode = 1;
}).finally(async () => {
  if (context) await context.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(profile, {recursive:true, force:true});
});
