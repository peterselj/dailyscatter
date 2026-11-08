// Game actions: everything that reads or writes the database.
import * as db from './db.js?v=202611080146';
import * as T from './time.js?v=202611080146';
import { promptsFor, rollLetter, SPECIAL_CARDS } from './prompts.js?v=202611080146';
import { flagKey, mergeKey, overrideKey, PROMPTS_PER_CARD } from './scoring.js?v=202611080146';
import { TIMER_SECONDS, ASSISTED_PLAYERS } from './config.js?v=202611080146';
import { PLAYTEST } from './mode.js?v=202611080146';
import { revealTime, stillPlaying } from './reveal.js?v=202611080146';

// Playtest data lives in its own collections so it never mixes with real games.
const DAYS = PLAYTEST ? 'pt_days' : 'days';
const PLAYERS = PLAYTEST ? 'pt_players' : 'players';
const CLOCK = 'pt_meta/clock';
const FAMILY = PLAYTEST ? 'pt_meta/family' : 'meta/family';

// Cache of day documents: id -> data, or null if nobody has rolled that day.
export const days = {};

const dayPath = (id) => `${DAYS}/${id}`;

export async function loadDay(id) {
  days[id] = await db.getDoc(dayPath(id));
  return days[id];
}

// Loads a week's days up to `upTo`. With `onlyFresh`, days already cached are
// reused and only the listed ids are re-fetched (saves reads when polling).
export async function loadWeek(wid, upTo, { onlyFresh } = {}) {
  const ids = T.weekDays(wid).filter((id) => id <= upTo);
  const need = onlyFresh ? ids.filter((id) => !(id in days) || onlyFresh.includes(id)) : ids;
  await Promise.all(need.map(loadDay));
  return ids;
}

export async function loadAllDays() {
  const list = await db.listDocs(DAYS);
  for (const { id, data } of list) days[id] = data;
  return list.map((d) => d.id).sort();
}

export async function listPlayers() {
  return (await db.listDocs(PLAYERS)).map(({ id, data }) => ({ id, name: data.name || id }));
}

export async function savePlayer(id, name) {
  await db.setDoc(`${PLAYERS}/${id}`, { name, lastSeen: Date.now() }, { mask: ['name', 'lastSeen'] });
}

// "Josh" -> "josh"; "Mary Ann" -> "maryann". Null if nothing usable.
export function playerId(name) {
  const id = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!id) return null;
  return /^[a-z]/.test(id) ? id.slice(0, 24) : `p${id}`.slice(0, 24);
}

export const assistedById = (id) => ASSISTED_PLAYERS.find((p) => p.id === id) ?? null;

// First person of the day rolls the letter. If two people roll at the same
// moment, the database accepts only the first; everyone gets that letter.
export async function rollDay(today, rollerName) {
  const wid = T.weekId(today);
  await loadWeek(wid, today);
  if (days[today]?.letter) return days[today];
  const used = T.weekDays(wid).filter((d) => d !== today).map((d) => days[d]?.letter).filter(Boolean);
  const special = SPECIAL_CARDS[today];
  const data = {
    letter: special?.letter ?? rollLetter(used),
    prompts: promptsFor(today, wid, T.weekdayIndex(today)),
    rolledBy: rollerName,
    rolledAt: Date.now(),
  };
  if (special?.title) data.title = special.title;
  try {
    days[today] = await db.setDoc(dayPath(today), data, { exists: false });
  } catch (e) {
    if (e.status === 0) throw e;
    const d = await loadDay(today); // someone beat us to it
    if (!d?.letter) throw e;
  }
  return days[today];
}

// --- Time: real days close at midnight ET; playtest days close when someone taps Reveal.

let dayShift = 0; // playtest only: how many days "Next day" has moved us forward

export async function loadClock() {
  if (!PLAYTEST) return;
  dayShift = (await db.getDoc(CLOCK))?.dayShift ?? 0;
}

export function todayId() {
  return PLAYTEST ? T.addDays(T.dayId(), dayShift) : T.dayId();
}

// --- Family: who counts toward "everyone's done" (admin sets it in Settings).
// Results come out early once all of them have finished the day's card.
export let family = [];

export async function loadFamily() {
  const doc = await db.getDoc(FAMILY);
  family = (doc?.members ?? []).filter((id) => !assistedById(id));
  return family;
}

export async function saveFamily(members) {
  const clean = [...new Set(members)].filter((id) => !assistedById(id));
  await db.setDoc(FAMILY, { members: clean, updatedAt: Date.now() });
  family = clean;
}

export function waitingOn(dayId, now = Date.now()) {
  return stillPlaying(days[dayId], dayId, family, now);
}

