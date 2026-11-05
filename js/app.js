import * as T from './time.js?v=202611051932';
import * as G from './game.js?v=202611051932';
import { scoreDay, scoreWeek, hasPlayed, normalize } from './scoring.js?v=202611051932';
import { FAMILY_CODE_SHA256, ADMIN_CODE_SHA256, TIMER_SECONDS, ASSISTED_PLAYERS } from './config.js?v=202611051932';
import { PLAYTEST, exitPlaytest } from './mode.js?v=202611051932';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const sheetEl = $('#sheet');
const toastEl = $('#toast');

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const store = {
  get(k, fallback = null) {
    try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.trim().toLowerCase()));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function errorMessage(e) {
  if (e?.status === 0) return 'Can’t reach the internet. Check your connection and try again.';
  if (e?.status === 403) return 'The database isn’t letting us in yet (security rules not set up).';
  return 'Something went wrong. Please try again.';
}

function fail(e) {
  console.error(e);
  toast(errorMessage(e));
}

async function share(text) {
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  try { await navigator.clipboard.writeText(text); toast('Copied! Paste it in the group chat.'); } catch { toast('Couldn’t share on this device.'); }
}

// ---------------------------------------------------------------------------
// Updates: phones can hold on to an old copy of the site. The app knows its
// own version (the ?v= stamp on this file); it checks the live page now and
// then, and reloads itself when there's a newer one (never mid-card).
// ---------------------------------------------------------------------------

const VERSION = new URL(import.meta.url).searchParams.get('v') || 'dev';
let pendingUpdate = null;

async function checkForUpdate() {
  if (VERSION === 'dev' || !navigator.onLine) return;
  try {
    const res = await fetch(`${location.pathname}?check=${Date.now()}`, { cache: 'no-store' });
    const latest = (await res.text()).match(/js\/app\.js\?v=([\w-]+)/)?.[1];
    if (latest && latest !== VERSION) { pendingUpdate = latest; applyUpdate(); }
  } catch { /* offline: try again later */ }
}

function applyUpdate() {
  const r = route().name;
  if (!pendingUpdate || r === 'play' || r === 'help') return; // wait until the card is done
  location.replace(`${location.pathname}?v=${pendingUpdate}${location.hash}`);
}

// Tidy the address bar after an update reload.
if (new URLSearchParams(location.search).has('v')) history.replaceState(null, '', location.pathname + location.hash);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const AS = document.documentElement.dataset.as || null; // e.g. "kenny" on kenny.html
const S = {
  famOk: store.get('ds.fam') === true,
  me: store.get('ds.me'), // { id, name }
  admin: store.get('ds.admin') === true,
  today: G.todayId(),
  loaded: false,
  error: null,
};

// The player whose card this device plays from the Today screen.
const helped = AS ? G.assistedById(AS) : null;

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name: parts[0] || 'today', arg: parts[1] || null };
}

