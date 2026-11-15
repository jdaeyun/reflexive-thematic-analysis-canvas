// Reflexive Thematic Analysis Canvas — Reflexive journal: quick drawer, decision prompts, structure snapshots
// MIT License · https://github.com/jdaeyun/reflexive-thematic-analysis-canvas
// Nothing here is mandatory. The journal is always one shortcut away (Ctrl/⌘+J); significant decisions
// show a small, self-dismissing "Why?" prompt; journal notes and theme status changes keep a lightweight
// snapshot of the code/theme structure so the audit trail can show "what the analysis looked like then".

const JOURNAL_DEFAULT_TYPE = 'memo'; // id from JOURNAL_TYPES (audit.js)

// ========================================================
// SNAPSHOTS (structure only: theme tree + code names and counts; no extract text)
// ========================================================
function takeSnapshot() {
  const codeRef = c => ({ id: c.id, name: c.name, n: segmentsForCode(c.id).length });
  const themes = [];
  for (const t of sortedThemes(null)) {
    themes.push({ id: t.id, name: t.name, parentId: null, status: t.status, definition: t.definition || '', codes: codesForTheme(t.id, false).map(codeRef) });
    for (const s of sortedThemes(t.id)) {
      themes.push({ id: s.id, name: s.name, parentId: t.id, status: s.status, definition: s.definition || '', codes: codesForTheme(s.id, false).map(codeRef) });
    }
  }
  return {
    themes,
    unassigned: sortedCodes().filter(c => !c.themeIds.some(t => themeById(t))).map(codeRef),
    counts: { docs: state.docs.length, segments: state.segments.length, codes: state.codes.length, themes: state.themes.length }
  };
}

// What changed between a snapshot and the current structure
function diffSnapshot(snap) {
  const now = takeSnapshot();
  const thenThemes = new Map(snap.themes.map(t => [t.id, t]));
  const nowThemes = new Map(now.themes.map(t => [t.id, t]));
  const out = { added: [], removed: [], renamed: [], status: [], moved: 0, codesAdded: 0, codesRemoved: 0 };
  for (const [id, t] of nowThemes) if (!thenThemes.has(id)) out.added.push(t.name);
  for (const [id, t] of thenThemes) {
    const n = nowThemes.get(id);
    if (!n) { out.removed.push(t.name); continue; }
    if (n.name !== t.name) out.renamed.push(`${t.name} → ${n.name}`);
    if (n.status !== t.status) out.status.push(`${n.name}: ${statusLabel(t.status)} → ${statusLabel(n.status)}`);
  }
  const placement = s => {
    const m = new Map();
    for (const t of s.themes) for (const c of t.codes) m.set(c.id, [...(m.get(c.id) || []), t.id].sort().join(','));
    for (const c of s.unassigned) m.set(c.id, '');
    return m;
  };
  const a = placement(snap), b = placement(now);
  for (const [id, where] of b) {
    if (!a.has(id)) out.codesAdded++;
    else if (a.get(id) !== where) out.moved++;
  }
  for (const id of a.keys()) if (!b.has(id)) out.codesRemoved++;
  return out;
}

