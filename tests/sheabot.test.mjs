// Tests tools/sheabot.gs (a Google Apps Script) by running it in a sandbox with
// stand-ins for Google's services, WhatsApp (GREEN-API), Gemini and the database.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { encFields } from '../js/codec.js';

const SRC = fs.readFileSync(new URL('../tools/sheabot.gs', import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-12T15:00:00-05:00'); // Thursday 3pm Eastern
const GROUP = '120363000000000000@g.us';
const at = (hhmm, date = '2026-11-12') => Date.parse(`${date}T${hhmm}:00-05:00`);

function world({ props = {}, docs = {}, gemini } = {}) {
  const calls = { gemini: [], sent: [], settings: [], firestore: 0 };
  const cache = new Map();
  const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  const sandbox = {
    console: { log() {}, error() {} },
    Date: class extends Date { static now() { return NOW; } constructor(...a) { super(...(a.length ? a : [NOW])); } },
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({
      GEMINI_API_KEY: 'gem-key', GREEN_API_URL: 'https://green.test', GREEN_API_INSTANCE: '11', GREEN_API_TOKEN: 'tok',
      WHATSAPP_CHAT_ID: GROUP, WEBHOOK_KEY: 'sekrit', WEBAPP_URL: 'https://script.test/macros/s/abc/exec', ...props,
    }) }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    ContentService: { createTextOutput: (t) => ({ text: t }) },
    UrlFetchApp: { fetch(url, opts = {}) {
      const body = opts.payload ? JSON.parse(opts.payload) : null;
      if (url.includes('firestore.googleapis.com')) {
        calls.firestore++;
        const path = decodeURIComponent(url.split('/documents/')[1].split('?')[0]);
        if (!path.includes('/')) {
          const list = Object.entries(docs).filter(([k]) => k.startsWith(`${path}/`)).map(([k, v]) => ({ name: `x/documents/${k}`, fields: encFields(v) }));
          return res(200, { documents: list });
        }
        return docs[path] ? res(200, { fields: encFields(docs[path]) }) : res(404, {});
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        if (url.endsWith('/models?pageSize=200')) return res(200, { models: [
          { name: 'models/gemini-9-pro', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-9-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-9-flash-image', supportedGenerationMethods: ['generateContent'] },
        ] });
        const model = url.match(/models\/([^:]+):generateContent/)[1];
        calls.gemini.push({ model, key: opts.headers['x-goog-api-key'], system: body.system_instruction.parts[0].text, question: body.contents[0].parts[0].text, thinking: body.generationConfig.thinkingConfig?.thinkingLevel ?? null });
        return gemini ? gemini(model, body) : res(200, { candidates: [{ content: { parts: [{ text: '✅ Legit. A sandwich is a sandwich.' }] } }] });
      }
      if (url.startsWith('https://green.test/waInstance11/sendMessage/tok')) { calls.sent.push(body); return res(200, { idMessage: 'OUT1' }); }
      if (url.startsWith('https://green.test/waInstance11/setSettings/tok')) { calls.settings.push(body); return res(200, { saveSettings: true }); }
      throw new Error(`unexpected fetch ${url}`);
    } },
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const post = (hook, key = 'sekrit') => sandbox.doPost({ parameter: { key }, postData: { contents: JSON.stringify(hook) } }).text;
  return { sandbox, calls, post, res };
}

const hook = (text, extra = {}) => ({
  typeWebhook: 'incomingMessageReceived', idMessage: extra.id ?? 'MSG1',
  senderData: { chatId: extra.chat ?? GROUP, senderName: 'Zach' },
  messageData: extra.messageData ?? { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
});
const card = (name, startedAt, answers, extra = {}) => ({ name, startedAt, doneAt: startedAt + 60000, answers, ...extra });
const DOCS = {
  'meta/family': { members: ['josh', 'zach', 'kenny'] },
  'players/zach': { name: 'Zachary' },
  'days/2026-11-11': { letter: 'F', prompts: ['A sandwich', 'An animal', 'A city', 'A movie', 'A name'], cards: {
    josh: card('Josh', at('09:00', '2026-11-11'), ['Fruit salad', 'Fox', '', 'Fargo', 'Fred']),
    zach: card('Zach', at('10:00', '2026-11-11'), ['Fluffernutter', 'Ferret', 'Fresno', '', 'Fran']),
  } },
  'days/2026-11-12': { letter: 'W', prompts: ['A fruit', 'A tool', 'A sport', 'A color', 'A verb'], cards: {
    josh: card('Josh', at('09:00'), ['Watermelon', 'Wrench', 'Wrestling', 'White', 'Walk']),
  } },
};

test('ignores strangers, other chats and messages that don\'t mention Sheabot', () => {
  const w = world({ docs: DOCS });
  assert.equal(w.post(hook('Sheabot, hello'), 'wrong-key'), 'no');
  assert.equal(w.post(hook('Sheabot, hello', { chat: '999@g.us' })), 'ignored');
  assert.equal(w.post(hook('who won yesterday?')), 'ignored');
  assert.equal(w.post({ typeWebhook: 'outgoingMessageStatus' }), 'ignored');
  assert.equal(w.calls.gemini.length, 0, 'nothing is sent to the AI');
  assert.equal(w.calls.firestore, 0);
  assert.equal(w.calls.sent.length, 0);
});

test('answers a question in the group, as a reply, with the rules and yesterday\'s answers', () => {
  const w = world({ docs: DOCS });
  assert.equal(w.post(hook('Hey sheabot is "fruit salad" a legit sandwich starting with F?')), 'answered');
  assert.equal(w.calls.gemini.length, 1);
  const g = w.calls.gemini[0];
  assert.equal(g.key, 'gem-key');
  assert.equal(g.model, 'gemini-flash-latest');
  assert.match(g.system, /You are Sheabot/);
  assert.match(g.system, /West Highland white terrier, about 12 years old/);
  assert.match(g.system, /barking at squirrels, getting belly scratches/);
  assert.match(g.system, /any of its main words starts with the letter/);
  assert.match(g.system, /Your ruling is advice/);
  assert.match(g.question, /Zach says: Hey sheabot is "fruit salad" a legit sandwich starting with F\?$/);
  assert.match(g.question, /Yesterday \(2026-11-11\), letter F:\n1\. A sandwich — Josh: Fruit salad; Zachary: Fluffernutter/, 'yesterday\'s answers, with current names');
  assert.deepEqual(w.calls.sent, [{ chatId: GROUP, message: '✅ Legit. A sandwich is a sandwich.', quotedMessageId: 'MSG1' }]);
});

test('never gives away today\'s card before the results are out', () => {
  const w = world({ docs: DOCS });
  w.post(hook('Sheabot what is today\'s letter?'));
  const q = w.calls.gemini[0].question;
  assert.match(q, /Today \(2026-11-12\): results are not out yet/);
  assert.ok(!q.includes('Watermelon') && !q.includes('letter W') && !q.includes('A tool'), 'today\'s letter, prompts and answers are not sent to the AI');
  assert.match(w.calls.gemini[0].system, /Never reveal or guess today's letter/);
});

test('includes today once everyone in the family has finished (Kenny is optional)', () => {
  const docs = structuredClone(DOCS);
  docs['days/2026-11-12'].cards.zach = card('Zach', at('14:00'), ['Wolfberry', 'Wedge', '', 'Wine', 'Wander']);
  let w = world({ docs });
  w.post(hook('Sheabot, rule on wolfberry'));
  assert.match(w.calls.gemini[0].question, /Today \(2026-11-12\), letter W:\n1\. A fruit — Josh: Watermelon; Zachary: Wolfberry/);
  // Still on the clock (started 2 minutes ago, hasn't tapped done): not out yet.
  docs['days/2026-11-12'].cards.zach = { name: 'Zach', startedAt: NOW - 120000, answers: ['Wolfberry', '', '', '', ''] };
  w = world({ docs });
  w.post(hook('Sheabot, rule on wolfberry'));
  assert.match(w.calls.gemini[0].question, /results are not out yet/);
});

test('reads the message being replied to', () => {
  const w = world({ docs: DOCS });
  w.post(hook('', { messageData: { typeMessage: 'quotedMessage', extendedTextMessageData: { text: 'SheaBot rule on #3 please' }, quotedMessage: { typeMessage: 'textMessage', textMessage: '*3. A city*\nZach: Fresno +1' } } }));
  assert.match(w.calls.gemini[0].question, /The message being replied to:\n"""\n\*3\. A city\*\nZach: Fresno \+1\n"""\n\nZach says: SheaBot rule on #3 please$/);
});

test('answers each message once, and naps if the chat gets carried away', () => {
  const w = world({ docs: DOCS });
  assert.equal(w.post(hook('Sheabot?')), 'answered');
  assert.equal(w.post(hook('Sheabot?')), 'duplicate');
  assert.equal(w.calls.sent.length, 1);
  for (let i = 2; i <= 30; i++) assert.equal(w.post(hook('Sheabot?', { id: `M${i}` })), 'answered');
  assert.equal(w.post(hook('Sheabot?', { id: 'M31' })), 'rate limited');
  assert.equal(w.post(hook('Sheabot?', { id: 'M32' })), 'rate limited');
  assert.equal(w.calls.gemini.length, 30);
  assert.equal(w.calls.sent.length, 31, 'one "needs a nap" message, then silence');
  assert.match(w.calls.sent.at(-1).message, /needs a nap/);
});

test('if the AI is down, says so in the chat; if the model name is retired, finds another', () => {
  let w = world({ docs: DOCS, gemini: () => ({ getResponseCode: () => 429, getContentText: () => '{"error":"quota"}' }) });
  assert.equal(w.post(hook('Sheabot?')), 'answered');
  assert.match(w.calls.sent[0].message, /can't rule right now/);
  w = world({ docs: DOCS });
  const ok = w.res(200, { candidates: [{ content: { parts: [{ text: '❌ Toss it.' }] } }] });
  w = world({ docs: DOCS, gemini: (model) => (model === 'gemini-flash-latest' ? w.res(404, {}) : ok) });
  w.post(hook('Sheabot?'));
  assert.deepEqual(w.calls.gemini.map((c) => c.model), ['gemini-flash-latest', 'gemini-9-flash']);
  assert.equal(w.calls.sent[0].message, '❌ Toss it.');
});

test('still rules if the game data can\'t be loaded, and honors the family\'s style note', () => {
  const w = world({ docs: {}, props: { SHEABOT_STYLE: 'Be extra tough on Josh.' } });
  w.sandbox.UrlFetchApp.fetch = ((orig) => (url, o) => { if (url.includes('firestore')) throw new Error('down'); return orig(url, o); })(w.sandbox.UrlFetchApp.fetch);
  assert.equal(w.post(hook('Sheabot, is a hot dog a sandwich?')), 'answered');
  assert.match(w.calls.gemini[0].question, /results could not be loaded/);
  assert.match(w.calls.gemini[0].system, /Extra instructions from the family: Be extra tough on Josh\./);
});

test('asks for quick answers, and falls back if a model doesn\'t know that setting', () => {
  let w = world({ docs: DOCS });
  w.post(hook('Sheabot?'));
  assert.equal(w.calls.gemini[0].thinking, 'low');
  w = world({ docs: DOCS });
  const ok = w.res(200, { candidates: [{ content: { parts: [{ text: '🤷 Borderline.' }] } }] });
  w = world({ docs: DOCS, gemini: (model, body) => (body.generationConfig.thinkingConfig ? w.res(400, { error: 'unknown field' }) : ok) });
  w.post(hook('Sheabot?'));
  assert.deepEqual(w.calls.gemini.map((c) => c.thinking), ['low', null]);
  assert.equal(w.calls.sent[0].message, '🤷 Borderline.');
});

test('sheabotTest logs each step and Sheabot\'s answer', () => {
  const w = world({ docs: DOCS });
  const lines = [];
  w.sandbox.console.log = (x) => lines.push(x);
  w.sandbox.sheabotTest();
  assert.match(lines[0], /AI key found \(7 characters\)/);
  assert.ok(lines.some((l) => /Flash models on offer: gemini-9-flash, gemini-9-flash-image/.test(l)));
  assert.ok(lines.some((l) => /gemini-flash-latest took [\d.]+ seconds and says: ✅ Legit/.test(l)));
  assert.ok(lines.some((l) => /gemini-flash-lite-latest took [\d.]+ seconds and says: ✅ Legit/.test(l)), 'times the lighter model too');
  assert.equal(w.calls.sent.length, 0, 'the test never posts to WhatsApp');
});

test('sheabotConnect points GREEN-API at the web app; sheabotDisconnect turns it off', () => {
  const w = world();
  w.sandbox.sheabotConnect();
  assert.equal(w.calls.settings[0].webhookUrl, 'https://script.test/macros/s/abc/exec?key=sekrit');
  assert.equal(w.calls.settings[0].incomingWebhook, 'yes');
  assert.equal(w.calls.settings[0].outgoingAPIMessageWebhook, 'no', 'Sheabot never hears its own posts');
  w.sandbox.sheabotDisconnect();
  assert.equal(w.calls.settings[1].incomingWebhook, 'no');
  assert.throws(() => world({ props: { WEBAPP_URL: 'https://script.test/dev' } }).sandbox.sheabotConnect(), /ending in \/exec/);
  assert.throws(() => world({ props: { GEMINI_API_KEY: '' } }).sandbox.sheabotConnect(), /GEMINI_API_KEY/);
});