function go(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

window.addEventListener('hashchange', () => { closeSheet(); applyUpdate(); render(); window.scrollTo(0, 0); });

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

let playCleanup = null;

async function render() {
  if (playCleanup) { playCleanup(); playCleanup = null; }
  if (PLAYTEST) { try { await G.loadClock(); } catch { /* offline */ } }
  S.today = G.todayId();

  if (!S.famOk || (!S.me && !AS)) return renderGate();

  const r = route();
  if (r.name === 'play') return renderPlay(S.me.id, S.me.name, false);
  if (r.name === 'help' && G.assistedById(r.arg)) return renderPlay(r.arg, G.assistedById(r.arg).name, true);

  const views = { today: viewToday, day: viewDay, week: viewWeek, past: viewPast };
  const view = views[r.name] ?? viewToday;
  if (!S.loaded) app.innerHTML = shell(r.name, '<div class="loading">Loading…</div>');
  try {
    const html = await view(r.arg);
    if (route().name !== r.name || route().arg !== r.arg) return; // navigated away meanwhile
    app.innerHTML = shell(r.name, html);
    S.loaded = true;
  } catch (e) {
    console.error(e);
    app.innerHTML = shell(r.name, `<div class="card empty"><p>${esc(errorMessage(e))}</p><button class="btn" data-act="reload">Try again</button></div>`);
  }
}

function shell(active, body) {
  const who = AS ? `${esc(helped.name)}’s card` : esc(S.me?.name ?? '');
  const tab = (name, label, icon) =>
    `<a href="#/${name === 'today' ? '' : name}" class="tab ${active === name ? 'on' : ''}"><span class="ti" aria-hidden="true">${icon}</span>${label}</a>`;
  return `
    <header class="top">
      <a href="#/" class="brand"><span class="brand-tile">S</span>Daily Scatter</a>
      <button class="who" data-act="settings" aria-label="Settings">${who}<span class="gear" aria-hidden="true">⚙︎</span></button>
    </header>
    ${PLAYTEST ? playtestBar() : ''}
    <main class="main">${body}</main>
    <nav class="tabs">
      ${tab('today', 'Today', '☀︎')}
      ${tab('week', 'This week', '★︎')}
      ${tab('past', 'Past weeks', '↺︎')}
    </nav>`;
}

// --- Playtest controls -----------------------------------------------------

function playtestBar() {
  const day = G.days[S.today];
  const canReveal = day && !revealed(S.today);
  return `<div class="pt-bar">
    <p><strong>🧪 Playtest</strong> · practice only, nothing here counts</p>
    <div class="pt-actions">
      ${canReveal ? '<button class="btn sm primary" data-act="pt-reveal">Reveal now</button>' : ''}
      <button class="btn sm" data-act="pt-next">Next day ›</button>
      <button class="btn sm ghost" data-act="pt-exit">Exit</button>
    </div>
  </div>`;
}

// --- Gate: family code + name ----------------------------------------------

async function renderGate() {
  let players = [];
  if (S.famOk && !AS) {
    try { players = (await G.listPlayers()).filter((p) => !G.assistedById(p.id)); } catch (e) { console.error(e); }
  }
  const step = S.famOk ? 'name' : 'code';
  app.innerHTML = `
    <div class="gate">
      <div class="gate-tile" aria-hidden="true">S</div>
      <h1>Daily Scatter</h1>
      <p class="sub">${AS ? `${esc(helped.name)}’s card` : 'The family’s daily category game'}</p>
      ${step === 'code' ? `
        <form class="card form" data-form="code">
          <label for="code">Family code</label>
          <input id="code" name="code" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" required>
          <button class="btn primary big">Come on in</button>
        </form>` : `
        <form class="card form" data-form="name">
          ${players.length ? `<p class="label">Who are you?</p>
          <div class="chips pick">${players.sort((a, b) => a.name.localeCompare(b.name)).map((p) =>
            `<button type="button" class="chip big" data-act="pick" data-id="${esc(p.id)}" data-name="${esc(p.name)}">${esc(p.name)}</button>`).join('')}</div>
          <p class="label or">New here? Type your first name</p>` : '<label for="name">Your first name</label>'}
          <input id="name" name="name" autocomplete="given-name" autocapitalize="words" maxlength="20" ${players.length ? '' : 'required'}>
          <button class="btn primary big">Let’s play</button>
        </form>`}
    </div>`;
  $('input', app)?.focus();
}

async function submitCode(form) {
  const code = form.code.value;
  if ((await sha256(code)) !== FAMILY_CODE_SHA256) { toast('That’s not the family code.'); return; }
  S.famOk = true;
  store.set('ds.fam', true);
  render();
}

async function choosePlayer(name) {
  name = name.trim().replace(/\s+/g, ' ');
  const id = G.playerId(name);
  if (!id) { toast('Please type your first name.'); return; }
  if (G.assistedById(id)) { toast(`${name} plays from their own page. Ask whoever helps them!`); return; }
  try { await G.savePlayer(id, name); } catch (e) { fail(e); return; }
  S.me = { id, name };
  store.set('ds.me', S.me);
  go('#/');
}

// --- Today --------------------------------------------------------------

async function viewToday() {
  const today = S.today;
  await G.loadWeek(T.weekId(today), today, { onlyFresh: [today] });
  const day = G.days[today];
  const now = Date.now();
  const lock = G.lockAt(today);
  const locked = now >= lock;

  let html = `<h2 class="date">${esc(T.dayLabel(today, true))}</h2>`;
  if (day?.title) html += `<p class="special">✨ ${esc(day.title)}</p>`;

  if (locked) {
    html += day ? await viewDay(today, { embedded: true }) : `<div class="card empty"><p>Nobody played today. Cards open again tomorrow at midnight.</p></div>`;
    return html + weekTeaser();
  }

  const mainId = AS ? AS : S.me.id;
  const mainName = AS ? helped.name : S.me.name;
  html += AS ? assistedCard(day, mainId, mainName, now, lock, true) : myCard(day, now, lock);
  if (!AS) for (const p of ASSISTED_PLAYERS) html += assistedCard(day, p.id, p.name, now, lock, false);
  html += whoPlayed(day, now);
  html += `<p class="fine">${revealPhrase(today, now)}</p>`;
  return html + weekTeaser();
}

function myCard(day, now, lock) {
  const card = day?.cards?.[S.me.id];
  const left = lock - now;
  const short = left < TIMER_SECONDS * 1000 ? `<p class="warn">Heads up: only ${esc(T.timerLabel(left))} left before cards lock.</p>` : '';
  if (!day) {
    return `<section class="card hero">
      <p class="eyebrow">You’re first today!</p>
      <h3>Roll today’s letter</h3>
      <p>You’ll roll the letter for everyone, then your 3-minute timer starts right away.</p>
      ${short}
      <button class="btn primary big" data-act="start">🎲 Roll &amp; start</button>
    </section>`;
  }
  if (!card?.startedAt) {
    return `<section class="card hero">
      <p class="eyebrow">Letter rolled by ${esc(day.rolledBy)} at ${esc(T.clockLabel(day.rolledAt))}</p>
      <h3>Ready when you are</h3>
      <p>5 categories, one secret letter, 3 minutes. The letter stays hidden until you hit start.</p>
      ${short}
      <button class="btn primary big" data-act="start">Start my card</button>
    </section>`;
  }
  if (G.cardOpen(card, S.today, now)) {
    return `<section class="card hero">
      <h3>Your card is still open!</h3>
      <p>${esc(T.timerLabel(G.deadline(card, S.today) - now))} left on the clock.</p>
      <button class="btn primary big" data-act="resume">Back to my card</button>
    </section>`;
  }
  return `<section class="card">
    <p class="eyebrow ok">✓ You’re locked in</p>
    ${answerList(day, card)}
    <p class="fine">${PLAYTEST ? 'Answers appear when someone taps Reveal now.' : `Everyone’s answers appear at ${esc(T.clockLabel(lock))} ET.`}</p>
  </section>`;
}

function answerList(day, card) {
  return `<div class="mine"><div class="letter-tile sm">${esc(day.letter)}</div><ol>
    ${day.prompts.map((p, i) => {
      const a = card.answers?.[i] ?? '';
      return `<li><span class="p">${esc(p)}</span><span class="a ${a ? '' : 'blank'}">${a ? esc(a) : '—'}</span></li>`;
    }).join('')}</ol></div>`;
}

function assistedCard(day, pid, name, now, lock, isMain) {
  const card = day?.cards?.[pid];
  const filled = (card?.answers ?? []).filter((a) => String(a).trim()).length;
  const open = `<a class="btn ${isMain ? 'primary big' : 'sm'}" href="#/help/${pid}">`;
  const skip = `<button class="btn ghost ${isMain ? '' : 'sm'}" data-act="skip" data-pid="${pid}">Not today 😴</button>`;
  let status, actions;
  if (card?.skipped) {
    status = `😴 ${esc(name)} is sitting out today.`;
    actions = `<button class="btn ${isMain ? '' : 'sm'}" data-act="unskip" data-pid="${pid}">Actually, let’s play</button>`;
  } else if (card?.startedAt) {
    status = filled === 5 ? '✓ All 5 answers are in.' : `${filled} of 5 answered.`;
    actions = `${open}${filled === 5 ? 'Review' : 'Continue'}</a>${filled ? '' : skip}`;
  } else {
    status = isMain ? `No timer. Ask ${esc(name)} each category and type in the answer. You can stop and come back.` : 'No timer.';
    actions = `${open}${day ? 'Start' : '🎲 Roll &amp; start'}${isMain ? ` ${esc(name)}’s card` : ''}</a>${skip}`;
  }
  status += ` ${esc(lockPhrase(S.today, now))}.`;
  if (isMain) {
    return `<section class="card hero"><h3>${esc(name)}’s card</h3><p>${status}</p><div class="row">${actions}</div></section>`;
  }
  return `<section class="card helper">
    <div class="helper-row">
      <div><p class="label">Helping ${esc(name)} play?</p><p class="fine">${status}</p></div>
      <div class="helper-actions">${actions}</div>
    </div>
  </section>`;
}

function whoPlayed(day, now) {
  const cards = Object.entries(day?.cards ?? {});
  if (!cards.length) return '';
  const chips = cards.sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([, c]) => {
    const allIn = c.assisted && (c.answers ?? []).filter((a) => String(a).trim()).length === 5;
    const icon = c.skipped ? '😴' : G.cardOpen(c, S.today, now) && !allIn ? '⏳' : '✓';
    return `<span class="chip">${icon} ${esc(c.name)}</span>`;
  }).join('');
  return `<section class="card"><p class="label">Played so far</p><div class="chips">${chips}</div></section>`;
}

