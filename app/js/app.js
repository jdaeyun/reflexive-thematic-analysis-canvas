// Reflexive Thematic Analysis Canvas — App shell
// MIT License · https://github.com/jdaeyun/reflexive-thematic-analysis-canvas
// Startup, tab switching, project setup, backup / restore / reset, file drag & drop, keyboard shortcuts.

const TABS = {
  code:   { btn: 'tabCodeBtn', view: 'viewCode', render: () => { renderCountsToggles(); if (state.textQuery.trim()) computeSearchHits(); renderSearchResults(); renderDocList(); renderParticipantList(); renderViewer(); renderSelectionPanel(); renderCodebook(); renderSegmentPanel(); } },
  themes: { btn: 'tabThemesBtn', view: 'viewThemes', render: () => renderThemesView() },
  audit:  { btn: 'tabAuditBtn', view: 'viewAudit', render: () => renderAuditView() },
  export: { btn: 'tabExportBtn', view: 'viewExport', render: () => renderExportView() }
};

function switchTab(tab) {
  flushAllPendingSaves();
  state.activeTab = tab;
  for (const [k, t] of Object.entries(TABS)) {
    const on = k === tab;
    document.getElementById(t.view).classList.toggle('hidden', !on);
    const b = document.getElementById(t.btn);
    b.className = on
      ? 'px-2.5 py-1.5 text-xs font-bold rounded-md bg-white text-indigo-700 shadow-sm cursor-pointer transition flex items-center gap-1.5'
      : 'px-2.5 py-1.5 text-xs font-medium rounded-md text-slate-500 hover:text-slate-800 cursor-pointer transition flex items-center gap-1.5';
  }
  lsSet('ta_active_tab', tab);
  TABS[tab].render();
  if (typeof refreshJournalContext === 'function') refreshJournalContext();
}

function renderAll() {
  flushAllPendingSaves();
  renderHeader();
  updateAuditBadge();
  updateUndoButton();
  TABS[state.activeTab].render();
}

function renderHeader() {
  document.getElementById('projectNameLabel').textContent = state.meta.name || tr('hdr.untitled');
  document.getElementById('projectBtnCompact').title = `${tr('hdr.projectSetup')}: ${state.meta.name || tr('hdr.untitled')}`;
  const rid = document.getElementById('researcherIdInput');
  if (document.activeElement !== rid) rid.value = state.researcherId;
  renderLastBackup();
  // Website guide in the interface language
  const guide = document.getElementById('guideLink');
  if (guide) guide.href = `${TA_SITE_URL}${LANG === 'ja' ? 'ja' : 'en'}/guide.html`;
}
const TA_SITE_URL = 'https://jdaeyun.github.io/reflexive-thematic-analysis-canvas/';

// "Last backup: 3 days ago" in the header. Quiet: no prompt, nothing that interrupts the analysis. It only turns
// amber once there is data and no backup from the last week, and its tooltip says where the project lives.
const BACKUP_STALE_MS = 7 * 24 * 3600 * 1000;
function renderLastBackup() {
  const el = document.getElementById('lastBackupLabel');
  if (!el) return;
  const ts = state.meta.lastBackupAt;
  const stale = state.docs.length > 0 && (!ts || Date.now() - ts > BACKUP_STALE_MS);
  el.classList.toggle('hidden', !ts && !state.docs.length);
  el.classList.toggle('text-amber-700', stale);
  el.classList.toggle('text-slate-400', !stale);
  el.textContent = ts ? tr('hdr.lastBackup', { when: relativeTime(ts) }) : tr('hdr.noBackup');
  const where = tr(location.protocol === 'file:' ? 'hdr.storageFile' : 'hdr.storageWeb');
  el.title = `${ts ? tr('hdr.lastBackupTitle', { time: fmtTime(ts) }) : tr('hdr.backupTitle')}\n${where}`;
}
function relativeTime(ts) {
  const sec = Math.max(0, (Date.now() - ts) / 1000);
  if (sec < 60) return tr('time.justNow');
  const rtf = new Intl.RelativeTimeFormat(localeOf(), { numeric: 'auto' });
  if (sec < 3600) return rtf.format(-Math.floor(sec / 60), 'minute');
  if (sec < 86400) return rtf.format(-Math.floor(sec / 3600), 'hour');
  return rtf.format(-Math.floor(sec / 86400), 'day');
}

