// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, matchKey, isValid, basePoints, scoreDay, scoreWeek, mergeKey, overrideKey, flagKey, applyNames } from '../js/scoring.js';
import * as T from '../js/time.js';
import { PROMPTS, LETTERS, SPECIAL_CARDS, promptsFor, rollLetter, swapRepeats, withSpecial, letterShort, letterWords, promptCount, timerFor } from '../js/prompts.js';
import { encFields, decFields } from '../js/codec.js';
import { resultsText, nudgeText, weekText } from '../js/share.js';
import { highlights, streaks, hallOfFame } from '../js/stats.js';
import { cardEnd, everyoneDoneAt, revealTime, stillPlaying, postTime, inQuietHours } from '../js/reveal.js';

// --- Scoring -------------------------------------------------------------

test('normalize ignores case, punctuation, accents and a leading article', () => {
  assert.equal(normalize('The Beatles'), 'beatles');
  assert.equal(normalize('  beatles! '), 'beatles');
  assert.equal(normalize('Crème Brûlée'), 'creme brulee');
  assert.equal(normalize("Mickey's"), 'mickeys');
  assert.equal(normalize('A Bug’s Life'), 'bugs life');
  assert.equal(normalize('salt & pepper'), normalize('Salt and Pepper'));
  assert.equal(normalize('The'), 'the'); // a lone article stays
  assert.equal(normalize(''), '');
});

test('singular and plural count as the same answer', () => {
  const same = (a, b) => assert.equal(matchKey(a), matchKey(b), `${a} = ${b}`);
  const different = (a, b) => assert.notEqual(matchKey(a), matchKey(b), `${a} != ${b}`);
  same('Nacho', 'nachos');
  same('Hot dog', 'Hot Dogs');
  same('Berry', 'berries');
  same('Cookie', 'Cookies');
  same('Peach', 'peaches');
  same('Box', 'boxes');
  same('Potato', 'potatoes');
  same('Shoe', 'shoes');
  same('Toe', 'toes');
  same('Horse', 'horses');
  same('The Beatles', 'beatle');
  same('Mouse', 'mice');
  same('McDonald’s', 'McDonalds');
  same('Kids', 'kid');
  different('Bus', 'bu');
  different('Paris', 'Pari');
  different('Glass', 'Gla');
  different('Gas', 'ga');
  different('Grape', 'Grapefruit');
  different('Swiss', 'Swis');
  different('Texas', 'Texan');
  different('Uno', 'Under');
  assert.equal(matchKey('  '), '');

  const d = day({
    josh: card('Josh', ['Grape', 'Goat', '', '', '']),
    zach: card('Zach', ['grapes!', 'Gorillas', '', '', '']),
    aly: card('Aly', ['Guava', 'Gorilla', 'Geese', 'goose', '']),
  });
  const { players } = scoreDay(d);
  assert.equal(players.josh.answers[0].dupe, true, 'Grape and grapes strike each other');
  assert.equal(players.zach.answers[0].points, 0);
  assert.equal(players.aly.answers[0].points, 1);
  assert.equal(players.zach.answers[1].dupe, true, 'Gorillas and Gorilla too');
  assert.equal(players.aly.answers[3].repeatOf, 2, 'and you can’t reuse your own answer as a plural');
  assert.equal(players.josh.answers[1].points, 1);
});

test('validity checks the first letter after the article', () => {
  assert.ok(isValid('The Godfather', 'G'));
  assert.ok(!isValid('The Godfather', 'T'));
  assert.ok(isValid('grapes', 'G'));
  assert.ok(!isValid('Apples', 'G'));
  assert.ok(!isValid('   ', 'G'));
  assert.ok(isValid('Éclair', 'E'));
});

test('house rule: any main word with the letter counts (friendlier than official first-word rule)', () => {
  assert.ok(isValid('Eat Pizza', 'P'));
  assert.ok(isValid('Play Music', 'P'));
  assert.ok(isValid('Of Mice and Men', 'O'), 'official first-word rule still counts');
  assert.ok(isValid('Fish and chips', 'C'));
  assert.ok(!isValid('Bread and butter', 'A'), '"and" is a little word, it does not count');
  assert.ok(!isValid('The Godfather', 'T'), '"the" does not count');
  assert.ok(!isValid('Eat Cake', 'P'));
  assert.equal(basePoints('Eat Pizza', 'P'), 1);
  assert.equal(basePoints('Pick Peppers', 'P'), 2);
  assert.equal(basePoints('Of Mice and Men', 'O'), 1);
});

