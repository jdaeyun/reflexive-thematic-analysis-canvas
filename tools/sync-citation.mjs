// Copies the version and release date from app/version.js (the one place to edit per release) into CITATION.cff.
//   node tools/sync-citation.mjs           update CITATION.cff
//   node tools/sync-citation.mjs --check   only check; exits with 1 if they differ
// Runs on GitHub after every push that changes app/version.js (.github/workflows/sync-citation.yml).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_JS = path.join(ROOT, 'app', 'version.js');
const CFF = path.join(ROOT, 'CITATION.cff');

const js = readFileSync(VERSION_JS, 'utf8');
const version = js.match(/version:\s*'([^']+)'/)?.[1];
const released = js.match(/released:\s*'([^']+)'/)?.[1];
if (!version || !/^\d+\.\d+\.\d+([-.+][\w.]+)?$/.test(version)) fail(`app/version.js: no valid version (found: ${version})`);
if (!released || !/^\d{4}-\d{2}-\d{2}$/.test(released)) fail(`app/version.js: released must be YYYY-MM-DD (found: ${released})`);

const cff = readFileSync(CFF, 'utf8');
if (!/^version:/m.test(cff) || !/^date-released:/m.test(cff)) fail('CITATION.cff: no top-level version or date-released line');
const next = cff
  .replace(/^version:.*$/m, `version: "${version}"`)
  .replace(/^date-released:.*$/m, `date-released: "${released}"`);

if (next === cff) {
  console.log(`CITATION.cff already matches app/version.js (${version}, ${released})`);
} else if (process.argv.includes('--check')) {
  fail(`CITATION.cff does not match app/version.js (${version}, ${released}): run node tools/sync-citation.mjs`);
} else {
  writeFileSync(CFF, next);
  console.log(`CITATION.cff updated to ${version} (${released})`);
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
