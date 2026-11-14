// Thematic Analysis Canvas — Core
// MIT License · https://github.com/jdaeyun/thematic-analysis-canvas
// IndexedDB storage, app state, audit log, undo snapshots and shared helpers. Must load first.
// Classic <script> (shared global scope); see the load order in ta_canvas.html.

// ========================================================
// INDEXEDDB
// ========================================================
const TA_DB_NAME = 'ThematicAnalysisCanvasDB';
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
    tx.onerror = () => reject(tx.error);
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
    tx.onerror = () => reject(tx.error);
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
  });
}

// ========================================================
// STATE
// ========================================================
const state = {
  researcherId: localStorage.getItem('ta_researcher_id') || '',
  meta: { id: 'project', name: '', question: '', approach: 'reflexive', createdAt: Date.now() },
  docs: [],         // { id, name, kind: 'txt'|'csv'|'docx'|'doc', encoding, text, blocks: [{ s, e, label }], defaultParticipantId, note, createdAt }
  segments: [],     // { id, docId, s, e, text, codeIds: [], memo, key: bool, createdBy, createdAt }
  ptags: [],        // { id, docId, s, e, participantId }
  codes: [],        // { id, name, description, color, themeIds: [], createdAt, order }
  themes: [],       // { id, name, parentId, status: 'candidate'|'reviewed'|'defined'|'discarded', definition, reviewNote, checkedExtracts, checkedDataset, order, createdAt }
  participants: [], // { id, label, role: 'participant'|'interviewer', attributes: { key: value }, color, createdAt }
  logs: [],         // { id, ts, category, action, detail, from, to, by }
  activeTab: 'code',
  activeDocId: null,
  pendingSel: null, // { docId, s, e, text }
  activeSegId: null,
  codeFilter: '',
  themeStatusFilter: 'all',
  openThemeExtracts: new Set(),
  openCodeExtracts: new Set(),
  exportTable: 'narrative',
  // Prevalence counts (extracts / participants per code and theme) are hidden by default: in reflexive TA
  // frequency does not decide what matters, and constant numbers nudge "more = more important"
  showCounts: (() => { try { return localStorage.getItem('ta_show_counts') === 'true'; } catch (e) { return false; } })(),
  auditFilter: 'decisions', // single coding actions are hidden by default so journal notes stay visible
  lastThemeId: null,        // theme card the user last worked on (journal context)
  undoStack: []
};

const COLLECTIONS = ['docs', 'segments', 'ptags', 'codes', 'themes', 'participants', 'logs'];

const CODE_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#d946ef'];
const PARTICIPANT_COLORS = ['#0f766e', '#7c3aed', '#b45309', '#be123c', '#1d4ed8', '#4d7c0f', '#a21caf', '#0369a1'];

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

// Lookups
const byId = (coll, id) => state[coll].find(x => x.id === id);
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

// Participants of a coded segment: participant ranges overlapping it, else the document default.
function participantsForRange(docId, s, e) {
  const ids = [];
  for (const p of state.ptags) {
    if (p.docId === docId && p.s < e && p.e > s && !ids.includes(p.participantId)) ids.push(p.participantId);
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
function updateAuditBadge() {
  const b = document.getElementById('auditCountBadge');
  if (b) b.textContent = String(state.logs.length);
}

// ========================================================
// UNDO (snapshots of whole collections — the data is small text)
// ========================================================
// label: [messageKey, params] so the undo button follows the current language
function pushUndo(label, collections) {
  const data = {};
  for (const c of collections) data[c] = JSON.parse(JSON.stringify(state[c]));
  state.undoStack.push({ label, data });
  if (state.undoStack.length > 20) state.undoStack.shift();
  updateUndoButton();
}
async function performUndo() {
  const last = state.undoStack.pop();
  updateUndoButton();
  if (!last) return;
  for (const [coll, items] of Object.entries(last.data)) {
    state[coll] = items;
    await dbReplaceAll(coll, items);
  }
  await recordLog({ category: 'system', ak: 'log.undid', ap: { lk: last.label[0], lp: last.label[1] || {} } });
  if (state.activeDocId && !docById(state.activeDocId)) state.activeDocId = state.docs[0]?.id || null;
  state.activeSegId = null;
  renderAll();
  showToast(tr('toast.undone', { label: tr(last.label[0], last.label[1] || {}) }), 'success');
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
async function saveMeta() {
  await dbPut('meta', state.meta);
}