test('alliteration bonus: one point per word with the letter, filler skipped', () => {
  assert.equal(basePoints('Mickey Mantle', 'M'), 2);
  assert.equal(basePoints('mickey mouse', 'M'), 2);
  assert.equal(basePoints('Marilyn Monroe', 'M'), 2);
  assert.equal(basePoints('Michael Jordan', 'M'), 1);
  assert.equal(basePoints('Mighty Mouse of Manhattan', 'M'), 3);
  assert.equal(basePoints('The Godfather', 'G'), 1);
  assert.equal(basePoints('Of Mice and Men', 'O'), 1); // "of" is filler, still worth 1
  assert.equal(basePoints('Apple', 'M'), 0);
  assert.equal(basePoints('', 'M'), 0);
});

function day(cards, extra = {}) {
  return { letter: 'G', prompts: ['A fruit', 'An animal', 'A movie', 'A city', 'A name'], cards, ...extra };
}
const card = (name, answers, more = {}) => ({ name, startedAt: 1, answers, ...more });

test('matching answers are struck for everyone who wrote them', () => {
  const d = day({
    josh: card('Josh', ['Grapes', 'Goat', 'The Godfather', 'Glasgow', 'Greg']),
    zach: card('Zach', ['grapes!', 'Gorilla', 'Godfather', 'Gary', 'George']),
    sara: card('Sara', ['Guava', 'Goat', 'Goodfellas', '', 'Gina Gershon']),
  });
  const { players } = scoreDay(d);
  assert.equal(players.josh.answers[0].dupe, true);
  assert.equal(players.zach.answers[0].dupe, true);
  assert.deepEqual(players.josh.answers[0].dupeWith, ['zach']);
  assert.equal(players.sara.answers[0].points, 1);
  assert.equal(players.josh.answers[1].points, 0); // Goat x2
  assert.equal(players.sara.answers[1].points, 0);
  assert.equal(players.zach.answers[1].points, 1);
  assert.equal(players.josh.answers[2].points, 0); // The Godfather == Godfather
  assert.equal(players.sara.answers[3].points, 0); // blank
  assert.equal(players.sara.answers[4].points, 2); // Gina Gershon
  assert.equal(players.josh.total, 2); // Glasgow + Greg
  assert.equal(players.zach.total, 3); // Gorilla, Gary, George
});

test('invalid answers score zero but still strike a matching answer', () => {
  const d = day({
    a: card('A', ['Apple', '', '', '', '']),
    b: card('B', ['apple', '', '', '', '']),
    c: card('C', ['Grape', '', '', '', '']),
  });
  const { players } = scoreDay(d);
  assert.equal(players.a.answers[0].valid, false);
  assert.equal(players.a.answers[0].points, 0);
  assert.equal(players.c.answers[0].points, 1);
});

test('skipped and unstarted cards do not play and do not strike others', () => {
  const d = day({
    josh: card('Josh', ['Grapes', '', '', '', '']),
    kenny: { name: 'Kenny', skipped: true, assisted: true, answers: ['Grapes', '', '', '', ''] },
    ghost: { name: 'Ghost', answers: ['Grapes', '', '', '', ''] },
  });
  const { players, order } = scoreDay(d);
  assert.equal(players.josh.answers[0].points, 1);
  assert.equal(players.kenny.played, false);
  assert.equal(players.kenny.total, 0);
  assert.equal(order[order.length - 1] !== 'josh', true);
});

test('confirmed "same as" merges strike both; pending ones do not', () => {
  const base = {
    josh: card('Josh', ['Mickey Mantle', '', '', '', '']),
    zach: card('Zach', ['Mickey Mantel', '', '', '', '']),
  };
  const k = mergeKey(0, 'zach', 'josh');
  const pending = scoreDay({ ...day(base), letter: 'M', merges: { [k]: { idx: 0, a: 'josh', b: 'zach', by: 'sara', confirmed: false } } });
  assert.equal(pending.players.josh.answers[0].points, 2);
  assert.equal(pending.players.josh.answers[0].merges.length, 1);
  const confirmed = scoreDay({ ...day(base), letter: 'M', merges: { [k]: { idx: 0, a: 'josh', b: 'zach', by: 'sara', confirmed: true } } });
  assert.equal(confirmed.players.josh.answers[0].points, 0);
  assert.equal(confirmed.players.zach.answers[0].dupe, true);
});

test('admin override wins over everything, flags are just recorded', () => {
  const d = day({
    josh: card('Josh', ['Michael Mantle', '', '', '', '']),
    zach: card('Zach', ['Grapes', '', '', '', '']),
  }, {
    letter: 'M',
    flags: { [flagKey('josh', 0, 'zach')]: { target: 'josh', idx: 0, by: 'zach' } },
    overrides: { [overrideKey('josh', 0)]: { target: 'josh', idx: 0, points: 0 } },
  });
  const { players } = scoreDay(d);
  assert.deepEqual(players.josh.answers[0].flags, ['zach']);
  assert.equal(players.josh.answers[0].base, 2);
  assert.equal(players.josh.answers[0].points, 0);
  assert.equal(players.josh.total, 0);
  const up = scoreDay({ ...d, overrides: { [overrideKey('zach', 0)]: { points: 1 } } });
  assert.equal(up.players.zach.answers[0].points, 1); // rescued an invalid answer
});