export function lockAt(dayId) {
  let base;
  if (!PLAYTEST) base = T.lockTime(dayId);
  else if (dayId < todayId()) return -Infinity;
  else base = days[dayId]?.revealedAt ?? Infinity;
  return revealTime(days[dayId], dayId, family, base);
}

export function isRevealed(dayId, now = Date.now()) {
  return now >= lockAt(dayId);
}

export async function revealNow(dayId) {
  if (days[dayId]) await writeDay(dayId, { revealedAt: Date.now() }, ['revealedAt']);
}

export async function nextDay() {
  await loadClock();
  dayShift += 1;
  await db.setDoc(CLOCK, { dayShift });
}

export async function wipePlaytest() {
  if (!PLAYTEST) return;
  const list = await db.listDocs(DAYS);
  await Promise.all(list.map(({ id }) => db.deleteDoc(`${DAYS}/${id}`)));
  await db.deleteDoc(CLOCK);
  const posts = await db.listDocs('pt_posts');
  await Promise.all(posts.map(({ id }) => db.deleteDoc(`pt_posts/${id}`)));
  for (const k of Object.keys(days)) delete days[k];
  dayShift = 0;
}

export function deadline(card, dayId) {
  const lock = lockAt(dayId);
  if (!card?.startedAt) return lock;
  if (card.assisted) return lock;
  return Math.min(card.startedAt + TIMER_SECONDS * 1000, lock, card.doneAt ?? Infinity);
}

export function cardOpen(card, dayId, now = Date.now()) {
  return !!card?.startedAt && !card.skipped && now < deadline(card, dayId);
}

// Starts (or resumes) a player's card. Returns the card.
export async function startCard(today, pid, name, { assisted = false, delayMs = 0 } = {}) {
  const day = await loadDay(today);
  const existing = day?.cards?.[pid];
  if (existing?.startedAt && !existing.skipped) return existing;
  const now = Date.now();
  const card = {
    name,
    startedAt: now + delayMs,
    answers: existing?.answers?.length ? existing.answers : Array(PROMPTS_PER_CARD).fill(''),
    updatedAt: now,
    skipped: false,
  };
  if (assisted) card.assisted = true;
  await writeDay(today, { cards: { [pid]: card } }, [`cards.${pid}`]);
  return card;
}

export async function saveCardFields(dayId, pid, fields) {
  const f = { ...fields, updatedAt: Date.now() };
  await writeDay(dayId, { cards: { [pid]: f } }, Object.keys(f).map((k) => `cards.${pid}.${k}`));
}

export async function setSkipped(today, pid, name, skipped) {
  const card = days[today]?.cards?.[pid];
  if (card) return saveCardFields(today, pid, { skipped });
  return writeDay(today, {
    cards: { [pid]: { name, assisted: true, skipped, answers: Array(PROMPTS_PER_CARD).fill(''), updatedAt: Date.now() } },
  }, [`cards.${pid}`]);
}

// --- Review: flags, "same as" merges, admin overrides ----------------------

export async function setFlag(dayId, target, idx, by, on) {
  const k = flagKey(target, idx, by);
  await writeDay(dayId, on ? { flags: { [k]: { target, idx, by, at: Date.now() } } } : {}, [`flags.${k}`]);
}

export async function clearFlags(dayId, target, idx) {
  const keys = Object.keys(days[dayId]?.flags ?? {}).filter((k) => k.startsWith(`${target}__${idx}__`));
  if (keys.length) await writeDay(dayId, {}, keys.map((k) => `flags.${k}`));
}

export async function suggestMerge(dayId, idx, a, b, by, confirmed) {
  const k = mergeKey(idx, a, b);
  const [x, y] = [a, b].sort();
  await writeDay(dayId, { merges: { [k]: { idx, a: x, b: y, by, confirmed, at: Date.now() } } }, [`merges.${k}`]);
}

export async function confirmMerge(dayId, key) {
  await writeDay(dayId, { merges: { [key]: { confirmed: true } } }, [`merges.${key}.confirmed`]);
}

export async function removeMerge(dayId, key) {
  await writeDay(dayId, {}, [`merges.${key}`]);
}

export async function setOverride(dayId, target, idx, points, by) {
  const k = overrideKey(target, idx);
  await writeDay(dayId, points === null ? {} : { overrides: { [k]: { target, idx, points, by, at: Date.now() } } }, [`overrides.${k}`]);
}

async function writeDay(dayId, data, mask) {
  days[dayId] = await db.setDoc(dayPath(dayId), data, { mask, exists: true });
  return days[dayId];
}
