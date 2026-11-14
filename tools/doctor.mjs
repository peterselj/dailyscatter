// Checks a copy of the game is set up properly. Run: npm run doctor
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../js/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINAL = { projectId: 'dailyscatter-f0771', site: 'https://peterselj.github.io/dailyscatter/' };
let problems = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const warn = (msg) => console.log(`  ! ${msg}`);
const bad = (msg) => { problems++; console.log(`  ✗ ${msg}`); };

console.log('Settings (js/config.js)');
if (C.FIREBASE?.projectId && C.FIREBASE?.apiKey) ok(`Firebase project: ${C.FIREBASE.projectId}`);
else bad('FIREBASE needs a projectId and an apiKey (Firebase console > Project settings > Your apps).');

if (/^https:\/\/.+\/$/.test(C.SITE_URL ?? '')) ok(`Address: ${C.SITE_URL}`);
else bad('SITE_URL should be your game\'s https address, ending in "/".');

const mine = C.SITE_URL !== ORIGINAL.site;
if (mine && C.FIREBASE?.projectId === ORIGINAL.projectId) bad('SITE_URL is yours, but FIREBASE still points at the original game\'s database. Create your own Firebase project.');
if (!mine && C.FIREBASE?.projectId !== ORIGINAL.projectId) bad('FIREBASE is yours, but SITE_URL is still the original game\'s address.');

try { new Intl.DateTimeFormat('en-US', { timeZone: C.TIME_ZONE }); ok(`Time zone: ${C.TIME_ZONE}`); } catch { bad(`TIME_ZONE "${C.TIME_ZONE}" isn't a time zone name. Use one like "America/Chicago".`); }

for (const [name, v] of [['FAMILY_CODE_SHA256', C.FAMILY_CODE_SHA256], ['ADMIN_CODE_SHA256', C.ADMIN_CODE_SHA256]]) {
  if (/^[0-9a-f]{64}$/.test(v ?? '')) ok(`${name} looks like a hash.`);
  else bad(`${name} should be 64 characters of 0-9 and a-f. See "Making the two code hashes" in docs/setup.md.`);
}
if (C.FAMILY_CODE_SHA256 === C.ADMIN_CODE_SHA256) bad('The group code and the admin code are the same. Pick two different codes.');

if (Number.isFinite(C.TIMER_SECONDS) && C.TIMER_SECONDS >= 30) ok(`Timer: ${C.TIMER_SECONDS} seconds.`);
else bad('TIMER_SECONDS should be a number of seconds, 30 or more.');
if (!(C.NUDGE_HOUR === null || (Number.isInteger(C.NUDGE_HOUR) && C.NUDGE_HOUR >= 9 && C.NUDGE_HOUR <= 20))) bad('NUDGE_HOUR should be null, or a whole hour from 9 to 20 (outside quiet hours).');

console.log('\nHelper players');
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const asOf = Object.fromEntries(pages.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8').match(/data-as="([^"]+)"/)?.[1] ?? null]));
const helpers = C.ASSISTED_PLAYERS ?? [];
if (!helpers.length) ok('None.');
for (const p of helpers) {
  if (!/^[a-z][a-z0-9]{0,23}$/.test(p.id ?? '')) bad(`Helper id "${p.id}" should be lowercase letters and numbers, starting with a letter.`);
  const page = Object.keys(asOf).find((f) => asOf[f] === p.id);
  if (page) ok(`${p.name}: plays from ${page}`);
  else bad(`${p.name} has no page. Copy kenny.html to ${p.id}.html and set data-as="${p.id}" in it.`);
}
for (const [f, id] of Object.entries(asOf)) {
  if (id && !helpers.some((p) => p.id === id)) bad(`${f} is for a helper called "${id}", who isn't in ASSISTED_PLAYERS. Add them or delete the page.`);
}

console.log('\nVersion stamps');
const stamps = new Set();
let unstamped = 0;
for (const f of [...fs.readdirSync(path.join(ROOT, 'js')).map((x) => `js/${x}`), ...pages]) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  unstamped += (src.match(/from\s+'\.\/[\w-]+\.js'|(?:href|src)="(?:css\/[\w-]+\.css|js\/[\w-]+\.js|[\w-]+\.webmanifest)"/g) ?? []).length;
  for (const m of src.matchAll(/\?v=([\w-]+)/g)) stamps.add(m[1]);
}
if (unstamped || stamps.size !== 1) bad('Files are out of step. Run: npm run stamp');
else ok(`All files are on version ${[...stamps][0]}.`);

console.log('\nDatabase');
if (C.FIREBASE?.projectId && C.FIREBASE?.apiKey) {
  const url = `${process.env.FIRESTORE_BASE || 'https://firestore.googleapis.com/v1/'}projects/${C.FIREBASE.projectId}/databases/(default)/documents/days?pageSize=1&key=${C.FIREBASE.apiKey}`;
  try {
    const res = await fetch(url);
    if (res.ok) ok('The database answers and the rules allow reading.');
    else if (res.status === 403) bad('The database refused. Publish firestore.rules (Firebase console > Firestore Database > Rules). If you did, check the apiKey.');
    else if (res.status === 404) bad('No database found. Create one (Firebase console > Build > Firestore Database), and check the projectId.');
    else if (res.status === 400) bad('Firebase rejected the apiKey. Copy it again from Project settings > Your apps.');
    else bad(`The database answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } catch (e) {
    warn(`Couldn't reach the database (${e.message}). Check your internet connection and try again.`);
  }
}

console.log(problems ? `\n${problems} thing${problems === 1 ? '' : 's'} to fix.` : '\nAll good.');
process.exitCode = problems ? 1 : 0;
