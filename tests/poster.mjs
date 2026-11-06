// Tests the WhatsApp posting job (tools/post-results.mjs) against the local
// fake database and a fake WhatsApp, through a week of scenarios.
// Run: npm run poster
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from './server.mjs';
import { encFields } from '../js/codec.js';

const run = promisify(execFile);
const server = createServer();
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;
const DB = `${BASE}/__mock/v1/projects/x/databases/(default)/documents`;
const ET = (date, hhmm) => new Date(`${date}T${hhmm}:00-05:00`).getTime();
let step = 0;
const ok = (msg) => console.log(`  ${String(++step).padStart(2)}. ${msg}`);

async function put(path, data) {
  const r = await fetch(`${DB}/${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: encFields(data) }) });
  assert.ok(r.ok, `seed ${path}`);
}
const dump = async () => (await fetch(`${BASE}/__mock/dump`)).json();
const sent = async () => (await fetch(`${BASE}/__mock/sent`)).json();

const WA = { GREEN_API_URL: `${BASE}/green`, GREEN_API_INSTANCE: '1101', GREEN_API_TOKEN: 'secret-token', WHATSAPP_CHAT_ID: '120363000000000000@g.us' };
async function job(now, { env = WA, flags = [] } = {}) {
  try {
    const { stdout } = await run('node', ['tools/post-results.mjs', ...flags], {
      env: { PATH: process.env.PATH, FIRESTORE_BASE: `${BASE}/__mock/v1/`, NOW: String(now), ...env },
    });
    return { out: stdout, code: 0 };
  } catch (e) {
    return { out: `${e.stdout}${e.stderr}`, code: e.code };
  }
}

const prompts = ['A fruit', 'An animal', 'A city', 'A movie', 'A name'];
const card = (name, start, answers, extra = {}) => ({ name, startedAt: start, answers, updatedAt: start, ...extra });
const done = (name, date, hhmm, L, extra = {}) => card(name, ET(date, hhmm), [`${L}1${name}`, `${L}2 ${L}x`, '', `${L}4${name}`, ''], { doneAt: ET(date, hhmm) + 60e3, ...extra });

try {
  await put('players/josh', { name: 'Josh' });
  await put('players/z', { name: 'Z' });
  await put('players/aly', { name: 'Aly' });
  await put('players/farm', { name: 'farm' });
  await put('meta/family', { members: ['josh', 'z', 'aly', 'kenny'] }); // Kenny is ignored: always optional

  // Mon: everyone finishes by 2:03pm; Kenny started but didn't finish (optional).
  await put('days/2026-11-09', {
    letter: 'G', prompts, rolledBy: 'Josh', rolledAt: ET('2026-11-09', '08:00'),
    cards: {
      josh: done('Josh', '2026-11-09', '08:00', 'G'),
      z: done('Z', '2026-11-09', '12:00', 'G'),
      aly: card('Aly', ET('2026-11-09', '14:00'), ['Grape', '', '', '', '']), // no "I'm done": timer ends 2:03pm
      kenny: { name: 'Kenny', assisted: true, startedAt: ET('2026-11-09', '13:00'), answers: ['Goat', '', '', '', ''] },
    },
  });
  let r = await job(ET('2026-11-09', '14:02'));
  assert.equal((await sent()).length, 0, 'nothing while Aly is still playing');
  assert.match(r.out, /2026-11-09: not revealed yet/);
  r = await job(ET('2026-11-09', '14:05'));
  let msgs = await sent();
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].chatId, WA.WHATSAPP_CHAT_ID);
  assert.match(msgs[0].message, /^🎲 \*Daily Scatter\* · Mon, Nov 9 · Letter \*G\*\n🎉 Everyone finished!/);
  assert.match(msgs[0].message, /Kenny: Goat \+1/, 'Kenny is included if he played');
  assert.match(msgs[0].message, /\*Week so far:\*/);
  ok('Everyone finished at 2:03pm: posted at the next check (2:05pm), with "Everyone finished!"');
  await job(ET('2026-11-09', '14:15'));
  await job(ET('2026-11-09', '23:59'));
  assert.equal((await sent()).length, 1, 'never posted twice');
  assert.equal((await dump())['posts/2026-11-09'].fields.status.stringValue, 'sent');
  ok('Later checks do not post it again');

  // Tue: the last person finishes at 9:31pm -> quiet hours -> 9am Wednesday.
  await put('days/2026-11-10', {
    letter: 'P', prompts, rolledBy: 'Z', rolledAt: ET('2026-11-10', '07:00'),
    cards: { josh: done('Josh', '2026-11-10', '09:00', 'P'), z: done('Z', '2026-11-10', '10:00', 'P'), aly: done('Aly', '2026-11-10', '21:30', 'P') },
  });
  r = await job(ET('2026-11-10', '21:40'));
  assert.match(r.out, /2026-11-10: revealed, waiting until 9:00am ET \(quiet hours\)/);
  await job(ET('2026-11-11', '08:55'));
  assert.equal((await sent()).length, 1, 'nothing overnight');
  await job(ET('2026-11-11', '09:05'));
  msgs = await sent();
  assert.equal(msgs.length, 2);
  assert.match(msgs[1].message, /Tue, Nov 10 · Letter \*P\*\n🎉 Everyone finished!/);
  ok('Finished at 9:31pm: held overnight, posted at 9:05am');

  // Wed: only Josh plays -> midnight reveal -> 9am Thursday, naming who didn't play.
  await put('days/2026-11-11', {
    letter: 'S', prompts, rolledBy: 'Josh', rolledAt: ET('2026-11-11', '10:00'),
    cards: { josh: done('Josh', '2026-11-11', '10:00', 'S') },
  });
  await job(ET('2026-11-11', '23:50'));
  await job(ET('2026-11-12', '00:10'));
  assert.equal((await sent()).length, 2, 'not before midnight, and not in the night');
  await job(ET('2026-11-12', '09:02'));
  msgs = await sent();
  assert.equal(msgs.length, 3);
  assert.match(msgs[2].message, /Wed, Nov 11 · Letter \*S\*\n😴 Didn't play: Z, Aly/);
  ok('Not everyone played: revealed at midnight, posted at 9am naming who didn’t play');

  // Thu: WhatsApp is down at first -> recorded as failed -> retried next check.
  await put('days/2026-11-12', {
    letter: 'B', prompts, rolledBy: 'Aly', rolledAt: ET('2026-11-12', '11:00'),
    cards: { josh: done('Josh', '2026-11-12', '11:00', 'B'), z: done('Z', '2026-11-12', '12:00', 'B'), aly: done('Aly', '2026-11-12', '15:00', 'B') },
  });
  await fetch(`${BASE}/__mock/fail-send?n=1`);
  r = await job(ET('2026-11-12', '15:10'));
  assert.equal(r.code, 1, 'the run is marked failed so it shows up in GitHub');
  const failed = (await dump())['posts/2026-11-12'].fields;
  assert.equal(failed.status.stringValue, 'failed');
  assert.match(failed.error.stringValue, /pretend WhatsApp is down/);
  await job(ET('2026-11-12', '15:20'));
  assert.equal((await sent()).length, 4);
  assert.equal((await dump())['posts/2026-11-12'].fields.status.stringValue, 'sent');
  ok('WhatsApp down: recorded as failed, then posted on the next check');

  // Fri: played, but the job was off until Sunday -> too old, skipped (no surprise spam).
  await put('days/2026-11-13', { letter: 'R', prompts, rolledBy: 'Josh', rolledAt: ET('2026-11-13', '09:00'), cards: { josh: done('Josh', '2026-11-13', '09:00', 'R') } });

  // Sun: everyone done by 4:01pm -> the day's results, then the week's winner.
  await put('days/2026-11-15', {
    letter: 'T', prompts, rolledBy: 'Z', rolledAt: ET('2026-11-15', '09:00'),
    cards: { josh: done('Josh', '2026-11-15', '09:00', 'T'), z: done('Z', '2026-11-15', '10:00', 'T'), aly: done('Aly', '2026-11-15', '16:00', 'T') },
  });
  r = await job(ET('2026-11-15', '16:10'));
  assert.match(r.out, /2026-11-13: too old to post now, skipping/);
  msgs = await sent();
  assert.equal(msgs.length, 6, 'Sunday results + the week');
  assert.match(msgs[4].message, /Sun, Nov 15 · Letter \*T\*/);
  assert.match(msgs[4].message, /\*Final for the week:\*/);
  assert.match(msgs[5].message, /^🏆 \*Daily Scatter · Week of Nov 9 – Nov 15\*\n\n.+ (wins|tie) the week with \d+ points!/);
  assert.match(msgs[5].message, /6 days played/);
  ok('Sunday: the day’s results, then the week’s winner and final standings');
  ok('An old unposted day (job was off) is skipped instead of posted late');
  await job(ET('2026-11-15', '16:20'));
  assert.equal((await sent()).length, 6, 'week message not repeated');

  // Dry run: no WhatsApp settings -> prints, changes nothing.
  await put('days/2026-11-16', { letter: 'M', prompts, rolledBy: 'Josh', rolledAt: ET('2026-11-16', '09:00'), cards: { josh: done('Josh', '2026-11-16', '09:00', 'M') } });
  const before = JSON.stringify(await dump());
  r = await job(ET('2026-11-17', '09:30'), { env: {} });
  assert.equal(r.code, 0);
  assert.match(r.out, /WhatsApp is not connected yet/);
  assert.match(r.out, /----- would post \(2026-11-16\) -----\n🎲 \*Daily Scatter\* · Mon, Nov 16/);
  assert.equal(JSON.stringify(await dump()), before, 'dry run changes nothing');
  assert.equal((await sent()).length, 6);
  assert.ok(!r.out.includes('secret-token'), 'token never printed');
  ok('Not connected yet: dry run prints the message and changes nothing');

  // Finding the group id.
  r = await job(ET('2026-11-17', '09:30'), { flags: ['--list-groups'] });
  assert.match(r.out, /Petersel Family {2}-> {2}120363000000000000@g\.us/);
  assert.ok(!r.out.includes('Someone'), 'only groups are listed');
  ok('--list-groups shows the family group’s id');

  // Playtest: separate data and markers, no quiet hours.
  await put('pt_meta/family', { members: ['josh', 'z'] });
  await put('pt_days/2026-11-17', {
    letter: 'C', prompts, rolledBy: 'Josh', rolledAt: ET('2026-11-17', '22:00'),
    cards: { josh: done('Josh', '2026-11-17', '22:00', 'C'), z: done('Z', '2026-11-17', '22:05', 'C') },
  });
  r = await job(ET('2026-11-17', '22:10'), { flags: ['--playtest'] });
  assert.match(r.out, /WHATSAPP_TEST_CHAT_ID is missing, so this is a dry run/);
  assert.equal((await sent()).length, 6, 'no test chat set: practice results are never sent to the family group');
  r = await job(ET('2026-11-17', '22:10'), { flags: ['--playtest'], env: { ...WA, WHATSAPP_TEST_CHAT_ID: '120363999@g.us' } });
  msgs = await sent();
  assert.equal(msgs.length, 7, 'playtest posts right away, even at 10pm');
  assert.equal(msgs[6].chatId, '120363999@g.us', 'to the test chat, not the family group');
  assert.match(msgs[6].message, /Letter \*C\*\n🎉 Everyone finished!/);
  assert.equal((await dump())['pt_posts/2026-11-17'].fields.status.stringValue, 'sent');
  assert.equal((await dump())['posts/2026-11-17'], undefined, 'real markers untouched');
  ok('Playtest mode posts practice results right away, kept separate from the real game');

  console.log('\nAll posting checks passed.');
} catch (e) {
  console.error('\nFAILED:', e.message);
  process.exitCode = 1;
} finally {
  server.close();
}
