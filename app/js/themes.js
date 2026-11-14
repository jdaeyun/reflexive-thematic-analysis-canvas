// Thematic Analysis Canvas — Tab 2: Themes (Braun & Clarke phases 3–5)
// MIT License · https://github.com/jdaeyun/thematic-analysis-canvas
// One board for generating, reviewing and defining themes. The phases are recursive, so they are
// tracked as a status on each theme (Candidate → Reviewed → Defined) rather than as separate tabs.
// Codes are dragged from the pool into themes (or subthemes); a code may sit in more than one theme.

function renderThemesView() {
  renderThemeToolbar();
  renderCodePool();
  renderThemeBoard();
}

function renderThemeToolbar() {
  const counts = { all: state.themes.length };
  for (const k of Object.keys(THEME_STATUS)) counts[k] = state.themes.filter(t => t.status === k).length;
  const el = document.getElementById('themeStatusFilter');
  const opts = [['all', 'All'], ['candidate', 'Candidate'], ['reviewed', 'Reviewed'], ['defined', 'Defined'], ['discarded', 'Set aside']];
  el.innerHTML = opts.map(([k, label]) => `<button data-f="${k}" class="px-2 py-1 text-[11px] rounded-md cursor-pointer border ${state.themeStatusFilter === k ? 'bg-indigo-600 text-white border-indigo-600 font-bold' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}">${label} <span class="opacity-70">${counts[k] || 0}</span></button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => { state.themeStatusFilter = b.dataset.f; renderThemesView(); });
  const nAssigned = state.codes.filter(c => c.themeIds.some(t => themeById(t) && themeById(t).status !== 'discarded')).length;
  document.getElementById('themeProgress').textContent = `${nAssigned}/${state.codes.length} codes in a theme`;
}

function renderCodePool() {
  const el = document.getElementById('codePool');
  const onlyFree = document.getElementById('poolUnassignedOnly').checked;
  const q = (document.getElementById('poolSearch').value || '').toLowerCase();
  const codes = sortedCodes().filter(c => {
    const live = c.themeIds.filter(t => themeById(t));
    if (onlyFree && live.length) return false;
    return !q || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q);
  });
  if (!state.codes.length) {
    el.innerHTML = `<div class="text-[11px] text-slate-400 p-2 leading-relaxed">No codes yet. Code your data in tab 1 first.</div>`;
    return;
  }
  if (!codes.length) {
    el.innerHTML = `<div class="text-[11px] text-slate-400 p-2">${onlyFree ? 'Every code is in a theme.' : 'No matching codes.'}</div>`;
    return;
  }
  el.innerHTML = codes.map(c => {
    const segs = segmentsForCode(c.id);
    const cov = coverage(segs);
    const open = state.openCodeExtracts.has(c.id);
    const themes = c.themeIds.map(t => themeById(t)?.name).filter(Boolean);
    return `<div class="pool-code bg-white border border-slate-200 rounded-md shadow-sm" data-code="${c.id}">
      <div class="pool-row flex items-start gap-1.5 px-2 py-1.5 cursor-grab" draggable="true" title="${escapeHtml(c.description || 'Drag into a theme')}">
        <span class="w-2.5 h-2.5 rounded-sm shrink-0 mt-0.5" style="background:${c.color}"></span>
        <div class="flex-1 min-w-0">
          <div class="text-xs text-slate-800 leading-snug">${escapeHtml(c.name)}</div>
          ${themes.length ? `<div class="text-[10px] text-slate-400 truncate">in: ${escapeHtml(themes.join(', '))}</div>` : ''}
        </div>
        <span class="text-[10px] text-slate-400 shrink-0" title="extracts / participants">${segs.length}/${cov.participants.size}</span>
      </div>
      ${open ? `<div class="px-2 pb-2 space-y-1">${segs.map(s => extractLinkHtml(s)).join('') || '<div class="text-[11px] text-slate-400">No extracts.</div>'}</div>` : ''}
    </div>`;
  }).join('');
  el.querySelectorAll('.pool-code').forEach(card => {
    const cid = card.dataset.code;
    const row = card.querySelector('.pool-row');
    row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-ta-code', cid); e.dataTransfer.setData('text/x-ta-from-theme', ''); });
    row.addEventListener('click', () => {
      if (state.openCodeExtracts.has(cid)) state.openCodeExtracts.delete(cid); else state.openCodeExtracts.add(cid);
      renderCodePool();
    });
  });
  bindExtractLinks(el);
}

function renderThemeBoard() {
  const el = document.getElementById('themeBoard');
  const f = state.themeStatusFilter;
  const top = sortedThemes(null).filter(t => f === 'all' || t.status === f || sortedThemes(t.id).some(s => s.status === f));
  if (!state.themes.length) {
    el.innerHTML = `<div class="col-span-full text-center text-xs text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl p-10 leading-relaxed">
      <div class="text-sm font-bold text-slate-700 mb-1">Phase 3 — Generating initial themes</div>
      Create a candidate theme above, then drag codes that share a central organising concept into it.<br>
      Themes are patterns of shared meaning, not just topic summaries. They will change as you review them against the data.
    </div>`;
    return;
  }
  el.innerHTML = top.map((t, i) => themeCardHtml(t, 0, i, top.length)).join('') || `<div class="col-span-full text-xs text-slate-400 p-6 text-center">No themes with this status.</div>`;
  bindThemeCards(el);
  bindExtractLinks(el);
}

function themeCardHtml(t, depth, idx, total) {
  const st = THEME_STATUS[t.status] || THEME_STATUS.candidate;
  const ownCodes = codesForTheme(t.id, false);
  const segs = segmentsForTheme(t.id, true);
  const cov = coverage(segs);
  const nPart = countedParticipants().length;
  const subs = depth === 0 ? sortedThemes(t.id) : [];
  const open = state.openThemeExtracts.has(t.id);
  const keyFirst = [...segs].sort((a, b) => (b.key ? 1 : 0) - (a.key ? 1 : 0));
  return `<div class="theme-card ${depth ? 'bg-slate-50 border-slate-200 mt-2' : 'bg-white border-slate-300 shadow-sm'} border rounded-xl ${t.status === 'discarded' ? 'opacity-60' : ''}" data-theme="${t.id}">
    <div class="flex items-center gap-1.5 px-3 pt-2.5">
      <i class="ph ${depth ? 'ph-arrow-elbow-down-right' : 'ph-shapes'} text-slate-400"></i>
      <input class="theme-name flex-1 min-w-0 text-sm font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none px-0.5" value="${escapeHtml(t.name)}" placeholder="${depth ? 'Subtheme name' : 'Theme name'}">
      <select class="theme-status text-[11px] font-bold border rounded-md px-1 py-0.5 cursor-pointer ${st.cls}" title="Phase status">
        ${Object.entries(THEME_STATUS).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${v.label}${v.phase !== '—' ? ` (${v.phase})` : ''}</option>`).join('')}
      </select>
      ${depth === 0 ? `<button class="theme-up text-slate-300 hover:text-slate-700 cursor-pointer ${idx === 0 ? 'invisible' : ''}" title="Move up"><i class="ph ph-caret-up"></i></button>
      <button class="theme-down text-slate-300 hover:text-slate-700 cursor-pointer ${idx === total - 1 ? 'invisible' : ''}" title="Move down"><i class="ph ph-caret-down"></i></button>` : ''}
      <button class="theme-delete text-slate-300 hover:text-rose-600 cursor-pointer" title="Delete ${depth ? 'subtheme' : 'theme'}"><i class="ph ph-trash"></i></button>
    </div>
    <div class="px-3 text-[10px] text-slate-500 mt-0.5">${ownCodes.length} code${ownCodes.length === 1 ? '' : 's'}${subs.length ? ` + ${subs.length} subtheme${subs.length > 1 ? 's' : ''}` : ''} · ${segs.length} extracts · <b>${cov.participants.size}${nPart ? `/${nPart}` : ''}</b> participants · ${cov.docs.size} document${cov.docs.size === 1 ? '' : 's'}</div>

    <div class="theme-drop mx-3 mt-2 min-h-[38px] rounded-lg border-2 border-dashed border-slate-200 p-1.5 flex flex-wrap gap-1 content-start" title="Drop codes here">
      ${ownCodes.length ? ownCodes.map(c => `<span class="theme-code inline-flex items-center gap-1 text-[11px] pl-1.5 pr-1 py-0.5 rounded border bg-white cursor-grab" draggable="true" data-code="${c.id}" style="border-color:${c.color}" title="${escapeHtml(c.description || 'Drag to another theme to move')}">
        <span class="w-2 h-2 rounded-sm" style="background:${c.color}"></span>${escapeHtml(c.name)} <span class="text-slate-400">${segmentsForCode(c.id).length}</span>
        <button class="theme-code-remove text-slate-300 hover:text-rose-600 cursor-pointer" title="Remove from this theme"><i class="ph ph-x text-[10px]"></i></button></span>`).join('') : `<span class="text-[11px] text-slate-400 px-1 py-1">Drop codes here</span>`}
    </div>

    <details class="mx-3 mt-2 group" ${t.status !== 'candidate' ? 'open' : ''}>
      <summary class="text-[11px] font-bold text-sky-700 cursor-pointer select-none">Phase 4 · Review against the data ${t.checkedExtracts && t.checkedDataset ? '✓' : ''}</summary>
      <div class="mt-1 space-y-1">
        <label class="flex items-center gap-1.5 text-[11px] text-slate-600"><input type="checkbox" class="theme-chk-extracts" ${t.checkedExtracts ? 'checked' : ''}> Checked against all coded extracts (do they cohere?)</label>
        <label class="flex items-center gap-1.5 text-[11px] text-slate-600"><input type="checkbox" class="theme-chk-dataset" ${t.checkedDataset ? 'checked' : ''}> Checked against the full dataset (does it capture the data?)</label>
        <textarea class="theme-review w-full text-[11px] border border-slate-300 rounded px-2 py-1 resize-y focus:outline-none focus:border-sky-500" rows="2" placeholder="Review notes: what changed, what was split, merged or set aside, and why…">${escapeHtml(t.reviewNote || '')}</textarea>
      </div>
    </details>
    <details class="mx-3 mt-1.5" ${t.status === 'reviewed' || t.status === 'defined' ? 'open' : ''}>
      <summary class="text-[11px] font-bold text-emerald-700 cursor-pointer select-none">Phase 5 · Define & name ${t.definition ? '✓' : ''}</summary>
      <textarea class="theme-def mt-1 w-full text-[11px] border border-slate-300 rounded px-2 py-1 resize-y focus:outline-none focus:border-emerald-500" rows="3" placeholder="Definition: the central organising concept, its scope and boundaries, and how it relates to the other themes…">${escapeHtml(t.definition || '')}</textarea>
    </details>

    <div class="mx-3 mt-1.5 mb-2.5 flex items-center gap-3">
      <button class="theme-toggle-extracts text-[11px] font-semibold text-indigo-700 hover:underline cursor-pointer" ${segs.length ? '' : 'disabled'}>${open ? 'Hide' : 'Show'} extracts (${segs.length})</button>
      ${depth === 0 ? `<button class="theme-add-sub text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer">+ Subtheme</button>` : ''}
    </div>
    ${open ? `<div class="mx-3 mb-3 space-y-1 max-h-72 overflow-y-auto">${keyFirst.map(s => extractLinkHtml(s)).join('')}</div>` : ''}
    ${subs.length ? `<div class="px-3 pb-3">${subs.map(s => themeCardHtml(s, 1, 0, 0)).join('')}</div>` : ''}
  </div>`;
}

function bindThemeCards(root) {
  root.querySelectorAll('.theme-card').forEach(card => {
    const tid = card.dataset.theme;
    const t = themeById(tid);
    // Only bind controls that belong to this card, not to nested subtheme cards
    const own = sel => [...card.querySelectorAll(sel)].filter(x => x.closest('.theme-card') === card);
    const one = sel => own(sel)[0];
    const mark = (e) => { if (e.target.closest('.theme-card') === card && state.lastThemeId !== tid) { state.lastThemeId = tid; refreshJournalContext(); } };
    card.addEventListener('pointerdown', mark);
    card.addEventListener('focusin', mark);

    one('.theme-name').addEventListener('change', async (e) => {
      const v = e.target.value.trim();
      if (!v || v === t.name) { e.target.value = t.name; return; }
      await recordLog({ category: 'themes', action: `Renamed ${t.parentId ? 'subtheme' : 'theme'}`, from: t.name, to: v });
      t.name = v; await dbPut('themes', t); renderThemeToolbar();
    });
    one('.theme-status').addEventListener('change', async (e) => {
      const v = e.target.value;
      if (v === 'defined' && !(t.definition || '').trim()) {
        alert('Write a definition (Phase 5) before marking the theme as defined.');
        e.target.value = t.status; return;
      }
      const from = THEME_STATUS[t.status]?.label, to = THEME_STATUS[v]?.label;
      t.status = v;
      renderThemesView();
      await dbPut('themes', t);
      const entry = await recordLog({ category: 'themes', action: `Changed status of “${t.name}”`, from, to, snapshot: takeSnapshot() });
      promptNote({ title: `“${clip(t.name, 40)}”: ${from} → ${to}`, logEntry: entry });
    });
    one('.theme-up')?.addEventListener('click', () => moveTheme(tid, -1));
    one('.theme-down')?.addEventListener('click', () => moveTheme(tid, 1));
    one('.theme-delete').addEventListener('click', () => deleteTheme(tid));
    one('.theme-add-sub')?.addEventListener('click', () => createTheme('New subtheme', tid));
    one('.theme-toggle-extracts').addEventListener('click', () => {
      if (state.openThemeExtracts.has(tid)) state.openThemeExtracts.delete(tid); else state.openThemeExtracts.add(tid);
      renderThemeBoard();
    });
    one('.theme-chk-extracts').addEventListener('change', async (e) => {
      t.checkedExtracts = e.target.checked; await dbPut('themes', t);
      await recordLog({ category: 'themes', action: `${e.target.checked ? 'Checked' : 'Unchecked'} “${t.name}” against coded extracts` });
    });
    one('.theme-chk-dataset').addEventListener('change', async (e) => {
      t.checkedDataset = e.target.checked; await dbPut('themes', t);
      await recordLog({ category: 'themes', action: `${e.target.checked ? 'Checked' : 'Unchecked'} “${t.name}” against the full dataset` });
    });
    one('.theme-review').addEventListener('change', async (e) => {
      const v = e.target.value.trim();
      await recordLog({ category: 'themes', action: `Review note for “${t.name}”`, from: t.reviewNote || '', to: v });
      t.reviewNote = v; await dbPut('themes', t);
    });
    one('.theme-def').addEventListener('change', async (e) => {
      const v = e.target.value.trim();
      await recordLog({ category: 'themes', action: `Definition of “${t.name}”`, from: t.definition || '', to: v });
      t.definition = v; await dbPut('themes', t);
    });

    // Codes inside the theme: drag to move, × to remove
    own('.theme-code').forEach(chip => {
      chip.addEventListener('dragstart', e => {
        e.stopPropagation();
        e.dataTransfer.setData('text/x-ta-code', chip.dataset.code);
        e.dataTransfer.setData('text/x-ta-from-theme', tid);
      });
      chip.querySelector('.theme-code-remove').addEventListener('click', () => removeCodeFromTheme(chip.dataset.code, tid));
    });
    const drop = one('.theme-drop');
    drop.addEventListener('dragover', e => {
      if (![...e.dataTransfer.types].includes('text/x-ta-code')) return;
      e.preventDefault(); e.stopPropagation(); drop.classList.add('theme-drop-over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('theme-drop-over'));
    drop.addEventListener('drop', async e => {
      e.preventDefault(); e.stopPropagation();
      drop.classList.remove('theme-drop-over');
      const cid = e.dataTransfer.getData('text/x-ta-code');
      const from = e.dataTransfer.getData('text/x-ta-from-theme');
      if (cid) await addCodeToTheme(cid, tid, from || null);
    });
  });
}

async function createTheme(name, parentId = null) {
  const clean = String(name || '').trim();
  if (!clean) return;
  const t = { id: uid('thm'), name: clean, parentId, status: 'candidate', definition: '', reviewNote: '', checkedExtracts: false, checkedDataset: false, order: sortedThemes(parentId).length, createdAt: Date.now() };
  state.themes.push(t);
  await dbPut('themes', t);
  const parent = parentId ? themeById(parentId) : null;
  const entry = await recordLog({ category: 'themes', action: parent ? `Created subtheme “${t.name}” under “${parent.name}”` : `Created candidate theme “${t.name}”` });
  state.lastThemeId = t.id;
  if (!parent && state.themes.length === 1) {
    promptNote({ title: 'Your first candidate theme. What are you noticing in the data right now?', placeholder: 'A sentence or two (optional — Enter to save)', mode: 'journal', logEntry: entry, ttl: 20000 });
  }
  if (state.themeStatusFilter !== 'all' && state.themeStatusFilter !== 'candidate') state.themeStatusFilter = 'all';
  renderThemesView();
  const input = document.querySelector(`.theme-card[data-theme="${t.id}"] .theme-name`);
  if (input && parentId) { input.focus(); input.select(); }
}

async function addCodeToTheme(codeId, themeId, fromThemeId) {
  const c = codeById(codeId), t = themeById(themeId);
  if (!c || !t || fromThemeId === themeId) return;
  if (fromThemeId) c.themeIds = c.themeIds.filter(x => x !== fromThemeId);
  if (!c.themeIds.includes(themeId)) c.themeIds.push(themeId);
  await dbPut('codes', c);
  const from = fromThemeId ? themeById(fromThemeId) : null;
  await recordLog({ category: 'themes', action: from ? `Moved code “${c.name}” from “${from.name}” to “${t.name}”` : `Added code “${c.name}” to “${t.name}”` });
  renderThemesView();
}

async function removeCodeFromTheme(codeId, themeId) {
  const c = codeById(codeId), t = themeById(themeId);
  if (!c || !t) return;
  c.themeIds = c.themeIds.filter(x => x !== themeId);
  await dbPut('codes', c);
  await recordLog({ category: 'themes', action: `Removed code “${c.name}” from “${t.name}”` });
  renderThemesView();
}

async function moveTheme(themeId, dir) {
  const t = themeById(themeId);
  const list = sortedThemes(t.parentId || null);
  const i = list.findIndex(x => x.id === themeId);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((x, k) => x.order = k);
  await dbPutMany('themes', list);
  renderThemeBoard();
}

async function deleteTheme(themeId) {
  const t = themeById(themeId);
  if (!t) return;
  const subs = state.themes.filter(x => x.parentId === themeId);
  if (!confirm(`Delete “${t.name}”? Its codes go back to the pool${subs.length ? ` and its ${subs.length} subtheme(s) become themes` : ''}. Tip: use “Set aside” instead to keep a record. (You can undo.)`)) return;
  pushUndo(`Delete theme “${t.name}”`, ['themes', 'codes']);
  for (const s of subs) s.parentId = null;
  await dbPutMany('themes', subs);
  const changed = state.codes.filter(c => c.themeIds.includes(themeId));
  for (const c of changed) c.themeIds = c.themeIds.filter(x => x !== themeId);
  await dbPutMany('codes', changed);
  state.themes = state.themes.filter(x => x.id !== themeId);
  await dbDelete('themes', themeId);
  renderThemesView();
  const entry = await recordLog({ category: 'themes', action: `Deleted ${t.parentId ? 'subtheme' : 'theme'} “${t.name}”`, detail: `${changed.length} code(s) returned to the pool`, snapshot: takeSnapshot() });
  promptNote({ title: `Deleted “${clip(t.name, 40)}”`, logEntry: entry });
}

function setupThemeEvents() {
  const inp = document.getElementById('newThemeInput');
  const go = () => { createTheme(inp.value); inp.value = ''; };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  document.getElementById('newThemeBtn').onclick = go;
  document.getElementById('poolUnassignedOnly').onchange = renderCodePool;
  document.getElementById('poolSearch').addEventListener('input', renderCodePool);
  // Dropping a theme's code back on the pool removes it from that theme
  const pool = document.getElementById('codePool');
  pool.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/x-ta-from-theme')) e.preventDefault(); });
  pool.addEventListener('drop', async e => {
    const from = e.dataTransfer.getData('text/x-ta-from-theme');
    const cid = e.dataTransfer.getData('text/x-ta-code');
    if (from && cid) { e.preventDefault(); await removeCodeFromTheme(cid, from); }
  });
}
