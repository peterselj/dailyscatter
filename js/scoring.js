// Pure scoring logic. No DOM, no network: everything here is unit-tested.
//
// Rules:
//  - An answer is valid if any of its main words starts with the day's letter
//    ("Eat Pizza" counts for P), not counting little words like "the", "of"
//    or "and". This house rule is friendlier than the official Scattergories
//    rule (the first word must start with the letter), which still counts too,
//    so "Of Mice and Men" works for O. Case, accents and punctuation are ignored.
//  - Answers to the same prompt that match each other are struck out (0 points)
//    for everyone who wrote them. Matching ignores case, punctuation, accents
//    and a leading article. An admin can also confirm two different spellings
//    as "the same", which strikes both.
//  - A valid, unique answer scores 1 point per word that starts with the
//    letter, skipping filler words like "of" and "and" (always at least 1).
//    "Mickey Mantle" for M = 2.
//  - Using the same answer twice on your own card only counts the first one;
//    the repeat scores 0 (the app also stops you from entering it).
//  - Challenges: anyone can flag an answer. If most of the other players who
//    played that day flag it (and at least two do), it's tossed: 0 points.
//  - An admin override sets the points for one answer outright and wins over
//    everything above.

export const PROMPTS_PER_CARD = 5;

const ARTICLES = new Set(['the', 'a', 'an']);
const FILLER = new Set([
  'the', 'a', 'an', 'of', 'and', 'in', 'on', 'at', 'to', 'for', 'with', 'or', 'by', 'from',
  'de', 'la', 'le', 'el', 'du', 'da', 'van', 'von',
]);

