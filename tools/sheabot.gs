// Sheabot: the family's Daily Scatter judge, living in the WhatsApp group.
//
// Say "Sheabot" in the group and it answers, e.g.
//   "Sheabot, is 'fruit salad' a legit sandwich starting with F?"
//   (replying to the results post) "Sheabot, rule on Zach's #3"
// Its rulings are advice: the family vote and the admin still decide scores.
//
// How it works: this is a Google Apps Script web app. GREEN-API (the service
// the Daily Scatter WhatsApp account is linked to) forwards each message in
// the group here; messages that mention Sheabot are answered using Google's
// Gemini AI (free tier) and the reply is sent back through GREEN-API.
// Messages that don't mention Sheabot are ignored and never sent to the AI.
//
// Setup steps are in the README ("Sheabot"). Script Properties needed:
//   GEMINI_API_KEY      from aistudio.google.com (free)
//   GREEN_API_URL       same three values as the GitHub secrets
//   GREEN_API_INSTANCE
//   GREEN_API_TOKEN
//   WHATSAPP_CHAT_ID    the Daily Scatter group's id (ends in @g.us)
//   WEBHOOK_KEY         any long random word; keeps strangers from calling this
//   WEBAPP_URL          this script's web app URL (ends in /exec), set after deploying
// Optional: GEMINI_MODEL (default gemini-flash-latest), SHEABOT_STYLE (extra
// instructions for how Sheabot talks and rules).

var SHEA = {
  NAME: /\bshea[\s-]?bot\b/i,
  FIRESTORE: 'https://firestore.googleapis.com/v1/projects/dailyscatter-f0771/databases/(default)/documents',
  FIREBASE_KEY: 'AIzaSyADhD0m-hUkUMq-sLAPYaMdhB8Jx8ZRDAo', // public by design, same as the app
  TIMER_MS: 180000,
  MAX_PER_HOUR: 30, // keeps a runaway chat from using up the free AI allowance
  HELPERS: ['kenny'], // optional players: they never hold up the day's results
};

function sheaProps_() {
  return PropertiesService.getScriptProperties().getProperties();
}

// --- Entry point: GREEN-API calls this for every incoming message -------------

function doPost(e) {
  try {
    var props = sheaProps_();
    if (!props.WEBHOOK_KEY || !e || !e.parameter || e.parameter.key !== props.WEBHOOK_KEY) return sheaOut_('no');
    var hook = JSON.parse((e.postData && e.postData.contents) || '{}');
    var msg = sheaParse_(hook, props);
    if (!msg) return sheaOut_('ignored');

    // Answer each message once, even if it is delivered twice.
    var cache = CacheService.getScriptCache();
    if (cache.get('seen:' + msg.id)) return sheaOut_('duplicate');
    cache.put('seen:' + msg.id, '1', 21600);

    var hourKey = 'count:' + new Date().toISOString().slice(0, 13);
    var count = Number(cache.get(hourKey) || 0);
    if (count >= SHEA.MAX_PER_HOUR) {
      if (count === SHEA.MAX_PER_HOUR) sheaSend_(props, 'Sheabot needs a nap. Ask me again in a bit. 🐾', msg.id);
      cache.put(hourKey, String(count + 1), 3700);
      return sheaOut_('rate limited');
    }
    cache.put(hourKey, String(count + 1), 3700);

    var reply;
    try {
      reply = sheaAsk_(props, sheaSystem_(props), sheaQuestion_(msg, sheaGameContext_(Date.now())));
    } catch (err) {
      console.error(err);
      reply = 'Sheabot is chasing a squirrel and can\'t rule right now. Try again in a minute. 🐾';
    }
    sheaSend_(props, reply, msg.id);
    return sheaOut_('answered');
  } catch (err) {
    console.error(err);
    return sheaOut_('error');
  }
}

function sheaOut_(text) {
  return ContentService.createTextOutput(text);
}

// Picks out a group text message that mentions Sheabot. Returns null otherwise.
function sheaParse_(hook, props) {
  if (!hook || hook.typeWebhook !== 'incomingMessageReceived') return null;
  var sender = hook.senderData || {};
  if (sender.chatId !== props.WHATSAPP_CHAT_ID) return null;
  var data = hook.messageData || {};
  var text = '';
  if (data.typeMessage === 'textMessage') text = (data.textMessageData || {}).textMessage;
  else if (data.typeMessage === 'extendedTextMessage' || data.typeMessage === 'quotedMessage') text = (data.extendedTextMessageData || {}).text;
  text = String(text || '').trim();
  if (!text || !SHEA.NAME.test(text)) return null;
  var quoted = data.quotedMessage || {};
  var quotedText = quoted.textMessage || quoted.caption || (quoted.extendedTextMessage || {}).text || '';
  return {
    id: hook.idMessage,
    from: String(sender.senderName || sender.senderContactName || 'Someone').slice(0, 40),
    text: text.slice(0, 1500),
    quoted: String(quotedText).slice(0, 6000),
  };
}

