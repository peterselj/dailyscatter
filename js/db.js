// Tiny Firestore client over the REST API (no SDK: keeps the page light).
import { FIREBASE } from './config.js?v=202611262309';
import { encFields, decFields, SAFE_KEY } from './codec.js?v=202611262309';

const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
// Running locally talks to the mock server in tests/ instead of the real database.
const API = LOCAL ? `${location.origin}/__mock/v1/` : 'https://firestore.googleapis.com/v1/';
const ROOT = `projects/${FIREBASE.projectId}/databases/(default)/documents`;

export class DbError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function call(method, path, { query = [], body } = {}) {
  const qs = new URLSearchParams([['key', FIREBASE.apiKey], ...query]);
  let res;
  try {
    // ':commit' is an action on the whole database; everything else is a document path.
    res = await fetch(`${API}${ROOT}${path.startsWith(':') ? '' : '/'}${path}?${qs}`, {
      method,
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new DbError(0, 'Network error');
  }
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error?.message ?? msg; } catch { /* ignore */ }
    throw new DbError(res.status, msg);
  }
  return res.json();
}

const idOf = (name) => name.slice(name.lastIndexOf('/') + 1);

export async function getDoc(path) {
  try {
    const doc = await call('GET', path);
    return decFields(doc.fields);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

export async function listDocs(collection) {
  const out = [];
  let pageToken = '';
  do {
    const query = [['pageSize', '300']];
    if (pageToken) query.push(['pageToken', pageToken]);
    const res = await call('GET', collection, { query });
    for (const d of res.documents ?? []) out.push({ id: idOf(d.name), data: decFields(d.fields) });
    pageToken = res.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

/**
 * Write fields to a document.
 * @param {string} path      e.g. 'days/2026-11-05'
 * @param {object} data      nested object holding the new values
 * @param {object} opts
 * @param {string[]} [opts.mask]   field paths to write, e.g. ['cards.josh']; a path
 *                                 missing from `data` is deleted. Omit to replace the doc.
 * @param {boolean} [opts.exists] precondition: true = must exist, false = must not exist
 */
function checkPaths(paths) {
  for (const p of paths) if (!p.split('.').every((k) => SAFE_KEY.test(k))) throw new Error(`Unsafe field path ${p}`);
}

export async function setDoc(path, data, { mask, exists } = {}) {
  const query = [];
  checkPaths(mask ?? []);
  for (const p of mask ?? []) query.push(['updateMask.fieldPaths', p]);
  if (exists !== undefined) query.push(['currentDocument.exists', String(exists)]);
  const doc = await call('PATCH', path, { query, body: { fields: encFields(data) } });
  return decFields(doc.fields);
}

export async function deleteDoc(path) {
  try {
    await call('DELETE', path);
  } catch (e) {
    if (e.status !== 404) throw e;
  }
}

/**
 * Like setDoc, but `serverTime` fields are set to the database's own clock
 * (phones' clocks can't be trusted for the timer). Returns nothing: read the
 * document again if you need it.
 */
export async function setDocStamped(path, data, { mask, exists, serverTime = [] } = {}) {
  checkPaths([...(mask ?? []), ...serverTime]);
  const write = { update: { name: `${ROOT}/${path}`, fields: encFields(data) } };
  if (mask) write.updateMask = { fieldPaths: mask };
  if (exists !== undefined) write.currentDocument = { exists };
  if (serverTime.length) write.updateTransforms = serverTime.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' }));
  await call('POST', ':commit', { body: { writes: [write] } });
}
