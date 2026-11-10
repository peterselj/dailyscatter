// App settings. Safe to edit.

// Firebase project (these values are meant to be public).
export const FIREBASE = {
  projectId: 'dailyscatter-f0771',
  apiKey: 'AIzaSyADhD0m-hUkUMq-sLAPYaMdhB8Jx8ZRDAo',
};

// SHA-256 of the family code and admin code (lowercase), so the plain words
// aren't sitting in the page source. To change one, run in a terminal:
//   node -e "console.log(require('crypto').createHash('sha256').update('newcode').digest('hex'))"
export const FAMILY_CODE_SHA256 = '8ebbc3e9ad0150936227ea2a47829b7a2e2455af29781e4d74d1a8e8768abae3';
export const ADMIN_CODE_SHA256 = 'da42c6b9fc4b4a38df0eea4f67374bfb0c89732ccc95781b280016bf9b76c9cb';

// Seconds on the clock once you hit Start.
export const TIMER_SECONDS = 180;

// The WhatsApp bot posts a "still to play" reminder at this hour (Eastern,
// 24-hour clock) if the day's results aren't out yet. Set to null for no reminders.
export const NUDGE_HOUR = 18;

// Players who play with a helper: no timer, one big prompt at a time, a
// "Not today" button, and answers that save so the card can be finished later.
// Each one gets its own page for a home-screen shortcut (e.g. kenny.html).
export const ASSISTED_PLAYERS = [
  { id: 'kenny', name: 'Kenny' },
];