function openSnapshot(logId) {
  const log = state.logs.find(l => l.id === logId);
  if (!log || !log.snapshot) return;
  const snap = log.snapshot;
  const d = diffSnapshot(snap);
  const changes = [
    d.added.length ? tr('snap.added', { n: d.added.length, list: d.added.join(', ') }) : '',
    d.removed.length ? tr('snap.removed', { n: d.removed.length, list: d.removed.join(', ') }) : '',
    d.renamed.length ? tr('snap.renamed', { list: d.renamed.join('; ') }) : '',
    d.status.length ? tr('snap.status', { list: d.status.join('; ') }) : '',
    d.moved ? tr('snap.moved', { n: d.moved }) : '',
    d.codesAdded ? tr('snap.codesAdded', { n: d.codesAdded }) : '',
    d.codesRemoved ? tr('snap.codesRemoved', { n: d.codesRemoved }) : ''
  ].filter(Boolean);
  const themeHtml = t => {
    const st = THEME_STATUS[t.status] || THEME_STATUS.candidate;
    return `<div class="${t.parentId ? 'ml-5 mt-1.5' : 'mt-3'}">
      <div class="flex items-center gap-1.5"><i class="ph ${t.parentId ? 'ph-arrow-elbow-down-right' : 'ph-shapes'} text-slate-400"></i>
        <span class="text-xs font-bold text-slate-800">${escapeHtml(t.name)}</span>
        <span class="text-[10px] font-bold border rounded px-1 ${st.cls}">${escapeHtml(statusLabel(t.status))}</span></div>
      ${t.definition ? `<div class="text-[11px] text-slate-500 ml-5 italic">${escapeHtml(clip(t.definition, 200))}</div>` : ''}
      <div class="flex flex-wrap gap-1 ml-5 mt-1">${t.codes.map(c => `<span class="text-[10px] bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">${escapeHtml(c.name)} <span class="text-slate-400">${c.n}</span></span>`).join('') || `<span class="text-[10px] text-slate-400">${escapeHtml(tr('snap.noCodes'))}</span>`}</div>
    </div>`;
  };
  document.getElementById('snapshotTitle').textContent = tr('snap.title', { time: fmtTime(log.ts) });
  document.getElementById('snapshotEntry').textContent = log.category === 'journal' ? `${logAction(log)}: ${clip(logDetail(log), 160)}` : logAction(log);
  document.getElementById('snapshotChanges').innerHTML = changes.length
    ? `<div class="text-[11px] font-bold text-slate-600 mb-1">${escapeHtml(tr('snap.since'))}</div><ul class="list-disc ml-4 text-[11px] text-slate-600 space-y-0.5">${changes.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`
    : `<div class="text-[11px] text-slate-500">${escapeHtml(tr('snap.unchanged'))}</div>`;
  document.getElementById('snapshotBody').innerHTML =
    `<div class="text-[10px] text-slate-400">${escapeHtml(tr('snap.counts', snap.counts))}</div>` +
    (snap.themes.length ? snap.themes.map(themeHtml).join('') : `<div class="text-xs text-slate-400 mt-3">${escapeHtml(tr('snap.noThemes'))}</div>`) +
    (snap.unassigned.length ? `<div class="mt-4 text-[11px] font-bold text-slate-500">${escapeHtml(tr('snap.unassigned', { n: snap.unassigned.length }))}</div><div class="flex flex-wrap gap-1 mt-1">${snap.unassigned.map(c => `<span class="text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5">${escapeHtml(c.name)}</span>`).join('')}</div>` : '');
  document.getElementById('snapshotModal').classList.remove('hidden');
}

// ========================================================
// CONTEXT (what the researcher was looking at)
// ========================================================
function captureContext() {
  const ctx = {};
  if (state.activeTab === 'code') {
    const doc = docById(state.activeDocId);
    if (doc) ctx.doc = { id: doc.id, name: doc.name };
    const seg = state.segments.find(s => s.id === state.activeSegId);
    if (state.pendingSel) ctx.quote = { docId: state.pendingSel.docId, s: state.pendingSel.s, e: state.pendingSel.e, text: clip(state.pendingSel.text, 240) };
    else if (seg) ctx.extract = { id: seg.id, text: clip(seg.text, 240), codes: seg.codeIds.map(c => codeById(c)?.name).filter(Boolean) };
  }
  if (state.activeTab === 'themes' && state.lastThemeId && themeById(state.lastThemeId)) {
    ctx.theme = { id: state.lastThemeId, name: themeById(state.lastThemeId).name };
  }
  return ctx;
}