// ========================================================
// PROJECT SETUP
// ========================================================
// Optional reporting fields (RTARG: own your perspectives, orientation to RTA, data preparation)
const PROJECT_FIELDS = [['projTheory', 'theory'], ['projOrientInd', 'orientInductive'], ['projOrientLat', 'orientLatent'], ['projOrientNote', 'orientNote'], ['projDataPrep', 'dataPrep']];

function openProjectModal() {
  document.getElementById('projName').value = state.meta.name || '';
  document.getElementById('projQuestion').value = state.meta.question || '';
  document.getElementById('projLang').value = langSetting();
  for (const [id, key] of PROJECT_FIELDS) document.getElementById(id).value = state.meta[key] || '';
  document.getElementById('projectModal').classList.remove('hidden');
}
async function saveProjectModal() {
  const name = document.getElementById('projName').value.trim();
  const question = document.getElementById('projQuestion').value.trim();
  const approach = 'reflexive'; // the only approach supported for now
  if (name !== state.meta.name || question !== state.meta.question) {
    await recordLog({ category: 'system', ak: 'log.setup', detail: [name, question].filter(Boolean).join(' — ') });
  }
  // Positioning fields are interpretive choices: log each change with before / after
  for (const [id, key] of PROJECT_FIELDS) {
    const v = document.getElementById(id).value.trim();
    if (v === (state.meta[key] || '')) continue;
    const ft = key === 'orientInductive' ? 'orientInd' : key === 'orientLatent' ? 'orientLat' : null;
    await recordLog({ category: 'familiarisation', ak: `log.meta.${key}`, from: state.meta[key] || '', to: v, ft });
    state.meta[key] = v;
  }
  Object.assign(state.meta, { name, question, approach });
  await saveMeta();
  document.getElementById('projectModal').classList.add('hidden');
  renderAll();
}

