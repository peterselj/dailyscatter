// Posts each day's results (and the week's winner on Sundays) to the family
// WhatsApp group. Run every 10 minutes by .github/workflows/post-results.yml.
//
// When:
//   - A day's results come out at midnight, or as soon as everyone in the
//     family (set in admin Settings) has finished. They're posted right then,
//     except during quiet hours (9pm-9am Eastern): then at 9am.
//   - After Sunday's results, the week's final standings are posted too.
//   - Nothing is posted twice: each post is recorded in the database (posts/...).
//
// Sends through GREEN-API (green-api.com), a WhatsApp number linked like
// WhatsApp Web. Settings come from environment variables (GitHub secrets):
//   GREEN_API_URL       e.g. https://7103.api.greenapi.com (from your GREEN-API console)
//   GREEN_API_INSTANCE  the instance id (idInstance)
//   GREEN_API_TOKEN     the instance token (apiTokenInstance)
//   WHATSAPP_CHAT_ID    the family group's id, ending in @g.us (find it with --list-groups)
//   WHATSAPP_TEST_CHAT_ID  optional: a test chat for --playtest (practice results never go to the family group)
// Without them, the job runs as a dry run: it prints what it would post.
//
// Flags:
//   --dry-run      print what would be posted; change nothing
//   --playtest     use the playtest data (pt_*), ignore quiet hours, and post to
//                  WHATSAPP_TEST_CHAT_ID (dry run if that isn't set)
//   --list-groups  print the WhatsApp groups the linked number is in, with their ids
import { FIREBASE, ASSISTED_PLAYERS } from '../js/config.js';
import { encFields, decFields } from '../js/codec.js';
import * as T from '../js/time.js';
import { scoreDay, scoreWeek } from '../js/scoring.js';
import { resultsText, weekText } from '../js/share.js';
import { revealTime, postTime, inQuietHours } from '../js/reveal.js';

const args = new Set(process.argv.slice(2));
const PT = args.has('--playtest');
const env = process.env;
const NOW = env.NOW ? (Number(env.NOW) || Date.parse(env.NOW)) : Date.now();
const APP_URL = env.APP_URL || 'https://peterselj.github.io/dailyscatter/';
const API = (env.FIRESTORE_BASE || 'https://firestore.googleapis.com/v1/').replace(/\/?$/, '/');
const ROOT = `projects/${FIREBASE.projectId}/databases/(default)/documents`;
const GREEN = {
  url: (env.GREEN_API_URL || 'https://api.green-api.com').replace(/\/$/, ''),
  instance: env.GREEN_API_INSTANCE || '',
  token: env.GREEN_API_TOKEN || '',
  chat: (PT ? env.WHATSAPP_TEST_CHAT_ID : env.WHATSAPP_CHAT_ID) || '',
};
const configured = !!(GREEN.instance && GREEN.token);
const DRY = args.has('--dry-run') || !configured || !GREEN.chat;
const C = PT
  ? { days: 'pt_days', players: 'pt_players', posts: 'pt_posts', family: 'pt_meta/family' }
  : { days: 'days', players: 'players', posts: 'posts', family: 'meta/family' };
// Don't post results that are long overdue (e.g. right after turning this on).
const STALE_AFTER = 18 * 3600e3;

const log = (...a) => console.log(...a);