function weekTeaser() {
  const { rows, winners } = currentWeekScores(T.weekId(S.today));
  if (!rows.length) return '';
  const lead = rows.filter((r) => winners.includes(r.id)).map((r) => esc(r.name)).join(' & ');
  return `<a class="card teaser" href="#/week"><span>This week</span><strong>${lead ? `👑 ${lead} · ${rows[0].total}` : 'No points yet'}</strong><span class="chev">›</span></a>`;
}

function revealed(dayId, now = Date.now()) {
  return G.isRevealed(dayId, now);
}

// "Locks in 2h 10m" (or the playtest equivalent).
function lockPhrase(dayId, now = Date.now()) {
  if (PLAYTEST) return 'Open until someone taps Reveal now';
  return `Locks in ${T.durationLabel(G.lockAt(dayId) - now)}`;
}

function revealPhrase(dayId, now = Date.now()) {
  if (PLAYTEST) return 'Playtest: answers appear when someone taps <strong>Reveal now</strong> above.';
  const lock = G.lockAt(dayId);
  return `Cards lock and answers are revealed at ${esc(T.clockLabel(lock))} ET · in ${esc(T.durationLabel(lock - now))}`;
}

function currentWeekScores(wid) {
  const ids = T.weekDays(wid).filter((d) => d <= S.today && revealed(d));
  return scoreWeek(ids.map((id) => ({ id, day: G.days[id] })));
}

// --- Play: my timed card, or an assisted card ---------------------------

async function renderPlay(pid, name, assisted) {
  const today = S.today;
  app.innerHTML = `<div class="loading full">Loading…</div>`;
  let day, card;
  try {
    day = G.days[today] ?? await G.loadDay(today);
    if (G.isRevealed(today)) { toast('Today’s cards are locked.'); go('#/'); return; }
    const isNew = !day;
    if (!day) day = await G.rollDay(today, AS ? helped.name : S.me.name);
    card = day.cards?.[pid];
    const fresh = !card?.startedAt || card.skipped;
    if (!assisted && card?.startedAt && !G.cardOpen(card, today)) { go('#/'); return; }
    if (fresh) {
      const reveal = rollAnimation(day.letter, isNew);
      card = await G.startCard(today, pid, name, { assisted, delayMs: assisted ? 0 : 1300 });
      await reveal;
      day = G.days[today];
    }
  } catch (e) {
    fail(e);
    app.innerHTML = `<div class="card empty"><p>${esc(errorMessage(e))}</p><a class="btn" href="#/">Back</a></div>`;
    return;
  }
  playCard(day, pid, card, { assisted, name });
}

function rollAnimation(letter, rolling) {
  const ov = document.createElement('div');
  ov.className = 'roll';
  ov.innerHTML = `<p>${rolling ? 'Rolling today’s letter…' : 'Today’s letter is…'}</p><div class="letter-tile xl spin">?</div>`;
  document.body.appendChild(ov);
  const tile = $('.letter-tile', ov);
  const pool = 'ABCDEFGHIJKLMNOPRSTW';
  const iv = setInterval(() => { tile.textContent = pool[Math.floor(Math.random() * pool.length)]; }, 70);
  return new Promise((res) => setTimeout(() => {
    clearInterval(iv);
    tile.textContent = letter;
    tile.classList.remove('spin');
    tile.classList.add('land');
    setTimeout(() => { ov.classList.add('out'); setTimeout(() => ov.remove(), 250); res(); }, 650);
  }, 1100));
}