function contextChipsHtml(ctx, { removable = false } = {}) {
  if (!ctx) return '';
  const chip = (key, icon, label, title) => `<span class="ctx-chip inline-flex items-center gap-1 text-[10px] bg-slate-50 border border-slate-200 text-slate-600 rounded px-1.5 py-0.5 max-w-full" data-key="${key}" title="${escapeHtml(title || label)}">
    <i class="ph ${icon}"></i><button type="button" class="ctx-go truncate max-w-[16rem] text-left hover:underline cursor-pointer">${escapeHtml(label)}</button>
    ${removable ? `<button type="button" class="ctx-remove text-slate-400 hover:text-rose-600 cursor-pointer" title="${escapeHtml(tr('jd.detach'))}"><i class="ph ph-x"></i></button>` : ''}</span>`;
  const out = [];
  if (ctx.doc) out.push(chip('doc', 'ph-file-text', ctx.doc.name));
  if (ctx.extract) out.push(chip('extract', 'ph-highlighter', `“${clip(ctx.extract.text, 50)}”`, `${ctx.extract.text}\n${(ctx.extract.codes || []).join(', ')}`));
  if (ctx.quote) out.push(chip('quote', 'ph-text-aa', `“${clip(ctx.quote.text, 50)}”`, ctx.quote.text));
  if (ctx.theme) out.push(chip('theme', 'ph-shapes', ctx.theme.name));
  return out.join('');
}

// Click on a context chip: go back to that place
function goToContext(ctx, key) {
  if (!ctx) return;
  if (key === 'doc' && ctx.doc && docById(ctx.doc.id)) { switchTab('code'); openDocument(ctx.doc.id); }
  if (key === 'extract' && ctx.extract) {
    const seg = state.segments.find(s => s.id === ctx.extract.id);
    if (seg) { switchTab('code'); openDocument(seg.docId, seg.id); } else showToast(tr('ctx.extractGone'));
  }
  if (key === 'quote' && ctx.quote && docById(ctx.quote.docId)) {
    switchTab('code'); openDocument(ctx.quote.docId);
    const el = [...document.querySelectorAll('#viewerBody [data-s]')].find(x => Number(x.dataset.s) <= ctx.quote.s && Number(x.dataset.s) + x.textContent.length > ctx.quote.s);
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.remove('seg-flash'); void el.offsetWidth; el.classList.add('seg-flash'); }
  }
  if (key === 'theme' && ctx.theme) {
    if (!themeById(ctx.theme.id)) { showToast(tr('ctx.themeGone')); return; }
    state.themeStatusFilter = 'all';
    switchTab('themes');
    const card = document.querySelector(`.theme-card[data-theme="${ctx.theme.id}"]`);
    if (card) { card.scrollIntoView({ block: 'center' }); card.classList.remove('seg-flash'); void card.offsetWidth; card.classList.add('seg-flash'); }
  }
}

// ========================================================
// JOURNAL DRAWER (Ctrl/⌘+J from anywhere)
// ========================================================
const journalDraft = { ctx: null, linkedLogId: null };

const NARROW_JOURNAL = window.matchMedia('(max-width: 1100px)'); // below this the drawer overlays the workspace

