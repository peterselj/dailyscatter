// Local dev/test server: serves the site and a small in-memory imitation of the
// Firestore REST API under /__mock/ (the app uses it automatically on localhost).
// Run: node tests/server.mjs [port]   then open http://localhost:8080
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

let docs = new Map(); // "days/2026-11-05" -> { fields, createTime, updateTime }
export const stats = { writes: 0, reads: 0 };

const err = (res, code, status, message) => send(res, code, { error: { code, status, message } });
function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Set or delete a dotted path inside Firestore-encoded fields.
function applyPath(target, source, parts) {
  const [head, ...rest] = parts;
  if (!rest.length) {
    if (source && head in source) target[head] = structuredClone(source[head]);
    else delete target[head];
    return;
  }
  const srcChild = source?.[head]?.mapValue?.fields;
  if (!target[head]?.mapValue) target[head] = { mapValue: { fields: {} } };
  target[head].mapValue.fields ??= {};
  applyPath(target[head].mapValue.fields, srcChild, rest);
}

function handleMock(req, res, url, body) {
  const m = url.pathname.match(/^\/__mock\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents\/(.+)$/);
  if (!m) return err(res, 404, 'NOT_FOUND', 'bad path');
  const p = decodeURIComponent(m[1]);
  const segs = p.split('/');
  const name = `projects/x/databases/(default)/documents/${p}`;

  if (req.method === 'GET' && segs.length % 2 === 1) {
    stats.reads++;
    const prefix = `${p}/`;
    const list = [...docs.entries()]
      .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, d]) => ({ name: `projects/x/databases/(default)/documents/${k}`, ...d }));
    return send(res, 200, list.length ? { documents: list } : {});
  }
  if (req.method === 'GET') {
    stats.reads++;
    const d = docs.get(p);
    return d ? send(res, 200, { name, ...d }) : err(res, 404, 'NOT_FOUND', 'No document');
  }
  if (req.method === 'PATCH') {
    stats.writes++;
    const exists = url.searchParams.get('currentDocument.exists');
    const mask = url.searchParams.getAll('updateMask.fieldPaths');
    const cur = docs.get(p);
    if (exists === 'false' && cur) return err(res, 409, 'ALREADY_EXISTS', 'Document already exists');
    if (exists === 'true' && !cur) return err(res, 404, 'NOT_FOUND', 'No document to update');
    const incoming = JSON.parse(body || '{}').fields ?? {};
    const now = new Date().toISOString();
    let fields;
    if (mask.length) {
      fields = structuredClone(cur?.fields ?? {});
      for (const fp of mask) applyPath(fields, incoming, fp.split('.'));
    } else {
      fields = incoming;
    }
    const d = { fields, createTime: cur?.createTime ?? now, updateTime: now };
    docs.set(p, d);
    return send(res, 200, { name, ...d });
  }
  if (req.method === 'DELETE') {
    stats.writes++;
    docs.delete(p);
    return send(res, 200, {});
  }
  return err(res, 405, 'METHOD', 'nope');
}

// With FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 set, requests go to Google's
// Firestore emulator instead (which also enforces firestore.rules).
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
async function proxy(req, res, url, body) {
  if (url.pathname === '/__mock/stats') return send(res, 200, { reads: 'n/a', writes: 'n/a' });
  if (url.pathname === '/__mock/dump') {
    // Read every collection the app uses, as the owner (bypasses rules).
    const out = {};
    const base = `http://${EMULATOR}/v1/projects/dailyscatter-f0771/databases/(default)/documents`;
    for (const c of ['days', 'players', 'pt_days', 'pt_players', 'pt_meta']) {
      const r = await (await fetch(`${base}/${c}?pageSize=300`, { headers: { Authorization: 'Bearer owner' } })).json();
      for (const d of r.documents ?? []) out[d.name.split('/documents/')[1]] = { fields: d.fields };
    }
    return send(res, 200, out);
  }
  const r = await fetch(`http://${EMULATOR}${url.pathname.replace('/__mock', '')}${url.search}`, {
    method: req.method, body: body || undefined, headers: body ? { 'Content-Type': 'application/json' } : {},
  });
  res.writeHead(r.status, { 'Content-Type': 'application/json' });
  res.end(await r.text());
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let body = '';
    for await (const chunk of req) body += chunk;
    if (EMULATOR && url.pathname.startsWith('/__mock/')) return proxy(req, res, url, body);
    if (url.pathname === '/__mock/reset') { docs = new Map(); stats.writes = stats.reads = 0; return send(res, 200, {}); }
    if (url.pathname === '/__mock/dump') return send(res, 200, Object.fromEntries(docs));
    if (url.pathname === '/__mock/stats') return send(res, 200, stats);
    if (url.pathname.startsWith('/__mock/')) return handleMock(req, res, url, body);
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +(process.argv[2] ?? 8080);
  createServer().listen(port, () => console.log(`Daily Scatter dev server on http://localhost:${port}`));
}