// Saves answers as you type, retries when offline, and keeps a local backup.
function makeSaver(dayId, pid, onStatus) {
  const bkKey = `ds.bk.${dayId}.${pid}`;
  let pending = null, timer = null, inflight = null;
  async function flush() {
    clearTimeout(timer);
    if (inflight) { await inflight; return pending && flush(); }
    if (!pending) return;
    const fields = pending; pending = null;
    onStatus('saving');
    inflight = G.saveCardFields(dayId, pid, fields).then(
      () => { if (!pending) { store.del(bkKey); onStatus('saved'); } },
      () => { pending = { ...fields, ...pending }; onStatus('offline'); timer = setTimeout(flush, 3000); },
    ).finally(() => { inflight = null; });
    await inflight;
  }
  return {
    queue(fields, delay = 600) {
      pending = { ...pending, ...fields };
      store.set(bkKey, { ...store.get(bkKey, {}), ...fields, at: Date.now() });
      onStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
  };
}

// If a save never made it (closed the app offline), push the local backup.
async function syncBackup(dayId, pid) {
  const bk = store.get(`ds.bk.${dayId}.${pid}`);
  if (!bk) return;
  const card = G.days[dayId]?.cards?.[pid];
  if (!card || (card.updatedAt ?? 0) >= bk.at) { store.del(`ds.bk.${dayId}.${pid}`); return; }
  const { at, ...fields } = bk;
  try { await G.saveCardFields(dayId, pid, fields); store.del(`ds.bk.${dayId}.${pid}`); } catch { /* try again next time */ }
}

function saveBadge(state) {
  const el = $('.save');
  if (!el) return;
  el.dataset.state = state;
  el.textContent = { saving: 'Saving…', saved: 'Saved ✓', offline: 'Offline – retrying' }[state] ?? '';
}

// --- Keyboard-aware layout ---------------------------------------------------
// iOS doesn't shrink the page when the keyboard opens; only the "visual
// viewport" shrinks. The play screens size themselves to it (via --vvh/--vvt)
// and switch to a compact layout (body.kb) while the keyboard is up.
const vv = window.visualViewport;
function syncViewport() {
  const root = document.documentElement;
  const h = vv ? vv.height : window.innerHeight;
  root.style.setProperty('--vvh', `${h}px`);
  root.style.setProperty('--vvt', `${vv ? vv.offsetTop : 0}px`);
  document.body.classList.toggle('kb', window.innerHeight - h > 120);
}
if (vv) { vv.addEventListener('resize', syncViewport); vv.addEventListener('scroll', syncViewport); }
window.addEventListener('resize', syncViewport);
syncViewport();

// Keep the focused answer just below the header, once the keyboard has settled.
function keepInView(row, scroller) {
  const go = () => { if (scroller && row) scroller.scrollTop = Math.max(0, row.offsetTop - 6); };
  go();
  setTimeout(go, 120);
  setTimeout(go, 400);
}

// One play screen for both modes. Timed: 3-minute clock. Assisted (Kenny):
// no clock, a "Kenny mode" tag instead, and the card stays open until the lock.
function playCard(day, pid, card, { assisted = false, name = '' } = {}) {
  const today = S.today;
  const n = day.prompts.length;
  const answers = (card.answers ?? []).slice();
  while (answers.length < n) answers.push('');
  const bk = store.get(`ds.bk.${today}.${pid}`);
  if (bk?.answers && bk.at > (card.updatedAt ?? 0)) bk.answers.forEach((a, i) => { answers[i] = a; });

  const L = esc(day.letter);
  const status = assisted
    ? `<span class="mode-tag">${esc(name)} mode</span>`
    : `<span class="t">${esc(T.timerLabel(G.deadline(card, today) - Date.now()))}</span>`;
  const foot = assisted
    ? `<button class="btn go big" data-act="assist-done">Done for now ✓</button>
       <p class="fine">Answers save as you type. You can come back and change them ${PLAYTEST ? 'until someone taps Reveal now' : `until ${esc(T.clockLabel(G.lockAt(today)))} ET`}.</p>`
    : '<button class="btn go big" data-act="done-early">I’m done</button>';

  app.innerHTML = `
    <div class="play screen ${assisted ? 'assisted' : ''}">
      <div class="play-top">
        <div class="letter-tile sm" aria-label="Letter ${L}">${L}</div>
        <span class="save" aria-live="polite"></span>
        <div class="clock">${status}</div>
        ${assisted ? '' : '<div class="tbar" aria-hidden="true"><i></i></div>'}
      </div>
      <div class="scroller">
        <form class="answers" autocomplete="off" onsubmit="return false">
          ${day.prompts.map((p, i) => `
            <label class="ans">
              <span class="p"><span class="n">${i + 1}</span>${esc(p)}</span>
              <input data-i="${i}" name="a${i}" value="${esc(answers[i])}" maxlength="60" autocomplete="off" autocapitalize="words" enterkeyhint="${i < n - 1 ? 'next' : 'done'}" placeholder="${assisted ? `${esc(name)}’s answer` : `${L}…`}">
            </label>`).join('')}
        </form>
        <div class="play-foot">${foot}</div>
        <div class="kb-spacer"></div>
      </div>
    </div>`;

  const saver = makeSaver(today, pid, saveBadge);
  const scroller = $('.scroller', app);
  const inputs = [...app.querySelectorAll('.answers input')];

  // No using the same answer twice on one card: warn while typing, clear it on leaving the box.
  const repeatOf = (i) => {
    const norm = normalize(answers[i]);
    if (!norm) return -1;
    return answers.findIndex((a, j) => j !== i && normalize(a) === norm);
  };
  // Only the box being typed in turns red (no extra text, so nothing jumps); it's cleared when you leave it.
  const showRepeat = (el) => {
    const i = +el.dataset.i;
    const j = repeatOf(i);
    const row = el.closest('.ans');
    row.classList.toggle('repeat', j >= 0);
    el.setAttribute('aria-invalid', j >= 0 ? 'true' : 'false');
  };
  const clearRepeat = (el) => {
    const i = +el.dataset.i;
    const j = repeatOf(i);
    if (j < 0 || el.disabled) return;
    toast(`“${el.value.trim()}” is already your answer for #${j + 1}.`);
    el.value = '';
    answers[i] = '';
    saver.queue({ answers: answers.slice() });
    showRepeat(el);
  };

  inputs.forEach((el) => {
    el.addEventListener('input', () => {
      answers[+el.dataset.i] = el.value;
      saver.queue({ answers: answers.slice() });
      showRepeat(el);
    });
    el.addEventListener('blur', () => clearRepeat(el));
    el.addEventListener('focus', () => keepInView(el.closest('.ans'), scroller));
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const next = inputs[+el.dataset.i + 1];
      if (next) next.focus(); else el.blur();
    });
  });
  const onResize = () => { const a = document.activeElement; if (a?.closest?.('.answers')) keepInView(a.closest('.ans'), scroller); };
  vv?.addEventListener('resize', onResize);
  (inputs.find((el) => !el.value) ?? inputs[0]).focus();

  let finished = false;
  const tEl = $('.clock .t', app);
  const finish = async (why) => {
    if (finished) return;
    finished = true;
    clearInterval(iv);
    // Drop any repeat that's still there (keep the first one).
    answers.forEach((a, i) => {
      const norm = normalize(a);
      if (norm && answers.slice(0, i).some((b) => normalize(b) === norm)) { answers[i] = ''; inputs[i].value = ''; }
    });
    inputs.forEach((el) => { el.disabled = true; });
    document.activeElement?.blur?.();
    $('.play', app)?.classList.add('over');
    if (tEl) tEl.textContent = '0:00';
    const fields = { answers: answers.slice() };
    if (why === 'early') fields.doneAt = Date.now();
    saver.queue(fields, 0);
    const msg = { early: 'Locked in!', time: 'Time’s up! Answers locked.', reveal: 'Cards are locked for today.' }[why];
    $('.play-foot', app).innerHTML = `<p class="over-msg">${msg}</p><a class="btn primary big" href="#/">Done</a>`;
    scroller.scrollTop = scroller.scrollHeight;
    await saver.flush();
  };

  let armed = null; // "I'm done" needs a second tap, so a stray tap can't end your card
  playActions.doneEarly = (btn) => {
    if (armed) { clearTimeout(armed); finish('early'); return; }
    btn.textContent = 'Tap again to lock in';
    btn.classList.add('armed');
    armed = setTimeout(() => { armed = null; btn.textContent = 'I’m done'; btn.classList.remove('armed'); }, 3000);
  };
  playActions.assistDone = async () => { await saver.flush(); go('#/'); };

  const tick = () => {
    if (assisted) {
      if (G.isRevealed(today)) { finish('reveal'); toast('Cards are locked for today.'); }
      return;
    }
    const end = G.deadline(card, today);
    const left = end - Date.now();
    tEl.textContent = T.timerLabel(left);
    tEl.classList.toggle('hurry', left <= 30000);
    const bar = $('.tbar i', app);
    if (bar) {
      bar.style.transform = `scaleX(${Math.max(0, Math.min(1, left / Math.max(1, end - card.startedAt)))})`;
      bar.parentElement.classList.toggle('hurry', left <= 30000);
    }
    if (left <= 0) finish('time');
  };
  const iv = setInterval(tick, assisted ? 15000 : 250);
  tick();
  playCleanup = () => {
    clearInterval(iv);
    clearTimeout(armed);
    vv?.removeEventListener('resize', onResize);
    saver.flush();
    playActions.doneEarly = playActions.assistDone = null;
  };
}