export function words(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['‘’`]/g, '') // "Mickey's" -> "mickeys"
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

// Canonical form used for matching duplicates and checking the first letter.
export function normalize(text) {
  const w = words(text);
  while (w.length > 1 && ARTICLES.has(w[0])) w.shift();
  return w.join(' ');
}

export function isValid(text, letter) {
  const l = String(letter).toLowerCase();
  const n = normalize(text);
  if (n && n[0] === l) return true; // official rule: first word (after a/an/the)
  return words(text).some((w) => !FILLER.has(w) && w[0] === l); // house rule: any main word
}

export function basePoints(text, letter) {
  if (!isValid(text, letter)) return 0;
  const l = String(letter).toLowerCase();
  const n = words(text).filter((w) => !FILLER.has(w) && w[0] === l).length;
  return Math.max(1, n);
}

export function hasPlayed(card) {
  return !!card && !card.skipped && !!card.startedAt;
}

// Keys used in the day document's maps.
export const flagKey = (target, idx, by) => `${target}__${idx}__${by}`;
export const overrideKey = (target, idx) => `${target}__${idx}`;
export const mergeKey = (idx, a, b) => {
  const [x, y] = [a, b].sort();
  return `p${idx}__${x}__${y}`;
};

/**
 * Score one day.
 * @param {object} day  Day document: { letter, prompts, cards, flags, merges, overrides }
 * @returns {{
 *   players: Record<string, { name, skipped, played, total, answers: Array<{
 *     text, norm, valid, dupe, dupeWith: string[], base, override, points, flags: string[], merges: object[]
 *   }> }>,
 *   order: string[]   // player ids sorted by total desc, then name
 * }}
 */
export function scoreDay(day) {
  const letter = day?.letter ?? '';
  const cards = day?.cards ?? {};
  const flags = Object.values(day?.flags ?? {});
  const merges = Object.values(day?.merges ?? {});
  const overrides = day?.overrides ?? {};
  const n = day?.prompts?.length || PROMPTS_PER_CARD;

  const ids = Object.keys(cards);
  const playing = ids.filter((id) => hasPlayed(cards[id]));

  const players = {};
  for (const id of ids) {
    const card = cards[id];
    const played = hasPlayed(card);
    const answers = [];
    for (let i = 0; i < n; i++) {
      const text = played ? String(card.answers?.[i] ?? '').trim() : '';
      answers.push({
        text,
        norm: normalize(text),
        valid: isValid(text, letter),
        dupe: false,
        dupeWith: [],
        repeatOf: null, // index of this player's earlier identical answer
        base: 0,
        override: null,
        points: 0,
        flags: [],
        tossed: false, // voted out by most of the other players
        votesNeeded: 0, // flags it takes to toss it (0 = can't be tossed by vote)
        merges: [],
      });
    }
    answers.forEach((a, i) => {
      if (!a.norm) return;
      const first = answers.findIndex((b) => b.norm === a.norm);
      if (first < i) a.repeatOf = first;
    });
    players[id] = { name: card.name || id, skipped: !!card.skipped, played, total: 0, answers };
  }

  // Duplicates: per prompt, group identical normalized answers plus confirmed merges.
  for (let i = 0; i < n; i++) {
    const parent = {};
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const union = (a, b) => { parent[find(a)] = find(b); };
    const withText = playing.filter((id) => players[id].answers[i].norm);
    for (const id of withText) parent[id] = id;

    const byNorm = {};
    for (const id of withText) {
      const k = players[id].answers[i].norm;
      if (byNorm[k]) union(id, byNorm[k]); else byNorm[k] = id;
    }
    for (const m of merges) {
      if (m.idx === i && m.confirmed && parent[m.a] !== undefined && parent[m.b] !== undefined) union(m.a, m.b);
    }
    const groups = {};
    for (const id of withText) (groups[find(id)] ??= []).push(id);
    for (const g of Object.values(groups)) {
      if (g.length < 2) continue;
      for (const id of g) {
        players[id].answers[i].dupe = true;
        players[id].answers[i].dupeWith = g.filter((x) => x !== id);
      }
    }
  }

  for (const f of flags) {
    const a = players[f.target]?.answers[f.idx];
    if (a && !a.flags.includes(f.by)) a.flags.push(f.by);
  }
  for (const m of merges) {
    for (const id of [m.a, m.b]) players[id]?.answers[m.idx]?.merges.push(m);
  }
  // Challenge votes: a strict majority of the other players, and never fewer than two.
  for (const id of playing) {
    const others = playing.filter((x) => x !== id);
    const needed = others.length >= 2 ? Math.floor(others.length / 2) + 1 : 0;
    for (const a of players[id].answers) {
      a.votesNeeded = a.text ? needed : 0;
      a.tossed = needed > 0 && a.flags.filter((f) => others.includes(f)).length >= needed;
    }
  }

  for (const id of ids) {
    const p = players[id];
    p.answers.forEach((a, i) => {
      a.base = p.played && !a.dupe && !a.tossed && a.repeatOf === null ? basePoints(a.text, letter) : 0;
      const o = p.played ? overrides[overrideKey(id, i)] : undefined;
      a.override = o && Number.isFinite(o.points) ? o.points : null;
      a.points = a.override ?? a.base;
    });
    p.total = p.answers.reduce((s, a) => s + a.points, 0);
  }

  const order = ids.slice().sort((a, b) =>
    (players[b].played - players[a].played) ||
    (players[b].total - players[a].total) ||
    players[a].name.localeCompare(players[b].name));
  return { players, order };
}

/**
 * Show each player under their current name (an admin can rename people).
 * Changes the day in place and returns it.
 */
export function applyNames(day, names = {}) {
  for (const [pid, card] of Object.entries(day?.cards ?? {})) {
    if (names[pid]) card.name = names[pid];
  }
  return day;
}

/**
 * Week standings from a list of { id, day } (day may be null for days nobody played).
 * Only days that are revealed should be passed in, so unrevealed answers never count.
 */
export function scoreWeek(days) {
  const rows = {};
  for (const { id: dayId, day } of days) {
    if (!day) continue;
    const { players } = scoreDay(day);
    for (const [pid, p] of Object.entries(players)) {
      const r = (rows[pid] ??= { id: pid, name: p.name, total: 0, perDay: {} });
      r.name = p.name;
      r.perDay[dayId] = p.played ? p.total : 'skip';
      if (p.played) r.total += p.total;
    }
  }
  const list = Object.values(rows).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const top = list.length ? list[0].total : 0;
  const winners = top > 0 ? list.filter((r) => r.total === top).map((r) => r.id) : [];
  return { rows: list, winners };
}