test('week totals add up revealed days; skips are marked; ties share the crown', () => {
  const d1 = day({ josh: card('Josh', ['Grapes', '', '', '', '']), zach: card('Zach', ['Guava', '', '', '', '']) });
  const d2 = day({ josh: card('Josh', ['', '', '', '', '']), kenny: { name: 'Kenny', skipped: true } });
  const { rows, winners } = scoreWeek([{ id: '2026-11-02', day: d1 }, { id: '2026-11-03', day: d2 }, { id: '2026-11-04', day: null }]);
  const josh = rows.find((r) => r.id === 'josh');
  assert.equal(josh.total, 1);
  assert.equal(josh.perDay['2026-11-03'], 0);
  assert.equal(rows.find((r) => r.id === 'kenny').perDay['2026-11-03'], 'skip');
  assert.deepEqual(winners.sort(), ['josh', 'zach']);
  assert.deepEqual(scoreWeek([]).winners, []);
});

test('repeating your own answer only counts the first one', () => {
  const d = day({ josh: card('Josh', ['Gouda', 'The gouda!', 'Goat', '', 'goat']) });
  const { players } = scoreDay(d);
  assert.equal(players.josh.answers[0].points, 1);
  assert.equal(players.josh.answers[1].repeatOf, 0);
  assert.equal(players.josh.answers[1].points, 0);
  assert.equal(players.josh.answers[4].repeatOf, 2);
  assert.equal(players.josh.total, 2);
  assert.equal(players.josh.answers[3].repeatOf, null); // blanks are not repeats
});

test('special card: M or L, duplicates OK, birthday bonus counts for the day and week', () => {
  const d = withSpecial('2026-11-22', day({
    lowey: card('Lowey', ['Me', 'Moi', 'Me', 'Me!', 'Lovely Me']),
    josh: card('Josh', ['Mom', 'Lois', 'Mom', 'Mom', 'Nana']),
    zach: card('Zach', ['Mom', 'Mother', 'Lois', 'Mom', 'Mom']),
  }));
  assert.equal(letterShort(d), 'M/L');
  assert.equal(letterWords(d), 'M or L');
  const { players, order } = scoreDay(d);
  assert.equal(players.josh.answers[0].dupe, false); // matches aren't struck
  assert.deepEqual(players.josh.answers[0].dupeWith, ['zach']); // but are still noticed
  assert.equal(players.josh.answers[2].repeatOf, null); // repeats on your own card are fine
  assert.equal(players.josh.answers[1].points, 1); // L counts
  assert.equal(players.josh.answers[4].points, 0); // N doesn't
  assert.equal(players.josh.total, 4);
  assert.equal(players.zach.total, 5);
  assert.equal(players.lowey.answers[4].points, 2); // Lovely Me: L + M
  assert.equal(players.lowey.bonus, 10000);
  assert.equal(players.lowey.total, 10006);
  assert.equal(order[0], 'lowey');
  assert.equal(players.josh.bonus, 0);
  const week = scoreWeek([{ id: '2026-11-22', day: d }]);
  assert.deepEqual(week.winners, ['lowey']);
  assert.match(resultsText({ day: d, dayLabel: 'Sun, Nov 22' }), /Letter \*M\/L\*[\s\S]*Birthday bonus \+10,000/);
  // The hall of fame leaves the bonus out of best day and average.
  assert.equal(hallOfFame({ '2026-11-22': d }).find((r) => r.id === 'lowey').bestDay, 6);
  assert.ok(highlights(d).some((h) => /Mom/.test(h.text))); // "great minds" still shows up
});

test('special card bonus only counts if the player plays; other days are untouched', () => {
  const skip = withSpecial('2026-11-22', day({ lowey: { name: 'Lowey', skipped: true }, josh: card('Josh', ['Mom', '', '', '', '']) }));
  assert.equal(scoreDay(skip).players.lowey.total, 0);
  const normal = withSpecial('2026-11-23', day({ lowey: card('Lowey', ['Me', 'Me', '', '', '']) }));
  assert.equal(normal.special, undefined);
  assert.equal(scoreDay(normal).players.lowey.answers[1].repeatOf, 0);
});

test('a long special card: 5 prompts saved, the rest added on load, with its own timer', () => {
  const id = '2026-11-22';
  const saved = promptsFor(id, T.weekId(id), T.weekdayIndex(id));
  assert.equal(saved.length, 5); // all the database accepts
  const d = withSpecial(id, { letter: 'M', prompts: saved, cards: {} });
  assert.equal(d.prompts.length, 18);
  assert.equal(promptCount(id), 18);
  assert.equal(timerFor(id), 360);
  assert.equal(timerFor('2026-11-23'), 180);
  assert.equal(cardEnd({ startedAt: Date.parse('2026-11-22T15:00:00Z') }, id), Date.parse('2026-11-22T15:06:00Z'));
  // A day saved with different prompts is left alone.
  assert.equal(withSpecial(id, { letter: 'M', prompts: ['a', 'b', 'c', 'd', 'e'] }).prompts.length, 5);
});

