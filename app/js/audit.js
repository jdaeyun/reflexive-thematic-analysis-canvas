// Reflexive Thematic Analysis Canvas — Tab 3: Audit trail & reflexive journal
// MIT License · https://github.com/jdaeyun/reflexive-thematic-analysis-canvas
// Every interpretive change is logged automatically (recordLog in core.js). The researcher adds
// reflexive journal entries here; both are exported as Appendix A.

// Labels: tr('cat.<id>')
const LOG_CATEGORIES = {
  journal:         { icon: 'ph-notebook', cls: 'bg-purple-100 text-purple-800' },
  familiarisation: { icon: 'ph-book-open', cls: 'bg-indigo-100 text-indigo-800' },
  codebook:        { icon: 'ph-tag', cls: 'bg-amber-100 text-amber-800' },
  coding:          { icon: 'ph-highlighter', cls: 'bg-yellow-50 text-yellow-800' },
  themes:          { icon: 'ph-shapes', cls: 'bg-emerald-100 text-emerald-800' },
  participants:    { icon: 'ph-users', cls: 'bg-teal-100 text-teal-800' },
  import:          { icon: 'ph-file-arrow-up', cls: 'bg-slate-100 text-slate-700' },
  system:          { icon: 'ph-gear', cls: 'bg-slate-100 text-slate-500' }
};
function categoryLabel(cat, lang = LANG) {
  return tr(`cat.${LOG_CATEGORIES[cat] ? cat : 'system'}`, {}, lang);
}

// Journal entry types (stored as ak 'jt.<id>'); labels: tr('jt.<id>')
const JOURNAL_TYPES = ['memo', 'familiarisation', 'decision', 'session', 'meeting', 'positionality'];
function journalTypeOptions(selected = 'memo') {
  return JOURNAL_TYPES.map(id => `<option value="${id}" ${id === selected ? 'selected' : ''}>${escapeHtml(tr(`jt.${id}`))}</option>`).join('');
}

// Team discussion entries start from a fill-in outline (RTARG item 21: who was involved and how differences
// in interpretation were handled). The outline only fills an empty box, is removed again when the type changes,
// and an untouched outline counts as empty, so nothing is saved by accident.
function isUntouchedTemplate(text) {
  const v = String(text || '').trim();
  return !!v && SUPPORTED_LANGS.some(l => v === tr('jt.meetingTemplate', {}, l).trim());
}
function journalHasText(ta) {
  const v = ta.value.trim();
  return !!v && !isUntouchedTemplate(v);
}
function applyJournalTemplate(sel, ta) {
  if (sel.value === 'meeting') {
    if (!ta.value.trim()) ta.value = tr('jt.meetingTemplate');
  } else if (isUntouchedTemplate(ta.value)) {
    ta.value = '';
  }
  growTextarea(ta);
}

// Text of a log entry in a language (entries from older versions only have English `action` / `detail`)
function logAction(l, lang = LANG) {
  return l.ak ? tr(l.ak, l.ap || {}, lang) : (l.action || '');
}
function logDetail(l, lang = LANG) {
  return l.dk ? tr(l.dk, l.dp || {}, lang) : (l.detail || '');
}
function logFromTo(l, value, lang = LANG) {
  if (l.ft === 'status') return statusLabel(value, lang);
  if (l.ft === 'orientInd' && value) return tr(`orient.ind.${value}`, {}, lang);
  if (l.ft === 'orientLat' && value) return tr(`orient.lat.${value}`, {}, lang);
  return value;
}

