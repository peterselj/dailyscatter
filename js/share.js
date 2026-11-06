// Builds the text for sharing a day's results into a group chat (WhatsApp,
// iMessage...). WhatsApp formatting: *bold*, ~strikethrough~.
import { scoreDay } from './scoring.js?v=202611061610';

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
 */
export function resultsText({ day, dayLabel, weekRows = [], weekFinal = false, url = '' }) {
  const { players, order } = scoreDay(day);
  const playing = order.filter((p) => players[p].played);
  const rank = (p) => playing.findIndex((x) => players[x].total === players[p].total);
  const out = [];

  out.push(`🎲 *Daily Scatter* · ${dayLabel} · Letter *${day.letter}*`);
  if (day.title) out.push(`✨ ${clean(day.title)}`);
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