// ========================================================
// BACKUP / RESTORE / RESET
// ========================================================
async function backupProject() {
  flushAllPendingSaves(); // the backup includes what was typed a moment ago
  state.meta.lastBackupAt = Date.now(); // saved in the backup too: a restored project shows when that copy was made
  const payload = { app: 'reflexive-thematic-analysis-canvas', schema: 1, appVersion: window.TA_CANVAS?.version || '', exportedAt: new Date().toISOString(), exportedBy: state.researcherId || '', meta: state.meta };
  for (const c of COLLECTIONS) payload[c] = state[c];
  downloadBlob(new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' }), `${safeFileStem()}_${new Date().toISOString().slice(0, 10)}.json`);
  renderLastBackup();
  await saveMeta();
  promptNote({ title: tr('prompt.backup'), placeholder: tr('prompt.backupPh'), mode: 'journal', journalType: 'session', ttl: 15000 });
}
// Backup without document texts: two files. The analysis file holds the project without the text of the documents
// (and without the quoted extracts in coded extracts, the record and journal context); the texts file holds only
// the document texts. Keep the texts file where the data must stay. Restoring the analysis file asks for the texts
// file or the original .txt / .docx / .doc files and reconnects them by fingerprint. What the researcher wrote
// (memos, definitions, narratives, journal) stays in the analysis file and may quote the data.
const QUOTING_LOGS = new Set(['log.coded', 'log.uncoded', 'log.tagged', 'log.extractRemoved', 'log.extractResized', 'log.extractSetAside', 'log.extractPutBack', 'log.docRevised']);
function stripLogQuotes(l) {
  const out = { ...l };
  if (QUOTING_LOGS.has(l.ak)) { out.detail = ''; out.from = ''; out.to = ''; }
  if (l.ctx) {
    out.ctx = { ...l.ctx };
    for (const k of ['extract', 'quote']) if (out.ctx[k]) out.ctx[k] = { ...out.ctx[k], text: '' };
  }
  return out;
}
async function backupWithoutTexts() {
  if (!confirm(tr('backupSplit.confirm'))) return;
  flushAllPendingSaves();
  state.meta.lastBackupAt = Date.now();
  const stamp = new Date().toISOString().slice(0, 10);
  const base = { schema: 1, appVersion: window.TA_CANVAS?.version || '', exportedAt: new Date().toISOString(), exportedBy: state.researcherId || '' };
  const analysis = { app: 'reflexive-thematic-analysis-canvas', textless: true, ...base, meta: state.meta };
  for (const c of COLLECTIONS) analysis[c] = state[c];
  analysis.docs = state.docs.map(({ text, ...d }) => ({ ...d, textFingerprint: textFingerprint(text) }));
  analysis.segments = state.segments.map(s => ({ ...s, text: '' }));
  analysis.logs = state.logs.map(stripLogQuotes);
  const texts = { app: 'reflexive-thematic-analysis-canvas-texts', ...base, docs: state.docs.map(d => ({ id: d.id, name: d.name, textFingerprint: textFingerprint(d.text), text: d.text })) };
  downloadBlob(new Blob([JSON.stringify(analysis, null, 1)], { type: 'application/json' }), `${safeFileStem()}_${stamp}_analysis.json`);
  downloadBlob(new Blob([JSON.stringify(texts)], { type: 'application/json' }), `${safeFileStem()}_${stamp}_texts.json`);
  renderLastBackup();
  await saveMeta();
  await recordLog({ category: 'system', ak: 'log.backupSplit' });
}

// Restoring an analysis file: ask for the texts (texts file or original files) and fill them in by fingerprint.
// Resolves with the backup data (docs that were not reconnected are left without text and dropped), or null.
async function textsFromFile(f) {
  const kind = fileKind(f.name);
  const buf = await f.arrayBuffer();
  if (/\.json$/i.test(f.name)) {
    const d = JSON.parse(new TextDecoder().decode(buf));
    return d?.app === 'reflexive-thematic-analysis-canvas-texts' && Array.isArray(d.docs) ? d.docs.filter(x => typeof x?.text === 'string').map(x => x.text) : [];
  }
  if (!['txt', 'docx', 'doc'].includes(kind)) return [];
  return [textToDoc((await readPlainText(buf, kind)).raw).text];
}
function reconnectTexts(data) {
  const modal = document.getElementById('reconnectModal');
  const list = document.getElementById('reconnectList');
  const input = document.getElementById('reconnectInput');
  const okBtn = document.getElementById('reconnectOk'), partBtn = document.getElementById('reconnectPartial');
  const docs = (Array.isArray(data.docs) ? data.docs : []).filter(d => d && typeof d === 'object');
  const found = new Map(); // doc id → text
  const render = () => {
    list.innerHTML = docs.map(d => `<li class="flex items-center gap-2 px-2 py-1 border-b border-slate-100 text-xs">
      <i class="ph ${found.has(d.id) ? 'ph-check-circle text-emerald-600' : 'ph-circle-dashed text-slate-400'}"></i>
      <span class="flex-1 min-w-0 truncate">${escapeHtml(d.name || d.id)}</span>
      <span class="text-[10px] ${found.has(d.id) ? 'text-emerald-700' : 'text-slate-400'}">${escapeHtml(tr(found.has(d.id) ? 'reconnect.ok' : 'reconnect.missing'))}</span></li>`).join('');
    okBtn.disabled = found.size < docs.length;
    partBtn.classList.toggle('hidden', found.size === docs.length || found.size === 0);
  };
  return new Promise(resolve => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      observer.disconnect();
      modal.classList.add('hidden');
      input.value = '';
      resolve(result);
    };
    const fill = () => {
      for (const d of docs) {
        if (found.has(d.id)) { d.text = found.get(d.id); for (const s of data.segments || []) if (s && s.docId === d.id) s.text = d.text.slice(s.s, s.e); }
        else delete d.text;
      }
      return data;
    };
    input.onchange = async () => {
      let unmatched = 0;
      for (const f of input.files) {
        let texts = [];
        try { texts = await textsFromFile(f); } catch (e) { console.error(e); }
        let hit = false;
        for (const text of texts) {
          const fp = textFingerprint(text);
          for (const d of docs) if (!found.has(d.id) && d.textFingerprint === fp) { found.set(d.id, text); hit = true; }
        }
        if (!hit) unmatched++;
      }
      input.value = '';
      render();
      if (unmatched) showToast(tr('reconnect.noMatch', { n: unmatched }), 'error');
    };
    okBtn.onclick = () => finish(fill());
    partBtn.onclick = () => { if (confirm(tr('reconnect.partialConfirm', { n: docs.length - found.size }))) finish(fill()); };
    // Closing the dialog (Cancel, Esc) cancels the restore
    const observer = new MutationObserver(() => { if (modal.classList.contains('hidden')) finish(null); });
    render();
    modal.classList.remove('hidden');
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  });
}

