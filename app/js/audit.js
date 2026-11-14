// Thematic Analysis Canvas — Tab 3: Audit trail & reflexive journal
// MIT License · https://github.com/jdaeyun/thematic-analysis-canvas
// Every interpretive change is logged automatically (recordLog in core.js). The researcher adds
// reflexive journal entries here; both are exported as Appendix A.

const LOG_CATEGORIES = {
  journal:         { label: 'Reflexive journal', icon: 'ph-notebook', cls: 'bg-purple-100 text-purple-800' },
  familiarisation: { label: 'Familiarisation', icon: 'ph-book-open', cls: 'bg-indigo-100 text-indigo-800' },
  codebook:        { label: 'Codebook', icon: 'ph-tag', cls: 'bg-amber-100 text-amber-800' },
  coding:          { label: 'Coding actions', icon: 'ph-highlighter', cls: 'bg-yellow-50 text-yellow-800' },
  themes:          { label: 'Themes', icon: 'ph-shapes', cls: 'bg-emerald-100 text-emerald-800' },
  participants:    { label: 'Participants', icon: 'ph-users', cls: 'bg-teal-100 text-teal-800' },
  import:          { label: 'Data import', icon: 'ph-file-arrow-up', cls: 'bg-slate-100 text-slate-700' },
  system:          { label: 'System', icon: 'ph-gear', cls: 'bg-slate-100 text-slate-500' }
};

const JOURNAL_TYPES = ['Reflexive memo', 'Familiarisation note', 'Analytic decision', 'Supervisor / team meeting', 'Positionality'];

function renderAuditView() {
  const filter = document.getElementById('auditFilter');
  const counts = {};
  for (const l of state.logs) counts[l.category] = (counts[l.category] || 0) + 1;
  filter.innerHTML = `<option value="all">All entries (${state.logs.length})</option>` +
    `<option value="decisions">Interpretive decisions only (no single coding actions)</option>` +
    Object.entries(LOG_CATEGORIES).map(([k, v]) => `<option value="${k}" ${state.auditFilter === k ? 'selected' : ''}>${v.label} (${counts[k] || 0})</option>`).join('');
  filter.value = state.auditFilter;

  const list = document.getElementById('auditTimeline');
  const logs = filteredLogs(state.auditFilter).slice().reverse();
  if (!logs.length) {
    list.innerHTML = `<div class="text-xs text-slate-400 p-8 text-center bg-white border border-dashed border-slate-300 rounded-xl">Nothing logged yet.</div>`;
    return;
  }
  list.innerHTML = logs.map(l => {
    const c = LOG_CATEGORIES[l.category] || LOG_CATEGORIES.system;
    const fromTo = (l.from || l.to) ? `<div class="mt-1 text-[11px] grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        ${l.from ? `<span class="text-slate-400">from</span><span class="text-slate-500 line-through decoration-slate-300 whitespace-pre-wrap">${escapeHtml(l.from)}</span>` : ''}
        ${l.to ? `<span class="text-slate-400">to</span><span class="text-slate-700 whitespace-pre-wrap">${escapeHtml(l.to)}</span>` : ''}</div>` : '';
    return `<div class="bg-white border border-slate-200 rounded-lg px-3 py-2 ${l.category === 'journal' ? 'border-l-4 border-l-purple-400' : ''}">
      <div class="flex items-center gap-2 text-[10px] text-slate-400">
        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold ${c.cls}"><i class="ph ${c.icon}"></i>${c.label}</span>
        <span>${fmtTime(l.ts)}</span>${l.by ? `<span>· ${escapeHtml(l.by)}</span>` : ''}
        ${l.category === 'journal' ? `<button class="log-del ml-auto text-slate-300 hover:text-rose-600 cursor-pointer" data-log="${l.id}" title="Delete journal entry"><i class="ph ph-trash"></i></button>` : ''}
      </div>
      <div class="text-xs text-slate-800 mt-1 font-medium whitespace-pre-wrap">${escapeHtml(l.action)}</div>
      ${l.detail ? `<div class="text-[11px] text-slate-500 mt-0.5 whitespace-pre-wrap">${escapeHtml(l.detail)}</div>` : ''}
      ${fromTo}
    </div>`;
  }).join('');
  list.querySelectorAll('.log-del').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this journal entry?')) return;
    pushUndo('Delete journal entry', ['logs']);
    state.logs = state.logs.filter(l => l.id !== b.dataset.log);
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
  const type = document.getElementById('journalType').value;
  const ta = document.getElementById('journalText');
  const text = ta.value.trim();
  if (!text) return;
  await recordLog({ category: 'journal', action: type, detail: text });
  ta.value = '';
  renderAuditView();
  showToast('Journal entry added', 'success');
}

function setupAuditEvents() {
  document.getElementById('journalType').innerHTML = JOURNAL_TYPES.map(t => `<option>${t}</option>`).join('');
  document.getElementById('journalAddBtn').onclick = addJournalEntry;
  document.getElementById('journalText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addJournalEntry(); });
  document.getElementById('auditFilter').onchange = (e) => { state.auditFilter = e.target.value; renderAuditView(); };
}
