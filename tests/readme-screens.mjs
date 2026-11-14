// Makes docs/screens.png for the README: four screens with made-up but
// realistic answers, on the local fake database.
// Run: npm run screens   (needs Playwright and Python's Pillow)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from './server.mjs';
import { encFields } from '../js/codec.js';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const { defaultBrowserType, ...IPHONE } = devices['iPhone 13'];
const server = createServer();
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;
const DB = `${BASE}/__mock/v1/projects/x/databases/(default)/documents`;
const OUT = 'tests/screens/readme/';
fs.mkdirSync(OUT, { recursive: true });
const ET = (date, hhmm) => new Date(`${date}T${hhmm}:00-05:00`).getTime();
const put = (path, data) => fetch(`${DB}/${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: encFields(data) }) });
const card = (name, date, hhmm, answers) => ({ name, startedAt: ET(date, hhmm), doneAt: ET(date, hhmm) + 150e3, answers, updatedAt: ET(date, hhmm) });

const people = { sam: 'Sam', maya: 'Maya', dev: 'Dev', nana: 'Nana', leo: 'Leo' };
for (const [id, name] of Object.entries(people)) await put(`players/${id}`, { name });
const day = (date, letter, prompts, rolledBy, answers) => put(`days/${date}`, {
  letter, prompts, rolledBy, rolledAt: ET(date, '07:10'),
  cards: Object.fromEntries(Object.entries(answers).map(([id, a], i) => [id, card(people[id], date, `${String(7 + i).padStart(2, '0')}:15`, a)])),
});
await day('2026-11-02', 'B', ['A fruit', 'Something in the kitchen', 'A movie', 'A job or occupation', 'Something you shout'], 'Maya', {
  sam: ['Banana', 'Blender', 'Back to the Future', 'Baker', 'Bingo!'], maya: ['Blueberry', 'Butter', 'Big', 'Bus driver', 'Boo!'],
  dev: ['Banana', 'Bread box', 'Beetlejuice', 'Barber', 'Bravo!'], nana: ['Blackberry', 'Bowl', 'Bambi', 'Bookkeeper', 'Bless you!'],
});
await day('2026-11-03', 'M', ['A famous person', 'A breakfast food', 'Something in a garage', 'A reason to celebrate', 'A sport'], 'Sam', {
  sam: ['Mickey Mantle', 'Muffin', 'Mower', 'Marriage', 'Marathon'], maya: ['Marilyn Monroe', 'Maple syrup', 'Motor oil', 'Moving day', 'Mini golf'],
  dev: ['Madonna', 'Muffin', 'Mallet', 'Mardi Gras', 'Motocross'], leo: ['Mozart', 'Melon', 'Minivan', 'Monday off', 'Mountain biking'],
  nana: ['Meryl Streep', 'Marmalade', 'Mop', 'Mother’s Day', 'Mahjong'],
});
await day('2026-11-04', 'S', ['A sandwich', 'Something you hide', 'A TV show', 'An excuse for being late', 'Something at the beach'], 'Nana', {
  sam: ['Sloppy Joe', 'Snacks', 'Seinfeld', 'Slept in', 'Sandcastle'], maya: ['Sub', 'Surprise party', 'Succession', 'Snowstorm', 'Seagull'],
  dev: ['Fruit salad', 'Spare key', 'Survivor', 'Slow train', 'Sunscreen'], leo: ['Salami', 'Savings', 'Seinfeld', 'School run', 'Surfboard'],
  nana: ['Shrimp salad sandwich', 'Sweets', 'Sesame Street', 'Spilled coffee', 'Shells'],
});
// Wednesday: two people challenged "Fruit salad".
await fetch(`${DB}/days/2026-11-04?updateMask.fieldPaths=flags`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: encFields({ flags: {
  dev__0__sam: { target: 'dev', idx: 0, by: 'sam' }, dev__0__maya: { target: 'dev', idx: 0, by: 'maya' }, dev__0__nana: { target: 'dev', idx: 0, by: 'nana' },
} }) }) });
await put('days/2026-11-05', { letter: 'P', prompts: ['A pizza topping', 'Something you plug in', 'A place to hide', 'A bad habit', 'A name for a pet'], rolledBy: 'Maya', rolledAt: ET('2026-11-05', '07:02'),
  cards: { maya: card('Maya', '2026-11-05', '07:02', ['Pepperoni', 'Phone', 'Pantry', 'Procrastinating', 'Pickles']) } });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...IPHONE, deviceScaleFactor: 2, baseURL: BASE });
await ctx.clock.install({ time: ET('2026-11-05', '08:30') });
const page = await ctx.newPage();
const snap = async (name) => { await page.waitForTimeout(350); await page.evaluate(() => document.querySelector('.confetti')?.remove()); await page.screenshot({ path: `${OUT}${name}.png` }); };
await page.goto('/');
await page.fill('#code', 'petersel');
await page.click('text=Come on in');
await page.click('.chip[data-name="Sam"]');
await page.waitForSelector('[data-act=start]');
for (let i = 0; i < 12; i++) { await page.clock.runFor(500); await page.waitForTimeout(40); } // history loads -> streaks
await page.goto('/#/');
await snap('1-today');

await page.click('[data-act=start]');
for (let i = 0; i < 24 && !(await page.$('.play .answers')); i++) { await page.clock.runFor(250); await page.waitForTimeout(20); }
await page.clock.runFor(1000);
const typed = ['Pineapple', 'Popcorn popper', 'Pillow fort'];
for (let i = 0; i < typed.length; i++) { await page.click(`.answers input[data-i="${i}"]`); await page.keyboard.type(typed[i]); }
await page.click('.answers input[data-i="3"]');
await page.keyboard.type('Pro');
await page.clock.runFor(38_000);
await snap('2-play');

await page.goto('/#/yesterday');
await page.waitForSelector('.day-head');
await snap('3-results');
await page.evaluate(() => document.querySelector('.card.prompt').scrollIntoView({ block: 'start' }));
await page.evaluate(() => window.scrollBy(0, -70));
await snap('4-answers');
await browser.close();
server.close();

execFileSync('python3', ['-c', `
from PIL import Image
ims=[Image.open('${OUT}%s.png' % n).convert('RGB') for n in ['1-today','2-play','3-results','4-answers']]
gap=36
W=sum(i.width for i in ims)+gap*(len(ims)+1); H=max(i.height for i in ims)+gap*2
S=Image.new('RGB',(W,H),'#e9dfcf'); x=gap
for i in ims:
    S.paste(i,(x,gap)); x+=i.width+gap
S=S.resize((W//2,H//2), Image.LANCZOS); S.save('docs/screens.png', optimize=True); print('docs/screens.png', S.size)
`], { stdio: 'inherit' });
