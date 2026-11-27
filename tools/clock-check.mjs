// Before publishing the strict clock rules (step 2 in docs/clock-rules.md):
// who has played on the updated app? Read-only. Run: npm run clock-check
//
// The updated app has the database stamp each card's start (serverStartedAt).
// A player whose latest card has no stamp is still on the old app; with the
// strict rules their saves would be refused, so wait until they've played once
// on the new one (opening the app updates it).
import { FIREBASE, ASSISTED_PLAYERS } from '../js/config.js';
import { decFields } from '../js/codec.js';
import * as T from '../js/time.js';

const API = (process.env.FIRESTORE_BASE || 'https://firestore.googleapis.com/v1/').replace(/\/?$/, '/');
const ROOT = `projects/${FIREBASE.projectId}/databases/(default)/documents`;
const helpers = new Set(ASSISTED_PLAYERS.map((p) => p.id));

async function getDay(id) {
  const res = await fetch(`${API}${ROOT}/days/${id}?key=${FIREBASE.apiKey}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't read days/${id}: ${res.status}`);
  return decFields((await res.json()).fields);
}

const today = T.dayId();
const latest = {}; // pid -> { day, name, stamped }
for (let i = 0; i < 14; i++) {
  const id = T.addDays(today, -i);
  const day = await getDay(id);
  for (const [pid, card] of Object.entries(day?.cards ?? {})) {
    if (helpers.has(pid) || !card.startedAt || latest[pid]) continue;
    latest[pid] = { day: id, name: card.name || pid, stamped: card.serverStartedAt != null };
  }
}

const rows = Object.values(latest).sort((a, b) => a.name.localeCompare(b.name));
if (!rows.length) { console.log('Nobody has played in the last two weeks.'); process.exit(0); }
console.log('Latest card in the last two weeks:\n');
for (const r of rows) console.log(`  ${r.stamped ? '✓ updated app' : '✗ old app    '}  ${r.name} (${r.day})`);
const old = rows.filter((r) => !r.stamped);
console.log(old.length
  ? `\nWait: ${old.map((r) => r.name).join(', ')} last played on the old app. Publish step 2 once they've played on the new one.`
  : '\nEveryone has played on the updated app. Step 2 (firestore.rules) is safe to publish.');
