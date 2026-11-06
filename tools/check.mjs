// index.html を Playwright (Chromium) で開き、PC 1440x900 と iPhone 14 で次を確認する。
//  - コンソールのエラー・警告、読み込み失敗が無いこと
//  - 各ページ（①・③・④、④は 0/50/100%）でキャンバスが描画されていること
//  - 横スクロールが無いこと、表示中の文字が左右 16px 以上内側にあること
//
// 使い方:
//   npm i -g playwright && npx playwright install chromium   （未導入の場合）
//   node tools/check.mjs [スクリーンショット出力先]
// 既存の playwright を使う場合は PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs を指定。
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'interster-shots'));
fs.mkdirSync(OUT, { recursive: true });

// ヘッドレスでも WebGL を使えるよう SwiftShader（ソフトウェア描画、数 fps）を有効化
// Chromium をダウンロードできない環境では PW_CHANNEL=chrome でインストール済みの Google Chrome を使う
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL || 'chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const { defaultBrowserType, ...iphone } = devices['iPhone 14'];
const configs = [['pc', { viewport: { width: 1440, height: 900 } }], ['sp', iphone]];

let fail = 0;
for (const [name, opts] of configs) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => errs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', r => errs.push(`[requestfailed] ${r.url()}`));
  page.on('response', r => { if (r.status() >= 400) errs.push(`[http ${r.status()}] ${r.url()}`); });
  await page.goto(PAGE_URL, { waitUntil: 'networkidle' });

  const bgs = await page.evaluate(() => [...document.querySelectorAll('.bg')]
    .map(e => getComputedStyle(e).backgroundImage.split('/').pop().replace(/["')]/g, '')));
  console.log(name, JSON.stringify(opts.viewport), 'bg:', bgs.join(' '));

  const H = await page.evaluate(() => innerHeight);
  const top = id => page.evaluate(id => document.getElementById(id).offsetTop, id);
  const p3 = await top('p3');
  const p4 = await page.evaluate(() => ({ top: document.getElementById('p4').offsetTop, h: document.getElementById('p4').offsetHeight }));
  // ① 開始 / 文字化完了 / 吸い込み途中 → ③ / ③でスクロール中（バラけ）/ 止めた後（戻る）→ ④ 0/50/100%
  // scatter=true の地点は、少しずつ連続スクロールした直後（粒子がバラけている状態）に撮る
  const stops = [
    ['p1-0', 0, 1500], ['p1-text', H * 0.5, 2500], ['p1-suck', H * 1.1, 2500], ['p3', p3, 3000],
    ['p3-scatter', p3, 0, true], ['p3-return', p3, 4000],
    ['p4-0', p4.top, 3000], ['p4-50', p4.top + (p4.h - H) * 0.5, 3000], ['p4-100', p4.top + (p4.h - H), 3000],
  ];
  for (const [n, y, wait, scatter] of stops) {
    if (scatter) {
      for (let i = 0; i < 8; i++) { await page.evaluate(d => scrollBy(0, d), i % 2 ? -60 : 60); await page.waitForTimeout(120); }
    } else {
      await page.evaluate(y => scrollTo(0, y), y);
    }
    await page.waitForTimeout(wait);
    if (scatter) {
      const s = await page.evaluate(() => window.__scatter?.() ?? -1);
      console.log(`  ${n.padEnd(9)} scatter=${s.toFixed(2)}`);
    }
    const lay = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const vis = [...document.querySelectorAll('.label, h2, #p4 .panel p')].filter(e => {
        const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < vw;
      });
      // 要素の箱ではなく文字の実際の範囲で余白を測る
      const bad = vis.map(e => {
        const rg = document.createRange(); rg.selectNodeContents(e); const r = rg.getBoundingClientRect();
        return { t: e.textContent.trim(), l: Math.round(r.left), r: Math.round(vw - r.right) };
      }).filter(o => o.l < 16 || o.r < 16);
      return { sw: document.documentElement.scrollWidth, vw, bad };
    });
    await page.screenshot({ path: path.join(OUT, `${name}-${n}.png`) });

    // 背景画像と文字を隠し、キャンバスだけで光っている画素の割合を測る
    const hide = await page.addStyleTag({ content: '.bg,.center,.label,.track{visibility:hidden!important} html,body{background:transparent!important}' });
    const buf = await page.screenshot({ omitBackground: true });
    await hide.evaluate(e => e.remove());
    const lit = await page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const cv = new OffscreenCanvas(img.width, img.height); const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data; let k = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 10 && d[i] + d[i + 1] + d[i + 2] > 60) k++;
      return k / (d.length / 4);
    }, buf.toString('base64'));

    const ok = lit > 0.002 && lay.sw <= lay.vw && !lay.bad.length;
    if (!ok) fail++;
    console.log(`  ${n.padEnd(9)} canvas lit=${(lit * 100).toFixed(2)}%  scrollW=${lay.sw}/${lay.vw}`
      + (lay.bad.length ? `  MARGIN<16: ${JSON.stringify(lay.bad)}` : '') + (ok ? '  OK' : '  NG'));
  }
  console.log('  console errors/warnings:', errs.length ? '\n    ' + errs.join('\n    ') : 'none');
  if (errs.length) fail++;
  await ctx.close();
}
await browser.close();
console.log(`screenshots: ${OUT}`);
console.log(fail ? `FAILURES: ${fail}` : 'ALL CHECKS PASSED');
process.exit(fail ? 1 : 0);