test('special cards have 5 prompts and a letter that is their first allowed letter', () => {
  for (const [id, c] of Object.entries(SPECIAL_CARDS)) {
    assert.match(id, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(c.prompts.length >= 5, id);
    assert.equal(new Set(c.prompts).size, c.prompts.length, `${id}: no repeated prompts`);
    if (c.letters) assert.equal(c.letter, c.letters[0], id);
    if (c.letter) assert.match(c.letter, /^[A-Z]$/, id); // the database only accepts one letter
  }
});

test('every file reference carries the same version stamp', async () => {
  const fs = await import('node:fs');
  const files = [...fs.readdirSync('js').map((f) => `js/${f}`), 'index.html', 'kenny.html'];
  const stamps = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const unstamped = src.match(/from\s+'\.\/[\w-]+\.js'|(?:href|src)="(?:css\/[\w-]+\.css|js\/[\w-]+\.js|[\w-]+\.webmanifest)"/g);
    assert.equal(unstamped, null, `${f} has an unstamped reference; run npm run stamp`);
    for (const m of src.matchAll(/\?v=([\w-]+)/g)) stamps.add(m[1]);
  }
  assert.equal(stamps.size, 1, `mixed versions: ${[...stamps].join(', ')}; run npm run stamp`);
});

test('firestore.rules knows the same helper players and special timers as the app', async () => {
  const fs = await import('node:fs');
  const { ASSISTED_PLAYERS, TIMER_SECONDS } = await import('../js/config.js');
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  const helpers = rules.match(/function helperPlayers\(\) \{ return \[(.*?)\]; \}/)[1];
  assert.deepEqual([...helpers.matchAll(/'([^']+)'/g)].map((m) => m[1]), ASSISTED_PLAYERS.map((p) => p.id), 'helperPlayers() in firestore.rules');
  const [, map, fallback] = rules.match(/function timerSeconds\(day\) \{ return \{(.*?)\}\.get\(day, (\d+)\); \}/);
  const inRules = Object.fromEntries([...map.matchAll(/'([^']+)': (\d+)/g)].map((m) => [m[1], Number(m[2])]));
  const inApp = Object.fromEntries(Object.entries(SPECIAL_CARDS).filter(([, c]) => c.timerSeconds).map(([d, c]) => [d, c.timerSeconds]));
  assert.deepEqual(inRules, inApp, 'timerSeconds() in firestore.rules');
  assert.equal(Number(fallback), TIMER_SECONDS);
});

test('ids and keys from the database are escaped before going into page attributes', async () => {
  // Player ids and merge keys are Firestore map keys that anyone can write, so a
  // key like x"><img onerror=...> must not break out of a data-* attribute.
  const fs = await import('node:fs');
  const src = fs.readFileSync('js/app.js', 'utf8');
  const safe = /^(esc\(.*\)|i|idx|\w+ \? '\d' : '\d'|Math\..*)$/;
  const unescaped = [...src.matchAll(/data-[a-z-]+="\$\{([^}]+)\}"/g)].map((m) => m[1]).filter((e) => !safe.test(e));
  assert.deepEqual(unescaped, [], 'wrap these in esc()');
});

test('group-chat text lists every answer, crosses out matches, marks wrong letters', () => {
  const d = day({
    josh: card('Josh', ['Grapes', 'Mickey *Mantle*', 'Godzilla', '', 'Gus']),
    zach: card('Zach', ['grapes', 'Goat', 'Godzilla', 'Gary', 'Gus Grissom']),
    kenny: { name: 'Kenny', skipped: true },
  }, { flags: { f: { target: 'zach', idx: 1, by: 'josh' } }, overrides: { [overrideKey('zach', 3)]: { points: 0 } } });
  const txt = resultsText({ day: d, dayLabel: 'Thu, Nov 5', weekRows: [{ name: 'Zach', total: 9 }, { name: 'Josh', total: 4 }], url: 'https://x.test/' });
  assert.match(txt, /^🎲 \*Daily Scatter\* · Thu, Nov 5 · Letter \*G\*/);
  assert.match(txt, /🥇 Zach 3\n🥈 Josh 1\n😴 Kenny sat out/);
  assert.match(txt, /Zach: ~Gary~ ⚖️/, 'admin ruled it out');
  assert.match(txt, /\*1\. A fruit\*\nZach: ~grapes~\nJosh: ~Grapes~/);
  assert.match(txt, /Josh: Mickey Mantle ✗/, 'formatting characters stripped; wrong letter marked');
  assert.match(txt, /Zach: Goat \+1 🚩/);
  assert.match(txt, /Josh: —/);
  assert.match(txt, /Zach: Gus Grissom \+2/);
  assert.match(txt, /\*Week so far:\* Zach 9 · Josh 4\nhttps:\/\/x\.test\/$/);
});

test('results come out early once the whole family has finished (Kenny optional)', () => {
  const at = (hhmm) => Date.parse(`2026-11-05T${hhmm}:00-05:00`);
  const d = { cards: {
    josh: { startedAt: at('09:00'), doneAt: at('09:01') },
    zach: { startedAt: at('10:00') }, // no "I'm done": finishes when the 3 minutes run out
    kenny: { startedAt: at('08:00'), assisted: true },
  } };
  assert.equal(cardEnd(d.cards.zach, '2026-11-05'), at('10:03'));
  assert.equal(everyoneDoneAt(d, '2026-11-05', ['josh', 'zach']), at('10:03'));
  assert.equal(everyoneDoneAt(d, '2026-11-05', ['josh', 'zach', 'aly']), Infinity, 'Aly has not started');
  assert.equal(everyoneDoneAt(d, '2026-11-05', []), Infinity, 'no family set: wait for midnight');
  assert.equal(revealTime(d, '2026-11-05', ['josh', 'zach']), at('10:03'));
  assert.equal(revealTime(d, '2026-11-05', ['josh', 'aly']), Date.parse('2026-11-06T05:00:00Z'), 'otherwise midnight');
  assert.deepEqual(stillPlaying(d, '2026-11-05', ['josh', 'zach', 'aly'], at('10:01')), ['zach', 'aly']);
  assert.deepEqual(stillPlaying(d, '2026-11-05', ['josh', 'zach'], at('10:04')), []);
});

test('group-chat posts wait out quiet hours (9pm to 9am Eastern), across daylight saving', () => {
  const iso = (ms) => new Date(ms).toISOString();
  assert.equal(iso(postTime(Date.parse('2026-11-05T14:03:00-05:00'))), '2026-11-05T19:03:00.000Z', '2:03pm: right away');
  assert.equal(iso(postTime(Date.parse('2026-11-05T20:59:00-05:00'))), '2026-11-06T01:59:00.000Z', '8:59pm: right away');
  assert.equal(iso(postTime(Date.parse('2026-11-05T21:00:00-05:00'))), '2026-11-06T14:00:00.000Z', '9pm: next 9am');
  assert.equal(iso(postTime(Date.parse('2026-11-06T05:00:00Z'))), '2026-11-06T14:00:00.000Z', 'midnight: 9am');
  assert.equal(iso(postTime(Date.parse('2026-11-06T07:30:00-05:00'))), '2026-11-06T14:00:00.000Z', '7:30am: 9am');
  assert.equal(iso(postTime(Date.parse('2026-07-04T09:00:00-04:00'))), '2026-07-04T13:00:00.000Z', '9am in summer: right away');
  assert.equal(iso(postTime(Date.parse('2026-10-31T23:00:00-04:00'))), '2026-11-01T14:00:00.000Z', 'night of the fall-back switch');
  assert.equal(iso(postTime(Date.parse('2026-03-08T05:00:00Z'))), '2026-03-08T13:00:00.000Z', 'night of the spring-forward switch');
  assert.equal(inQuietHours(Date.parse('2026-11-07T22:15:00-05:00')), true);
  assert.equal(inQuietHours(Date.parse('2026-11-08T08:59:00-05:00')), true);
  assert.equal(inQuietHours(Date.parse('2026-11-08T09:00:00-05:00')), false);
  assert.equal(inQuietHours(Date.parse('2026-11-08T20:59:00-05:00')), false);
});

test('highlights: great minds, answer of the day, lone scorer, clean sweep', () => {
  const d = day({
    josh: card('Josh', ['Grapes', 'Goat', 'Gone Girl', 'Geneva', 'Gus']),
    zach: card('Zach', ['grapes', 'Giant Gorilla', 'Gladiator', '', 'Gary']),
    aly: card('Aly', ['Grapes!', 'Gecko', 'Apollo 13', '', 'Gina']),
  });
  const hl = highlights(d, 10);
  const texts = hl.map((h) => `${h.icon} ${h.text}`);
  assert.ok(texts.includes('🧠 Great minds: everyone said “Grapes” for A fruit'), texts.join('\n'));
  assert.ok(texts.includes('🔥 Answers of the day (+2): Josh’s “Gone Girl” · Zach’s “Giant Gorilla”'), texts.join('\n'));
  assert.ok(texts.includes('🎯 Only Josh scored on A city, with “Geneva”'), texts.join('\n'));
  assert.equal(texts.filter((t) => t.startsWith('💯')).length, 0, 'nobody scored in all 5 (the fruit matched)');
  assert.deepEqual(highlights(day({ josh: card('Josh', ['Grapes', '', '', '', '']) })), [], 'no highlights for a solo day');
  assert.ok(highlights(d).length <= 4);
  const txt = resultsText({ day: d, dayLabel: 'Thu, Nov 5' });
  assert.match(txt, /\n\n🧠 Great minds: everyone said “Grapes” for A fruit\n/);
});

test('streaks: consecutive days, still alive until today ends, best ever', () => {
  const played = (...ids) => ({ cards: Object.fromEntries(ids.map((id) => [id, { name: id, startedAt: 1 }])) });
  const days = {
    '2026-11-02': played('josh', 'zach'),
    '2026-11-03': played('josh', 'zach'),
    '2026-11-04': played('josh'),
    '2026-11-05': null,
    '2026-11-06': played('josh', 'zach'),
    '2026-11-07': played('josh', 'zach', 'aly'),
    '2026-11-08': { cards: { josh: { name: 'josh', startedAt: 1 }, kenny: { name: 'Kenny', skipped: true } } },
  };
  const st = streaks(days, '2026-11-08');
  assert.deepEqual(st.josh, { current: 3, best: 3, playedToday: true });
  assert.deepEqual(st.zach, { current: 2, best: 2, playedToday: false }, 'has not played today yet: streak still stands');
  assert.deepEqual(st.aly, { current: 1, best: 1, playedToday: false });
  assert.equal(st.kenny, undefined, 'sitting out is not playing');
  assert.equal(streaks(days, '2026-11-09').zach.current, 0, 'missed a whole day: streak over');
  assert.equal(streaks(days, '2026-11-09').josh.current, 3);
  assert.equal(streaks(days, '2026-11-04').josh.current, 3);
});

test('hall of fame: weeks won skip the current week; days won, best and average', () => {
  const c = (answers) => card('x', answers);
  const g = (n) => Array.from({ length: 5 }, (_, i) => (i < n ? `G${i}unique${Math.random()}` : ''));
  const mk = (scores) => day(Object.fromEntries(Object.entries(scores).map(([id, n]) => [id, { ...c(g(n)), name: id }])));
  const days = {
    '2026-11-02': mk({ josh: 3, zach: 2 }),
    '2026-11-03': mk({ josh: 1, zach: 4 }),
    '2026-11-09': mk({ josh: 5, zach: 1 }), // current week
  };
  const rows = hallOfFame(days, '2026-11-09');
  const zach = rows.find((r) => r.id === 'zach'), josh = rows.find((r) => r.id === 'josh');
  assert.equal(zach.weeksWon, 1);
  assert.equal(josh.weeksWon, 0, 'the unfinished week does not count');
  assert.equal(josh.daysWon, 2);
  assert.equal(josh.bestDay, 5);
  assert.equal(josh.average, 3);
  assert.equal(zach.average, 2.3);
  assert.equal(rows[0].id, 'zach');
});

test('reminder and week messages', () => {
  assert.equal(nudgeText({ waiting: ['Emily', 'Dilan'], done: 5, url: 'https://x/' }),
    '⏳ *Daily Scatter* · still to play today: Emily and Dilan\n5 are in. Results come out the moment everyone’s done, or at midnight.\nhttps://x/');
  assert.match(nudgeText({ waiting: ['A', 'B', 'C'], done: 0 }), /A, B and C\nNobody has played yet/);
  const w = weekText({ weekLabel: 'Nov 2 – Nov 8', rows: [{ id: 'z', name: 'Zach', total: 9 }], winners: ['z'], daysPlayed: 7, extras: ['⭐ Best day: 6 points, Zach (Sat)'] });
  assert.match(w, /🥇 Zach 9\n\n⭐ Best day: 6 points, Zach \(Sat\)\n\n7 days played/);
});

test('challenges: most of the other players (at least two) toss an answer; admin still wins', () => {
  const cards = {
    josh: card('Josh', ['Gorilla Glue', '', '', '', '']),
    zach: card('Zach', ['Grape', '', '', '', '']),
    aly: card('Aly', ['Guava', '', '', '', '']),
    sara: card('Sara', ['Gooseberry', '', '', '', '']),
  };
  const f = (...by) => Object.fromEntries(by.map((b) => [flagKey('josh', 0, b), { target: 'josh', idx: 0, by: b }]));
  let a = scoreDay(day(cards, { flags: f('zach') })).players.josh.answers[0];
  assert.equal(a.votesNeeded, 2);
  assert.equal(a.tossed, false);
  assert.equal(a.points, 2, 'one challenge of three others is not enough');
  a = scoreDay(day(cards, { flags: f('zach', 'aly') })).players.josh.answers[0];
  assert.equal(a.tossed, true);
  assert.equal(a.points, 0, 'two of three others toss it');
  a = scoreDay(day(cards, { flags: f('zach', 'aly'), overrides: { [overrideKey('josh', 0)]: { points: 2 } } })).players.josh.answers[0];
  assert.equal(a.points, 2, 'the admin can overrule the vote');
  a = scoreDay(day(cards, { flags: f('josh', 'ghost', 'zach') })).players.josh.answers[0];
  assert.equal(a.tossed, false, 'your own vote and non-players do not count');
  const two = { josh: cards.josh, zach: cards.zach };
  a = scoreDay(day(two, { flags: f('zach') })).players.josh.answers[0];
  assert.equal(a.votesNeeded, 0);
  assert.equal(a.tossed, false, 'with one other player, a challenge needs the admin');
  const txt = resultsText({ day: day(cards, { flags: f('zach', 'aly') }), dayLabel: 'x' });
  assert.match(txt, /Josh: ~Gorilla Glue~ 🚩/);
});

test('renames show everywhere, including old days', () => {
  const d = day({ farm: card('farm', ['Grape', '', '', '', '']), zach: card('Zach', ['Guava', '', '', '', '']) });
  applyNames(d, { farm: 'Sara' });
  assert.equal(scoreDay(d).players.farm.name, 'Sara');
  assert.equal(scoreDay(d).players.zach.name, 'Zach');
  assert.equal(applyNames(null, { a: 'b' }), null);
});

test('prompts: no repeats for 8 weeks from the cycle start; older weeks unchanged', () => {
  const seen = new Set();
  let n = 0;
  for (let w = 0; w < 8; w++) {
    const wid = T.addDays('2026-11-16', w * 7);
    T.weekDays(wid).forEach((d, i) => promptsFor(d, wid, i).forEach((p) => { seen.add(p); n++; }));
  }
  assert.equal(n, 280);
  assert.equal(seen.size, 280, 'no prompt repeats within the 8-week cycle');
  const wk9 = T.addDays('2026-11-16', 56);
  assert.equal(promptsFor(wk9, wk9, 0).length, 5, 'next cycle deals again');
  assert.deepEqual(promptsFor('2026-11-23', '2026-11-23', 2), promptsFor('2026-11-23', '2026-11-23', 2), 'same for everyone');
  // If the list is edited mid-week, anything already played this week is swapped out.
  const today = promptsFor('2026-11-11', '2026-11-09', 2);
  const fixed = swapRepeats(today, [today[1], today[3], 'A fruit'], '2026-11-11');
  assert.equal(fixed.length, 5);
  assert.equal(new Set(fixed).size, 5);
  assert.ok(!fixed.includes(today[1]) && !fixed.includes(today[3]) && !fixed.includes('A fruit'));
  assert.equal(fixed[0], today[0]);
  assert.deepEqual(swapRepeats(today, [today[1]], '2026-11-11'), swapRepeats(today, [today[1]], '2026-11-11'), 'same on every phone');
  assert.equal(swapRepeats(today, [], 'x'), today);
  for (const p of PROMPTS) assert.ok(p.length <= 42 && !/[*_~`]/.test(p), `"${p}" is short and plain`);
});

// --- Time ------------------------------------------------------------------

test('day ids follow Eastern time, not UTC', () => {
  assert.equal(T.dayId(Date.parse('2026-11-06T03:30:00Z')), '2026-11-05'); // 10:30pm EST
  assert.equal(T.dayId(Date.parse('2026-11-06T05:00:00Z')), '2026-11-06'); // midnight EST
  assert.equal(T.dayId(Date.parse('2026-07-04T03:59:00Z')), '2026-07-03'); // 11:59pm EDT
  assert.equal(T.dayId(Date.parse('2026-07-04T04:00:00Z')), '2026-07-04');
});

test('cards close at midnight Eastern at the end of the day, across daylight saving', () => {
  assert.equal(new Date(T.lockTime('2026-11-05')).toISOString(), '2026-11-06T05:00:00.000Z'); // EST
  assert.equal(new Date(T.lockTime('2026-07-04')).toISOString(), '2026-07-05T04:00:00.000Z'); // EDT
  assert.equal(new Date(T.lockTime('2026-10-31')).toISOString(), '2026-11-01T04:00:00.000Z'); // night before fall-back
  assert.equal(new Date(T.lockTime('2026-11-01')).toISOString(), '2026-11-02T05:00:00.000Z'); // fall-back day
  assert.equal(new Date(T.lockTime('2026-03-07')).toISOString(), '2026-03-08T05:00:00.000Z'); // night before spring-forward
  assert.equal(new Date(T.lockTime('2026-03-08')).toISOString(), '2026-03-09T04:00:00.000Z'); // spring-forward day
  assert.equal(T.isLocked('2026-11-05', Date.parse('2026-11-06T04:59:59Z')), false); // 11:59:59pm
  assert.equal(T.isLocked('2026-11-05', Date.parse('2026-11-06T05:00:00Z')), true); // midnight
  // The lock is always the moment the next day begins.
  for (const id of ['2026-01-15', '2026-03-08', '2026-06-30', '2026-11-01', '2026-12-31']) {
    assert.equal(T.dayId(T.lockTime(id)), T.addDays(id, 1));
    assert.equal(T.dayId(T.lockTime(id) - 1), id);
  }
});

test('time zones other than Eastern work, including on daylight-saving days', () => {
  const iso = (tz, id, h) => new Date(T.zonedInstant(tz, id, h)).toISOString();
  assert.equal(iso('Europe/London', '2026-01-15', 0), '2026-01-15T00:00:00.000Z');
  assert.equal(iso('Europe/London', '2026-07-01', 0), '2026-06-30T23:00:00.000Z');
  assert.equal(iso('Europe/London', '2026-03-29', 0), '2026-03-29T00:00:00.000Z'); // clocks go forward at 1am that day
  assert.equal(iso('Europe/London', '2026-03-30', 0), '2026-03-29T23:00:00.000Z');
  assert.equal(iso('Europe/London', '2026-10-25', 9), '2026-10-25T09:00:00.000Z'); // clocks went back at 2am
  assert.equal(iso('America/Los_Angeles', '2026-11-01', 0), '2026-11-01T07:00:00.000Z'); // fall-back day
  assert.equal(iso('America/Los_Angeles', '2026-11-01', 9), '2026-11-01T17:00:00.000Z');
  assert.equal(iso('Australia/Sydney', '2026-10-04', 9), '2026-10-03T22:00:00.000Z'); // spring forward (southern)
  assert.equal(iso('Asia/Kolkata', '2026-06-01', 0), '2026-05-31T18:30:00.000Z'); // half-hour offset
  assert.equal(iso('America/New_York', '2026-03-08', 0), '2026-03-08T05:00:00.000Z');
});

test('weeks run Monday to Sunday', () => {
  assert.equal(T.weekId('2026-11-05'), '2026-11-02'); // Thu -> Mon
  assert.equal(T.weekId('2026-11-02'), '2026-11-02');
  assert.equal(T.weekId('2026-11-08'), '2026-11-02'); // Sunday
  assert.equal(T.weekId('2026-11-09'), '2026-11-09');
  assert.equal(T.weekId('2027-01-01'), '2026-12-28'); // across a year
  assert.deepEqual(T.weekDays('2026-11-02'), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  assert.equal(T.addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(T.dayLabel('2026-11-05'), 'Thu, Nov 5');
});

test('labels', () => {
  assert.equal(T.timerLabel(180000), '3:00');
  assert.equal(T.timerLabel(5400), '0:06');
  assert.equal(T.timerLabel(-10), '0:00');
  assert.equal(T.durationLabel(2 * 3600e3 + 10 * 60e3), '2h 10m');
  assert.equal(T.clockLabel(Date.parse('2026-11-05T18:00:00Z')), '1:00pm');
  assert.equal(T.clockLabel(Date.parse('2026-11-05T12:02:00Z')), '7:02am');
});

// --- Prompts & letters -------------------------------------------------------

test('300+ unique prompts, and no prompt repeats within a week', () => {
  assert.ok(PROMPTS.length >= 300);
  assert.equal(new Set(PROMPTS).size, PROMPTS.length);
  const week = T.weekDays('2026-11-02').flatMap((d, i) => promptsFor(d, '2026-11-02', i));
  assert.equal(week.length, 35);
  assert.equal(new Set(week).size, 35);
  assert.deepEqual(promptsFor('2026-11-05', '2026-11-02', 3), promptsFor('2026-11-05', '2026-11-02', 3));
  assert.notDeepEqual(promptsFor('2026-11-09', '2026-11-09', 0), promptsFor('2026-11-02', '2026-11-02', 0));
});

test('letters skip the hard ones and do not repeat within a week', () => {
  for (const hard of 'QUVXYZ') assert.ok(!LETTERS.includes(hard));
  const used = [];
  for (let i = 0; i < 7; i++) used.push(rollLetter(used));
  assert.equal(new Set(used).size, 7);
  assert.equal(rollLetter(LETTERS.slice(1), () => 0.99), 'A');
});

// --- Firestore value codec -----------------------------------------------------

test('codec round-trips nested values', () => {
  const v = { letter: 'G', n: 3, x: 1.5, ok: true, none: null, list: ['a', ''], empty: [], cards: { josh: { answers: ['G1'], startedAt: 1762300000000 } }, m: {} };
  assert.deepEqual(decFields(encFields(v)), v);
  assert.deepEqual(encFields({ n: 3 }), { n: { integerValue: '3' } });
});
