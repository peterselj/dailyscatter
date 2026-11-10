// Phone-size check: the main screens on several iPhone sizes (dark mode).
// Fails if anything scrolls sideways, a tab label wraps, today's start button
// is hidden, or the play screen doesn't fit above the keyboard.
// Run: npm run devices   (screenshots land in tests/screens/devices/)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { createServer } from './server.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const strip = ({ defaultBrowserType, ...d }) => d;
const PHONES = [
  ['iPhone SE (2nd/3rd gen)', { ...strip(devices['iPhone SE']), viewport: { width: 375, height: 553 } }],
  ['iPhone 11', strip(devices['iPhone 11'])],
  ['iPhone 13 mini', strip(devices['iPhone 13 Mini'])],
  ['iPhone 15 Pro', { ...strip(devices['iPhone 13']), viewport: { width: 393, height: 659 } }],
  ['iPhone Pro Max', strip(devices['iPhone 14 Pro Max'])],
  ['Large text / zoom (320 wide)', { ...strip(devices['iPhone 13']), viewport: { width: 320, height: 568 } }],
];
// Phones at least this tall should also show yesterday's results without scrolling.
const TALL_ENOUGH = 620;

const server = createServer();
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;
const OUT = 'tests/screens/devices/';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const run = async (p, ms) => { await p.clock.runFor(ms); await p.waitForTimeout(20); };
const ET = (date, hhmm) => new Date(`${date}T${hhmm}:00-05:00`);

async function playCard(p, answers) {
  await p.click('[data-act=start]');
  for (let i = 0; i < 24 && !(await p.$('.play .answers')); i++) await run(p, 250);
  await run(p, 1000);
  const L = (await p.innerText('.play .letter-tile')).trim();
  const inputs = await p.$$('.answers input');
  for (let i = 0; i < inputs.length; i++) await inputs[i].fill(answers(L, i));
  await run(p, 900);
}

// Thursday: three players, so Friday has a yesterday and a week to show.
const users = {};
for (const [name, time] of [['Josh', '09:00'], ['Zach', '09:10'], ['Alyssa', '09:20']]) {
  const ctx = await browser.newContext({ ...PHONES[1][1], baseURL: BASE });
  await ctx.clock.install({ time: ET('2026-11-05', time) });
  const p = await ctx.newPage();
  await p.goto('/');
  await p.fill('#code', 'petersel');
  await p.click('text=Come on in');
  await p.fill('#name', name);
  await p.click('button.primary');
  await p.waitForSelector('[data-act=start]');
  await playCard(p, (L, i) => `${L}${name}${i}${i % 2 ? ` ${L}extra ${L}longer answer` : ''}`);
  await p.click('[data-act=done-early]');
  await p.click('[data-act=done-early]');
  await p.waitForSelector('.play.over');
  users[name] = await ctx.storageState();
  await ctx.close();
}

const problems = [];
const layout = (page) => page.evaluate(() => {
  const vw = innerWidth;
  const offside = [...document.querySelectorAll('body *')]
    .filter((el) => { const r = el.getBoundingClientRect(); return !el.closest('.confetti') && r.width && (r.right > vw + 1 || r.left < -1); })
    .map((el) => `<${el.tagName.toLowerCase()} class="${el.className}">`).slice(0, 3);
  const tabs = [...document.querySelectorAll('.tabs .tab')].map((t) => t.getBoundingClientRect().height);
  return { sideScroll: document.documentElement.scrollWidth > vw, offside, tabWrap: tabs.length > 0 && Math.max(...tabs) > 50 };
});