const playActions = { doneEarly: null, assistDone: null };

// --- Day results ----------------------------------------------------------

async function viewDay(id, { embedded = false } = {}) {
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(id)) return '<div class="card empty"><p>Day not found.</p></div>';
  const day = G.days[id] !== undefined && embedded ? G.days[id] : await G.loadDay(id);
  const top = embedded ? '' : `<a class="back" href="#/week/${T.weekId(id)}">‹ Week of ${esc(T.monthDay(T.weekId(id)))}</a><h2 class="date">${esc(T.dayLabel(id, true))}</h2>`;
  if (!day) return `${top}<div class="card empty"><p>Nobody played this day.</p></div>`;
  if (!revealed(id)) {
    return `${top}<div class="card empty"><p>${PLAYTEST ? 'Answers appear when someone taps Reveal now.' : `Answers are revealed at ${esc(T.clockLabel(G.lockAt(id)))} ET.`}</p></div>`;
  }
  const { players, order } = scoreDay(day);
  const playing = order.filter((pid) => players[pid].played);
  const sitting = order.filter((pid) => !players[pid].played);
  const meId = S.me?.id;

  const meRank = playing.indexOf(meId);
  const youLine = meRank >= 0
    ? `<p class="you">You: <strong>${players[meId].total} point${players[meId].total === 1 ? '' : 's'}</strong> · ${ordinal(playing.findIndex((x) => players[x].total === players[meId].total) + 1)} of ${playing.length}</p>`
    : '';
  const standings = playing.map((pid, i) => `
    <li class="${pid === meId ? 'me' : ''}"><span class="rank">${rankLabel(playing, players, i)}</span><span class="nm">${esc(players[pid].name)}</span><span class="pts">${players[pid].total}</span></li>`).join('')
    + sitting.map((pid) => `<li class="out"><span class="rank">😴</span><span class="nm">${esc(players[pid].name)}</span><span class="pts">–</span></li>`).join('');

  const sections = day.prompts.map((prompt, i) => {
    const rows = playing.map((pid) => {
      const a = players[pid].answers[i];
      const cls = [a.dupe || a.repeatOf !== null ? 'dupe' : '', a.text && !a.valid ? 'invalid' : '', !a.text ? 'blank' : '', a.override !== null ? 'overridden' : '', a.flags.length ? 'flagged' : ''].join(' ');
      const pending = a.merges.some((m) => !m.confirmed);
      const marks = `${a.flags.length ? `<span class="mk flag">🚩${a.flags.length}</span>` : ''}${pending ? '<span class="mk">≈?</span>' : ''}${a.override !== null ? '<span class="mk adm">set</span>' : ''}`;
      return `<button class="ansrow ${cls}" data-act="answer" data-day="${id}" data-pid="${pid}" data-i="${i}">
        <span class="nm">${esc(players[pid].name)}</span>
        <span class="tx">${a.text ? esc(a.text) : '—'}</span>
        ${marks}
        <span class="pt">${a.points ? `+${a.points}` : '0'}</span>
      </button>`;
    }).join('');
    return `<section class="card prompt"><h4><span class="n">${i + 1}</span>${esc(prompt)}</h4>${rows}</section>`;
  }).join('');

  return `${top}
    <section class="card day-head">
      <div class="letter-tile">${esc(day.letter)}</div>
      <div><p class="eyebrow">${day.title ? `✨ ${esc(day.title)} · ` : ''}Rolled by ${esc(day.rolledBy)}</p>${youLine}<ol class="standings">${standings}</ol></div>
    </section>
    <p class="fine">Struck-through answers matched someone else’s. Tap any answer to flag it${AS ? '' : ' or mark two as the same'}.</p>
    ${sections}
    <button class="btn big" data-act="share-day" data-day="${id}">Share results</button>`;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function rankLabel(ids, players, i) {
  const first = ids.findIndex((x) => players[x].total === players[ids[i]].total);
  return ['🥇', '🥈', '🥉'][first] ?? `${first + 1}`;
}

