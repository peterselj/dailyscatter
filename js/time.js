// All game time is US Eastern (America/New_York), DST-aware.
// A "day id" is the Eastern calendar date as 'YYYY-MM-DD'.
// A "week id" is the day id of that week's Monday.

export const TZ = 'America/New_York';
// Each day's card stays open all day; it closes, and everyone's answers are
// revealed, at midnight Eastern (the start of the next day).

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function etParts(ms) {
  const p = {};
  for (const { type, value } of partsFmt.formatToParts(new Date(ms))) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

// Eastern offset from UTC at instant ms, in ms (negative, e.g. -5h or -4h).
function etOffset(ms) {
  const p = etParts(ms);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

const pad = (n) => String(n).padStart(2, '0');

export function dayId(ms = Date.now()) {
  const p = etParts(ms);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

function parseDay(id) {
  const [y, m, d] = id.split('-').map(Number);
  return { y, m, d };
}

// The UTC instant of hh:mm Eastern on the given day.
export function etInstant(id, hour, minute = 0) {
  const { y, m, d } = parseDay(id);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  // Sample the offset within an hour of the target instant (ET is UTC-4/-5).
  // DST switches happen at 2am, so this is exact for midnight and for 4am onward.
  return guess - etOffset(guess + 4.5 * 3600e3);
}

// When a day's card closes: midnight Eastern at the end of that day.
export function lockTime(id) {
  return etInstant(addDays(id, 1), 0);
}

export function isLocked(id, now = Date.now()) {
  return now >= lockTime(id);
}

export function addDays(id, n) {
  const { y, m, d } = parseDay(id);
  const t = new Date(Date.UTC(y, m - 1, d + n, 12));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// 0 = Monday ... 6 = Sunday
export function weekdayIndex(id) {
  const { y, m, d } = parseDay(id);
  return (new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() + 6) % 7;
}

export function weekId(id) {
  return addDays(id, -weekdayIndex(id));
}

export function weekDays(wid) {
  return Array.from({ length: 7 }, (_, i) => addDays(wid, i));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function shortWeekday(id) { return WEEKDAYS[weekdayIndex(id)]; }

export function dayLabel(id, long = false) {
  const { m, d } = parseDay(id);
  const wd = long ? WEEKDAYS_LONG[weekdayIndex(id)] : WEEKDAYS[weekdayIndex(id)];
  return `${wd}, ${MONTHS[m - 1]} ${d}`;
}

export function monthDay(id) {
  const { m, d } = parseDay(id);
  return `${MONTHS[m - 1]} ${d}`;
}

export function clockLabel(ms) {
  const p = etParts(ms);
  const h12 = p.h % 12 || 12;
  return `${h12}:${pad(p.mi)}${p.h < 12 ? 'am' : 'pm'}`;
}

// "2h 10m", "14m", "45s"
export function durationLabel(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}

// "2:59"
export function timerLabel(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
