// Reflexive Thematic Analysis Canvas — Core
// MIT License · https://github.com/jdaeyun/reflexive-thematic-analysis-canvas
// IndexedDB storage, app state, audit log, undo snapshots and shared helpers. Must load first.
// Classic <script> (shared global scope); see the load order in ta_canvas.html.

// ========================================================
// INDEXEDDB
// ========================================================
const TA_DB_NAME = 'ReflexiveThematicAnalysisCanvasDB';
const TA_DB_VERSION = 1;
// docs: imported sources (plain text, fixed at import) · segments: coded extracts · ptags: participant ranges
// codes · themes · participants · logs: audit trail + reflexive journal · meta: project settings
const TA_STORES = ['docs', 'segments', 'ptags', 'codes', 'themes', 'participants', 'logs', 'meta'];
let taDbPromise = null;

function initDB() {
  if (taDbPromise) return taDbPromise;
  taDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(TA_DB_NAME, TA_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const s of TA_STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { taDbPromise = null; reject(req.error); };
  });
  return taDbPromise;
}

function flashSaveStatus(status = 'saved') {
  const badge = document.getElementById('saveStatusBadge');
  if (!badge) return;
  badge.classList.remove('hidden');
  if (status === 'error') {
    badge.className = 'inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[11px] font-bold whitespace-nowrap bg-rose-50 text-rose-700 border border-rose-200';
    badge.innerHTML = `<i class="ph ph-warning-circle"></i><span>${escapeHtml(tr('save.error'))}</span>`;
  } else {
    const time = new Date().toLocaleTimeString(localeOf(), { hour: '2-digit', minute: '2-digit' });
    badge.className = 'inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[11px] font-bold whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-200';
    badge.title = tr('save.saved', { time });
    badge.innerHTML = `<i class="ph ph-check-circle"></i><span class="hidden xl:inline">${escapeHtml(tr('save.saved', { time }))}</span>`;
  }
}

async function dbPut(store, item) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(item);
    tx.oncomplete = () => { flashSaveStatus('saved'); resolve(); };
    tx.onerror = () => { flashSaveStatus('error'); reject(tx.error); };
    tx.onabort = () => { flashSaveStatus('error'); reject(tx.error || new Error('IndexedDB transaction aborted')); };
  });
}
async function dbPutMany(store, items) {
  if (!items.length) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const it of items) os.put(it);
    tx.oncomplete = () => { flashSaveStatus('saved'); resolve(); };
    tx.onerror = () => { flashSaveStatus('error'); reject(tx.error); };
    tx.onabort = () => { flashSaveStatus('error'); reject(tx.error || new Error('IndexedDB transaction aborted')); };
  });
}
async function dbGetAll(store) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbDelete(store, key) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => { flashSaveStatus('saved'); resolve(); };
    tx.onerror = () => { flashSaveStatus('error'); reject(tx.error); };
    tx.onabort = () => { flashSaveStatus('error'); reject(tx.error || new Error('IndexedDB transaction aborted')); };
  });
}
async function dbDeleteMany(store, keys) {
  if (!keys.length) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const k of keys) os.delete(k);
    tx.oncomplete = () => { flashSaveStatus('saved'); resolve(); };
    tx.onerror = () => { flashSaveStatus('error'); reject(tx.error); };
    tx.onabort = () => { flashSaveStatus('error'); reject(tx.error || new Error('IndexedDB transaction aborted')); };
  });
}
async function dbReplaceAll(store, items) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    os.clear();
    for (const it of items) os.put(it);
    tx.oncomplete = () => { flashSaveStatus('saved'); resolve(); };
    tx.onerror = () => { flashSaveStatus('error'); reject(tx.error); };
    tx.onabort = () => { flashSaveStatus('error'); reject(tx.error || new Error('IndexedDB transaction aborted')); };
  });
}

