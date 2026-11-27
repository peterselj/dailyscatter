// Checks firestore.rules against Google's Firestore emulator, with the real clock.
// Run: npm run test:rules  (needs Java; downloads the Firebase CLI and emulator the
// first time). Without the emulator these tests are skipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encFields, decFields } from '../js/codec.js';
import * as T from '../js/time.js';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const skip = HOST ? false : 'set FIRESTORE_EMULATOR_HOST (run under the Firestore emulator)';
const ROOT = 'projects/dailyscatter-f0771/databases/(default)/documents';
const BASE = `http://${HOST}/v1/${ROOT}`;
const OWNER = { Authorization: 'Bearer owner' }; // the emulator's rules bypass, for setting up

async function req(method, url, body, headers = {}) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json };
}
const seed = (path, data) => req('PATCH', `${BASE}/${path}`, { fields: encFields(data) }, OWNER);
const read = async (path) => decFields((await req('GET', `${BASE}/${path}`, null, OWNER)).json.fields);

// What the app sends (js/db.js): a masked update, optionally with server-time fields.
function write(path, data, mask, serverTime = []) {
  const w = { update: { name: `${ROOT}/${path}`, fields: encFields(data) }, updateMask: { fieldPaths: mask }, currentDocument: { exists: true } };
  if (serverTime.length) w.updateTransforms = serverTime.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' }));
  return req('POST', `${BASE}:commit`, { writes: [w] });
}
const start = (day, pid) => write(`days/${day}`, { cards: { [pid]: { name: pid, startedAt: Date.now(), answers: ['', '', '', '', ''], updatedAt: Date.now(), skipped: false } }, editing: pid }, [`cards.${pid}`, 'editing'], [`cards.${pid}.serverStartedAt`]);
const save = (day, pid, fields) => write(`days/${day}`, { cards: { [pid]: fields }, editing: pid }, [...Object.keys(fields).map((k) => `cards.${pid}.${k}`), 'editing']);

const today = T.dayId();
const ROLL = { letter: 'B', prompts: ['a', 'b', 'c', 'd', 'e'], rolledBy: 'Josh', rolledAt: 1 };
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
// Today's day document, rolled and (re)set for each test.
async function fresh(extra = {}) {
  await seed(`days/${today}`, { ...ROLL, ...extra });
  return today;
}

test('a timed card: the database stamps the start, answers save while the clock runs', { skip }, async () => {
  const day = await fresh();
  const r = await start(day, 'josh');
  assert.ok(r.ok, JSON.stringify(r.json));
  const card = (await read(`days/${day}`)).cards.josh;
  assert.ok(Math.abs(card.serverStartedAt - Date.now()) < 10_000, 'stamped by the database');
  assert.ok((await save(day, 'josh', { answers: ['Bear', '', '', '', ''], updatedAt: Date.now() })).ok);
  assert.ok((await save(day, 'josh', { answers: ['Bear', 'Bob', '', '', ''], doneAt: Date.now(), updatedAt: Date.now() })).ok, 'lock in');
  assert.equal((await save(day, 'josh', { answers: ['Bear', 'Bob', 'Boat', '', ''], updatedAt: Date.now() })).status, 403, 'no changes after I\'m done');
  assert.ok((await save(day, 'josh', { updatedAt: Date.now() })).ok, 'touching the card without changing answers is fine');
});

test('a phone can\'t choose its own start time, or restart', { skip }, async () => {
  const day = await fresh();
  const forged = await write(`days/${day}`, { cards: { zach: { name: 'zach', startedAt: Date.now(), serverStartedAt: Date.now(), answers: [], updatedAt: 1, skipped: false } }, editing: 'zach' }, ['cards.zach', 'editing']);
  assert.equal(forged.status, 403, 'start without the database stamp');
  assert.ok((await start(day, 'zach')).ok);
  assert.equal((await start(day, 'zach')).status, 403, 'restart the clock');
  assert.equal((await save(day, 'zach', { skipped: true })).status, 403, 'skip (only helper players can)');
});

test('answers lock when the timer runs out, with a few minutes\' grace', { skip }, async () => {
  const card = { name: 'x', startedAt: 1, answers: ['', '', '', '', ''], updatedAt: 1, skipped: false };
  const fields = encFields({ ...ROLL, cards: { inTime: card, late: card } });
  // Started 4 and 7 minutes ago, by the database's clock (a 3:00 timer + 3:00 grace).
  for (const [pid, min] of [['inTime', 4], ['late', 7]]) fields.cards.mapValue.fields[pid].mapValue.fields.serverStartedAt = { timestampValue: ago(min) };
  await req('PATCH', `${BASE}/days/${today}`, { fields }, OWNER);
  assert.ok((await save(today, 'inTime', { answers: ['Bear', '', '', '', ''], updatedAt: Date.now() })).ok, 'still saves at 4 minutes');
  assert.equal((await save(today, 'late', { answers: ['Bear', '', '', '', ''], updatedAt: Date.now() })).status, 403, 'refused at 7 minutes');
});

test('cards can\'t change after the day ends, or be removed', { skip }, async () => {
  const old = T.addDays(today, -2);
  await seed(`days/${old}`, { ...ROLL, cards: { kenny: { name: 'Kenny', assisted: true, answers: ['', '', '', '', ''], updatedAt: 1 } } });
  assert.equal((await save(old, 'kenny', { answers: ['Bear', '', '', '', ''] })).status, 403);
  const day = await fresh();
  assert.ok((await start(day, 'sara')).ok);
  const removed = await write(`days/${day}`, { editing: 'sara' }, ['cards.sara', 'editing']);
  assert.equal(removed.status, 403);
});

test('one card per write, named in editing', { skip }, async () => {
  const day = await fresh();
  assert.ok((await start(day, 'josh')).ok);
  const sneaky = await write(`days/${day}`, { cards: { josh: { answers: ['x', '', '', '', ''] } }, editing: 'zach' }, ['cards.josh.answers', 'editing']);
  assert.equal(sneaky.status, 403);
});

test('helper players (Kenny): no timer, can skip, until the day ends', { skip }, async () => {
  const day = await fresh();
  const r = await write(`days/${day}`, { cards: { kenny: { name: 'Kenny', assisted: true, skipped: true, answers: ['', '', '', '', ''], updatedAt: 1 } }, editing: 'kenny' }, ['cards.kenny', 'editing']);
  assert.ok(r.ok, JSON.stringify(r.json));
  assert.ok((await save(day, 'kenny', { skipped: false, startedAt: Date.now() })).ok);
  assert.ok((await save(day, 'kenny', { answers: ['Bear', '', '', '', ''] })).ok);
});

test('cards started before these rules can still be finished that day', { skip }, async () => {
  const day = await fresh({ cards: { lois: { name: 'Lois', startedAt: Date.now() - 60_000, answers: ['', '', '', '', ''], updatedAt: 1, skipped: false } } });
  assert.ok((await save(day, 'lois', { answers: ['Bear', '', '', '', ''], updatedAt: Date.now() })).ok);
});

test('flags, merges and overrides still work (no card changes)', { skip }, async () => {
  const day = await fresh();
  const r = await write(`days/${day}`, { flags: { zach__1__josh: { target: 'zach', idx: 1, by: 'josh', at: 1 } } }, ['flags.zach__1__josh']);
  assert.ok(r.ok, JSON.stringify(r.json));
});