async function restoreProject(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { alert(tr('restore.invalidJson')); return; }
  // 'thematic-analysis-canvas': backups made before the app was renamed (v0.1 beta)
  if (!['reflexive-thematic-analysis-canvas', 'thematic-analysis-canvas'].includes(data.app)) { alert(tr('restore.notBackup')); return; }
  if (!confirm(tr('restore.confirm', { name: data.meta?.name || file.name }))) return;
  if (data.textless) {
    data = await reconnectTexts(data);
    if (!data) return;
  }
  flushAllPendingSaves();
  const clean = sanitizeProjectData(data);
  // Keep the open project: if writing the backup fails, nothing in the browser changes (one transaction) and
  // the project in memory is put back as well.
  const before = { meta: state.meta };
  for (const c of COLLECTIONS) before[c] = state[c];
  for (const c of COLLECTIONS) state[c] = clean.collections[c];
  state.meta = clean.meta;
  state.logs.sort((a, b) => a.ts - b.ts);
  state.docs.sort((a, b) => a.createdAt - b.createdAt);
  repairReferences(); // state only: everything is written in full below
  try {
    await dbReplaceProject(state, state.meta);
  } catch (e) {
    console.error('restore', e);
    for (const c of COLLECTIONS) state[c] = before[c];
    state.meta = before.meta;
    renderAll();
    alert(tr('restore.failed', { error: e?.message || String(e) }));
    return;
  }
  await recordLog({ category: 'system', ak: 'log.restored', ap: { file: file.name } });
  state.undoStack = [];
  state.activeDocId = state.docs[0]?.id || null;
  state.activeSegId = null;
  state.pendingSel = null;
  renderAll();
  showToast(tr('toast.restored'), 'success');
}
async function resetProject() {
  if (!confirm(tr('reset.confirm1'))) return;
  if (!confirm(tr('reset.confirm2'))) return;
  flushAllPendingSaves();
  const meta = defaultMeta();
  try {
    await dbReplaceProject({}, meta);
  } catch (e) {
    console.error('reset', e);
    alert(tr('reset.failed', { error: e?.message || String(e) }));
    return;
  }
  for (const c of COLLECTIONS) state[c] = [];
  state.meta = meta;
  state.undoStack = [];
  state.activeDocId = null; state.activeSegId = null; state.pendingSel = null;
  renderAll();
  openProjectModal();
}

// ========================================================
// LAYOUT: one resizable left column shared by every tab
// ========================================================
const LEFT_W = { def: 272, min: 200, max: 480 };
function applyLeftWidth(px) {
  const w = Math.max(LEFT_W.min, Math.min(LEFT_W.max, Math.round(px)));
  document.documentElement.style.setProperty('--left-w', `${w}px`);
  return w;
}
function setupColumnResize() {
  const saved = Number(lsGet('ta_left_w')) || LEFT_W.def;
  applyLeftWidth(saved);
  document.querySelectorAll('.col-resizer').forEach(h => {
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const col = h.parentElement;
      const startX = e.clientX, startW = col.getBoundingClientRect().width;
      h.setPointerCapture(e.pointerId);
      h.classList.add('dragging'); document.body.classList.add('col-resizing');
      const move = (ev) => applyLeftWidth(startW + ev.clientX - startX);
      const up = (ev) => {
        h.releasePointerCapture(e.pointerId);
        h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up);
        h.classList.remove('dragging'); document.body.classList.remove('col-resizing');
        const w = applyLeftWidth(startW + ev.clientX - startX);
        lsSet('ta_left_w', w);
      };
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
    });
    h.addEventListener('dblclick', () => {
      applyLeftWidth(LEFT_W.def);
      lsRemove('ta_left_w');
    });
  });
}

