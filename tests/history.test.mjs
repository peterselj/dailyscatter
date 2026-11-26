// Run: node --test tests/history.test.mjs
// Opening the app shouldn't re-read every day ever played: settled days are kept
// on the phone, and only recent days are re-read.
import test from 'node:test';
import assert from 'node:assert/strict';

// Just enough of a browser for js/game.js: a phone's storage and a fake database.
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
globalThis.location = { hostname: 'localhost', origin: 'http://phone', search: '', pathname: '/' };

const { encFields } = await import('../js/codec.js');
const T = await import('../js/time.js');

const docs = new Map(); // 'days/2026-11-01' -> plain data
let reads = 0;
globalThis.fetch = async (url) => {
  const path = decodeURIComponent(new URL(url).pathname.split('/documents/')[1]);
  const json = (status, body) => ({ ok: status < 400, status, statusText: '', json: async () => body });
  if (!path.includes('/')) {
    const list = [...docs].filter(([k]) => k.startsWith(`${path}/`)).map(([k, data]) => ({ name: `x/documents/${k}`, fields: encFields(data) }));
    reads += Math.max(1, list.length);
    return json(200, list.length ? { documents: list } : {});
  }
  reads++;
  return docs.has(path) ? json(200, { name: `x/documents/${path}`, fields: encFields(docs.get(path)) }) : json(404, { error: { message: 'No document' } });
};

const today = T.dayId();
for (let i = 0; i < 100; i++) {
  docs.set(`days/${T.addDays(today, -i)}`, { letter: 'B', prompts: ['a', 'b', 'c', 'd', 'e'], cards: { josh: { name: 'Josh', answers: [`day ${i}`] } } });
}
let visit = 0;
const openApp = () => import(`../js/game.js?visit=${++visit}`); // a fresh page load on the same phone

test('first visit reads everything, later visits only the last two weeks', async () => {
  reads = 0;
  const first = await (await openApp()).loadAllDays();
  assert.equal(first.length, 100);
  assert.equal(reads, 100);

  reads = 0;
  const G = await openApp();
  const again = await G.loadAllDays();
  assert.deepEqual(again, first, 'same days, from the phone');
  assert.ok(reads <= 16, `re-read only recent days (read ${reads})`);
  assert.equal(G.days[T.addDays(today, -60)].cards.josh.answers[0], 'day 60', 'old days come back whole');
});

test('recent changes show up; a second call in the same visit reads nothing', async () => {
  docs.set(`days/${T.addDays(today, -3)}`, { letter: 'B', prompts: ['a', 'b', 'c', 'd', 'e'], cards: { josh: { name: 'Josh', answers: ['fixed'] } } });
  const G = await openApp();
  await G.loadAllDays();
  assert.equal(G.days[T.addDays(today, -3)].cards.josh.answers[0], 'fixed');
  reads = 0;
  await G.loadAllDays();
  assert.equal(reads, 0);
});

test('once a month everything is read again, picking up fixes to old days', async () => {
  docs.set(`days/${T.addDays(today, -60)}`, { letter: 'B', prompts: ['a', 'b', 'c', 'd', 'e'], cards: { josh: { name: 'Josh', answers: ['admin fix'] } } });
  reads = 0;
  const G = await openApp();
  await G.loadAllDays({ now: Date.now() + 31 * 86_400_000 });
  assert.equal(reads, 100);
  assert.equal(G.days[T.addDays(today, -60)].cards.josh.answers[0], 'admin fix');
});

test('a phone that broke its storage still works, it just reads everything', async () => {
  storage.set('ds.history.v1.days', '{not json');
  reads = 0;
  const all = await (await openApp()).loadAllDays();
  assert.equal(all.length, 100);
  assert.equal(reads, 100);
});
