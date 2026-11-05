// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, isValid, basePoints, scoreDay, scoreWeek, mergeKey, overrideKey, flagKey } from '../js/scoring.js';
import * as T from '../js/time.js';
import { PROMPTS, LETTERS, promptsFor, rollLetter } from '../js/prompts.js';
import { encFields, decFields } from '../js/codec.js';

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

test('validity checks the first letter after the article', () => {
  assert.ok(isValid('The Godfather', 'G'));
  assert.ok(!isValid('The Godfather', 'T'));
  assert.ok(isValid('grapes', 'G'));
  assert.ok(!isValid('Apples', 'G'));
  assert.ok(!isValid('   ', 'G'));
  assert.ok(isValid('Éclair', 'E'));
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

// --- Time ------------------------------------------------------------------

test('day ids follow Eastern time, not UTC', () => {
  assert.equal(T.dayId(Date.parse('2026-11-06T03:30:00Z')), '2026-11-05'); // 10:30pm EST
  assert.equal(T.dayId(Date.parse('2026-11-06T05:00:00Z')), '2026-11-06'); // midnight EST
  assert.equal(T.dayId(Date.parse('2026-07-04T03:59:00Z')), '2026-07-03'); // 11:59pm EDT
  assert.equal(T.dayId(Date.parse('2026-07-04T04:00:00Z')), '2026-07-04');
});

test('lock time is 1pm Eastern, across daylight saving', () => {
  assert.equal(new Date(T.lockTime('2026-11-05')).toISOString(), '2026-11-05T18:00:00.000Z'); // EST
  assert.equal(new Date(T.lockTime('2026-07-04')).toISOString(), '2026-07-04T17:00:00.000Z'); // EDT
  assert.equal(new Date(T.lockTime('2026-11-01')).toISOString(), '2026-11-01T18:00:00.000Z'); // fall-back day
  assert.equal(new Date(T.lockTime('2026-03-08')).toISOString(), '2026-03-08T17:00:00.000Z'); // spring-forward day
  assert.equal(T.isLocked('2026-11-05', Date.parse('2026-11-05T17:59:59Z')), false);
  assert.equal(T.isLocked('2026-11-05', Date.parse('2026-11-05T18:00:00Z')), true);
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