// --- Firestore over REST ------------------------------------------------------
async function call(method, path, { query = [], body } = {}) {
  const qs = new URLSearchParams([['key', FIREBASE.apiKey], ...query]);
  const res = await fetch(`${API}${ROOT}/${path}?${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
const cache = new Map();
async function get(path) {
  if (cache.has(path)) return cache.get(path);
  let data = null;
  try { data = decFields((await call('GET', path)).fields); } catch (e) { if (e.status !== 404) throw e; }
  cache.set(path, data);
  return data;
}
async function list(coll) {
  const res = await call('GET', coll, { query: [['pageSize', '300']] });
  return (res.documents ?? []).map((d) => ({ id: d.name.slice(d.name.lastIndexOf('/') + 1), data: decFields(d.fields) }));
}
async function put(path, data, exists) {
  const query = exists === undefined ? [] : [['currentDocument.exists', String(exists)]];
  await call('PATCH', path, { query, body: { fields: encFields(data) } });
}

// --- WhatsApp (GREEN-API) -------------------------------------------------------
async function green(method, body) {
  const res = await fetch(`${GREEN.url}/waInstance${GREEN.instance}/${method}/${GREEN.token}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WhatsApp ${method} failed: ${res.status} ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function sendWhatsApp(message) {
  const r = await green('sendMessage', { chatId: GREEN.chat, message });
  if (!r?.idMessage) throw new Error(`WhatsApp did not confirm the message: ${JSON.stringify(r).slice(0, 200)}`);
}

async function listGroups() {
  if (!configured) {
    log('GREEN_API_INSTANCE and GREEN_API_TOKEN are not set, so there is nothing to look up yet.');
    return;
  }
  const chats = await green('getChats');
  const groups = (Array.isArray(chats) ? chats : []).filter((c) => String(c.id).endsWith('@g.us'));
  if (!groups.length) { log('No groups found. Is the linked number in the family group yet?'); return; }
  log('Groups the linked WhatsApp number is in (put the id in the WHATSAPP_CHAT_ID secret):');
  for (const g of groups) log(`  ${g.name || '(no name)'}  ->  ${g.id}`);
}

// --- Posting, at most once per day/week ----------------------------------------------
async function postOnce(id, message) {
  const path = `${C.posts}/${id}`;
  const prev = await get(path);
  if (prev?.status === 'sent') return 'already posted';
  if (prev?.status === 'sending' && NOW - prev.at < 30 * 60e3) return 'another run is posting it';
  if ((prev?.attempts ?? 0) >= 5) return 'gave up after 5 tries';
  if (DRY) {
    log(`\n----- would post (${id}) -----\n${message}\n-----------------------------`);
    return 'dry run';
  }
  const attempts = (prev?.attempts ?? 0) + 1;
  try {
    await put(path, { status: 'sending', at: NOW, attempts }, prev ? true : false);
  } catch {
    return 'another run claimed it';
  }
  try {
    await sendWhatsApp(message);
    await put(path, { status: 'sent', at: NOW, attempts });
    return 'posted';
  } catch (e) {
    await put(path, { status: 'failed', at: NOW, attempts, error: String(e.message).slice(0, 300) });
    process.exitCode = 1;
    return `failed (${e.message})`;
  }
}

// --- What to post ------------------------------------------------------------------------
const assisted = new Set(ASSISTED_PLAYERS.map((p) => p.id));

async function main() {
  if (args.has('--list-groups')) return listGroups();
  log(`Daily Scatter poster · ${new Date(NOW).toISOString()} · ${PT ? 'PLAYTEST' : 'real game'}${DRY ? ' · dry run' : ''}`);
  if (!configured) log('WhatsApp is not connected yet (GREEN_API_* secrets missing), so this is a dry run.');
  else if (!GREEN.chat) log(`${PT ? 'WHATSAPP_TEST_CHAT_ID' : 'WHATSAPP_CHAT_ID'} is missing, so this is a dry run. Run with --list-groups to find it.`);

  // Is the WhatsApp link still up? WhatsApp drops linked devices if the bot's phone
  // hasn't connected in 14 days. If it's down, don't burn retries on posts that can't
  // go through; once a day (the run between noon and 12:10pm ET) fail loudly so
  // GitHub emails the owner.
  if (configured && !DRY) {
    const state = (await green('getStateInstance'))?.stateInstance;
    if (state !== 'authorized') {
      log(`The WhatsApp link is down (Green API says "${state}"). To fix it: open WhatsApp Business on the bot's phone, then scan the QR code again in the Green API console. Nothing is lost; due posts go out once it's back.`);
      const et = new Date(NOW).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
      const [h, m] = et.split(':').map(Number);
      if (h === 12 && m < 10) process.exitCode = 1;
      return;
    }
  }

  const family = ((await get(C.family))?.members ?? []).filter((id) => !assisted.has(id));
  const names = Object.fromEntries((await list(C.players)).map(({ id, data }) => [id, data.name || id]));
  const shift = PT ? ((await get('pt_meta/clock'))?.dayShift ?? 0) : 0;
  const today = T.addDays(T.dayId(NOW), shift);

  const candidates = PT
    ? (await list(C.days)).map((d) => { cache.set(`${C.days}/${d.id}`, d.data); return d.id; }).sort()
    : [T.addDays(today, -2), T.addDays(today, -1), today];

  const baseLock = (id, day) => (PT ? (id < today ? -Infinity : day?.revealedAt ?? Infinity) : T.lockTime(id));
  const revealedAt = async (id) => {
    const day = await get(`${C.days}/${id}`);
    return day ? revealTime(day, id, family, baseLock(id, day)) : Infinity;
  };

  for (const id of candidates) {
    const day = await get(`${C.days}/${id}`);
    if (!day) continue;
    const { players } = scoreDay(day);
    if (!Object.values(players).some((p) => p.played)) continue;
    const base = baseLock(id, day);
    const at = revealTime(day, id, family, base);
    if (NOW < at) { log(`${id}: not revealed yet`); continue; }
    const when = PT ? NOW : postTime(at);
    if (NOW < when) { log(`${id}: revealed, waiting until ${T.clockLabel(when)} ET (quiet hours)`); continue; }
    // A post that's running late still never goes out during quiet hours.
    if (!PT && inQuietHours(NOW)) { log(`${id}: due, but it's quiet hours; waiting until 9:00am ET`); continue; }
    if (!PT && NOW - when > STALE_AFTER) { log(`${id}: too old to post now, skipping`); continue; }

    // The week so far (revealed days only).
    const wid = T.weekId(id);
    const weekIds = T.weekDays(wid).filter((d) => d <= id);
    const weekDays = [];
    for (const d of weekIds) if (NOW >= await revealedAt(d)) weekDays.push({ id: d, day: await get(`${C.days}/${d}`) });
    const week = scoreWeek(weekDays);
    const isSunday = T.weekdayIndex(id) === 6;

    const early = at < base;
    const missing = family.filter((p) => !players[p]?.played && !players[p]?.skipped).map((p) => names[p] || p);
    const note = early ? '🎉 Everyone finished! Here are the results.' : missing.length ? `😴 Didn't play: ${missing.join(', ')}` : '';
    const text = resultsText({ day, dayLabel: T.dayLabel(id), weekRows: week.rows, weekFinal: isSunday, url: APP_URL, note });
    log(`${id}: ${await postOnce(id, text)}`);

    if (isSunday && week.rows.length) {
      const weekMsg = weekText({
        weekLabel: `${T.monthDay(wid)} – ${T.monthDay(T.addDays(wid, 6))}`,
        rows: week.rows, winners: week.winners, daysPlayed: weekDays.filter((d) => d.day).length, url: APP_URL,
      });
      log(`week of ${wid}: ${await postOnce(`week-${wid}`, weekMsg)}`);
    }
  }
}

main().catch((e) => {
  if (e.status === 403) console.error('The database refused access. Publish the latest firestore.rules in the Firebase console (Firestore Database > Rules).');
  console.error(e.message || e);
  process.exitCode = 1;
});
