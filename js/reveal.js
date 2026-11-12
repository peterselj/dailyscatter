// When a day's results come out, and when it's polite to post them.
// Pure functions, shared by the app and the WhatsApp posting job, so the two
// always agree. No DOM, no network.
import { lockTime, etInstant, dayId as dayIdOf, addDays } from './time.js?v=202611121238';
import { TIMER_SECONDS } from './config.js?v=202611121238';

// The moment a timed card is finished: 3 minutes after start, or when the
// player tapped "I'm done", or the end of the day, whichever comes first.
export function cardEnd(card, dayId) {
  if (!card?.startedAt) return Infinity;
  return Math.min(card.startedAt + TIMER_SECONDS * 1000, card.doneAt ?? Infinity, lockTime(dayId));
}

/**
 * When everyone in the family has finished the day's card, or Infinity if
 * someone hasn't started yet (or no family is set). Helper-played players
 * (Kenny) should not be in `family`: they're optional.
 */
export function everyoneDoneAt(day, dayId, family = []) {
  if (!family.length || !day?.cards) return Infinity;
  let last = -Infinity;
  for (const id of family) {
    const card = day.cards[id];
    if (!card?.startedAt || card.skipped) return Infinity;
    last = Math.max(last, cardEnd(card, dayId));
  }
  return last;
}

/** Results come out at midnight, or as soon as the whole family is done. */
export function revealTime(day, dayId, family = [], baseLock = lockTime(dayId)) {
  return Math.min(baseLock, everyoneDoneAt(day, dayId, family));
}

/** Family members who haven't finished yet (in family order). */
export function stillPlaying(day, dayId, family = [], now = Date.now()) {
  return family.filter((id) => {
    const card = day?.cards?.[id];
    return !card?.startedAt || card.skipped || now < cardEnd(card, dayId);
  });
}

// Quiet hours for group-chat posts: nothing between 9pm and 9am Eastern.
export const QUIET_START = 21;
export const QUIET_END = 9;

function etHour(ms) {
  const id = dayIdOf(ms);
  return (ms - etInstant(id, 0)) / 3600e3; // hours since Eastern midnight (DST-safe)
}

/** True between 9pm and 9am Eastern. */
export function inQuietHours(ms) {
  const h = etHour(ms);
  return h < QUIET_END || h >= QUIET_START;
}

/** When to post results that came out at `revealAt`: right away, unless it's quiet hours. */
export function postTime(revealAt) {
  const h = etHour(revealAt);
  if (h >= QUIET_END && h < QUIET_START) return revealAt;
  const id = dayIdOf(revealAt);
  return etInstant(h < QUIET_END ? id : addDays(id, 1), QUIET_END);
}