// ========================================================
// STARTUP
// ========================================================
// Icon-only buttons and links are named by their tooltip for screen readers (kept in step when the tooltip
// changes, e.g. after switching language). Elements with their own aria-label are left alone.
// Same project open in two tabs: each tab keeps its own copy in memory and writes it back, so the tabs would
// silently overwrite each other. Warn in every tab while another one is open (nothing is blocked).
function watchOtherTabs() {
  if (!('BroadcastChannel' in window)) return;
  const banner = document.getElementById('multiTabBanner');
  if (!banner) return;
  const ch = new BroadcastChannel(`ta-tabs-${TA_DB_NAME}`);
  const me = uid('tab');
  const others = new Set();
  let dismissed = false;
  const refresh = () => {
    const show = others.size > 0 && !dismissed;
    banner.classList.toggle('hidden', !show);
    banner.classList.toggle('flex', show);
  };
  ch.onmessage = (e) => {
    const m = e.data;
    if (!m || m.from === me) return;
    if (m.type === 'hello') { if (!others.has(m.from)) dismissed = false; others.add(m.from); ch.postMessage({ type: 'present', from: me }); }
    else if (m.type === 'present') others.add(m.from);
    else if (m.type === 'bye') others.delete(m.from);
    refresh();
  };
  ch.postMessage({ type: 'hello', from: me });
  window.addEventListener('pagehide', () => { try { ch.postMessage({ type: 'bye', from: me }); } catch (err) { /* channel closed */ } });
  document.getElementById('multiTabDismissBtn').onclick = () => { dismissed = true; refresh(); };
}

// Dialogs: focus moves into a dialog when it opens and back to where it was when it closes; Tab stays inside.
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function topModal() {
  const open = [...document.querySelectorAll('.ta-modal:not(.hidden)')];
  return open[open.length - 1] || null;
}
function visibleFocusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0);
}
function trapTab(e) {
  const m = topModal();
  if (!m || e.key !== 'Tab') return;
  const items = visibleFocusables(m);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (!m.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// Long-text boxes (definitions, analytic narratives, memos …) grow with what is typed, up to 60% of the window
// height (textarea.auto-grow in ta_canvas.css), then scroll. Boxes are measured in batches (read, then write),
// and hidden ones only once they become visible, so a long write-up does not cost one layout pass per box.
// growTextarea(el): re-measure a box whose value was set by code (typing is picked up by itself)
let growTextarea = () => {};
function setupAutoGrowTextareas() {
  const queue = new Set();
  let scheduled = false;
  const growMany = (els) => {
    const live = els.filter(el => el.isConnected && el.getClientRects().length > 0);
    const fresh = live.filter(el => el._minH === undefined);
    fresh.forEach(el => { el._minH = el.offsetHeight; });                                          // read
    fresh.forEach(el => { el.style.minHeight = `${el._minH}px`; el.classList.add('auto-grow'); }); // write
    live.forEach(el => { el.style.height = 'auto'; });                                             // write
    const sizes = live.map(el => el.scrollHeight + el.offsetHeight - el.clientHeight);             // read
    live.forEach((el, i) => { el.style.height = `${sizes[i]}px`; });                               // write
  };
  const flush = () => { scheduled = false; const els = [...queue]; queue.clear(); growMany(els); };
  const schedule = (el) => { queue.add(el); if (!scheduled) { scheduled = true; requestAnimationFrame(flush); } };
  const visibility = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) schedule(e.target); }));
  const widths = new ResizeObserver(entries => entries.forEach(e => { // only a change of width re-wraps the text
    const w = Math.round(e.contentRect.width);
    if (e.target._lastW !== w) { e.target._lastW = w; schedule(e.target); }
  }));
  const init = (el) => {
    if (el._autoGrow) return;
    el._autoGrow = true;
    visibility.observe(el); widths.observe(el); schedule(el);
  };
  const initIn = (root) => {
    if (root.nodeType !== 1) return;
    if (root.tagName === 'TEXTAREA') init(root);
    root.querySelectorAll('textarea').forEach(init);
  };
  growTextarea = (el) => { if (el) { init(el); schedule(el); } };
  document.addEventListener('input', e => { if (e.target.tagName === 'TEXTAREA') growTextarea(e.target); });
  initIn(document.body);
  new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(initIn))).observe(document.body, { childList: true, subtree: true });
}