function openJournal({ linkedLogId = null, type = null, text = '' } = {}) {
  const drawer = document.getElementById('journalDrawer');
  const ta = document.getElementById('jdText');
  // Reopening with a kept draft: keep what it was attached to. Otherwise attach what is on screen now.
  const resumingDraft = journalHasText(ta) && !linkedLogId && !text;
  if (!resumingDraft) {
    journalDraft.ctx = captureContext();
    journalDraft.linkedLogId = linkedLogId;
  }
  if (type) document.getElementById('jdType').value = type;
  if (text) ta.value = text;
  applyJournalTemplate(document.getElementById('jdType'), ta);
  renderJournalDrawer();
  drawer.classList.remove('hidden');
  document.body.classList.add('journal-open'); // wide screens: the workspace narrows instead of being covered
  updateJournalDraftIndicators();
  setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
}
// Closing never discards what was typed; the Journal button and the edge handle show a dot instead
function closeJournal() {
  document.getElementById('journalDrawer').classList.add('hidden');
  document.body.classList.remove('journal-open');
  updateJournalDraftIndicators();
}
function journalIsOpen() {
  return !document.getElementById('journalDrawer').classList.contains('hidden');
}
function updateJournalDraftIndicators() {
  const hasDraft = journalHasText(document.getElementById('jdText'));
  const open = journalIsOpen();
  document.getElementById('journalDraftDot').classList.toggle('hidden', !hasDraft || open);
  // Edge handle: on narrow screens (the drawer is light-dismissed there), or whenever a draft is waiting
  const handle = document.getElementById('journalHandle');
  handle.classList.toggle('hidden', open || !(NARROW_JOURNAL.matches || hasDraft));
  handle.classList.toggle('journal-handle-draft', hasDraft);
  handle.title = tr(hasDraft ? 'jd.handleDraft' : 'jd.handle');
}
// While the drawer stays open and nothing is typed yet, follow what the researcher is looking at
function refreshJournalContext() {
  const drawer = document.getElementById('journalDrawer');
  if (!drawer || drawer.classList.contains('hidden')) return;
  if (journalHasText(document.getElementById('jdText')) || journalDraft.linkedLogId) return;
  journalDraft.ctx = captureContext();
  renderJournalDrawer();
}
function toggleJournal() {
  if (document.getElementById('journalDrawer').classList.contains('hidden')) openJournal(); else closeJournal();
}

function renderJournalDrawer() {
  const linked = journalDraft.linkedLogId ? state.logs.find(l => l.id === journalDraft.linkedLogId) : null;
  const linkEl = document.getElementById('jdLinked');
  linkEl.classList.toggle('hidden', !linked);
  if (linked) linkEl.innerHTML = `<i class="ph ph-link-simple"></i> ${escapeHtml(tr('audit.about'))}: <b>${escapeHtml(clip(logAction(linked), 90))}</b> <button type="button" id="jdUnlink" class="ml-auto text-slate-400 hover:text-rose-600 cursor-pointer" title="${escapeHtml(tr('jd.unlink'))}"><i class="ph ph-x"></i></button>`;
  linkEl.querySelector('#jdUnlink')?.addEventListener('click', () => { journalDraft.linkedLogId = null; renderJournalDrawer(); });

  const ctxEl = document.getElementById('jdContext');
  const chips = contextChipsHtml(journalDraft.ctx, { removable: true });
  ctxEl.innerHTML = chips ? `<span class="text-[10px] text-slate-400 mr-1">${escapeHtml(tr('jd.attached'))}</span>${chips}` : `<span class="text-[10px] text-slate-400">${escapeHtml(tr('jd.noContext'))}</span>`;
  ctxEl.querySelectorAll('.ctx-remove').forEach(b => b.onclick = () => { delete journalDraft.ctx[b.closest('.ctx-chip').dataset.key]; renderJournalDrawer(); });
  ctxEl.querySelectorAll('.ctx-go').forEach(b => b.onclick = () => goToContext(journalDraft.ctx, b.closest('.ctx-chip').dataset.key));

  const recent = state.logs.filter(l => l.category === 'journal').slice(-6).reverse();
  document.getElementById('jdRecent').innerHTML = recent.length ? recent.map(l => `
    <div class="border-l-2 border-purple-300 pl-2">
      <div class="text-[10px] text-slate-400">${fmtTime(l.ts)} · ${escapeHtml(logAction(l))}</div>
      <div class="text-[11px] text-slate-700 whitespace-pre-wrap">${escapeHtml(clip(logDetail(l), 220))}</div>
    </div>`).join('') : `<div class="text-[11px] text-slate-400">${escapeHtml(tr('jd.noEntries'))}</div>`;
}