for (const [label, device] of PHONES) {
  const slug = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  // Fresh Friday for each phone.
  await fetch(`${BASE}/__mock/v1/projects/x/databases/(default)/documents/days/2026-11-06`, { method: 'DELETE' });
  const ctx = await browser.newContext({ ...device, deviceScaleFactor: 2, baseURL: BASE, colorScheme: 'dark', storageState: users.Josh });
  await ctx.clock.install({ time: ET('2026-11-06', '08:00') });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const { width, height } = p.viewportSize();
  const fail = (msg) => problems.push(`${label} (${width}x${height}): ${msg}`);
  const check = async (screen) => {
    await p.waitForTimeout(150);
    const m = await layout(p);
    await p.screenshot({ path: `${OUT}${slug}-${screen}.png` });
    if (m.sideScroll) fail(`${screen} scrolls sideways`);
    if (m.offside.length) fail(`${screen} has something off the edge: ${m.offside.join(', ')}`);
    if (m.tabWrap) fail(`${screen}: a tab label wraps`);
  };

  // Today, before playing: start button first and visible.
  await p.goto('/');
  await p.waitForSelector('[data-act=start]');
  const tabsTop = await p.$eval('.tabs', (el) => el.getBoundingClientRect().top);
  const startBottom = await p.$eval('[data-act=start]', (el) => el.getBoundingClientRect().bottom);
  if (startBottom > tabsTop) fail('today: the start button is hidden behind the tab bar');
  if (height >= TALL_ENOUGH) {
    const yBottom = await p.$eval('.yday', (el) => el.getBoundingClientRect().bottom);
    if (yBottom > tabsTop) fail("today: yesterday's results need a scroll");
  }
  await check('today');

  await p.goto('/#/yesterday');
  await p.waitForSelector('.day-head');
  await check('yesterday');
  await p.goto('/#/week');
  await p.waitForSelector('.board');
  await check('week');
  await p.goto('/#/past');
  await p.waitForSelector('.main .card');
  await check('past');

  // Play screen, then with the keyboard covering ~55% of the screen.
  await p.goto('/');
  await p.waitForSelector('[data-act=start]');
  await playCard(p, (L, i) => (i < 3 ? `${L}answer number ${i + 1}` : ''));
  await check('play');
  const kbH = Math.round(height * 0.45);
  await p.setViewportSize({ width, height: kbH });
  await p.waitForTimeout(50);
  await p.evaluate(() => document.body.classList.add('kb'));
  await p.focus('.answers input[data-i="3"]');
  await run(p, 600);
  const kb = await p.evaluate((h) => {
    const head = document.querySelector('.play-top').getBoundingClientRect();
    const row = document.activeElement.closest('.ans').getBoundingClientRect();
    const input = document.activeElement.getBoundingClientRect();
    return { timer: head.top >= 0, category: row.top >= head.bottom - 1, box: input.bottom <= h };
  }, kbH);
  await p.screenshot({ path: `${OUT}${slug}-play-keyboard.png` });
  if (!kb.timer) fail('play + keyboard: timer is off screen');
  if (!kb.category) fail('play + keyboard: the current category is hidden under the header');
  if (!kb.box) fail('play + keyboard: the answer box is under the keyboard');
  // Finish the card: two days in a row should show a streak on Today.
  await p.setViewportSize({ width, height });
  await p.evaluate(() => document.body.classList.remove('kb'));
  await p.click('[data-act=done-early]');
  await p.click('[data-act=done-early]');
  await p.waitForSelector('.play.over');
  await p.click('text=Done');
  await p.waitForSelector('.locked-in');
  for (let i = 0; i < 20 && !(await p.$('.locked-in .streak')); i++) await p.waitForTimeout(100);
  const streak = await p.$('.locked-in .streak');
  if (!streak || !/2-day streak/.test(await streak.innerText())) fail('today: no "2-day streak" after playing two days running');
  await check('today-after');
  if (errors.length) fail(`page errors: ${errors.join('; ')}`);
  console.log(`  ${problems.some((x) => x.startsWith(label)) ? '✗' : '✓'} ${label} (${width}x${height})`);
  await ctx.close();
}

await browser.close();
server.close();
if (problems.length) {
  console.error(`\nFAILED:\n${problems.map((x) => `  - ${x}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('\nAll phone sizes look right.');
}