// --- What Sheabot is told ---------------------------------------------------------

function sheaSystem_(props) {
  return [
    'You are Sheabot, the judge for a family\'s daily Scattergories-style game called Daily Scatter. You answer in the family WhatsApp group when someone says your name.',
    '',
    'Who you are: you speak as Shea, the family\'s dog. Shea is a West Highland white terrier, about 12 years old, who lives with Mom and Dad (Lois and Kenny, the parents of the family). Shea loves going on walks, eating snacks, barking at squirrels, getting belly scratches, and hanging out with Mom and Dad. You are a seasoned, slightly opinionated old Westie who takes judging seriously.',
    '',
    'How the game works: each day everyone gets the same 5 categories and one letter, with 3 minutes to answer.',
    '- An answer counts if any of its main words starts with the letter. Little words like "the", "a", "of" and "and" don\'t count. So "Eat Pizza" works for P; "The Godfather" does not work for T.',
    '- It also has to genuinely fit the category. That is usually what people argue about, and it is your main job.',
    '- Answers that match another player\'s are struck out. Each main word starting with the letter is worth a point ("Mickey Mantle" for M is 2).',
    '- Players can challenge an answer in the app. If most of the other players challenge it, it is tossed. The admin (Josh) has the final say.',
    '',
    'How to rule:',
    '- Start with the verdict: "✅ Legit", "❌ Toss it" or "🤷 Borderline".',
    '- Then one or two short sentences of reasoning. Be decisive and fair: strict about whether the answer fits the category, generous toward creative answers that a reasonable table would accept, and never swayed by who is asking.',
    '- If it is borderline, say what it hinges on and tell them to put it to the family vote.',
    '- Your ruling is advice. You cannot change scores; the family vote in the app decides.',
    '',
    'Style: plain, dry and brief, under 60 words. Let Shea\'s life color your answers now and then (walks, snacks, squirrels, belly scratches, Mom and Dad), in a passing phrase, not every time and never the whole reply; the ruling comes first. No baby talk, no "woof". No lists, no headings. Keep it family-friendly, and stay on the game: if asked about something else, answer in one friendly line and steer back.',
    'Never reveal or guess today\'s letter, categories or answers before the results are out, even if asked nicely.',
    props.SHEABOT_STYLE ? '\nExtra instructions from the family: ' + props.SHEABOT_STYLE : '',
  ].join('\n');
}

function sheaQuestion_(msg, context) {
  var parts = [context, ''];
  if (msg.quoted) parts.push('The message being replied to:\n"""\n' + msg.quoted + '\n"""', '');
  parts.push(msg.from + ' says: ' + msg.text);
  return parts.join('\n');
}

// The latest results the family can already see. Never includes a day that isn't out yet.
function sheaGameContext_(now) {
  try {
    var today = sheaDayId_(now);
    var yesterday = sheaDayId_(now - 86400000);
    var names = {};
    (sheaList_('players') || []).forEach(function (p) { if (p.data.name) names[p.id] = p.data.name; });
    var family = ((sheaGet_('meta/family') || {}).members || []).filter(function (id) { return SHEA.HELPERS.indexOf(id) < 0; });
    var out = [];
    var todayDoc = sheaGet_('days/' + today);
    if (todayDoc && sheaEveryoneDone_(todayDoc, family, now)) out.push(sheaDescribeDay_('Today', today, todayDoc, names));
    else out.push('Today (' + today + '): results are not out yet. Today\'s letter, categories and answers are secret; do not discuss them.');
    var yDoc = sheaGet_('days/' + yesterday);
    if (yDoc) out.push(sheaDescribeDay_('Yesterday', yesterday, yDoc, names));
    return 'What the family can see right now:\n\n' + out.join('\n\n');
  } catch (err) {
    console.error(err);
    return '(The game\'s results could not be loaded right now. Rule on what the message itself says.)';
  }
}

