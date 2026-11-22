// Reflexive Thematic Analysis Canvas — REFI-QDA project exchange (.qdpx)
// MIT License · https://github.com/jdaeyun/reflexive-thematic-analysis-canvas
// Exchange with other QDA software (ATLAS.ti, MAXQDA, NVivo, QDA Miner, Quirkos, …) through the REFI-QDA
// Project standard (https://www.qdasoftware.org). A .qdpx file is a zip archive with project.qde (XML,
// namespace urn:QDA-XML:project:1.0) and the plain-text sources under Sources/.
//
// Mapping (export → import back):
//   documents            ↔ TextSource (plain text, UTF-8) · familiarisation notes ↔ Note + NoteRef
//   coded extracts        ↔ PlainTextSelection + Coding (positions in Unicode code points) · memo ↔ Description
//   codes                 ↔ Code (flat; a nested code tree from other software is flattened on import)
//   themes / subthemes    ↔ Set of member codes (subthemes named “Theme › Subtheme”); definition ↔ Description;
//                           analytic narrative ↔ Note referenced by the set
//   participants          ↔ Case (+ Variables for attributes), linked to whole documents (SourceRef)
//                           and to coded extracts (SelectionRef)
//   reflexive journal     → Notes (journal entries are added to the journal on import)
// Not included: the audit trail, theme status and review notes, the thematic map. Use Backup (.json) for a
// complete copy of the project; .qdpx is for moving the analysis between programs.
// Loaded after export.js; only called from handlers.

const REFI_NS = 'urn:QDA-XML:project:1.0';
const SUBTHEME_SEP = ' › ';

// ========================================================
// ZIP (store on write; store + deflate on read) — no library needed
// ========================================================
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// files: [{ name, data: Uint8Array }] → Blob (zip, no compression)
function zipStore(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 file names
    local.setUint16(8, 0, true);      // stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

// ArrayBuffer → Map(lower-case name → { name, read: () => Promise<Uint8Array> })
function zipEntries(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(tr('refi.notZip'));
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder('utf-8');
  const out = new Map();
  for (let n = 0; n < count && p + 46 <= u8.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = u8.subarray(start, start + csize);
    out.set(name.replace(/\\/g, '/').toLowerCase(), {
      name,
      read: async () => {
        if (method === 0) return raw;
        if (method !== 8) throw new Error(tr('refi.zipMethod'));
        if (typeof DecompressionStream === 'undefined') throw new Error(tr('refi.noInflate'));
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
    });
  }
  return out;
}

// ========================================================
// HELPERS
// ========================================================
// Same project → same GUIDs on every export (a 128-bit hash of the internal id), so re-imports can be compared
function refiGuid(key) {
  const h = [0x811c9dc5, 0x01000193, 0x2545f491, 0x9e3779b9];
  const s = String(key);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    for (let k = 0; k < 4; k++) h[k] = Math.imul(h[k] ^ c, 0x01000193 + k * 0x1000) >>> 0;
  }
  for (let k = 0; k < 4; k++) { h[k] ^= h[(k + 1) % 4] >>> 13; h[k] = Math.imul(h[k], 0x5bd1e995) >>> 0; h[k] ^= h[k] >>> 15; }
  const hex = h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  const v = hex.slice(0, 12) + '4' + hex.slice(13, 16) + ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 32);
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}
function xmlEsc(v) {
  return String(v ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '') // not allowed in XML 1.0
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function isoTime(ts) {
  const d = new Date(ts || Date.now());
  return isNaN(d) ? new Date().toISOString().replace(/\.\d+Z$/, 'Z') : d.toISOString().replace(/\.\d+Z$/, 'Z');
}
// REFI-QDA positions count Unicode characters (code points); JavaScript strings count UTF-16 units.
// Identity for text without surrogate pairs (almost all Japanese and European text).
function cpConverter(text) {
  if (!/[\uD800-\uDFFF]/.test(text)) return { toCp: i => i, fromCp: i => i };
  const cpAt = new Int32Array(text.length + 1); // UTF-16 index → code point index
  const unitAt = [0];                             // code point index → UTF-16 index
  let cp = 0;
  for (let i = 0; i < text.length; i++) {
    cpAt[i] = cp;
    const c = text.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length) { cpAt[i + 1] = cp; i++; }
    cp++;
    unitAt.push(i + 1);
  }
  cpAt[text.length] = cp;
  return { toCp: i => cpAt[Math.max(0, Math.min(text.length, i))], fromCp: n => unitAt[Math.max(0, Math.min(unitAt.length - 1, n))] };
}
const kids = (el, name) => el ? [...el.children].filter(c => c.localName === name) : [];
const kid = (el, name) => kids(el, name)[0] || null;
const kidText = (el, name) => (kid(el, name)?.textContent || '').trim();