function setupAccessibleNames() {
  const label = (el) => {
    if (!el.matches('button[title], a[title]')) return;
    if (el.hasAttribute('aria-label') && !el.dataset.autoAria) return;
    if (el.textContent.trim() && !el.dataset.autoAria) return;
    el.setAttribute('aria-label', el.title);
    el.dataset.autoAria = '1';
  };
  const scan = (root) => { if (root.nodeType !== 1) return; label(root); root.querySelectorAll('button[title], a[title]').forEach(label); };
  scan(document.body);
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'attributes') label(r.target);
      else r.addedNodes.forEach(scan);
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
}

function setupShellEvents() {
  for (const [k, t] of Object.entries(TABS)) document.getElementById(t.btn).onclick = () => switchTab(k);
  document.getElementById('projectBtn').onclick = openProjectModal;
  document.getElementById('projectBtnCompact').onclick = openProjectModal;
  // Language: gear menu and project setup share one setting (auto = browser language)
  const menuLang = document.getElementById('menuLang');
  menuLang.value = langSetting();
  menuLang.addEventListener('click', e => e.stopPropagation());
  menuLang.onchange = () => { setLanguage(menuLang.value); document.getElementById('projLang').value = menuLang.value; };
  document.getElementById('projLang').onchange = (e) => { setLanguage(e.target.value); menuLang.value = e.target.value; };
  // Highlight colours for coded text (display preference)
  const menuMarker = document.getElementById('menuMarker');
  menuMarker.value = MARKER_STYLES[state.markerStyle] ? state.markerStyle : 'standard';
  menuMarker.addEventListener('click', e => e.stopPropagation());
  menuMarker.onchange = () => {
    state.markerStyle = menuMarker.value;
    lsSet('ta_marker_style', state.markerStyle);
    if (state.activeTab === 'code') renderViewer();
  };
  document.getElementById('projSave').onclick = saveProjectModal;
  document.getElementById('projCancel').onclick = () => document.getElementById('projectModal').classList.add('hidden');
  const rid = document.getElementById('researcherIdInput');
  rid.addEventListener('input', () => { // kept at once: entries made before leaving the field carry the name
    state.researcherId = rid.value.trim();
    lsSet('ta_researcher_id', state.researcherId);
  });
  document.getElementById('backupBtn').onclick = backupProject;
  document.getElementById('backupSplitBtn').onclick = backupWithoutTexts;
  document.getElementById('reconnectChoose').onclick = () => document.getElementById('reconnectInput').click();
  document.getElementById('restoreBtn').onclick = () => document.getElementById('restoreInput').click();
  document.getElementById('restoreInput').onchange = async (e) => { if (e.target.files[0]) await restoreProject(e.target.files[0]); e.target.value = ''; };
  document.getElementById('resetBtn').onclick = resetProject;
  document.getElementById('undoBtn').onclick = performUndo;
  const menuBtn = document.getElementById('menuBtn'), menu = document.getElementById('menuDropdown');
  menuBtn.onclick = (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); };
  document.addEventListener('click', () => menu.classList.add('hidden'));
  document.querySelectorAll('[data-close-modal]').forEach(b => b.onclick = () => b.closest('.ta-modal').classList.add('hidden'));

  // Drop files anywhere (except while dragging codes / participants inside the app)
  const overlay = document.getElementById('dropOverlay');
  let depth = 0;
  const isFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', e => { if (isFiles(e)) { depth++; overlay.classList.add('active'); } });
  window.addEventListener('dragleave', e => { if (isFiles(e) && --depth <= 0) { depth = 0; overlay.classList.remove('active'); } });
  window.addEventListener('dragover', e => { if (isFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', async e => {
    if (!isFiles(e)) return;
    e.preventDefault(); depth = 0; overlay.classList.remove('active');
    if (state.activeTab !== 'code') switchTab('code');
    await importFiles(e.dataTransfer.files);
  });

  // Dialogs remember whether something was typed since they opened (Esc asks before discarding it)
  // They are also announced as dialogs, named after their title line.
  document.querySelectorAll('.ta-modal').forEach(m => {
    const mark = () => { m.dataset.dirty = '1'; };
    m.addEventListener('input', mark);
    m.addEventListener('change', mark);
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    let wasOpen = !m.classList.contains('hidden'), returnTo = null;
    new MutationObserver(() => {
      const open = !m.classList.contains('hidden');
      if (open === wasOpen) return;
      wasOpen = open;
      if (!open) {
        // Focus goes back to what opened the dialog (if it is still there and nothing else took it)
        if (returnTo && document.contains(returnTo) && (!document.activeElement || document.activeElement === document.body || m.contains(document.activeElement))) {
          try { returnTo.focus(); } catch (err) { /* element gone */ }
        }
        returnTo = null;
        return;
      }
      returnTo = document.activeElement;
      m.dataset.dirty = '';
      const title = m.querySelector('.font-bold');
      if (title) m.setAttribute('aria-label', title.textContent.trim());
      // Into the dialog, unless the code that opened it already focused a field inside
      setTimeout(() => { if (!m.contains(document.activeElement)) visibleFocusables(m)[0]?.focus(); }, 0);
    }).observe(m, { attributes: true, attributeFilter: ['class'] });
  });
  setupAccessibleNames();
  watchOtherTabs();
  setupAutoGrowTextareas();


  document.addEventListener('keydown', trapTab);
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); performUndo(); }
    if (e.key === 'Escape') {
      // Only the topmost dialog closes; one with unsaved edits asks first
      const open = [...document.querySelectorAll('.ta-modal:not(.hidden)')];
      if (open.length) {
        const top = open[open.length - 1];
        if (top.dataset.dirty === '1' && !confirm(tr('modal.discardConfirm'))) return;
        top.classList.add('hidden');
        return;
      }
      closeJournal();
      document.getElementById('notePrompt').classList.add('hidden');
      if (state.pendingSel) clearPendingSelection();
    }
    // With text selected in the viewer, start typing a code name right away
    if (state.activeTab === 'code' && state.pendingSel && !typing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const q = document.getElementById('quickCodeInput');
      q.focus();
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  applyI18n();
  const ver = document.getElementById('appVersionLabel');
  if (ver && window.TA_CANVAS) ver.textContent = `v${window.TA_CANVAS.version}`;
  setupShellEvents();
  setupColumnResize();
  setupCodingEvents();
  setupRevisionEvents();
  setupThemeEvents();
  setupMapEvents();
  setupAuditEvents();
  setupExportEvents();
  setupRefiEvents();
  setupJournalEvents();
  try {
    await loadAll();
  } catch (e) {
    console.error(e);
    alert(tr('err.storage'));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  state.activeDocId = state.docs[0]?.id || null;
  const tab = lsGet('ta_active_tab', 'code');
  switchTab(TABS[tab] ? tab : 'code');
  renderHeader();
  updateAuditBadge();
  updateUndoButton();
  setInterval(renderLastBackup, 60000); // keep "… ago" current
  if (!state.meta.name && !state.docs.length) openProjectModal();
  window.taReady = true; // start-up finished (the browser tests wait for this)
});