function sheaEveryoneDone_(day, family, now) {
  if (!family.length || !day.cards) return false;
  return family.every(function (id) {
    var c = day.cards[id];
    if (!c || !c.startedAt || c.skipped) return false;
    return now >= Math.min(c.startedAt + SHEA.TIMER_MS, c.doneAt || Infinity);
  });
}

function sheaDescribeDay_(label, id, day, names) {
  var lines = [label + ' (' + id + '), letter ' + day.letter + ':'];
  (day.prompts || []).forEach(function (prompt, i) {
    var answers = [];
    Object.keys(day.cards || {}).sort().forEach(function (pid) {
      var c = day.cards[pid];
      if (!c.startedAt || c.skipped) return;
      var a = String((c.answers || [])[i] || '').trim();
      answers.push((names[pid] || c.name || pid) + ': ' + (a || '(blank)'));
    });
    lines.push((i + 1) + '. ' + prompt + ' — ' + answers.join('; '));
  });
  return lines.join('\n');
}

function sheaDayId_(ms) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD, Eastern
}

// --- Firestore (read-only) ------------------------------------------------------------

function sheaGet_(path) {
  var res = UrlFetchApp.fetch(SHEA.FIRESTORE + '/' + path + '?key=' + SHEA.FIREBASE_KEY, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  return sheaFields_(JSON.parse(res.getContentText()).fields);
}

function sheaList_(collection) {
  var res = UrlFetchApp.fetch(SHEA.FIRESTORE + '/' + collection + '?pageSize=100&key=' + SHEA.FIREBASE_KEY, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return [];
  return (JSON.parse(res.getContentText()).documents || []).map(function (d) {
    return { id: d.name.slice(d.name.lastIndexOf('/') + 1), data: sheaFields_(d.fields) };
  });
}

function sheaFields_(fields) {
  var out = {};
  Object.keys(fields || {}).forEach(function (k) { out[k] = sheaValue_(fields[k]); });
  return out;
}

function sheaValue_(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(sheaValue_);
  if ('mapValue' in v) return sheaFields_(v.mapValue.fields);
  return null;
}

// --- Gemini ---------------------------------------------------------------------------

function sheaAsk_(props, system, question) {
  if (!props.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  var model = props.GEMINI_MODEL || 'gemini-flash-latest';
  // Ask for quick answers ("low" thinking): a ruling doesn't need deep thought, and
  // full thinking can take minutes. Models that don't know the setting get asked without it.
  var res = sheaGemini_(props, model, system, question, true);
  if (res.getResponseCode() === 400) res = sheaGemini_(props, model, system, question, false);
  if (res.getResponseCode() === 404) { // model name retired: use whichever Flash model is on offer
    var other = sheaPickModel_(props);
    if (other && other !== model) {
      res = sheaGemini_(props, other, system, question, true);
      if (res.getResponseCode() === 400) res = sheaGemini_(props, other, system, question, false);
    }
  }
  if (res.getResponseCode() !== 200) throw new Error('Gemini said ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  var body = JSON.parse(res.getContentText());
  var parts = (((body.candidates || [])[0] || {}).content || {}).parts || [];
  var text = parts.map(function (p) { return p.text || ''; }).join('').trim();
  if (!text) throw new Error('Gemini gave no answer: ' + res.getContentText().slice(0, 300));
  return text.slice(0, 1200);
}

function sheaGemini_(props, model, system, question, quick) {
  var config = { temperature: 0.7, maxOutputTokens: 2000 };
  if (quick) config.thinkingConfig = { thinkingLevel: 'low' };
  return UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': props.GEMINI_API_KEY },
    payload: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: question }] }],
      generationConfig: config,
    }),
    muteHttpExceptions: true,
  });
}

function sheaPickModel_(props) {
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': props.GEMINI_API_KEY }, muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return null;
  var names = (JSON.parse(res.getContentText()).models || [])
    .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; })
    .map(function (m) { return m.name.replace('models/', ''); })
    .filter(function (n) { return /flash/.test(n) && !/image|tts|audio|live|embedding/.test(n); });
  return names.sort().reverse()[0] || null;
}

// --- WhatsApp (GREEN-API) -----------------------------------------------------------------