// ========================================================
// EXPORT
// ========================================================
function buildQdpx() {
  const enc = new TextEncoder();
  const files = [];
  const G = (kind, id) => refiGuid(`${kind}:${id}`);
  const appName = `Reflexive Thematic Analysis Canvas ${window.TA_CANVAS?.version || ''}`.trim();

  // Users: everyone named in the project
  const users = new Map();
  const userRef = (name) => {
    const n = String(name || '').trim();
    if (!n) return '';
    if (!users.has(n)) users.set(n, G('user', n));
    return ` creatingUser="${users.get(n)}"`;
  };
  const me = state.researcherId ? userRef(state.researcherId) : '';

  // Notes are collected while building the rest
  const notes = [];
  const addNote = (key, name, text, ts, by) => {
    const guid = G('note', key);
    notes.push(`<Note guid="${guid}" name="${xmlEsc(name)}"${userRef(by)} creationDateTime="${isoTime(ts)}"><PlainTextContent>${xmlEsc(text)}</PlainTextContent></Note>`);
    return guid;
  };

  // Codes
  const codesXml = sortedCodes().map(c => `<Code guid="${G('code', c.id)}" name="${xmlEsc(c.name)}" isCodable="true"${/^#[0-9a-f]{6}$/i.test(c.color || '') ? ` color="${c.color.toUpperCase()}"` : ''}>${c.description ? `<Description>${xmlEsc(c.description)}</Description>` : ''}</Code>`).join('');

  // Variables: participant attributes
  const varKeys = [];
  for (const p of state.participants) for (const k of Object.keys(p.attributes || {})) if (!varKeys.includes(k)) varKeys.push(k);
  const variablesXml = varKeys.map(k => `<Variable guid="${G('var', k)}" name="${xmlEsc(k)}" typeOfVariable="Text"/>`).join('');

  // Sources with coded selections
  const caseSel = new Map(); // participantId → [selection guid]
  const sourcesXml = state.docs.map(doc => {
    const guid = G('doc', doc.id);
    files.push({ name: `Sources/${guid}.txt`, data: enc.encode(doc.text) });
    const cp = cpConverter(doc.text);
    const sels = state.segments.filter(s => s.docId === doc.id && s.codeIds.some(c => codeById(c))).sort((a, b) => a.s - b.s || a.e - b.e).map(s => {
      const sg = G('seg', s.id);
      for (const pid of participantsForRange(s.docId, s.s, s.e)) {
        if (!caseSel.has(pid)) caseSel.set(pid, []);
        caseSel.get(pid).push(sg);
      }
      const codings = s.codeIds.filter(c => codeById(c)).map(c => `<Coding guid="${G('coding', `${s.id}:${c}`)}"${userRef(s.createdBy)} creationDateTime="${isoTime(s.createdAt)}"><CodeRef targetGUID="${G('code', c)}"/></Coding>`).join('');
      return `<PlainTextSelection guid="${sg}" name="${xmlEsc(clip(s.text, 60))}" startPosition="${cp.toCp(s.s)}" endPosition="${cp.toCp(s.e)}"${userRef(s.createdBy)} creationDateTime="${isoTime(s.createdAt)}">${s.memo ? `<Description>${xmlEsc(s.memo)}</Description>` : ''}${codings}</PlainTextSelection>`;
    }).join('');
    const noteRef = doc.note ? `<NoteRef targetGUID="${addNote(`doc:${doc.id}`, `${tr('refi.famNote', {}, 'en')}: ${doc.name}`, doc.note, doc.createdAt)}"/>` : '';
    return `<TextSource guid="${guid}" name="${xmlEsc(doc.name)}" plainTextPath="internal://${guid}.txt"${me} creationDateTime="${isoTime(doc.createdAt)}">${sels}${noteRef}</TextSource>`;
  }).join('');

  // Cases: participants, with attributes, the documents they are the default participant of, and their extracts
  const casesXml = state.participants.map(p => {
    const vals = varKeys.filter(k => String((p.attributes || {})[k] ?? '') !== '').map(k => `<VariableValue><VariableRef targetGUID="${G('var', k)}"/><TextValue>${xmlEsc(p.attributes[k])}</TextValue></VariableValue>`).join('');
    const srcs = state.docs.filter(d => d.defaultParticipantId === p.id).map(d => `<SourceRef targetGUID="${G('doc', d.id)}"/>`).join('');
    const sels = (caseSel.get(p.id) || []).map(g => `<SelectionRef targetGUID="${g}"/>`).join('');
    const desc = p.role === 'interviewer' ? `<Description>${xmlEsc(tr('refi.interviewer', {}, 'en'))}</Description>` : '';
    return `<Case guid="${G('par', p.id)}" name="${xmlEsc(p.label)}">${desc}${vals}${srcs}${sels}</Case>`;
  }).join('');

  // Sets: themes and subthemes with their codes; definition as description, narrative as a note
  const setsXml = state.themes.filter(t => !t.parentId || themeById(t.parentId)).sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0) || (a.order ?? 0) - (b.order ?? 0)).map(t => {
    const parent = t.parentId ? themeById(t.parentId) : null;
    const name = parent ? `${parent.name}${SUBTHEME_SEP}${t.name}` : t.name;
    const members = codesForTheme(t.id, false).map(c => `<MemberCode targetGUID="${G('code', c.id)}"/>`).join('');
    const narr = (t.narrative || '').trim() ? `<MemberNote targetGUID="${addNote(`narr:${t.id}`, `${tr('refi.narrative', {}, 'en')}: ${name}`, t.narrative, t.createdAt)}"/>` : '';
    return `<Set guid="${G('theme', t.id)}" name="${xmlEsc(name)}">${t.definition ? `<Description>${xmlEsc(t.definition)}</Description>` : ''}${members}${narr}</Set>`;
  }).join('');

  // Project-level notes: overview, general discussion, journal entries
  if ((state.meta.storyline || '').trim()) addNote('storyline', tr('narr.overview', {}, 'en'), state.meta.storyline, state.meta.createdAt);
  if ((state.meta.conclusions || '').trim()) addNote('conclusions', tr('narr.conclusions', {}, 'en'), state.meta.conclusions, state.meta.createdAt);
  for (const l of state.logs.filter(x => x.category === 'journal' && (x.detail || '').trim())) {
    addNote(`log:${l.id}`, `${l.ak ? tr(l.ak, l.ap || {}, 'en') : l.action || 'Journal'} · ${isoTime(l.ts).slice(0, 10)}`, l.detail, l.ts, l.by);
  }

  const desc = [
    state.meta.question && `Research question: ${state.meta.question}`,
    'Approach: reflexive thematic analysis (Braun & Clarke)',
    state.meta.theory && `Theoretical assumptions: ${state.meta.theory}`,
    orientationText('en') !== '—' && `Orientation: ${orientationText('en')}`,
    state.meta.dataPrep && `Data preparation: ${state.meta.dataPrep}`
  ].filter(Boolean).join('\n');

  const usersXml = [...users.entries()].map(([n, g]) => `<User guid="${g}" name="${xmlEsc(n)}"/>`).join('');
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<Project xmlns="${REFI_NS}" name="${xmlEsc(state.meta.name || tr('hdr.untitled', {}, 'en'))}" origin="${xmlEsc(appName)}"${me ? ` creatingUserGUID="${users.get(state.researcherId.trim())}"` : ''} creationDateTime="${isoTime(state.meta.createdAt)}" modifiedDateTime="${isoTime(Date.now())}">`
    + (usersXml ? `<Users>${usersXml}</Users>` : '')
    + (codesXml ? `<CodeBook><Codes>${codesXml}</Codes></CodeBook>` : '')
    + (variablesXml ? `<Variables>${variablesXml}</Variables>` : '')
    + (casesXml ? `<Cases>${casesXml}</Cases>` : '')
    + (sourcesXml ? `<Sources>${sourcesXml}</Sources>` : '')
    + (notes.length ? `<Notes>${notes.join('')}</Notes>` : '')
    + (setsXml ? `<Sets>${setsXml}</Sets>` : '')
    + `<Description>${xmlEsc(desc)}</Description>`
    + `</Project>\n`;
  files.unshift({ name: 'project.qde', data: enc.encode(xml) });
  return zipStore(files);
}

async function downloadQdpx() {
  if (!state.docs.length) { showToast(tr('refi.nothing')); return; }
  downloadBlob(buildQdpx(), `${safeFileStem()}.qdpx`);
  await recordLog({ category: 'system', ak: 'log.refiExported' });
  showToast(tr('refi.exported'), 'success');
}

// ========================================================
// IMPORT (added to the current project)
// ========================================================
async function importQdpx(file) {
  const entries = zipEntries(await file.arrayBuffer());
  const qde = [...entries.values()].find(e => /(^|\/)[^/]*\.qde$/i.test(e.name));
  if (!qde) throw new Error(tr('refi.noQde'));
  const xmlText = new TextDecoder('utf-8').decode(await qde.read()).replace(/^﻿/, '');
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  const project = xml.documentElement;
  if (!project || project.localName !== 'Project' || xml.getElementsByTagName('parsererror').length) throw new Error(tr('refi.badXml'));

  const users = new Map(kids(kid(project, 'Users'), 'User').map(u => [u.getAttribute('guid'), u.getAttribute('name') || '']));
  const userName = g => users.get(g) || '';
  const tsOf = v => { const t = Date.parse(v || ''); return isNaN(t) ? Date.now() : t; };
  const notesByGuid = new Map(kids(kid(project, 'Notes'), 'Note').map(n => [n.getAttribute('guid'), n]));
  const noteText = async (n) => {
    if (!n) return '';
    const inline = kidText(n, 'PlainTextContent');
    if (inline) return inline;
    const path = n.getAttribute('plainTextPath') || '';
    const entry = path.startsWith('internal://') ? entries.get(`sources/${path.slice(11)}`.toLowerCase()) : null;
    return entry ? new TextDecoder('utf-8').decode(await entry.read()).replace(/^﻿/, '').trim() : '';
  };
  const usedNotes = new Set();

  // ---- What is in the file (for the confirmation) ----
  const allCodes = [];
  const walk = (el, parent, depth) => {
    for (const c of kids(el, 'Code')) {
      const item = { el: c, guid: c.getAttribute('guid'), name: (c.getAttribute('name') || '').trim() || '—', parent, depth, children: [] };
      allCodes.push(item);
      if (parent) parent.children.push(item);
      walk(c, item, depth + 1);
    }
  };
  walk(kid(kid(project, 'CodeBook'), 'Codes'), null, 0);
  const sources = kids(kid(project, 'Sources'), 'TextSource');
  const otherSources = kid(project, 'Sources') ? kid(project, 'Sources').children.length - sources.length : 0;
  const cases = kids(kid(project, 'Cases'), 'Case');
  const sets = kids(kid(project, 'Sets'), 'Set');
  const pname = project.getAttribute('name') || file.name;
  const origin = project.getAttribute('origin') || '?';
  if (!confirm(tr('refi.confirm', { name: pname, origin, d: sources.length, c: allCodes.length, p: cases.length, other: otherSources }))) return false;

  pushUndo(['undo.refiImport', { file: file.name }], ['docs', 'segments', 'ptags', 'codes', 'themes', 'participants']);

  // ---- Codes (flattened; names made unique with their parent's name) ----
  const codeMap = new Map(); // REFI guid → our code id
  const newCodes = [];
  const takenNames = new Map(state.codes.map(c => [c.name.toLowerCase(), c]));
  const importedNames = new Set();
  for (const item of allCodes) {
    if (item.el.getAttribute('isCodable') === 'false') continue; // a folder only: becomes a theme below
    let name = item.name;
    if (importedNames.has(name.toLowerCase()) && item.parent) name = `${item.parent.name} / ${name}`;
    importedNames.add(name.toLowerCase());
    let code = takenNames.get(name.toLowerCase());
    if (!code) {
      const color = /^#[0-9a-f]{6}$/i.test(item.el.getAttribute('color') || '') ? item.el.getAttribute('color').toLowerCase() : nextCodeColor();
      code = { id: uid('code'), name, description: kidText(item.el, 'Description'), color, themeIds: [], createdAt: Date.now(), order: state.codes.length };
      state.codes.push(code);
      takenNames.set(name.toLowerCase(), code);
      newCodes.push(code);
    }
    codeMap.set(item.guid, code.id);
  }

  // ---- Candidate themes: Sets of codes, and code folders (codes with child codes) from other software ----
  const newThemes = [];
  const themeByName = new Map(state.themes.filter(t => !t.parentId).map(t => [t.name.toLowerCase(), t]));
  const makeTheme = (name, parentId, definition = '') => {
    const key = name.toLowerCase();
    if (!parentId && themeByName.has(key)) return themeByName.get(key);
    const t = { id: uid('thm'), name, parentId, status: 'candidate', definition, reviewNote: '', order: sortedThemes(parentId).length + newThemes.filter(x => x.parentId === parentId).length, createdAt: Date.now() };
    state.themes.push(t);
    newThemes.push(t);
    if (!parentId) themeByName.set(key, t);
    return t;
  };
  const putInTheme = (codeId, themeId) => { const c = codeById(codeId); if (c && !c.themeIds.includes(themeId)) c.themeIds.push(themeId); };
  const descendants = (item) => item.children.flatMap(ch => [ch, ...descendants(ch)]);

  // A top-level folder becomes a theme (with its direct codes), a second-level folder a subtheme (with every
  // code below it). The folder code joins too unless it is marked as not codable.
  const codable = item => item.el.getAttribute('isCodable') !== 'false';
  for (const item of allCodes.filter(i => i.depth === 0 && i.children.length)) {
    const t = makeTheme(item.name, null);
    for (const m of [item, ...item.children.filter(ch => !ch.children.length)]) if (m === item ? codable(m) : true) putInTheme(codeMap.get(m.guid), t.id);
    for (const sub of item.children.filter(ch => ch.children.length)) {
      const st = makeTheme(sub.name, t.id);
      for (const m of [sub, ...descendants(sub)]) if (m === sub ? codable(m) : true) putInTheme(codeMap.get(m.guid), st.id);
    }
  }
  // Sets of codes: themes, or subthemes when named “Theme › Subtheme” (as exported by this app)
  for (const set of sets) {
    const full = (set.getAttribute('name') || '').trim();
    if (!full) continue;
    const members = kids(set, 'MemberCode').map(m => codeMap.get(m.getAttribute('targetGUID'))).filter(Boolean);
    const narrNotes = kids(set, 'MemberNote').map(m => notesByGuid.get(m.getAttribute('targetGUID'))).filter(Boolean);
    if (!members.length && !narrNotes.length) continue; // sets of documents or cases are not themes
    const cut = full.indexOf(SUBTHEME_SEP);
    let t;
    if (cut > 0 && themeByName.has(full.slice(0, cut).toLowerCase())) t = makeTheme(full.slice(cut + SUBTHEME_SEP.length), themeByName.get(full.slice(0, cut).toLowerCase()).id, kidText(set, 'Description'));
    else t = makeTheme(full, null, kidText(set, 'Description'));
    if (!t.definition && kidText(set, 'Description')) t.definition = kidText(set, 'Description');
    for (const cid of members) putInTheme(cid, t.id);
    const texts = [];
    for (const n of narrNotes) { usedNotes.add(n.getAttribute('guid')); const tx = await noteText(n); if (tx) texts.push(tx); }
    if (texts.length) t.narrative = [t.narrative, ...texts].filter(Boolean).join('\n\n');
  }

  // ---- Sources, coded extracts ----
  const docMap = new Map(); // REFI guid → { doc, cp }
  const selMap = new Map(); // selection guid → { docId, s, e }
  const newDocs = [], newSegs = [];
  let skipped = otherSources;
  for (const src of sources) {
    let text = '';
    const inline = kid(src, 'PlainTextContent');
    if (inline) text = inline.textContent;
    else {
      const path = src.getAttribute('plainTextPath') || '';
      const entry = path.startsWith('internal://') ? entries.get(`sources/${path.slice(11)}`.toLowerCase()) : null;
      if (!entry) { skipped++; continue; }
      text = new TextDecoder('utf-8').decode(await entry.read());
    }
    text = text.replace(/^﻿/, '');
    if (!text.trim()) { skipped++; continue; }
    // Keep the text exactly as it is (positions point into it); one block per non-empty line
    const blocks = [];
    let pos = 0;
    for (const line of text.split('\n')) {
      const e = pos + line.replace(/\r$/, '').length;
      if (line.trim()) blocks.push({ s: pos, e, label: '' });
      pos += line.length + 1;
    }
    const name = (src.getAttribute('name') || '').trim() || file.name;
    const doc = { id: uid('doc'), name, kind: 'txt', encoding: 'REFI-QDA (.qdpx)', text, blocks, defaultParticipantId: null, note: '', createdAt: tsOf(src.getAttribute('creationDateTime')) };
    const noteTexts = [];
    for (const nr of kids(src, 'NoteRef')) {
      const g = nr.getAttribute('targetGUID');
      usedNotes.add(g);
      const tx = await noteText(notesByGuid.get(g));
      if (tx) noteTexts.push(tx);
    }
    doc.note = noteTexts.join('\n\n');
    const cp = cpConverter(text);
    docMap.set(src.getAttribute('guid'), { doc });
    newDocs.push(doc);
    const byRange = new Map();
    for (const sel of kids(src, 'PlainTextSelection')) {
      let s = cp.fromCp(Number(sel.getAttribute('startPosition')));
      let e = cp.fromCp(Number(sel.getAttribute('endPosition')));
      if (!(e > s)) continue;
      s = Math.max(0, s); e = Math.min(text.length, e);
      selMap.set(sel.getAttribute('guid'), { docId: doc.id, s, e });
      const codeIds = kids(sel, 'Coding').map(c => codeMap.get(kid(c, 'CodeRef')?.getAttribute('targetGUID'))).filter(Boolean);
      for (const nr of kids(sel, 'NoteRef')) usedNotes.add(nr.getAttribute('targetGUID'));
      const memoParts = [kidText(sel, 'Description')];
      for (const nr of kids(sel, 'NoteRef')) memoParts.push(await noteText(notesByGuid.get(nr.getAttribute('targetGUID'))));
      if (!codeIds.length) continue; // an uncoded selection may still mark a speaker (see Cases)
      const key = `${s}:${e}`;
      let seg = byRange.get(key);
      if (!seg) {
        const firstCoding = kid(sel, 'Coding');
        seg = { id: uid('seg'), docId: doc.id, s, e, text: text.slice(s, e), codeIds: [], memo: '', key: false, createdBy: userName(sel.getAttribute('creatingUser') || firstCoding?.getAttribute('creatingUser')), createdAt: tsOf(sel.getAttribute('creationDateTime')) };
        byRange.set(key, seg);
        newSegs.push(seg);
      }
      for (const c of codeIds) if (!seg.codeIds.includes(c)) seg.codeIds.push(c);
      seg.memo = [seg.memo, ...memoParts].map(x => (x || '').trim()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join('\n');
    }
  }
  state.docs.push(...newDocs);
  state.segments.push(...newSegs);

  // ---- Cases → participants; whole documents → default participant; selections → speaker tags ----
  const sourceCases = new Map(); // doc id → [participant id]
  const newPtags = [];
  const varNames = new Map(kids(kid(project, 'Variables'), 'Variable').map(v => [v.getAttribute('guid'), v.getAttribute('name') || '']));
  for (const cs of cases) {
    const label = (cs.getAttribute('name') || '').trim();
    if (!label) continue;
    const attrs = {};
    for (const vv of kids(cs, 'VariableValue')) {
      const key = varNames.get(kid(vv, 'VariableRef')?.getAttribute('targetGUID'));
      const valEl = [...vv.children].find(x => x.localName.endsWith('Value'));
      if (key && valEl) attrs[key] = valEl.textContent.trim();
    }
    const p = await ensureParticipant(label, attrs);
    if (/interviewer|moderator|聞き手|インタビュアー|司会/i.test(kidText(cs, 'Description'))) p.role = 'interviewer';
    for (const sr of kids(cs, 'SourceRef')) {
      const d = docMap.get(sr.getAttribute('targetGUID'))?.doc;
      if (!d) continue;
      if (!sourceCases.has(d.id)) sourceCases.set(d.id, []);
      sourceCases.get(d.id).push(p.id);
    }
    for (const sr of kids(cs, 'SelectionRef')) {
      const r = selMap.get(sr.getAttribute('targetGUID'));
      if (r) newPtags.push({ id: uid('pt'), docId: r.docId, s: r.s, e: r.e, participantId: p.id });
    }
  }
  for (const [docId, pids] of sourceCases) {
    const d = docById(docId);
    if (d && pids.length === 1) d.defaultParticipantId = pids[0];
  }
  // One participant per character: a later tag cuts earlier overlapping ones
  newPtags.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
  const ptags = [];
  for (const t of newPtags) {
    const cut = [];
    for (const x of ptags) {
      if (x.docId !== t.docId || x.e <= t.s || x.s >= t.e) { cut.push(x); continue; }
      if (x.s < t.s) cut.push({ ...x, id: uid('pt'), e: t.s });
      if (x.e > t.e) cut.push({ ...x, id: uid('pt'), s: t.e });
    }
    cut.push(t);
    ptags.length = 0; ptags.push(...cut);
  }
  state.ptags.push(...ptags);

  // ---- Save ----
  await dbPutMany('codes', state.codes);
  await dbPutMany('themes', newThemes);
  await dbPutMany('docs', newDocs);
  await dbPutMany('segments', newSegs);
  await dbPutMany('ptags', ptags);
  await dbPutMany('participants', state.participants);
  commitUndo();
  await recordLog({ category: 'import', ak: 'log.refiImported', ap: { file: file.name }, dk: 'log.d.refiImported', dp: { origin, d: newDocs.length, x: newSegs.length, c: newCodes.length, t: newThemes.length } });

  // Memos not attached to anything become journal entries (marked as imported)
  for (const [g, n] of notesByGuid) {
    if (usedNotes.has(g)) continue;
    const tx = await noteText(n);
    if (!tx) continue;
    const head = tr('refi.importedNote', { name: n.getAttribute('name') || '', date: (n.getAttribute('creationDateTime') || '').slice(0, 10), origin });
    await recordLog({ category: 'journal', ak: 'jt.memo', detail: `${head}\n\n${tx}` });
  }

  state.activeDocId = newDocs[0]?.id || state.activeDocId;
  state.activeSegId = null;
  renderAll();
  showToast(tr('refi.imported', { d: newDocs.length, x: newSegs.length, c: newCodes.length, t: newThemes.length }) + (skipped ? ` ${tr('refi.skippedSources', { n: skipped })}` : ''), 'success');
  return true;
}

function setupRefiEvents() {
  document.getElementById('qdpxBtn').onclick = downloadQdpx;
}
