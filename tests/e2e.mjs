// End-to-end test: several family members play full days on emulated iPhones
// against the local mock database, with a controlled clock.
// Run: node tests/e2e.mjs   (screenshots land in tests/screens/)
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from './server.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const { defaultBrowserType, ...IPHONE } = devices['iPhone 13'];

const server = createServer();
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;
fs.mkdirSync('tests/screens', { recursive: true });

const browser = await chromium.launch();
const errors = [];
let step = 0;
const log = (msg) => console.log(`  ${String(++step).padStart(2)}. ${msg}`);

// Thursday Nov 5 2026 (EST, UTC-5)
const ET = (hhmm, date = '2026-11-05') => new Date(`${date}T${hhmm}:00-05:00`);

async function player(label, time, path = '/', state) {
  const ctx = await browser.newContext({ ...IPHONE, deviceScaleFactor: 2, baseURL: BASE, storageState: state });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ctx.clock.install({ time });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${label} console: ${m.text()}`); });
  await page.goto(path);
  return { ctx, page, label };
}

async function join(page, name, { existing = false } = {}) {
  await page.fill('#code', 'petersel');
  await page.click('text=Come on in');
  if (existing) await page.click(`.chip[data-name="${name}"]`);
  else { await page.fill('#name', name); await page.click('text=Let’s play'); }
  await page.waitForSelector('.main .card');
}

// Advance fake time in small steps until a selector shows up.
async function runUntil(page, selector, ms = 6000) {
  for (let t = 0; t < ms; t += 250) {
    if (await page.$(selector)) return;
    await page.clock.runFor(250);
    await page.waitForTimeout(15);
  }
  await page.waitForSelector(selector, { timeout: 2000 });
}

async function saved(page) {
  await page.clock.runFor(800);
  await page.waitForSelector('.save[data-state=saved]');
}

const shot = async (page, name) => { await page.waitForTimeout(300); await page.screenshot({ path: `tests/screens/${name}.png` }); };
const text = (page) => page.evaluate(() => document.body.textContent);

try {
  console.log('Day 1 (Thu Nov 5)');

  // Josh: first of the day, rolls the letter.
  const josh = await player('josh', ET('08:30'));
  await shot(josh.page, '01-gate');
  await join(josh.page, 'Josh');
  assert.match(await text(josh.page), /You’re first today/);
  await shot(josh.page, '02-first-of-day');
  await josh.page.click('[data-act=start]');
  await runUntil(josh.page, '.play .answers');
  const L = (await josh.page.innerText('.play .letter-tile')).trim();
  assert.match(L, /^[ABCDEFGHIJKLMNOPRSTW]$/);
  log(`Josh rolled the letter ${L} and his timer started`);
  assert.match(await josh.page.innerText('.clock .t'), /^(3:00|2:5\d)$/);

  const J = [`${L}alpha`, `${L}one ${L}two`, `${L}shared`, 'Xylophone', ''];
  const inputs = await josh.page.$$('.answers input');
  for (let i = 0; i < 5; i++) if (J[i]) await inputs[i].fill(J[i]);
  await saved(josh.page);
  await shot(josh.page, '03-playing');
  log('Josh typed answers; they autosaved');

  // Reload mid-timer: card resumes with the same clock and answers.
  await josh.page.reload();
  await josh.page.waitForSelector('.play .answers');
  assert.equal(await josh.page.inputValue('.answers input[data-i="1"]'), J[1]);
  await josh.page.goto('/#/');
  await josh.page.waitForSelector('.card.hero');
  assert.match(await text(josh.page), /still open/);
  await josh.page.click('[data-act=resume]');
  await josh.page.waitForSelector('.play .answers');
  assert.equal(await josh.page.inputValue('.answers input[data-i="1"]'), J[1]);
  log('Reloading mid-game resumes the card with answers intact');

  await josh.page.clock.runFor(185_000);
  await josh.page.waitForSelector('.play.over');
  assert.equal(await josh.page.isDisabled('.answers input[data-i="0"]'), true);
  assert.match(await text(josh.page), /Time’s up/);
  await shot(josh.page, '04-times-up');
  log('After 3 minutes the card locks');
  await josh.page.click('text=Done');
  await josh.page.waitForSelector('.eyebrow.ok');
  await shot(josh.page, '05-locked-in');

  // Zach: second, no roll; finishes early.
  const zach = await player('zach', ET('09:10'));
  await join(zach.page, 'Zach');
  assert.match(await text(zach.page), /rolled by Josh/i);
  assert.ok(!(await text(zach.page)).includes(`${L}alpha`), 'answers are hidden before 1pm');
  await zach.page.click('[data-act=start]');
  await runUntil(zach.page, '.play .answers');
  assert.equal((await zach.page.innerText('.play .letter-tile')).trim(), L, 'same letter for everyone');
  const Z = [`${L}beta`, `${L}three`, `The ${L}shared!`, `${L}four`, `${L}five ${L}six ${L}seven`];
  const zi = await zach.page.$$('.answers input');
  for (let i = 0; i < 5; i++) await zi[i].fill(Z[i]);
  await saved(zach.page);
  await zach.page.click('[data-act=done-early]');
  await zach.page.waitForSelector('.play.over');
  assert.match(await text(zach.page), /Locked in!/);
  log('Zach got the same letter and locked in early');

  // Lowey (Mom): plays her own card, then Kenny's.
  const mom = await player('lowey', ET('10:00'));
  await join(mom.page, 'Lowey');
  await mom.page.click('[data-act=start]');
  await runUntil(mom.page, '.play .answers');
  const M = [`${L}gamma`, `${L}three`, '', `${L}eight`, `${L}nine`];
  const mi = await mom.page.$$('.answers input');
  for (let i = 0; i < 5; i++) if (M[i]) await mi[i].fill(M[i]);
  await saved(mom.page);
  await mom.page.clock.runFor(181_000);
  await mom.page.waitForSelector('.play.over');
  await mom.page.click('text=Done');
  await mom.page.waitForSelector('.card.helper');
  await shot(mom.page, '06-mom-today');
  log('Mom played her card; Kenny’s card is offered below');

  await mom.page.click('.card.helper a.btn');
  await runUntil(mom.page, '.assist .ask');
  await mom.page.clock.runFor(1000); // let the letter reveal fade out
  await shot(mom.page, '07-kenny-prompt');
  assert.match(await mom.page.innerText('.ask'), /Kenny, what’s/);
  await mom.page.fill('.ask-input', `${L}alpha`); // same as Josh: both get struck
  await mom.page.click('.nav .primary');
  await mom.page.fill('.ask-input', `${L}ten`);
  await saved(mom.page);
  await mom.page.click('text=Save & close');
  await mom.page.waitForSelector('.card.helper');
  assert.match(await mom.page.innerText('.card.helper'), /2 of 5 answered/);
  log('Kenny answered 2, Mom saved and closed (he fell asleep)');

  await mom.page.clock.runFor(60 * 60_000); // an hour later
  await mom.page.click('.card.helper a.btn');
  await runUntil(mom.page, '.assist .ask');
  assert.match(await mom.page.innerText('.ask-prompt'), /.+/);
  await mom.page.fill('.ask-input', `${L}eleven ${L}twelve`);
  await mom.page.click('.nav .primary');
  await mom.page.click('.nav .primary'); // skip #4
  await mom.page.fill('.ask-input', `${L}thirteen`);
  await mom.page.click('.nav .primary');
  await mom.page.waitForSelector('.review');
  await saved(mom.page);
  await shot(mom.page, '08-kenny-review');
  await mom.page.click('text=All done');
  await mom.page.waitForSelector('.card.helper');
  log('Later, Mom finished Kenny’s card (no timer)');

  // Late player: starts at 12:58, gets only until 1pm.
  const sara = await player('sara', ET('12:58'));
  await join(sara.page, 'Sara');
  assert.match(await text(sara.page), /only 2:00 left/);
  await sara.page.click('[data-act=start]');
  await runUntil(sara.page, '.play .answers');
  await sara.page.fill('.answers input[data-i="0"]', `${L}late`);
  await saved(sara.page);
  await sara.page.clock.runFor(125_000);
  await sara.page.waitForSelector('.play.over');
  log('Sara started at 12:58 and her card locked at 1:00pm');

  // --- 1:05pm: results ---------------------------------------------------
  await josh.page.clock.setSystemTime(ET('13:05'));
  await josh.page.goto('/');
  await josh.page.waitForSelector('.day-head');
  await shot(josh.page, '09-results');
  const row = (page, pid, i) => page.$(`.ansrow[data-pid="${pid}"][data-i="${i}"]`);
  const cls = async (page, pid, i) => (await row(page, pid, i)).getAttribute('class');
  const pts = async (page, pid, i) => (await (await row(page, pid, i)).$('.pt')).innerText();
  assert.match(await cls(josh.page, 'josh', 0), /dupe/, 'Josh and Kenny both wrote alpha');
  assert.match(await cls(josh.page, 'kenny', 0), /dupe/);
  assert.match(await cls(josh.page, 'josh', 2), /dupe/, '"Lshared" matches "The Lshared!"');
  assert.match(await cls(josh.page, 'josh', 3), /invalid/);
  assert.equal(await pts(josh.page, 'josh', 1), '+2', 'two words with the letter');
  assert.equal(await pts(josh.page, 'zach', 4), '+3');
  assert.match(await cls(josh.page, 'zach', 1), /dupe/, 'Zach and Mom both wrote three');
  const standings = (await josh.page.$$eval('.standings li', (lis) => lis.map((li) => li.innerText.replace(/\s+/g, ' ')))).join('\n');
  log(`Results at 1pm:\n${standings.split('\n').filter(Boolean).map((s) => `        ${s}`).join('\n')}`);
  // josh: 0+2+0+0+0 = 2; zach: 1+0+0+1+3 = 5; lowey: 1+0+0+1+1 = 3; kenny: 0+1+2+0+1 = 4; sara: 1
  const totals = Object.fromEntries(await josh.page.$$eval('.standings li', (lis) => lis.map((li) => [li.querySelector('.nm').textContent, li.querySelector('.pts').textContent])));
  assert.deepEqual(totals, { Zach: '5', Kenny: '4', Lowey: '3', Josh: '2', Sara: '1' });

  // Zach flags Josh's 2-pointer.
  await zach.page.clock.setSystemTime(ET('13:10'));
  await zach.page.goto('/#/day/2026-11-05');
  await zach.page.waitForSelector('.day-head');
  await zach.page.click('.ansrow[data-pid="josh"][data-i="1"]');
  await zach.page.click('[data-act=flag]');
  await zach.page.waitForSelector('[data-act=flag][data-on="0"]');
  await shot(zach.page, '10-flag-sheet');
  await zach.page.click('[data-act=close]');
  assert.match(await (await row(zach.page, 'josh', 1)).innerText(), /🚩1/);
  log('Zach flagged one of Josh’s answers');

  // Mom says Zach's "beta" is the same as her "gamma" (pretend it's a typo).
  await mom.page.clock.setSystemTime(ET('13:12'));
  await mom.page.goto('/#/day/2026-11-05');
  await mom.page.waitForSelector('.day-head');
  await mom.page.click('.ansrow[data-pid="zach"][data-i="0"]');
  await mom.page.click('.same summary');
  await mom.page.click('[data-act=merge-suggest][data-other="lowey"]');
  await mom.page.waitForSelector('.merges');
  assert.match(await mom.page.innerText('.merges'), /Waiting for the admin/);
  await mom.page.click('[data-act=close]');
  assert.equal(await pts(mom.page, 'zach', 0), `+1`, 'pending merge does not change points');
  log('Mom suggested two answers are the same (pending admin)');

  // Josh unlocks admin: confirms the merge, zeroes the flagged answer.
  await josh.page.clock.setSystemTime(ET('13:15'));
  await josh.page.goto('/#/day/2026-11-05');
  await josh.page.waitForSelector('.day-head');
  await josh.page.click('[data-act=settings]');
  await josh.page.fill('[data-form=admin] input', 'wrong');
  await josh.page.click('[data-form=admin] button');
  await josh.page.waitForSelector('#toast.show');
  assert.match(await josh.page.innerText('#toast'), /Wrong admin code/);
  await josh.page.fill('[data-form=admin] input', 'Olerud');
  await josh.page.click('[data-form=admin] button');
  await josh.page.waitForSelector('#sheet:not(.open)', { state: 'attached' });
  await josh.page.waitForSelector('.day-head');
  await josh.page.click('.ansrow[data-pid="zach"][data-i="0"]');
  await josh.page.click('[data-act=merge-confirm]');
  await josh.page.waitForSelector('.merges li:has-text("confirmed")');
  await josh.page.click('[data-act=close]');
  await josh.page.click('.ansrow[data-pid="josh"][data-i="1"]');
  await josh.page.click('[data-act=override][data-pts="0"]');
  await josh.page.waitForSelector('.chip.on[data-pts="0"]');
  await shot(josh.page, '11-admin-sheet');
  await josh.page.click('[data-act=clear-flags]');
  await josh.page.waitForSelector('.sheet-card');
  await josh.page.click('[data-act=close]');
  const after = Object.fromEntries(await josh.page.$$eval('.standings li', (lis) => lis.map((li) => [li.querySelector('.nm').textContent, li.querySelector('.pts').textContent])));
  assert.deepEqual(after, { Kenny: '4', Zach: '4', Lowey: '2', Sara: '1', Josh: '0' });
  log('Admin confirmed the merge and zeroed the flagged answer; scores updated');

  // Week view + share
  await josh.page.click('a.tab[href="#/week"]');
  await josh.page.waitForSelector('.board');
  await shot(josh.page, '12-week');
  await josh.page.click('[data-act=share-week]');
  await josh.page.waitForSelector('#toast.show');
  const shared = await josh.page.evaluate(() => navigator.clipboard.readText());
  assert.match(shared, /Daily Scatter/);
  assert.match(shared, /Kenny 4/);
  log(`Share text:\n${shared.split('\n').map((s) => `        ${s}`).join('\n')}`);

  // --- Day 2 (Fri): Kenny sits out from his own page; two people roll at once.
  console.log('Day 2 (Fri Nov 6)');
  const kenny = await player('kenny-page', ET('07:00', '2026-11-06'), '/kenny.html');
  await kenny.page.fill('#code', 'petersel');
  await kenny.page.click('text=Come on in');
  await kenny.page.waitForSelector('.card.hero');
  await shot(kenny.page, '13-kenny-page');
  await kenny.page.click('[data-act=skip]');
  await kenny.page.waitForSelector('[data-act=unskip]');
  assert.match(await text(kenny.page), /sitting out today/);
  log('From Kenny’s home-screen page, Mom tapped "Not today" (that also rolled the day)');

  const lowey2 = await player('lowey2', ET('07:30', '2026-11-06'), '/', await mom.ctx.storageState());
  await lowey2.page.waitForSelector('.card.helper');
  assert.match(await lowey2.page.innerText('.card.helper'), /sitting out/);
  await lowey2.page.click('[data-act=unskip]');
  await lowey2.page.waitForSelector('.card.helper a.btn');
  log('He woke up: "Actually, let’s play" un-skips him');

  // --- Day 3 (Sat): two people roll at the same moment.
  console.log('Day 3 (Sat Nov 7)');
  const a = await player('a', ET('08:00', '2026-11-07'), '/', await josh.ctx.storageState());
  const b = await player('b', ET('08:00', '2026-11-07'), '/', await zach.ctx.storageState());
  await Promise.all([a.page.waitForSelector('[data-act=start]'), b.page.waitForSelector('[data-act=start]')]);
  await Promise.all([a.page.click('[data-act=start]'), b.page.click('[data-act=start]')]);
  await Promise.all([runUntil(a.page, '.play .answers'), runUntil(b.page, '.play .answers')]);
  const la = (await a.page.innerText('.play .letter-tile')).trim();
  const lb = (await b.page.innerText('.play .letter-tile')).trim();
  assert.equal(la, lb, 'simultaneous rolls agree on one letter');
  assert.notEqual(la, L, 'letters do not repeat within the week');
  log(`Josh and Zach hit Roll at the same moment; both got ${la}`);

  // Kenny's page sees Thursday's results too.
  await kenny.page.goto('/kenny.html#/day/2026-11-05');
  await kenny.page.waitForSelector('.day-head');

  const stats = await (await fetch(`${BASE}/__mock/stats`)).json();
  log(`Database usage for the whole test: ${stats.reads} reads, ${stats.writes} writes`);

  await shot(zach.page, '14-zach-final');
  // Dark mode check
  const dark = await browser.newContext({ ...IPHONE, deviceScaleFactor: 2, baseURL: BASE, colorScheme: 'dark', storageState: await josh.ctx.storageState() });
  await dark.clock.install({ time: ET('13:30') });
  const dp = await dark.newPage();
  await dp.goto('/#/day/2026-11-05');
  await dp.waitForSelector('.day-head');
  await shot(dp, '15-dark-results');

  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
  console.log('\nAll end-to-end checks passed.');
} catch (e) {
  console.error('\nFAILED:', e.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