function sheaGreen_(props, method, body) {
  var url = String(props.GREEN_API_URL || '').replace(/\/$/, '') + '/waInstance' + props.GREEN_API_INSTANCE + '/' + method + '/' + props.GREEN_API_TOKEN;
  var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('WhatsApp ' + method + ' failed: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText() || '{}');
}

function sheaSend_(props, message, replyToId) {
  var body = { chatId: props.WHATSAPP_CHAT_ID, message: message };
  if (replyToId) body.quotedMessageId = replyToId;
  return sheaGreen_(props, 'sendMessage', body);
}

// --- Run these by hand from the editor ------------------------------------------------------

// 1. Checks the AI key and the game data, without touching WhatsApp. Logs each
// step as it goes, so if something is slow or stuck you can see which one.
function sheabotTest() {
  var props = sheaProps_();
  var t0 = Date.now();
  var lap = function (label) { console.log('[' + ((Date.now() - t0) / 1000).toFixed(1) + 's] ' + label); };
  lap('Starting. AI key ' + (props.GEMINI_API_KEY ? 'found (' + props.GEMINI_API_KEY.length + ' characters).' : 'MISSING: add a Script Property named GEMINI_API_KEY.'));
  if (!props.GEMINI_API_KEY) return;

  lap('Step 1 of 3: reading the game results...');
  var context = sheaGameContext_(Date.now());
  lap('Got them: ' + context.split('\n').length + ' lines.');

  lap('Step 2 of 3: asking Google which AI models this key can use...');
  var list = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': props.GEMINI_API_KEY }, muteHttpExceptions: true,
  });
  if (list.getResponseCode() !== 200) {
    lap('Google refused the key (' + list.getResponseCode() + '): ' + list.getContentText().slice(0, 300));
    return;
  }
  var flash = (JSON.parse(list.getContentText()).models || []).map(function (m) { return m.name.replace('models/', ''); })
    .filter(function (n) { return /flash/.test(n); });
  lap('Key works. Flash models on offer: ' + (flash.join(', ') || '(none)'));

  var msg = { from: 'Josh', text: 'Sheabot, is "fruit salad" a legit answer for "a sandwich" starting with F?', quoted: '' };
  // Lighter and older models first: they tend to answer fastest on the free tier.
  // The newest one goes last, since it can take minutes. Press Stop once you've seen enough.
  var models = ['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash', props.GEMINI_MODEL || 'gemini-flash-latest']
    .filter(function (m, i, all) { return all.indexOf(m) === i; });
  models.forEach(function (model, i) {
    lap('Step 3 of 3 (' + (i + 1) + '/' + models.length + '): asking ' + model + ' for a ruling...');
    var started = Date.now();
    try {
      var p2 = {};
      Object.keys(props).forEach(function (k) { p2[k] = props[k]; });
      p2.GEMINI_MODEL = model;
      var answer = sheaAsk_(p2, sheaSystem_(props), sheaQuestion_(msg, context));
      lap(model + ' took ' + ((Date.now() - started) / 1000).toFixed(1) + ' seconds and says: ' + answer);
    } catch (err) {
      lap(model + ' failed: ' + err.message);
    }
  });
  lap('Done. Sheabot uses ' + (props.GEMINI_MODEL || 'gemini-flash-latest') + ' unless you set a Script Property GEMINI_MODEL to another one.');
}

// 2. Tells GREEN-API to forward the group's messages to this script. Run once, after deploying the web app.
function sheabotConnect() {
  var props = sheaProps_();
  ['GEMINI_API_KEY', 'GREEN_API_URL', 'GREEN_API_INSTANCE', 'GREEN_API_TOKEN', 'WHATSAPP_CHAT_ID', 'WEBHOOK_KEY', 'WEBAPP_URL'].forEach(function (k) {
    if (!props[k]) throw new Error('Add a Script Property named ' + k + ' first.');
  });
  if (!/\/exec$/.test(props.WEBAPP_URL)) throw new Error('WEBAPP_URL should be the web app URL ending in /exec.');
  sheaGreen_(props, 'setSettings', {
    webhookUrl: props.WEBAPP_URL + '?key=' + encodeURIComponent(props.WEBHOOK_KEY),
    incomingWebhook: 'yes',
    outgoingWebhook: 'no',
    outgoingMessageWebhook: 'no',
    outgoingAPIMessageWebhook: 'no',
    stateWebhook: 'no',
  });
  console.log('Connected. GREEN-API takes a few minutes to apply this. Then say "Sheabot, are you there?" in the group.');
}

// To switch Sheabot off: stops GREEN-API forwarding messages here.
function sheabotDisconnect() {
  sheaGreen_(sheaProps_(), 'setSettings', { webhookUrl: '', incomingWebhook: 'no' });
  console.log('Sheabot is off.');
}
