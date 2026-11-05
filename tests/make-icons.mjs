// Renders the app icons. Run: node tests/make-icons.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const icons = [
  { file: 'icon', bg: '#e0503a', letter: 'S' },
  { file: 'icon-kenny', bg: '#2c6e8a', letter: 'K' },
];
const sizes = [[512, '-512'], [192, '-192'], [180, '']];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, bg, letter } of icons) {
  for (const [size, suffix] of sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0">
      <div style="width:${size}px;height:${size}px;background:${bg};display:grid;place-items:center">
        <div style="width:62%;height:62%;border-radius:22%;background:#f4b63f;display:grid;place-items:center;
          transform:rotate(-6deg);box-shadow:inset 0 -${size * 0.03}px 0 rgba(0,0,0,.16),0 ${size * 0.02}px ${size * 0.05}px rgba(0,0,0,.25);
          font:900 ${size * 0.44}px/1 ui-rounded,'DejaVu Sans',sans-serif;color:#3a2400">${letter}</div>
      </div></body></html>`);
    const name = suffix === '' ? (file === 'icon' ? 'apple-touch-icon' : 'apple-touch-icon-kenny') : `${file}${suffix}`;
    await page.screenshot({ path: `icons/${name}.png` });
  }
}
await browser.close();
