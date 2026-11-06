// Builds the text for sharing a day's results into a group chat (WhatsApp,
// iMessage...). WhatsApp formatting: *bold*, ~strikethrough~.
import { scoreDay } from './scoring.js?v=202611061722';

const MEDALS = ['🥇', '🥈', '🥉'];

// Strip characters that would turn into WhatsApp formatting by accident.
const clean = (t) => String(t ?? '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();

/**
 * @param {object} o
 * @param {object} o.day        the day document
 * @param {string} o.dayLabel   e.g. "Thu, Nov 5"
 * @param {Array}  [o.weekRows] scoreWeek(...).rows for that day's week
 * @param {boolean} [o.weekFinal] true once the week is over
 * @param {string} [o.url]      link back to the app
 * @param {string} [o.note]     an extra line under the title, e.g. "🎉 Everyone's in!"
 */
export function resultsText({ day, dayLabel, weekRows = [], weekFinal = false, url = '', note = '' }) {
  const { players, order } = scoreDay(day);
  const playing = order.filter((p) => players[p].played);
  const rank = (p) => playing.findIndex((x) => players[x].total === players[p].total);
  const out = [];

  out.push(`🎲 *Daily Scatter* · ${dayLabel} · Letter *${day.letter}*`);
  if (day.title) out.push(`✨ ${clean(day.title)}`);
  if (note) out.push(note);
  out.push('');
  for (const p of playing) out.push(`${MEDALS[rank(p)] ?? `${rank(p) + 1}.`} ${clean(players[p].name)} ${players[p].total}`);
  const sitting = order.filter((p) => !players[p].played).map((p) => clean(players[p].name));
  if (sitting.length) out.push(`😴 ${sitting.join(', ')} sat out`);

  day.prompts.forEach((prompt, i) => {
    out.push('', `*${i + 1}. ${clean(prompt)}*`);
    for (const p of playing) {
      const a = players[p].answers[i];
      const name = clean(players[p].name);
      const text = clean(a.text);
      if (!text) { out.push(`${name}: —`); continue; }
      let shown = text;
      if (a.points === 0 && (a.dupe || a.repeatOf !== null || a.override !== null)) shown = `~${text}~`;
      else if (a.points === 0 && !a.valid) shown = `${text} ✗`;
      const marks = `${a.override !== null ? ' ⚖️' : ''}${a.flags.length ? ' 🚩' : ''}`;
      out.push(`${name}: ${shown}${a.points ? ` +${a.points}` : ''}${marks}`);
    }
  });

  out.push('', '~crossed out~ = matched someone · ✗ = wrong letter · 🚩 = flagged · ⚖️ = admin’s call');
  if (weekRows.length) {
    out.push('', `*${weekFinal ? 'Final for the week' : 'Week so far'}:* ${weekRows.map((r) => `${clean(r.name)} ${r.total}`).join(' · ')}`);
  }
  if (url) out.push(url);
  return out.join('\n');
}

/**
 * The end-of-week message: the winner and final standings.
 * @param {object} o
 * @param {string} o.weekLabel  e.g. "Nov 2 – Nov 8"
 * @param {Array}  o.rows       scoreWeek(...).rows
 * @param {string[]} o.winners  scoreWeek(...).winners
 * @param {number} o.daysPlayed how many days had a game
 * @param {string} [o.url]
 */
export function weekText({ weekLabel, rows, winners, daysPlayed, url = '' }) {
  const champs = rows.filter((r) => winners.includes(r.id)).map((r) => clean(r.name));
  const out = [`🏆 *Daily Scatter · Week of ${weekLabel}*`, ''];
  if (champs.length) out.push(`${champs.join(' & ')} ${champs.length > 1 ? 'tie' : 'wins'} the week with ${rows[0].total} points!`, '');
  rows.forEach((r, i) => {
    const rank = rows.findIndex((x) => x.total === r.total);
    out.push(`${MEDALS[rank] ?? `${rank + 1}.`} ${clean(r.name)} ${r.total}`);
  });
  out.push('', `${daysPlayed} day${daysPlayed === 1 ? '' : 's'} played. New week, fresh scores. Good luck!`);
  if (url) out.push(url);
  return out.join('\n');
}