// ========================================================
// STATE
// ========================================================
const state = {
  researcherId: lsGet('ta_researcher_id', ''),
  meta: { id: 'project', name: '', question: '', approach: 'reflexive', createdAt: Date.now() }, // = defaultMeta()
  docs: [],         // { id, name, kind: 'txt'|'csv'|'docx'|'doc', encoding, text, blocks: [{ s, e, label }], defaultParticipantId, note, createdAt }
  segments: [],     // { id, docId, s, e, text, codeIds: [], memo, key: bool, createdBy, createdAt }
  ptags: [],        // { id, docId, s, e, participantId }
  codes: [],        // { id, name, description, color, themeIds: [], createdAt, order }
  themes: [],       // { id, name, parentId, status: 'candidate'|'reviewed'|'defined'|'discarded', definition, reviewNote, order, createdAt } (checkedExtracts / checkedDataset: older data, no longer used)
  participants: [], // { id, label, role: 'participant'|'interviewer', attributes: { key: value }, color, createdAt }
  logs: [],         // { id, ts, category, action, detail, from, to, by }
  activeTab: 'code',
  activeDocId: null,
  pendingSel: null, // { docId, s, e, text }
  activeSegId: null,
  codeFilter: '',
  textQuery: '',     // full-text search over all documents (tab 1, left column)
  searchHits: [],    // [{ docId, s, e }] for textQuery, in document order
  searchIdx: -1,     // hit shown in the viewer
  // Read extracts from one group: null | { type: 'attr', key, value } | { type: 'par', id }.
  // For reading across groups only: counts, the theme structure and exports ignore it.
  extractFilter: null,
  themeStatusFilter: 'all',
  themeView: lsGet('ta_theme_view') === 'map' ? 'map' : 'board',
  openThemeExtracts: new Set(),
  openCodeExtracts: new Set(),
  exportTable: 'narrative',
  // Prevalence counts (extracts / participants per code and theme) are hidden by default: in reflexive TA
  // frequency does not decide what matters, and constant numbers nudge "more = more important"
  showCounts: lsGet('ta_show_counts') === 'true',
  // How coded text is highlighted in the viewer (display preference, per browser): standard | soft | underline
  markerStyle: lsGet('ta_marker_style', 'standard'),
  auditFilter: 'decisions', // single coding actions are hidden by default so journal notes stay visible
  lastThemeId: null,        // theme card the user last worked on (journal context)
  undoStack: []
};

const COLLECTIONS = ['docs', 'segments', 'ptags', 'codes', 'themes', 'participants', 'logs'];

const CODE_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#d946ef'];
const PARTICIPANT_COLORS = ['#0f766e', '#7c3aed', '#b45309', '#be123c', '#1d4ed8', '#4d7c0f', '#a21caf', '#0369a1'];

// Highlight strength for coded text: background opacity (one code / several codes) and the coloured underline
// stripes (opacity, thickness in px). 'soft' and 'underline' are for long reading sessions.
const MARKER_STYLES = {
  standard:  { bg: 0.24, bgMulti: 0.34, line: 1, lineW: 3 },
  soft:      { bg: 0.10, bgMulti: 0.16, line: 0.45, lineW: 2 },
  underline: { bg: 0, bgMulti: 0, line: 0.75, lineW: 2 }
};
function markerStyle() {
  return MARKER_STYLES[state.markerStyle] || MARKER_STYLES.standard;
}

