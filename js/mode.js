// Playtest mode: open the site with ?playtest to turn it on (it sticks on this
// device until you tap Exit). Playtest uses separate data, has no midnight wait
// (anyone can tap "Reveal now"), and has a "Next day" button to move time along.

const KEY = 'ds.playtest';
const params = new URLSearchParams(location.search);

function read() {
  try {
    if (params.has('playtest')) localStorage.setItem(KEY, '1');
    if (params.has('live')) localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === '1';
  } catch {
    return params.has('playtest');
  }
}

export const PLAYTEST = read();

export function exitPlaytest() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  location.replace(location.pathname);
}
