// Copies the release info from app/version.js (the ONE place to edit at a release) into the files that show it as text:
//   CITATION.cff (version, date-released), README.md (the "**Version x.y.z**" headline),
//   site/{en,ja}/*.html (the text inside an element marked data-ta="version" / data-ta="year").
// The app itself reads app/version.js at run time (gear menu), so ta_canvas.html needs no copy.
// Usage: node tools/sync-version.mjs          update the files
//        node tools/sync-version.mjs --check  only report (exit 1 if something is out of date)
// On GitHub, .github/workflows/sync-version.yml runs it after a push to main that changes app/version.js.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'app/version.js'), 'utf8'), ctx);
const { version, released } = ctx.window.TA_CANVAS || {};
const V = '\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?'; // 1.0.0 or 1.0.0-beta.1
if (!new RegExp(`^${V}$`).test(version || '') || !/^\d{4}-\d{2}-\d{2}$/.test(released || '')) {
  console.error('app/version.js needs version (x.y.z or x.y.z-beta.n) and released (YYYY-MM-DD).');
  process.exit(2);
}
const year = released.slice(0, 4);
const rules = {
  'CITATION.cff': [
    [new RegExp(`^version: "?${V}"?$`, 'm'), `version: "${version}"`],
    [/^date-released: "?[\d-]+"?$/m, `date-released: "${released}"`]],
  'README.md': [
    [new RegExp(`\\*\\*Version ${V}`), `**Version ${version}`]]
};
// Any tag may carry the marker; the closing tag must match the opening one
const spanRules = [
  [new RegExp(`(<(\\w+) data-ta="version">)${V}(</\\2>)`, 'g'), `$1${version}$3`],
  [/(<(\w+) data-ta="year">)\d{4}(<\/\2>)/g, `$1${year}$3`]];
for (const lang of ['en', 'ja']) {
  for (const f of fs.readdirSync(path.join(ROOT, 'site', lang))) if (f.endsWith('.html')) rules[`site/${lang}/${f}`] = spanRules;
}

let stale = 0;
for (const [file, list] of Object.entries(rules)) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  const before = fs.readFileSync(full, 'utf8');
  let text = before;
  for (const [re, rep] of list) text = text.replace(re, rep);
  if (text === before) continue;
  stale++;
  console.log((check ? 'out of date: ' : 'updated: ') + file);
  if (!check) fs.writeFileSync(full, text);
}
console.log(stale
  ? (check ? `${stale} file(s) out of date with app/version.js (${version}, ${released}): run node tools/sync-version.mjs` : `${stale} file(s) updated to ${version} (${released}).`)
  : `All files already show ${version} (${released}).`);
process.exit(check && stale ? 1 : 0);