// Labels come from i18n.js: statusLabel(id) ('status.<id>') and 'status.<id>.phase'
const THEME_STATUS = {
  candidate: { cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  reviewed:  { cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  defined:   { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  discarded: { cls: 'bg-slate-100 text-slate-500 border-slate-200' }
};
function statusLabel(id, lang = LANG) {
  return THEME_STATUS[id] ? tr(`status.${id}`, {}, lang) : String(id || '');
}

// ========================================================
// HELPERS
// ========================================================
function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Sets innerHTML only when the markup differs from what this element last got through here, so long lists (a survey
// with thousands of respondents) are not rebuilt on every coding action. Returns true when the DOM was replaced.
// Every write to such an element must go through here.
function setHtml(el, html) {
  if (el._taHtml === html) return false;
  el.innerHTML = html;
  el._taHtml = html;
  return true;
}
const LABEL_ORDER = new Intl.Collator(undefined, { numeric: true });
function clip(str, n = 80) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function hexAlpha(hex, alpha) {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
}
function fmtTime(ts, lang = LANG) {
  return new Date(ts).toLocaleString(localeOf(lang), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function showToast(msg, kind = 'info') {
  const host = document.getElementById('toastHost');
  if (!host) return;
  const el = document.createElement('div');
  const cls = kind === 'error' ? 'bg-rose-600' : kind === 'success' ? 'bg-emerald-600' : 'bg-slate-800';
  el.className = `${cls} text-white text-xs font-medium px-3 py-2 rounded-md shadow-lg max-w-sm`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function safeFileStem() {
  return (state.meta.name || 'thematic-analysis').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'thematic-analysis';
}

// Lookups. Positions by id are cached per array and checked on every hit (the item at that position must still
// carry the id), so the cache can never return a stale item; a miss rebuilds it once. Keeps large projects fast.
const ID_POS = new WeakMap(); // array → Map(id → index)
function byId(coll, id) {
  const arr = state[coll];
  let pos = ID_POS.get(arr);
  let i = pos?.get(id);
  if (i !== undefined && arr[i]?.id === id) return arr[i];
  pos = new Map();
  arr.forEach((x, k) => pos.set(x.id, k));
  ID_POS.set(arr, pos);
  i = pos.get(id);
  return i === undefined ? undefined : arr[i];
}
const codeById = id => byId('codes', id);
const themeById = id => byId('themes', id);
const docById = id => byId('docs', id);
const participantById = id => byId('participants', id);

function sortedCodes() {
  return [...state.codes].sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
}
function sortedThemes(parentId = null) {
  return state.themes.filter(t => (t.parentId || null) === parentId).sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
}
function nextCodeColor() {
  return CODE_COLORS[state.codes.length % CODE_COLORS.length];
}

// Participant ranges per document, sorted by start, with the running maximum of their ends (so a lookup is a binary
// search even if ranges overlap). Built once per task: dropped at the next microtask, and rebuilt at once if
// state.ptags was replaced or changed length.
let ptagIndex = null;
function ptagsIndex() {
  if (ptagIndex && ptagIndex.arr === state.ptags && ptagIndex.len === state.ptags.length) return ptagIndex.byDoc;
  const byDoc = new Map();
  for (const t of state.ptags) { if (!byDoc.has(t.docId)) byDoc.set(t.docId, []); byDoc.get(t.docId).push(t); }
  for (const [docId, list] of byDoc) {
    list.sort((a, b) => a.s - b.s);
    const maxE = []; let m = -Infinity;
    for (const t of list) { m = Math.max(m, t.e); maxE.push(m); }
    byDoc.set(docId, { list, maxE });
  }
  ptagIndex = { arr: state.ptags, len: state.ptags.length, byDoc };
  queueMicrotask(() => { ptagIndex = null; });
  return byDoc;
}
// Index of the last item in a list sorted by `s` whose s < e (−1 if none)
function lastStartingBefore(list, e) {
  let lo = 0, hi = list.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (list[mid].s < e) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

// Participants of a coded segment: participant ranges overlapping it, else the document default.
function participantsForRange(docId, s, e) {
  const ids = [];
  const idx = ptagsIndex().get(docId);
  if (idx) {
    const found = [];
    for (let k = lastStartingBefore(idx.list, e); k >= 0 && idx.maxE[k] > s; k--) if (idx.list[k].e > s) found.push(idx.list[k]);
    for (let k = found.length - 1; k >= 0; k--) if (!ids.includes(found[k].participantId)) ids.push(found[k].participantId); // document order
  }
  if (!ids.length) {
    const d = docById(docId);
    if (d && d.defaultParticipantId) ids.push(d.defaultParticipantId);
  }
  return ids.filter(id => participantById(id));
}
// Interviewers / moderators are tagged like speakers but are not counted as participants
const INTERVIEWER_LABEL = /^(I|Q|Int\.?|Interviewer|Moderator|Facilitator|Researcher|インタビュアー|聞き手|質問者|司会|司会者|調査者|研究者)$/i;
function isInterviewer(pid) {
  return participantById(pid)?.role === 'interviewer';
}
function countedParticipants() {
  return state.participants.filter(p => p.role !== 'interviewer');
}
function participantLabels(ids) {
  return ids.map(id => participantById(id)?.label).filter(Boolean).join(', ');
}

// Segments coded with a code; with themes: every code in a theme and its subthemes
function segmentsForCode(codeId) {
  return state.segments.filter(s => s.codeIds.includes(codeId));
}
function themeAndDescendantIds(themeId) {
  const out = [themeId];
  for (const t of state.themes) if (t.parentId === themeId) out.push(...themeAndDescendantIds(t.id));
  return out;
}
function codesForTheme(themeId, includeSub = true) {
  const ids = includeSub ? themeAndDescendantIds(themeId) : [themeId];
  return sortedCodes().filter(c => c.themeIds.some(t => ids.includes(t)));
}
function segmentsForTheme(themeId, includeSub = true) {
  const codeIds = new Set(codesForTheme(themeId, includeSub).map(c => c.id));
  return state.segments.filter(s => s.codeIds.some(c => codeIds.has(c)));
}
function coverage(segments) {
  const parts = new Set(), docs = new Set();
  for (const s of segments) {
    docs.add(s.docId);
    for (const p of participantsForRange(s.docId, s.s, s.e)) if (!isInterviewer(p)) parts.add(p);
  }
  return { participants: parts, docs };
}

// Extract filter (by participant attribute or by participant): which participants are shown, or null for all
function extractFilterParticipants() {
  const f = state.extractFilter;
  if (!f) return null;
  if (f.type === 'par') return new Set([f.id]);
  return new Set(state.participants.filter(p => String((p.attributes || {})[f.key] ?? '').trim() === f.value).map(p => p.id));
}
function matchesExtractFilter(docId, s, e, allowed = extractFilterParticipants()) {
  if (!allowed) return true;
  return participantsForRange(docId, s, e).some(id => allowed.has(id));
}
function filterSegments(segments) {
  const allowed = extractFilterParticipants();
  return allowed ? segments.filter(x => matchesExtractFilter(x.docId, x.s, x.e, allowed)) : segments;
}
function extractFilterLabel(f = state.extractFilter) {
  if (!f) return '';
  if (f.type === 'par') return participantById(f.id)?.label || '';
  return `${f.key}: ${f.value}`;
}

// ========================================================
// AUDIT LOG
// ========================================================
// Text is stored as message keys (ak/ap = action key/params, dk/dp = detail key/params) so the audit trail
// is shown and exported in whatever language is chosen later; `action` / `detail` keep an English copy.
// ft: 'status' marks from/to as theme status ids. User-written text goes in detail/from/to/reason as is.
// Optional: reason (why, from the decision prompt), ctx (what was on screen), snapshot (code/theme structure
// at that moment, see takeSnapshot in journal.js), linkedLogId (a journal note written about another entry)
async function recordLog({ category, ak, ap = {}, dk = null, dp = {}, action = '', detail = '', from = '', to = '', ft = null, reason = '', ctx = null, snapshot = null, linkedLogId = null }) {
  const entry = { id: uid('log'), ts: Date.now(), category, action: ak ? tr(ak, ap, 'en') : action, detail: dk ? tr(dk, dp, 'en') : detail, from, to, by: state.researcherId || '' };
  if (ak) { entry.ak = ak; entry.ap = ap; }
  if (dk) { entry.dk = dk; entry.dp = dp; }
  if (ft) entry.ft = ft;
  if (reason) entry.reason = reason;
  if (ctx && Object.keys(ctx).length) entry.ctx = ctx;
  if (snapshot) entry.snapshot = snapshot;
  if (linkedLogId) entry.linkedLogId = linkedLogId;
  state.logs.push(entry);
  updateAuditBadge();
  await dbPut('logs', entry);
  return entry;
}
// ========================================================
// TEXT FIELDS: SAVE AND LOG WITHOUT EVER SKIPPING THE COMMIT
// ========================================================
// A bare `change` handler misses text typed right before the tab is closed, a re-render or an undo, so a text
// could be saved without its audit entry, or not saved at all. Every text field that writes an audit entry (or
// that the user would expect to be kept) uses bindPendingCommit(el, commitFn): the commit runs once after typing,
// on whichever comes first: change, blur, flushAllPendingSaves() (tab switch, re-render of that view, undo,
// backup, export) or the page being hidden. commitFn must update `state` before its first await.
// saveSoon(key, fn) is a short debounce for writing while typing (long texts); it is flushed the same way.
const pendingCommits = new Set();
function flushAllPendingSaves() {
  for (const fn of [...pendingCommits]) {
    try { fn(); } catch (e) { console.error('pending save', e); }
  }
}
function bindPendingCommit(el, commitFn) {
  let dirty = false;
  const run = () => {
    if (!dirty) return;
    dirty = false;
    pendingCommits.delete(run);
    return Promise.resolve(commitFn()).catch(e => console.error('commit', e));
  };
  el.addEventListener('input', () => { dirty = true; pendingCommits.add(run); });
  el.addEventListener('change', run);
  el.addEventListener('blur', run);
  return run;
}
const soonTimers = new Map(); // key → { timer, run }
function saveSoon(key, fn, delay = 600) {
  const prev = soonTimers.get(key);
  if (prev) { clearTimeout(prev.timer); pendingCommits.delete(prev.run); }
  const run = () => {
    const cur = soonTimers.get(key);
    if (cur?.run !== run) return;
    clearTimeout(cur.timer); soonTimers.delete(key); pendingCommits.delete(run);
    return Promise.resolve(fn()).catch(e => console.error('save', e));
  };
  soonTimers.set(key, { run, timer: setTimeout(run, delay) });
  pendingCommits.add(run);
}
window.addEventListener('pagehide', flushAllPendingSaves);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAllPendingSaves(); });

function updateAuditBadge() {
  const b = document.getElementById('auditCountBadge');
  if (b) b.textContent = String(state.logs.length);
}

// ========================================================
// UNDO (per-item differences, so later work is never rolled back)
// ========================================================
// pushUndo(label, collections) right before a destructive change, commitUndo() once the change is in `state`.
// Only the items the change touched are kept (before / after); undo puts back exactly those, merging with
// anything edited since (later edits win, arrays such as codeIds are merged), then repairs references.
// label: [messageKey, params] so the undo button follows the current language. 'meta' may be listed as a
// collection: its fields are compared one by one (e.g. mapLinks when a theme is deleted).
function undoSnapshot(coll) {
  const m = new Map();
  if (coll === 'meta') {
    for (const [k, v] of Object.entries(state.meta)) m.set(k, JSON.stringify(v));
    return m;
  }
  for (const it of state[coll]) m.set(it.id, JSON.stringify(it));
  return m;
}
function pushUndo(label, collections) {
  commitUndo(); // an earlier change left open (should not happen): close it with what is in state now
  const before = {};
  for (const c of collections) before[c] = undoSnapshot(c);
  state.undoStack.push({ label, before, diff: null });
  if (state.undoStack.length > 20) state.undoStack.shift();
  updateUndoButton();
}
function commitUndo() {
  const top = state.undoStack[state.undoStack.length - 1];
  if (!top || top.diff) return;
  const diff = {};
  for (const [coll, before] of Object.entries(top.before)) {
    const after = undoSnapshot(coll);
    const d = new Map();
    for (const [id, b] of before) if (after.get(id) !== b) d.set(id, { b, a: after.get(id) });
    for (const [id, a] of after) if (!before.has(id)) d.set(id, { b: undefined, a });
    if (d.size) diff[coll] = d;
  }
  top.diff = diff;
  delete top.before;
}
// Three-way merge of one item: fields changed since the undone step keep their current value;
// arrays of plain values get the step's additions removed and its removals put back.
function undoMergeItem(before, after, current) {
  const out = { ...current };
  for (const k of new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(current)])) {
    const b = before[k], a = after[k], c = current[k];
    const sb = JSON.stringify(b), sa = JSON.stringify(a), sc = JSON.stringify(c);
    if (sb === sa) continue;           // the step did not touch this field
    if (sc === sa) {                   // untouched since: put back
      if (b === undefined) delete out[k]; else out[k] = JSON.parse(sb);
    } else if (Array.isArray(b) && Array.isArray(a) && Array.isArray(c) && [...b, ...a, ...c].every(x => x === null || typeof x !== 'object')) {
      const added = a.filter(x => !b.includes(x)), removed = b.filter(x => !a.includes(x));
      const merged = c.filter(x => !added.includes(x));
      for (const x of removed) if (!merged.includes(x)) merged.push(x);
      out[k] = merged;
    }                                  // otherwise a later edit wins
  }
  return out;
}
async function performUndo() {
  flushAllPendingSaves(); // text typed just before Ctrl+Z is a later edit: keep it
  commitUndo();
  const last = state.undoStack.pop();
  updateUndoButton();
  if (!last) return;
  for (const [coll, d] of Object.entries(last.diff || {})) {
    if (coll === 'meta') {
      const cur = {};
      for (const [k, { b, a }] of d) cur[k] = { b: b === undefined ? undefined : JSON.parse(b), a: a === undefined ? undefined : JSON.parse(a) };
      const before = {}, after = {};
      for (const [k, v] of Object.entries(cur)) { if (v.b !== undefined) before[k] = v.b; if (v.a !== undefined) after[k] = v.a; }
      const current = {};
      for (const k of Object.keys(cur)) if (state.meta[k] !== undefined) current[k] = state.meta[k];
      const merged = undoMergeItem(before, after, current);
      for (const k of Object.keys(cur)) { if (merged[k] === undefined) delete state.meta[k]; else state.meta[k] = merged[k]; }
      await saveMeta();
      continue;
    }
    const puts = [], dels = [];
    for (const [id, { b, a }] of d) {
      const i = state[coll].findIndex(x => x.id === id);
      if (b === undefined) {                       // created by the step: remove
        if (i >= 0) { state[coll].splice(i, 1); dels.push(id); }
      } else if (a === undefined || i < 0) {       // deleted by the step: put back
        if (i >= 0) state[coll].splice(i, 1);
        const item = JSON.parse(b);
        state[coll].push(item); puts.push(item);
      } else {                                     // changed by the step: merge
        const item = undoMergeItem(JSON.parse(b), JSON.parse(a), state[coll][i]);
        state[coll][i] = item; puts.push(item);
      }
    }
    await dbPutMany(coll, puts);
    await dbDeleteMany(coll, dels);
  }
  state.docs.sort((a, b) => a.createdAt - b.createdAt);
  state.logs.sort((a, b) => a.ts - b.ts);
  await persistRepairs(repairReferences());
  await recordLog({ category: 'system', ak: 'log.undid', ap: { lk: last.label[0], lp: last.label[1] || {} } });
  if (state.activeDocId && !docById(state.activeDocId)) state.activeDocId = state.docs[0]?.id || null;
  state.activeSegId = null;
  renderAll();
  showToast(tr('toast.undone', { label: tr(last.label[0], last.label[1] || {}) }), 'success');
}

// Removes references to items that no longer exist (after an undo or a restore). Returns what changed.
function repairReferences() {
  const put = { docs: [], segments: [], ptags: [], codes: [], themes: [] };
  const del = { segments: [], ptags: [] };
  const docIds = new Set(state.docs.map(d => d.id)), codeIds = new Set(state.codes.map(c => c.id));
  const themeIds = new Set(state.themes.map(t => t.id)), parIds = new Set(state.participants.map(p => p.id));
  state.segments = state.segments.filter(s => {
    if (!docIds.has(s.docId)) { del.segments.push(s.id); return false; }
    const kept = s.codeIds.filter(c => codeIds.has(c));
    if (!kept.length) { del.segments.push(s.id); return false; }
    if (kept.length !== s.codeIds.length) { s.codeIds = kept; put.segments.push(s); }
    return true;
  });
  state.ptags = state.ptags.filter(t => {
    if (docIds.has(t.docId) && parIds.has(t.participantId)) return true;
    del.ptags.push(t.id); return false;
  });
  for (const c of state.codes) {
    const kept = c.themeIds.filter(t => themeIds.has(t));
    if (kept.length !== c.themeIds.length) { c.themeIds = kept; put.codes.push(c); }
  }
  for (const t of state.themes) if (t.parentId && !themeIds.has(t.parentId)) { t.parentId = null; put.themes.push(t); }
  for (const d of state.docs) if (d.defaultParticipantId && !parIds.has(d.defaultParticipantId)) { d.defaultParticipantId = null; put.docs.push(d); }
  if (Array.isArray(state.meta.mapLinks)) {
    const n = state.meta.mapLinks.length;
    state.meta.mapLinks = state.meta.mapLinks.filter(l => themeIds.has(l.from) && themeIds.has(l.to));
    if (state.meta.mapLinks.length !== n) put.meta = true;
  }
  return { put, del };
}
async function persistRepairs({ put, del }) {
  for (const [coll, items] of Object.entries(put)) if (coll !== 'meta') await dbPutMany(coll, items);
  for (const [coll, ids] of Object.entries(del)) await dbDeleteMany(coll, ids);
  if (put.meta) await saveMeta();
}
function updateUndoButton() {
  const btn = document.getElementById('undoBtn');
  if (!btn) return;
  btn.disabled = state.undoStack.length === 0;
  const last = state.undoStack[state.undoStack.length - 1];
  btn.title = last ? tr('undo.title', { label: tr(last.label[0], last.label[1] || {}) }) : tr('undo.none');
}

// ========================================================
// LOAD
// ========================================================
async function loadAll() {
  for (const c of COLLECTIONS) state[c] = await dbGetAll(c);
  const meta = (await dbGetAll('meta')).find(m => m.id === 'project');
  if (meta) state.meta = { ...state.meta, ...meta };
  state.logs.sort((a, b) => a.ts - b.ts);
  state.docs.sort((a, b) => a.createdAt - b.createdAt);
  for (const c of state.codes) if (!Array.isArray(c.themeIds)) c.themeIds = [];
  for (const s of state.segments) if (!Array.isArray(s.codeIds)) s.codeIds = [];
}
function defaultMeta() {
  return { id: 'project', name: '', question: '', approach: 'reflexive', createdAt: Date.now() };
}

// Checks a backup (or any project data from outside) before it goes into state: ids end up in HTML attributes and
// colours in style attributes, so both must have a safe shape. Drops what cannot be used, then repairs references.
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,100}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
function sanitizeProjectData(data) {
  const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const int = v => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : NaN);
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const ids = v => (Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && SAFE_ID.test(x)))] : []);
  const optId = v => (typeof v === 'string' && SAFE_ID.test(v) ? v : null);
  const plain = v => (v && typeof v === 'object' && !Array.isArray(v));
  const list = (c) => (Array.isArray(data?.[c]) ? data[c] : []).filter(x => plain(x) && typeof x.id === 'string' && SAFE_ID.test(x.id));
  const out = {};
  out.docs = list('docs').filter(d => typeof d.text === 'string').map(d => {
    const n = d.text.length;
    const blocks = (Array.isArray(d.blocks) ? d.blocks : []).filter(plain).map(b => ({ ...b, s: int(b.s), e: int(b.e), label: str(b.label) }))
      .filter(b => b.s <= b.e && b.e <= n);
    return { ...d, name: str(d.name), kind: str(d.kind), blocks: blocks.length ? blocks : [{ s: 0, e: n, label: '' }], defaultParticipantId: optId(d.defaultParticipantId), note: str(d.note), createdAt: num(d.createdAt, 0) };
  });
  const docLen = new Map(out.docs.map(d => [d.id, d.text.length]));
  const inDoc = x => docLen.has(x.docId) && Number.isFinite(x.s) && Number.isFinite(x.e) && x.s < x.e && x.e <= docLen.get(x.docId);
  out.segments = list('segments').map(x => ({ ...x, s: int(x.s), e: int(x.e), text: str(x.text), codeIds: ids(x.codeIds), memo: str(x.memo), key: !!x.key, createdAt: num(x.createdAt, 0) })).filter(inDoc);
  out.ptags = list('ptags').map(x => ({ ...x, s: int(x.s), e: int(x.e), participantId: optId(x.participantId) })).filter(x => inDoc(x) && x.participantId);
  out.codes = list('codes').map((c, i) => ({ ...c, name: str(c.name).trim() || '—', description: str(c.description), color: HEX_COLOR.test(c.color || '') ? c.color : CODE_COLORS[i % CODE_COLORS.length], themeIds: ids(c.themeIds), createdAt: num(c.createdAt, i) }));
  out.themes = list('themes').map((t, i) => ({ ...t, name: str(t.name), parentId: optId(t.parentId), status: THEME_STATUS[t.status] ? t.status : 'candidate', definition: str(t.definition), reviewNote: str(t.reviewNote), narrative: str(t.narrative), createdAt: num(t.createdAt, i) }));
  out.participants = list('participants').map((p, i) => {
    const attributes = {};
    if (plain(p.attributes)) for (const [k, v] of Object.entries(p.attributes)) attributes[str(k)] = str(v);
    return { ...p, label: str(p.label).trim() || '—', role: p.role === 'interviewer' ? 'interviewer' : 'participant', attributes, color: HEX_COLOR.test(p.color || '') ? p.color : PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length], createdAt: num(p.createdAt, i) };
  });
  out.logs = list('logs').map(l => ({ ...l, ts: num(l.ts, 0), category: str(l.category), action: str(l.action), detail: str(l.detail), from: str(l.from), to: str(l.to), by: str(l.by), linkedLogId: optId(l.linkedLogId) || undefined }));
  // Project setup: built from the defaults, never merged with the project that was open before
  const meta = defaultMeta();
  if (plain(data?.meta)) {
    for (const [k, v] of Object.entries(data.meta)) {
      if (k === 'id' || k === 'mapLinks') continue;
      if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) meta[k] = v;
    }
    if (Array.isArray(data.meta.mapLinks)) {
      meta.mapLinks = data.meta.mapLinks.filter(l => plain(l) && SAFE_ID.test(str(l.id)) && optId(l.from) && optId(l.to)).map(l => ({ id: l.id, from: l.from, to: l.to, label: str(l.label) }));
    }
  }
  meta.approach = 'reflexive';
  return { collections: out, meta };
}

async function saveMeta() {
  await dbPut('meta', state.meta);
}
