// Stamps a version onto every file reference (?v=...), so phones never mix an
// old cached file with new ones after an update. Run before each release:
//   npm run stamp
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stamp = process.argv[2] ?? new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12); // e.g. 202611051925

const files = [
  ...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
];
for (const rel of files) {
  const file = path.join(ROOT, rel);
  const before = fs.readFileSync(file, 'utf8');
  const after = before
    // JS: import ... from './time.js'
    .replace(/(from\s+'\.\/[\w-]+\.js)(\?v=[\w-]*)?'/g, `$1?v=${stamp}'`)
    // HTML: the stylesheet, the app script and the manifest
    .replace(/((?:href|src)="(?:css\/[\w-]+\.css|js\/[\w-]+\.js|[\w-]+\.webmanifest))(\?v=[\w-]*)?"/g, `$1?v=${stamp}"`);
  if (after !== before) fs.writeFileSync(file, after);
}
console.log(`Stamped version ${stamp}`);
