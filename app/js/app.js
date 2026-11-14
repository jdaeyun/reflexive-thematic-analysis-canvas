// Thematic Analysis Canvas — App shell
// MIT License · https://github.com/jdaeyun/thematic-analysis-canvas
// Startup, tab switching, project setup, backup / restore / reset, file drag & drop, keyboard shortcuts.

const TABS = {
  code:   { btn: 'tabCodeBtn', view: 'viewCode', render: () => { renderDocList(); renderParticipantList(); renderViewer(); renderSelectionPanel(); renderCodebook(); renderSegmentPanel(); } },
  themes: { btn: 'tabThemesBtn', view: 'viewThemes', render: () => renderThemesView() },
  audit:  { btn: 'tabAuditBtn', view: 'viewAudit', render: () => renderAuditView() },
  export: { btn: 'tabExportBtn', view: 'viewExport', render: () => renderExportView() }
};

function switchTab(tab) {
  state.activeTab = tab;
  for (const [k, t] of Object.entries(TABS)) {
    const on = k === tab;
    document.getElementById(t.view).classList.toggle('hidden', !on);
    const b = document.getElementById(t.btn);
    b.className = on
      ? 'px-2.5 py-1.5 text-xs font-bold rounded-md bg-white text-indigo-700 shadow-sm cursor-pointer transition flex items-center gap-1.5'
      : 'px-2.5 py-1.5 text-xs font-medium rounded-md text-slate-500 hover:text-slate-800 cursor-pointer transition flex items-center gap-1.5';
  }
  try { localStorage.setItem('ta_active_tab', tab); } catch (e) { /* private mode */ }
  TABS[tab].render();
}

function renderAll() {
  renderHeader();
  updateAuditBadge();
  updateUndoButton();
  TABS[state.activeTab].render();
}

function renderHeader() {
  document.getElementById('projectNameLabel').textContent = state.meta.name || 'Untitled project';
  const rid = document.getElementById('researcherIdInput');
  if (document.activeElement !== rid) rid.value = state.researcherId;
}

// ========================================================
// PROJECT SETUP
// ========================================================
function openProjectModal() {
  document.getElementById('projName').value = state.meta.name || '';
  document.getElementById('projQuestion').value = state.meta.question || '';
  document.getElementById('projApproach').value = state.meta.approach || 'reflexive';
  document.getElementById('projectModal').classList.remove('hidden');
}
async function saveProjectModal() {
  const name = document.getElementById('projName').value.trim();
  const question = document.getElementById('projQuestion').value.trim();
  const approach = document.getElementById('projApproach').value;
  if (name !== state.meta.name || question !== state.meta.question || approach !== state.meta.approach) {
    await recordLog({ category: 'system', action: 'Updated project setup', detail: [name, question].filter(Boolean).join(' — ') });
  }
  Object.assign(state.meta, { name, question, approach });
  await saveMeta();
  document.getElementById('projectModal').classList.add('hidden');
  renderAll();
}

// ========================================================
// BACKUP / RESTORE / RESET
// ========================================================
function backupProject() {
  const payload = { app: 'thematic-analysis-canvas', schema: 1, appVersion: window.TA_CANVAS?.version || '', exportedAt: new Date().toISOString(), exportedBy: state.researcherId || '', meta: state.meta };
  for (const c of COLLECTIONS) payload[c] = state[c];
  downloadBlob(new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' }), `${safeFileStem()}_${new Date().toISOString().slice(0, 10)}.json`);
  showToast('Backup saved. It contains the full text of your documents — store it like raw data.', 'success');
}
async function restoreProject(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { alert('This is not a valid JSON file.'); return; }
  if (data.app !== 'thematic-analysis-canvas') { alert('This file is not a Thematic Analysis Canvas backup.'); return; }
  if (!confirm(`Replace the current project with “${data.meta?.name || file.name}”? The current project in this browser is overwritten.`)) return;
  for (const c of COLLECTIONS) { state[c] = Array.isArray(data[c]) ? data[c] : []; await dbReplaceAll(c, state[c]); }
  state.meta = { ...state.meta, ...(data.meta || {}), id: 'project' };
  await saveMeta();
  await recordLog({ category: 'system', action: `Restored project from ${file.name}` });
  state.undoStack = [];
  state.activeDocId = state.docs[0]?.id || null;
  state.activeSegId = null;
  renderAll();
  showToast('Project restored', 'success');
}
async function resetProject() {
  if (!confirm('Start a new, empty project? Everything in this browser is deleted. Make a backup first if you need it.')) return;
  if (!confirm('Really delete all documents, codes, themes and the audit trail?')) return;
  for (const c of COLLECTIONS) { state[c] = []; await dbReplaceAll(c, []); }
  state.meta = { id: 'project', name: '', question: '', approach: 'reflexive', createdAt: Date.now() };
  await saveMeta();
  state.undoStack = [];
  state.activeDocId = null; state.activeSegId = null; state.pendingSel = null;
  renderAll();
  openProjectModal();
}

// ========================================================
// STARTUP
// ========================================================
function setupShellEvents() {
  for (const [k, t] of Object.entries(TABS)) document.getElementById(t.btn).onclick = () => switchTab(k);
  document.getElementById('projectBtn').onclick = openProjectModal;
  document.getElementById('projSave').onclick = saveProjectModal;
  document.getElementById('projCancel').onclick = () => document.getElementById('projectModal').classList.add('hidden');
  const rid = document.getElementById('researcherIdInput');
  rid.addEventListener('change', () => {
    state.researcherId = rid.value.trim();
    try { localStorage.setItem('ta_researcher_id', state.researcherId); } catch (e) { /* private mode */ }
  });
  document.getElementById('backupBtn').onclick = backupProject;
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

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); performUndo(); }
    if (e.key === 'Escape') {
      document.querySelectorAll('.ta-modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
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
  const ver = document.getElementById('appVersionLabel');
  if (ver && window.TA_CANVAS) ver.textContent = `v${window.TA_CANVAS.version}`;
  setupShellEvents();
  setupCodingEvents();
  setupThemeEvents();
  setupAuditEvents();
  setupExportEvents();
  try {
    await loadAll();
  } catch (e) {
    console.error(e);
    alert('Could not open browser storage (IndexedDB). Private windows or blocked site data can cause this.');
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  state.activeDocId = state.docs[0]?.id || null;
  let tab = 'code';
  try { tab = localStorage.getItem('ta_active_tab') || 'code'; } catch (e) { /* private mode */ }
  switchTab(TABS[tab] ? tab : 'code');
  renderHeader();
  updateAuditBadge();
  updateUndoButton();
  if (!state.meta.name && !state.docs.length) openProjectModal();
});
