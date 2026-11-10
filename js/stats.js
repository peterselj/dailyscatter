// Fun facts worked out from the answers: daily highlights, play streaks and
// all-time records. Pure functions (no DOM, no network), unit-tested, and
// shared by the app and the WhatsApp posting job.
import { scoreDay, scoreWeek, hasPlayed } from './scoring.js?v=202611101641';
import { addDays, weekId } from './time.js?v=202611101641';

const list = (names) => (names.length < 3 ? names.join(' & ') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`);

/**
 * The talking points of a day, most interesting first (at most `max`).
 * Each is { icon, text }, plain text with player names.
 */
export function highlights(day, max = 4) {
  const { players, order } = scoreDay(day);
  const playing = order.filter((p) => players[p].played);
  if (playing.length < 2) return [];
  const name = (p) => players[p].name;
  const out = [];

  // Great minds: the biggest group of matching answers in each category.
  const groups = [];
  day.prompts.forEach((prompt, i) => {
    const seen = new Set();
    for (const p of playing) {
      const a = players[p].answers[i];
      if (!a.dupe || seen.has(p)) continue;
      const group = [p, ...a.dupeWith.filter((x) => players[x]?.played)];
      group.forEach((x) => seen.add(x));
      groups.push({ i, group, text: a.text });
    }
  });
  groups.sort((a, b) => b.group.length - a.group.length || a.i - b.i);
  for (const g of groups.slice(0, 2)) {
    const all = g.group.length === playing.length && playing.length > 2;
    out.push({
      icon: '🧠',
      text: `Great minds: ${all ? 'everyone' : list(g.group.map(name))} said “${g.text}” for ${day.prompts[g.i]}`,
    });
  }

  // Answer of the day: the single highest-scoring answer (2+ points).
  // Ties are all named (up to 3), so it isn't always the day's leader.
  const all = playing.flatMap((p) => players[p].answers.map((a) => ({ p, a })));
  const bestPts = Math.max(0, ...all.map((x) => x.a.points));
  if (bestPts >= 2) {
    const best = all.filter((x) => x.a.points === bestPts).slice(0, 3);
    const each = best.map((x) => `${name(x.p)}’s “${x.a.text}”`);
    out.push({
      icon: '🔥',
      text: best.length === 1 ? `Answer of the day: ${each[0]} (+${bestPts})` : `Answers of the day (+${bestPts}): ${each.join(' · ')}`,
    });
  }

  // The only one to score in a category (with 3+ playing).
  if (playing.length >= 3) {
    for (let i = 0; i < day.prompts.length; i++) {
      const scorers = playing.filter((p) => players[p].answers[i].points > 0);
      if (scorers.length === 1) {
        const p = scorers[0];
        out.push({ icon: '🎯', text: `Only ${name(p)} scored on ${day.prompts[i]}, with “${players[p].answers[i].text}”` });
        break;
      }
    }
  }

  // Scored in every category.
  const sweepers = playing.filter((p) => players[p].answers.every((a) => a.points > 0));
  if (sweepers.length && sweepers.length < playing.length) {
    out.push({ icon: '💯', text: `${list(sweepers.map(name))} scored in all ${day.prompts.length} categories` });
  }

  return out.slice(0, max);
}

/**
 * Play streaks. `days` maps day id -> day document (missing days are fine).
 * A streak is consecutive days played, counting back from today; if someone
 * hasn't played today yet, their streak still stands until the day is over.
 * Returns { [playerId]: { current, best, playedToday } }.
 */
export function streaks(days, today) {
  const ids = Object.keys(days).filter((id) => days[id] && id <= today).sort();
  const playedOn = {}; // pid -> Set of day ids
  for (const id of ids) {
    for (const [pid, card] of Object.entries(days[id].cards ?? {})) {
      if (hasPlayed(card)) (playedOn[pid] ??= new Set()).add(id);
    }
  }
  const out = {};
  for (const [pid, set] of Object.entries(playedOn)) {
    const playedToday = set.has(today);
    let current = 0;
    for (let d = playedToday ? today : addDays(today, -1); set.has(d); d = addDays(d, -1)) current++;
    let best = 0, run = 0, prev = null;
    for (const d of [...set].sort()) {
      run = prev && addDays(prev, 1) === d ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    }
    out[pid] = { current, best, playedToday };
  }
  return out;
}

/**
 * All-time records from every revealed day. `days` maps day id -> document;
 * `currentWeek` (a week id) is left out of "weeks won" because it isn't over.
 * Returns rows sorted by weeks won, then average.
 */
export function hallOfFame(days, currentWeek) {
  const rows = {};
  const row = (id, name) => {
    const r = (rows[id] ??= { id, name, weeksWon: 0, daysWon: 0, daysPlayed: 0, points: 0, bestDay: 0 });
    r.name = name;
    return r;
  };
  const byWeek = {};
  for (const id of Object.keys(days).sort()) {
    const day = days[id];
    if (!day) continue;
    (byWeek[weekId(id)] ??= []).push({ id, day });
    const { players, order } = scoreDay(day);
    const playing = order.filter((p) => players[p].played);
    const top = playing.length ? players[playing[0]].total : 0;
    for (const p of playing) {
      const r = row(p, players[p].name);
      r.daysPlayed++;
      r.points += players[p].total;
      r.bestDay = Math.max(r.bestDay, players[p].total);
      if (playing.length > 1 && top > 0 && players[p].total === top) r.daysWon++;
    }
  }
  for (const [wid, list_] of Object.entries(byWeek)) {
    if (wid === currentWeek) continue;
    const { winners } = scoreWeek(list_);
    for (const w of winners) if (rows[w]) rows[w].weeksWon++;
  }
  return Object.values(rows)
    .map((r) => ({ ...r, average: r.daysPlayed ? Math.round((r.points / r.daysPlayed) * 10) / 10 : 0 }))
    .sort((a, b) => b.weeksWon - a.weeksWon || b.daysWon - a.daysWon || b.average - a.average || a.name.localeCompare(b.name));
}
