// Game actions: everything that reads or writes the database.
import * as db from './db.js?v=202611262253';
import * as T from './time.js?v=202611262253';
import { promptsFor, swapRepeats, rollLetter, SPECIAL_CARDS, withSpecial, timerFor, promptCount } from './prompts.js?v=202611262253';
import { flagKey, mergeKey, overrideKey, applyNames } from './scoring.js?v=202611262253';
import { ASSISTED_PLAYERS } from './config.js?v=202611262253';
import { PLAYTEST } from './mode.js?v=202611262253';
import { revealTime, stillPlaying } from './reveal.js?v=202611262253';

// Playtest data lives in its own collections so it never mixes with real games.
const DAYS = PLAYTEST ? 'pt_days' : 'days';
const PLAYERS = PLAYTEST ? 'pt_players' : 'players';
const CLOCK = 'pt_meta/clock';
const FAMILY = PLAYTEST ? 'pt_meta/family' : 'meta/family';

// Cache of day documents: id -> data, or null if nobody has rolled that day.
export const days = {};

const dayPath = (id) => `${DAYS}/${id}`;

// Current display names (player id -> name). An admin can rename people; days
// are shown with these names whatever name the card was saved under.
export const names = {};

// Day documents exactly as the database sent them (before names and special
// rules are applied), so settled days can be kept on this phone.
const fetched = {};

function keep(id, data) {
  fetched[id] = data ? structuredClone(data) : null;
  days[id] = withSpecial(id, applyNames(data, names));
  return days[id];
}

export async function loadDay(id) {
  return keep(id, await db.getDoc(dayPath(id)));
}

// Loads a week's days up to `upTo`. With `onlyFresh`, days already cached are
// reused and only the listed ids are re-fetched (saves reads when polling).
export async function loadWeek(wid, upTo, { onlyFresh } = {}) {
  const ids = T.weekDays(wid).filter((id) => id <= upTo);
  const need = onlyFresh ? ids.filter((id) => !(id in days) || onlyFresh.includes(id)) : ids;
  await Promise.all(need.map(loadDay));
  return ids;
}

// --- History (every past day, for streaks, the hall of fame and Past weeks) ---
//
// The database charges for every document read, and listing all days reads every
// day ever played: that grew without limit. So days old enough to be settled are
// kept on this phone, and a visit only re-reads the recent ones.
//   - Days in the last FRESH_DAYS are always re-read: flags and admin fixes still change them.
//   - Everything is re-read from scratch once a month (or after a long time away),
//     which picks up the rare fix to an old day.
const FRESH_DAYS = 14;
const MAX_GAP_DAYS = 45;
const FULL_RELOAD_MS = 30 * 86_400_000;
const HISTORY_KEY = `ds.history.v1.${DAYS}`;
const RECENT_MS = 5 * 60_000; // within one visit, don't re-read history more than this often

function readHistory() {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return h && typeof h.through === 'string' && h.days && typeof h.days === 'object' ? h : null;
  } catch { return null; }
}

function saveHistory(through, fullAt) {
  const kept = {};
  for (const [id, data] of Object.entries(fetched)) if (id <= through && data) kept[id] = data;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify({ through, fullAt, days: kept })); } catch { /* full or private mode: just re-read next time */ }
}

function forgetHistory() {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
}

let historyAt = 0;

/** Loads every day played so far. Returns the ids of days that have a document, sorted. */
export async function loadAllDays({ now = Date.now() } = {}) {
  const today = todayId();
  const through = T.addDays(today, -FRESH_DAYS - 1); // the newest day treated as settled
  if (now - historyAt > RECENT_MS) {
    const h = readHistory();
    const usable = h && now - (h.fullAt ?? 0) < FULL_RELOAD_MS && h.through <= today && h.through >= T.addDays(today, -MAX_GAP_DAYS);
    if (usable) {
      for (const [id, data] of Object.entries(h.days)) if (!(id in days)) keep(id, data);
      const recent = [];
      for (let d = T.addDays(h.through < through ? h.through : through, 1); d <= today; d = T.addDays(d, 1)) recent.push(d);
      await Promise.all(recent.map(loadDay));
      saveHistory(through, h.fullAt);
    } else {
      const list = await db.listDocs(DAYS);
      for (const { id, data } of list) keep(id, data);
      saveHistory(through, now);
    }
    historyAt = now;
  }
  return Object.keys(days).filter((id) => days[id] && id <= today).sort();
}

export async function listPlayers() {
  const list = (await db.listDocs(PLAYERS)).map(({ id, data }) => ({ id, name: data.name || id }));
  for (const p of list) names[p.id] = p.name;
  for (const d of Object.values(days)) applyNames(d, names);
  return list;
}

export async function renamePlayer(id, name) {
  await db.setDoc(`${PLAYERS}/${id}`, { name }, { mask: ['name'] });
  names[id] = name;
  for (const d of Object.values(days)) applyNames(d, names);
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
  const earlier = T.weekDays(wid).filter((d) => d !== today);
  const used = earlier.map((d) => days[d]?.letter).filter(Boolean);
  const special = SPECIAL_CARDS[today];
  const data = {
    letter: special?.letter ?? rollLetter(used),
    prompts: special?.prompts?.length >= 5
      ? promptsFor(today, wid, T.weekdayIndex(today))
      : swapRepeats(promptsFor(today, wid, T.weekdayIndex(today)), earlier.flatMap((d) => days[d]?.prompts ?? []), today),
    rolledBy: rollerName,
    rolledAt: Date.now(),
  };
  if (special?.title) data.title = special.title;
  try {
    keep(today, await db.setDoc(dayPath(today), data, { exists: false }));
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
  for (const k of Object.keys(fetched)) delete fetched[k];
  forgetHistory();
  historyAt = 0;
  dayShift = 0;
}

export function deadline(card, dayId) {
  const lock = lockAt(dayId);
  if (!card?.startedAt) return lock;
  if (card.assisted) return lock;
  return Math.min(card.startedAt + timerFor(dayId) * 1000, lock, card.doneAt ?? Infinity);
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
    answers: existing?.answers?.length ? existing.answers : Array(promptCount(today)).fill(''),
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
    cards: { [pid]: { name, assisted: true, skipped, answers: Array(promptCount(today)).fill(''), updatedAt: Date.now() } },
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
  return keep(dayId, await db.setDoc(dayPath(dayId), data, { mask, exists: true }));
}