function renderAuditView() {
  const filter = document.getElementById('auditFilter');
  const counts = {};
  for (const l of state.logs) counts[l.category] = (counts[l.category] || 0) + 1;
  filter.innerHTML = `<option value="all">${escapeHtml(tr('audit.all', { n: state.logs.length }))}</option>` +
    `<option value="decisions">${escapeHtml(tr('audit.decisions'))}</option>` +
    Object.keys(LOG_CATEGORIES).map(k => `<option value="${k}">${escapeHtml(categoryLabel(k))} (${counts[k] || 0})</option>`).join('');
  filter.value = state.auditFilter;

  const list = document.getElementById('auditTimeline');
  const logs = filteredLogs(state.auditFilter).slice().reverse();
  if (!logs.length) {
    list.innerHTML = `<div class="text-xs text-slate-400 p-8 text-center bg-white border border-dashed border-slate-300 rounded-xl">${escapeHtml(tr('audit.empty'))}</div>`;
    return;
  }
  const notedIds = new Set(state.logs.filter(x => x.linkedLogId).map(x => x.linkedLogId));
  list.innerHTML = logs.map(l => {
    const c = LOG_CATEGORIES[l.category] || LOG_CATEGORIES.system;
    const linked = l.linkedLogId ? state.logs.find(x => x.id === l.linkedLogId) : null;
    const detail = logDetail(l);
    const fromTo = (l.from || l.to) ? `<div class="mt-1 text-[11px] grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        ${l.from ? `<span class="text-slate-400">${escapeHtml(tr('audit.from'))}</span><span class="text-slate-500 line-through decoration-slate-300 whitespace-pre-wrap">${escapeHtml(logFromTo(l, l.from))}</span>` : ''}
        ${l.to ? `<span class="text-slate-400">${escapeHtml(tr('audit.to'))}</span><span class="text-slate-700 whitespace-pre-wrap">${escapeHtml(logFromTo(l, l.to))}</span>` : ''}</div>` : '';
    return `<div class="bg-white border border-slate-200 rounded-lg px-3 py-2 ${l.category === 'journal' ? 'border-l-4 border-l-purple-400' : ''}">
      <div class="flex items-center gap-2 text-[10px] text-slate-400">
        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold ${c.cls}"><i class="ph ${c.icon}"></i>${escapeHtml(categoryLabel(l.category))}</span>
        <span>${fmtTime(l.ts)}</span>${l.by ? `<span>· ${escapeHtml(l.by)}</span>` : ''}
        ${l.category === 'journal' ? `<button class="log-del ml-auto text-slate-300 hover:text-rose-600 cursor-pointer" data-log="${l.id}" title="${escapeHtml(tr('audit.deleteEntry'))}"><i class="ph ph-trash"></i></button>` : ''}
      </div>
      ${linked ? `<div class="mt-1 text-[10px] text-slate-500"><i class="ph ph-link-simple"></i> ${escapeHtml(tr('audit.about'))}: ${escapeHtml(clip(logAction(linked), 100))} <span class="text-slate-400">(${fmtTime(linked.ts)})</span></div>` : ''}
      <div class="text-xs text-slate-800 mt-1 font-medium whitespace-pre-wrap">${escapeHtml(logAction(l))}</div>
      ${detail ? `<div class="${l.category === 'journal' ? 'text-xs text-slate-700' : 'text-[11px] text-slate-500'} mt-0.5 whitespace-pre-wrap">${escapeHtml(detail)}</div>` : ''}
      ${fromTo}
      ${l.reason ? `<div class="mt-1.5 text-[11px] bg-purple-50 border border-purple-100 rounded px-2 py-1"><span class="font-bold text-purple-700">${escapeHtml(tr('audit.why'))}:</span> <span class="text-slate-700 whitespace-pre-wrap">${escapeHtml(l.reason)}</span></div>` : ''}
      ${(l.ctx || l.snapshot) ? `<div class="log-ctx mt-1.5 flex flex-wrap items-center gap-1" data-log="${l.id}">${contextChipsHtml(l.ctx)}
        ${l.snapshot ? `<button type="button" class="log-snap inline-flex items-center gap-1 text-[10px] text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded px-1.5 py-0.5 cursor-pointer" title="${escapeHtml(tr('audit.structureTitle'))}"><i class="ph ph-tree-structure"></i>${escapeHtml(tr('audit.structure'))}</button>` : ''}</div>` : ''}
      ${l.category !== 'journal' && l.category !== 'coding' && l.category !== 'system' && !notedIds.has(l.id) ? `<button type="button" class="log-note mt-1 text-[10px] text-slate-400 hover:text-purple-700 cursor-pointer" data-log="${l.id}"><i class="ph ph-note-pencil"></i> ${escapeHtml(tr('audit.addNote'))}</button>` : ''}
    </div>`;
  }).join('');
  list.querySelectorAll('.log-ctx').forEach(row => {
    const log = state.logs.find(x => x.id === row.dataset.log);
    row.querySelectorAll('.ctx-go').forEach(b => b.onclick = () => goToContext(log.ctx, b.closest('.ctx-chip').dataset.key));
    row.querySelector('.log-snap')?.addEventListener('click', () => openSnapshot(log.id));
  });
  list.querySelectorAll('.log-note').forEach(b => b.onclick = () => openJournal({ linkedLogId: b.dataset.log, type: 'decision' }));
  list.querySelectorAll('.log-del').forEach(b => b.onclick = async () => {
    if (!confirm(tr('audit.confirmDelete'))) return;
    pushUndo(['undo.deleteJournal', {}], ['logs']);
    state.logs = state.logs.filter(l => l.id !== b.dataset.log);
    commitUndo();
    await dbDelete('logs', b.dataset.log);
    updateAuditBadge();
    renderAuditView();
  });
}

function filteredLogs(filter) {
  if (filter === 'all') return state.logs;
  if (filter === 'decisions') return state.logs.filter(l => l.category !== 'coding' && l.category !== 'system');
  return state.logs.filter(l => l.category === filter);
}

async function addJournalEntry() {
  const type = document.getElementById('journalType').value || 'memo';
  const ta = document.getElementById('journalText');
  const text = ta.value.trim();
  if (!journalHasText(ta)) { ta.focus(); return; }
  await recordLog({ category: 'journal', ak: `jt.${type}`, detail: text, snapshot: takeSnapshot() });
  ta.value = '';
  growTextarea(ta);
  renderAuditView();
  showToast(tr('toast.journalAdded'), 'success');
}

function setupAuditEvents() {
  document.getElementById('journalType').innerHTML = journalTypeOptions();
  document.getElementById('journalType').addEventListener('change', (e) => applyJournalTemplate(e.target, document.getElementById('journalText')));
  document.getElementById('journalAddBtn').onclick = addJournalEntry;
  document.getElementById('journalText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addJournalEntry(); });
  document.getElementById('auditFilter').onchange = (e) => { state.auditFilter = e.target.value; renderAuditView(); };
}