async function saveJournalFromDrawer() {
  const ta = document.getElementById('jdText');
  const text = ta.value.trim();
  if (!journalHasText(ta)) { ta.focus(); return; }
  await recordLog({
    category: 'journal',
    ak: `jt.${document.getElementById('jdType').value || JOURNAL_DEFAULT_TYPE}`,
    detail: text,
    ctx: journalDraft.ctx,
    snapshot: takeSnapshot(),
    linkedLogId: journalDraft.linkedLogId
  });
  ta.value = '';
  journalDraft.linkedLogId = null;
  journalDraft.ctx = captureContext();
  renderJournalDrawer();
  updateJournalDraftIndicators();
  if (state.activeTab === 'audit') renderAuditView();
  showToast(tr('toast.journalSaved'), 'success');
}

// ========================================================
// DECISION PROMPT (small, optional, disappears by itself)
// ========================================================
let notePromptTimer = null;

// mode 'reason': the text is stored as `reason` on logEntry.
// mode 'journal': the text becomes its own journal entry (with a snapshot), e.g. session notes.
function promptNote({ title, placeholder = tr('prompt.whyPh'), mode = 'reason', logEntry = null, journalType = JOURNAL_DEFAULT_TYPE, ttl = 12000 }) {
  const box = document.getElementById('notePrompt');
  const input = document.getElementById('notePromptInput');
  document.getElementById('notePromptTitle').textContent = title;
  input.placeholder = placeholder;
  input.value = '';
  box.classList.remove('hidden');
  const close = () => { box.classList.add('hidden'); clearTimeout(notePromptTimer); };
  const arm = () => {
    clearTimeout(notePromptTimer);
    notePromptTimer = setTimeout(() => { if (document.activeElement !== input && !input.value.trim()) close(); else arm(); }, ttl);
  };
  arm();
  const save = async () => {
    const text = input.value.trim();
    close();
    if (!text) return;
    if (mode === 'reason' && logEntry) {
      logEntry.reason = text;
      await dbPut('logs', logEntry);
    } else {
      await recordLog({ category: 'journal', ak: `jt.${journalType}`, detail: text, ctx: captureContext(), snapshot: takeSnapshot(), linkedLogId: logEntry?.id || null });
    }
    if (state.activeTab === 'audit') renderAuditView();
    showToast(tr(mode === 'reason' ? 'toast.reasonSaved' : 'toast.journalSaved'), 'success');
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  };
  document.getElementById('notePromptSave').onclick = save;
  document.getElementById('notePromptClose').onclick = close;
  document.getElementById('notePromptMore').onclick = () => {
    const draft = input.value.trim();
    close();
    openJournal({ linkedLogId: logEntry?.id || null, type: mode === 'journal' ? journalType : null, text: draft });
  };
}

function setupJournalEvents() {
  document.getElementById('jdType').innerHTML = journalTypeOptions();
  document.getElementById('jdType').addEventListener('change', (e) => { applyJournalTemplate(e.target, document.getElementById('jdText')); updateJournalDraftIndicators(); });
  document.getElementById('journalOpenBtn').onclick = (e) => { e.stopPropagation(); toggleJournal(); };
  document.getElementById('jdClose').onclick = closeJournal;
  document.getElementById('jdSave').onclick = saveJournalFromDrawer;
  document.getElementById('jdText').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveJournalFromDrawer(); }
    if (e.key === 'Escape') { e.stopPropagation(); closeJournal(); }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') { e.preventDefault(); toggleJournal(); }
  }, true);
  document.getElementById('jdText').addEventListener('input', updateJournalDraftIndicators);
  document.getElementById('journalHandle').onclick = () => openJournal();
  // Light dismiss on narrow screens: a click outside the drawer closes it (the draft is kept).
  // Wide screens keep it docked so it can stay open while coding.
  document.addEventListener('pointerdown', (e) => {
    if (!NARROW_JOURNAL.matches || !journalIsOpen()) return;
    if (e.target.closest('#journalDrawer, #journalOpenBtn, #journalHandle, #notePrompt, .ta-modal')) return;
    closeJournal();
  }, true);
  NARROW_JOURNAL.addEventListener('change', updateJournalDraftIndicators);
  updateJournalDraftIndicators();
}
