// Everything specific to one group's game lives in this file.
// Setting up your own copy? Work through it top to bottom (see docs/setup.md).

// 1. Your Firebase project (Firebase console > Project settings > Your apps).
//    These two values are meant to be public; firestore.rules is what protects the data.
export const FIREBASE = {
  projectId: 'dailyscatter-f0771',
  apiKey: 'AIzaSyADhD0m-hUkUMq-sLAPYaMdhB8Jx8ZRDAo',
};

// 2. Where the game is published (used in share messages and WhatsApp posts).
export const SITE_URL = 'https://peterselj.github.io/dailyscatter/';

// 3. The group's time zone (an IANA name like 'America/Chicago' or 'Europe/London').
//    Days start and end at midnight here, and quiet hours follow this clock.
export const TIME_ZONE = 'America/New_York';

// 4. The codes. These are SHA-256 hashes, so the plain words aren't in the page
//    source. The group code lets people in; the admin code unlocks score fixes.
//    Use long codes: short words are easy to guess from the hash. To make a hash
//    (type the code in lowercase):
//      node -e "console.log(require('crypto').createHash('sha256').update('your code here').digest('hex'))"
export const FAMILY_CODE_SHA256 = '8ebbc3e9ad0150936227ea2a47829b7a2e2455af29781e4d74d1a8e8768abae3';
export const ADMIN_CODE_SHA256 = 'da42c6b9fc4b4a38df0eea4f67374bfb0c89732ccc95781b280016bf9b76c9cb';

// 5. Seconds on the clock once you hit Start.
export const TIMER_SECONDS = 180;

// 6. Players who play with a helper (someone else holds the phone): no timer, a
//    "Not today" button, and a card that can be finished later. They never hold
//    up the day's results. Each one needs their own page, a copy of kenny.html
//    with data-as set to their id. Use [] if nobody needs this.
export const ASSISTED_PLAYERS = [
  { id: 'kenny', name: 'Kenny' },
];

// 7. Only matters with the optional WhatsApp bot (docs/whatsapp.md): the hour
//    (24-hour clock, in TIME_ZONE) it posts a "still to play" reminder if the
//    day's results aren't out yet. Use null for no reminders.
export const NUDGE_HOUR = 18;