function dayShareText(id) {
  const day = G.days[id];
  const { players, order } = scoreDay(day);
  const playing = order.filter((p) => players[p].played);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = playing.map((p, i) => {
    const first = playing.findIndex((x) => players[x].total === players[p].total);
    return `${medals[first] ?? `${first + 1}.`} ${players[p].name} ${players[p].total}`;
  });
  const wk = currentWeekScores(T.weekId(id));
  const week = wk.rows.slice(0, 5).map((r) => `${r.name} ${r.total}`).join(', ');
  return `Daily Scatter · ${T.dayLabel(id)} · Letter ${day.letter}\n${lines.join('\n')}\n\nWeek so far: ${week}\n${appUrl()}`;
}

function appUrl() {
  return location.href.replace(/[^/]*(#.*)?$/, '');
}

// --- Answer sheet (flag / same-as / admin) -------------------------------

function openAnswerSheet(dayId, pid, idx) {
  const day = G.days[dayId];
  const { players } = scoreDay(day);
  const a = players[pid].answers[idx];
  const meId = S.me?.id;
  const isMine = pid === meId;
  const flaggedByMe = meId && a.flags.includes(meId);
  const nameOf = (id) => players[id]?.name ?? id;

  const info = [];
  if (!a.text) info.push('No answer.');
  else if (!a.valid) info.push(`Doesn’t start with ${esc(day.letter)}, so no points.`);
  if (a.repeatOf !== null) info.push(`Struck: ${esc(players[pid].name)} already used this for #${a.repeatOf + 1}.`);
  if (a.dupe) info.push(`Struck: same as ${a.dupeWith.map((x) => esc(nameOf(x))).join(', ')}.`);
  if (a.flags.length) info.push(`🚩 Flagged by ${a.flags.map((x) => esc(nameOf(x))).join(', ')}.`);
  if (a.override !== null) info.push(`Admin set this to ${a.override} point${a.override === 1 ? '' : 's'} (normally ${a.base}).`);

  const merges = a.merges.map((m) => {
    const other = m.a === pid ? m.b : m.a;
    const key = Object.entries(day.merges ?? {}).find(([, v]) => v === m)?.[0] ?? '';
    const desc = `${esc(nameOf(m.by))} says this is the same as ${esc(nameOf(other))}’s “${esc(players[other]?.answers[idx]?.text)}”`;
    if (m.confirmed) return `<li>✓ ${desc} (confirmed)${S.admin ? ` <button class="link" data-act="merge-remove" data-key="${key}">undo</button>` : ''}</li>`;
    return `<li>${desc}. ${S.admin
      ? `<button class="link" data-act="merge-confirm" data-key="${key}">Confirm</button> <button class="link" data-act="merge-remove" data-key="${key}">Reject</button>`
      : '<em>Waiting for the admin.</em>'}</li>`;
  }).join('');

  const others = Object.entries(players)
    .filter(([id, p]) => id !== pid && p.played && p.answers[idx].text && !a.dupeWith.includes(id))
    .map(([id, p]) => `<button class="chip" data-act="merge-suggest" data-other="${id}">${esc(p.name)}: ${esc(p.answers[idx].text)}</button>`).join('');

  const canAct = !!meId && !AS;
  sheetEl.innerHTML = `
    <div class="sheet-card" role="dialog" aria-modal="true" data-day="${dayId}" data-pid="${pid}" data-i="${idx}">
      <div class="grab"></div>
      <p class="eyebrow">${esc(day.prompts[idx])} · ${esc(day.letter)}</p>
      <h3>${esc(players[pid].name)}: ${a.text ? `“${esc(a.text)}”` : '—'}</h3>
      <p class="big-pts">${a.points} point${a.points === 1 ? '' : 's'}</p>
      ${info.map((t) => `<p>${t}</p>`).join('')}
      ${merges ? `<ul class="merges">${merges}</ul>` : ''}
      ${canAct && a.text && !isMine ? `<button class="btn big ${flaggedByMe ? '' : 'warn'}" data-act="flag" data-on="${flaggedByMe ? '0' : '1'}">${flaggedByMe ? 'Remove my flag' : '🚩 Not legit? Flag it'}</button>` : ''}
      ${canAct && a.text && others ? `<details class="same"><summary>≈ Same as another answer?</summary><p class="fine">Tap the answer that means the same thing. ${S.admin ? '' : 'The admin will confirm.'}</p><div class="chips">${others}</div></details>` : ''}
      ${S.admin && a.text ? `<div class="admin-box">
        <p class="label">Admin: adjust points</p>
        <div class="stepper">
          <button class="btn step" data-act="override" data-pts="${Math.max(0, a.points - 1)}" ${a.points <= 0 ? 'disabled' : ''} aria-label="One point less">−</button>
          <span class="step-val">${a.points}</span>
          <button class="btn step" data-act="override" data-pts="${Math.min(20, a.points + 1)}" ${a.points >= 20 ? 'disabled' : ''} aria-label="One point more">+</button>
        </div>
        <p class="fine">Automatic score: ${a.base}${a.dupe ? ' (struck as a match)' : !a.valid ? ` (doesn’t start with ${esc(day.letter)})` : ''}.${a.override !== null ? ' <button class="link" data-act="override" data-pts="reset">Reset to automatic</button>' : ''}</p>
        ${a.flags.length ? '<button class="btn" data-act="clear-flags">Clear flags</button>' : ''}</div>` : ''}
      <button class="btn ghost big" data-act="close">Close</button>
    </div>`;
  sheetEl.classList.add('open');
}

function closeSheet() {
  sheetEl.classList.remove('open');
  sheetEl.innerHTML = '';
}

async function sheetAction(act, el) {
  const card = el.closest('.sheet-card');
  const { day: dayId, pid } = card.dataset;
  const idx = +card.dataset.i;
  try {
    if (act === 'flag') await G.setFlag(dayId, pid, idx, S.me.id, el.dataset.on === '1');
    if (act === 'merge-suggest') await G.suggestMerge(dayId, idx, pid, el.dataset.other, S.me.id, S.admin);
    if (act === 'merge-confirm') await G.confirmMerge(dayId, el.dataset.key);
    if (act === 'merge-remove') await G.removeMerge(dayId, el.dataset.key);
    if (act === 'override') await G.setOverride(dayId, pid, idx, el.dataset.pts === 'reset' ? null : +el.dataset.pts, S.me?.id ?? 'admin');
    if (act === 'clear-flags') await G.clearFlags(dayId, pid, idx);
  } catch (e) { fail(e); return; }
  if (act === 'merge-suggest' && !S.admin) toast('Sent to the admin to confirm.');
  await render();
  openAnswerSheet(dayId, pid, idx);
}

// --- Week -----------------------------------------------------------------

async function viewWeek(arg) {
  const wid = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? T.weekId(arg) : T.weekId(S.today);
  const ids = await G.loadWeek(wid, S.today);
  const isCurrent = wid === T.weekId(S.today);
  const done = !isCurrent || revealed(T.addDays(wid, 6));
  const { rows, winners } = currentWeekScores(wid);
  const all = T.weekDays(wid);

  const head = all.map((d) => `<th><a href="#/day/${d}">${esc(T.shortWeekday(d)[0])}</a></th>`).join('');
  const body = rows.map((r) => `
    <tr class="${r.id === S.me?.id ? 'me' : ''}">
      <td class="nm">${winners.includes(r.id) ? '👑 ' : ''}${esc(r.name)}</td>
      ${all.map((d) => { const v = r.perDay[d]; return `<td>${v === undefined ? '<span class="dim">·</span>' : v === 'skip' ? '😴' : v}</td>`; }).join('')}
      <td class="tot">${r.total}</td>
    </tr>`).join('');

  const dayList = all.map((d) => {
    const day = G.days[d];
    const future = d > S.today;
    const n = Object.values(day?.cards ?? {}).filter(hasPlayed).length;
    const status = future ? 'Coming up' : !day ? 'Nobody played' : !revealed(d) ? `In progress · ${n} played` : `${n} played`;
    return `<a class="dayrow ${future ? 'future' : ''}" href="${future ? '#/week' : `#/day/${d}`}">
      <span class="dl">${esc(T.dayLabel(d))}</span>
      <span class="lt">${day && revealed(d) ? esc(day.letter) : ''}</span>
      <span class="st">${status}</span></a>`;
  }).join('');

  const title = isCurrent ? 'This week' : `Week of ${T.monthDay(wid)}`;
  const banner = done && winners.length
    ? `<p class="winner">🏆 ${rows.filter((r) => winners.includes(r.id)).map((r) => esc(r.name)).join(' & ')} won the week!</p>` : '';
  return `
    ${isCurrent ? '' : '<a class="back" href="#/past">‹ Past weeks</a>'}
    <h2 class="date">${esc(title)}</h2>
    <p class="fine">${esc(T.monthDay(wid))} – ${esc(T.monthDay(T.addDays(wid, 6)))}. ${isCurrent ? 'Scores reset every Monday.' : ''}</p>
    ${banner}
    ${rows.length ? `<section class="card flush"><table class="board"><thead><tr><th></th>${head}<th>Total</th></tr></thead><tbody>${body}</tbody></table></section>` : '<div class="card empty"><p>No results yet this week. Scores show up after 1pm ET.</p></div>'}
    <section class="card flush days">${dayList}</section>
    ${rows.length ? `<button class="btn big" data-act="share-week" data-week="${wid}">Share standings</button>` : ''}`;
}

function weekShareText(wid) {
  const { rows, winners } = currentWeekScores(wid);
  const isCurrent = wid === T.weekId(S.today);
  const done = !isCurrent || revealed(T.addDays(wid, 6));
  const lines = rows.map((r, i) => `${winners.includes(r.id) ? '👑' : `${i + 1}.`} ${r.name} ${r.total}`);
  return `Daily Scatter · ${done ? 'Final' : 'Standings'} for the week of ${T.monthDay(wid)}\n${lines.join('\n')}\n${appUrl()}`;
}

// --- Past weeks -------------------------------------------------------------

async function viewPast() {
  const ids = await G.loadAllDays();
  const current = T.weekId(S.today);
  const weeks = {};
  for (const id of ids) {
    const w = T.weekId(id);
    if (w !== current) (weeks[w] ??= []).push(id);
  }
  const list = Object.keys(weeks).sort().reverse().map((w) => {
    const { rows, winners } = scoreWeek(weeks[w].map((id) => ({ id, day: G.days[id] })));
    const champ = rows.filter((r) => winners.includes(r.id)).map((r) => esc(r.name)).join(' & ');
    return `<a class="dayrow" href="#/week/${w}"><span class="dl">Week of ${esc(T.monthDay(w))}</span>
      <span class="st">${champ ? `🏆 ${champ} · ${rows[0].total}` : 'No winner'}</span></a>`;
  }).join('');
  return `<h2 class="date">Past weeks</h2>${list ? `<section class="card flush days">${list}</section>` : '<div class="card empty"><p>No past weeks yet. Check back next Monday!</p></div>'}`;
}

// --- Settings sheet ---------------------------------------------------------

function openSettings() {
  const base = appUrl();
  const shortcuts = ASSISTED_PLAYERS.map((p) =>
    `<li><a href="${esc(base)}${esc(p.id)}.html" target="_blank" rel="noopener">${esc(p.name)}’s page</a></li>`).join('');
  sheetEl.innerHTML = `
    <div class="sheet-card settings" role="dialog" aria-modal="true">
      <div class="grab"></div>
      <h3>Settings</h3>
      ${AS ? `<p>This is <strong>${esc(helped.name)}’s</strong> page, for whoever is helping ${esc(helped.name)} play.</p>`
        : `<p>You’re playing as <strong>${esc(S.me.name)}</strong>.</p><button class="btn" data-act="switch">Switch player</button>`}
      <hr>
      <p class="label">Add to your Home Screen</p>
      <p class="fine">In Safari, tap the Share button <span aria-hidden="true">⬆︎</span>, then <strong>Add to Home Screen</strong>. It opens like an app.</p>
      ${!AS && shortcuts ? `<p class="fine">Helping someone play? Open their page, then add <em>that</em> page to your Home Screen too, so you have one icon for you and one for them:</p><ul class="links">${shortcuts}</ul>` : ''}
      <hr>
      ${S.admin ? `<p class="label">Admin mode is on</p><p class="fine">Tap any revealed answer to set its points or confirm “same as” matches.</p><button class="btn" data-act="admin-off">Turn off admin mode</button>`
        : `<form data-form="admin" class="form inline"><input name="code" placeholder="Admin code" autocapitalize="none" autocorrect="off" spellcheck="false" aria-label="Admin code"><button class="btn">Unlock</button></form>`}
      ${PLAYTEST ? '<hr><p class="label">Playtest</p><p class="fine">Practice data is separate from the real game.</p><button class="btn" data-act="pt-wipe">Wipe all playtest data</button>' : ''}
      <button class="btn ghost big" data-act="close">Close</button>
      <p class="version">Version ${esc(VERSION)}</p>
    </div>`;
  sheetEl.classList.add('open');
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

document.addEventListener('click', async (e) => {
  if (e.target === sheetEl) { closeSheet(); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (['flag', 'merge-suggest', 'merge-confirm', 'merge-remove', 'override', 'clear-flags'].includes(act)) {
    el.disabled = true;
    await sheetAction(act, el);
    return;
  }
  switch (act) {
    case 'reload': render(); break;
    case 'pick': choosePlayer(el.dataset.name); break;
    case 'start': go('#/play'); break;
    case 'resume': go('#/play'); break;
    case 'done-early': playActions.doneEarly?.(el); break;
    case 'assist-done': playActions.assistDone?.(); break;
    case 'skip':
    case 'unskip': {
      const p = G.assistedById(el.dataset.pid);
      el.disabled = true;
      try {
        if (!G.days[S.today]) await G.rollDay(S.today, AS ? p.name : S.me.name);
        await G.setSkipped(S.today, p.id, p.name, act === 'skip');
      } catch (err) { fail(err); }
      render();
      break;
    }
    case 'answer': openAnswerSheet(el.dataset.day, el.dataset.pid, +el.dataset.i); break;
    case 'share-day': share(dayShareText(el.dataset.day)); break;
    case 'share-week': share(weekShareText(el.dataset.week)); break;
    case 'settings': openSettings(); break;
    case 'switch':
      S.me = null; store.del('ds.me'); closeSheet(); render(); break;
    case 'admin-off':
      S.admin = false; store.del('ds.admin'); closeSheet(); render(); toast('Admin mode off.'); break;
    case 'close': closeSheet(); break;
    case 'pt-reveal':
      el.disabled = true;
      try { await G.revealNow(S.today); } catch (err) { fail(err); }
      go('#/');
      break;
    case 'pt-next':
      if (!confirm('Jump ahead to the next day? (Playtest only.)')) break;
      el.disabled = true;
      try { await G.nextDay(); } catch (err) { fail(err); }
      go('#/');
      break;
    case 'pt-exit': exitPlaytest(); break;
    case 'pt-wipe':
      if (!confirm('Delete all playtest days and scores? Real games are not affected.')) break;
      try { await G.wipePlaytest(); toast('Playtest data wiped.'); } catch (err) { fail(err); }
      closeSheet();
      go('#/');
      break;
    default: break;
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form;
  if (kind === 'code') await submitCode(form);
  if (kind === 'name') await choosePlayer(form.name.value);
  if (kind === 'admin') {
    if ((await sha256(form.code.value)) !== ADMIN_CODE_SHA256) { toast('Wrong admin code.'); return; }
    S.admin = true; store.set('ds.admin', true); closeSheet(); render(); toast('Admin mode on.');
  }
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

// Refresh every 30s while visible (to see who has played, and catch the 1pm reveal).
let lastRefresh = Date.now();
function maybeRefresh(force = false) {
  if (document.hidden || sheetEl.classList.contains('open')) return;
  const r = route().name;
  if (r === 'play' || r === 'help' || !S.famOk || (!S.me && !AS)) return;
  if (force || Date.now() - lastRefresh > 30000 || G.todayId() !== S.today) { lastRefresh = Date.now(); render(); }
}
setInterval(() => maybeRefresh(), 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); maybeRefresh(true); });
setInterval(checkForUpdate, 5 * 60_000);

// Reveal moment: re-render right at 1pm if the page is open.
setInterval(() => {
  const lock = G.lockAt(S.today);
  const now = Date.now();
  if (now >= lock && now - lock < 5000) maybeRefresh(true);
}, 4000);

// Push any answers that didn't get saved last time, then draw.
(async () => {
  if (S.famOk) {
    const pids = [S.me?.id, ...ASSISTED_PLAYERS.map((p) => p.id)].filter(Boolean);
    try {
      await G.loadClock();
      S.today = G.todayId();
      await G.loadDay(S.today);
      await Promise.all(pids.map((pid) => syncBackup(S.today, pid)));
    } catch { /* offline; render will show it */ }
  }
  render();
  checkForUpdate();
})();
