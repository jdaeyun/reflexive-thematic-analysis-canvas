// Reflexive Thematic Analysis Canvas — Tab 1: Familiarise & Code (Braun & Clarke phases 1–2)
// MIT License · https://github.com/jdaeyun/reflexive-thematic-analysis-canvas
// Document list, participant list, document viewer with highlights, codebook and segment details.
// Two independent layers sit on the text:
//   • coded segments (state.segments)  — may overlap freely; one segment can carry several codes
//   • participant ranges (state.ptags)  — one participant per character; a document default fills the gaps

// ========================================================
// LEFT: DOCUMENTS & PARTICIPANTS
// ========================================================
function renderDocList() {
  const el = document.getElementById('docList');
  if (!state.docs.length) {
    el.innerHTML = `<div class="text-[11px] text-slate-400 px-2 py-3 leading-relaxed">${escapeHtml(tr('docs.empty'))}</div>`;
    return;
  }
  const icon = { txt: 'ph-file-text', csv: 'ph-file-csv', docx: 'ph-file-doc', doc: 'ph-file-doc' };
  el.innerHTML = state.docs.map(d => {
    const n = state.segments.filter(s => s.docId === d.id).length;
    const active = d.id === state.activeDocId;
    return `<button data-doc="${d.id}" class="doc-item w-full text-left px-2 py-1.5 rounded-md flex items-center space-x-2 text-xs cursor-pointer ${active ? 'bg-indigo-50 text-indigo-800 font-semibold border border-indigo-200' : 'hover:bg-slate-50 text-slate-700 border border-transparent'}">
      <i class="ph ${icon[d.kind] || 'ph-file'} text-sm shrink-0"></i>
      <span class="truncate flex-1" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</span>
      <span class="text-[10px] text-slate-400 shrink-0" title="${escapeHtml(tr('docs.codedExtracts'))}">${n}</span>
    </button>`;
  }).join('');
  el.querySelectorAll('.doc-item').forEach(b => b.onclick = () => openDocument(b.dataset.doc));
}

function openDocument(docId, flashSegId = null) {
  flushAllPendingSaves(); // e.g. the familiarisation note of the document being left
  state.activeDocId = docId;
  state.pendingSel = null;
  if (!flashSegId) state.activeSegId = null;
  renderDocList();
  renderViewer(true);
  renderSelectionPanel();
  renderSegmentPanel();
  if (flashSegId) {
    state.activeSegId = flashSegId;
    renderViewer();
    renderSegmentPanel();
    const el = document.querySelector(`#viewerBody [data-segs~="${flashSegId}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      document.querySelectorAll(`#viewerBody [data-segs~="${flashSegId}"]`).forEach(x => {
        x.classList.remove('seg-flash'); void x.offsetWidth; x.classList.add('seg-flash');
      });
    }
  }
}

function renderParticipantList() {
  const el = document.getElementById('participantList');
  if (!state.participants.length) {
    el.innerHTML = `<div class="text-[11px] text-slate-400 px-2 py-2 leading-relaxed">${escapeHtml(tr('par.empty'))}</div>`;
    return;
  }
  const hasSel = !!state.pendingSel;
  el.innerHTML = [...state.participants].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })).map(p => {
    const nDocs = new Set(state.ptags.filter(t => t.participantId === p.id).map(t => t.docId).concat(state.docs.filter(d => d.defaultParticipantId === p.id).map(d => d.id))).size;
    const attrs = Object.entries(p.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
    return `<div class="par-item group flex items-center space-x-1.5 px-2 py-1 rounded-md hover:bg-slate-50 text-xs" draggable="true" data-par="${p.id}" title="${escapeHtml(attrs || tr('par.dragHint'))}">
      <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${p.color}"></span>
      <span class="truncate flex-1 font-medium ${p.role === 'interviewer' ? 'text-slate-400' : 'text-slate-700'}">${escapeHtml(p.label)}${p.role === 'interviewer' ? ` <span class="text-[9px] font-bold uppercase text-slate-400 border border-slate-200 rounded px-1">${escapeHtml(tr('par.interviewer'))}</span>` : ''}</span>
      <span class="text-[10px] text-slate-400">${nDocs}</span>
      ${hasSel ? `<button class="par-tag px-1.5 py-0.5 text-[10px] font-bold rounded bg-teal-600 text-white cursor-pointer" title="${escapeHtml(tr('par.tagTitle', { label: p.label }))}">${escapeHtml(tr('par.tag'))}</button>` : ''}
      <button class="par-edit opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 cursor-pointer" title="${escapeHtml(tr('par.edit'))}"><i class="ph ph-pencil-simple"></i></button>
    </div>`;
  }).join('');
  el.querySelectorAll('.par-item').forEach(row => {
    const pid = row.dataset.par;
    row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-ta-participant', pid); e.dataTransfer.effectAllowed = 'copy'; });
    row.querySelector('.par-tag')?.addEventListener('click', () => state.pendingSel && tagParticipant(pid, state.pendingSel));
    row.querySelector('.par-edit').addEventListener('click', () => openParticipantEditor(pid));
  });
}

async function addParticipantFromInput() {
  const inp = document.getElementById('newParticipantInput');
  const label = inp.value.trim();
  if (!label) return;
  if (state.participants.some(p => p.label === label)) { showToast(tr('par.exists', { label })); return; }
  const p = await ensureParticipant(label);
  await recordLog({ category: 'participants', ak: 'log.parAdded', ap: { label: p.label } });
  inp.value = '';
  renderParticipantList();
  renderDocHeader();
}

function openParticipantEditor(pid) {
  const p = participantById(pid);
  if (!p) return;
  const modal = document.getElementById('participantModal');
  document.getElementById('parEditLabel').value = p.label;
  document.getElementById('parEditAttrs').value = Object.entries(p.attributes || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
  document.getElementById('parEditInterviewer').checked = p.role === 'interviewer';
  modal.classList.remove('hidden');
  document.getElementById('parEditSave').onclick = async () => {
    const label = document.getElementById('parEditLabel').value.trim() || p.label;
    if (label !== p.label && state.participants.some(x => x.label === label)) { alert(tr('par.exists', { label })); return; }
    const attrs = {};
    for (const line of document.getElementById('parEditAttrs').value.split('\n')) {
      const m = line.match(/^\s*([^:：]+?)\s*[:：]\s*(.*)$/);
      if (m && m[1]) attrs[m[1]] = m[2].trim();
    }
    if (label !== p.label) await recordLog({ category: 'participants', ak: 'log.parRenamed', from: p.label, to: label });
    const role = document.getElementById('parEditInterviewer').checked ? 'interviewer' : 'participant';
    if (role !== (p.role || 'participant')) await recordLog({ category: 'participants', ak: role === 'interviewer' ? 'log.parMarkedInterviewer' : 'log.parMarkedParticipant', ap: { label } });
    p.label = label;
    p.attributes = attrs;
    p.role = role;
    await dbPut('participants', p);
    modal.classList.add('hidden');
    renderAll();
  };
  document.getElementById('parEditDelete').onclick = async () => {
    if (!confirm(tr('par.confirmDelete', { label: p.label }))) return;
    pushUndo(['undo.deleteParticipant', { label: p.label }], ['participants', 'ptags', 'docs']);
    const gone = state.ptags.filter(t => t.participantId === pid).map(t => t.id);
    state.ptags = state.ptags.filter(t => t.participantId !== pid);
    const docs = state.docs.filter(d => d.defaultParticipantId === pid);
    for (const d of docs) d.defaultParticipantId = null;
    state.participants = state.participants.filter(x => x.id !== pid);
    commitUndo();
    await dbDeleteMany('ptags', gone);
    await dbPutMany('docs', docs);
    await dbDelete('participants', pid);
    await recordLog({ category: 'participants', ak: 'log.parDeleted', ap: { label: p.label } });
    modal.classList.add('hidden');
    renderAll();
  };
}

// ========================================================
// VIEWER
// ========================================================
function renderDocHeader() {
  const doc = docById(state.activeDocId);
  const hdr = document.getElementById('viewerHeader');
  const empty = document.getElementById('viewerEmpty');
  if (!doc) { hdr.classList.add('hidden'); empty.classList.remove('hidden'); return; }
  hdr.classList.remove('hidden'); empty.classList.add('hidden');
  document.getElementById('docTitle').textContent = doc.name;
  document.getElementById('docMeta').textContent = tr(doc.kind === 'csv' ? 'doc.metaCsv' : 'doc.meta', { kind: doc.kind.toUpperCase(), enc: encodingLabel(doc.encoding), chars: doc.text.length.toLocaleString(localeOf()), n: doc.blocks.length });
  const sel = document.getElementById('docDefaultParticipant');
  sel.innerHTML = `<option value="">${escapeHtml(tr('doc.noneOption'))}</option>` + state.participants.map(p => `<option value="${p.id}" ${doc.defaultParticipantId === p.id ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('');
  const note = document.getElementById('docNote');
  if (document.activeElement !== note) note.value = doc.note || '';
  note.dataset.doc = doc.id; // the note belongs to this document even if the commit runs after switching
  document.getElementById('docNoteDot').classList.toggle('hidden', !doc.note);
}

function renderViewer(resetScroll = false) {
  renderDocHeader();
  const body = document.getElementById('viewerBody');
  const scroller = document.getElementById('viewerScroll');
  const doc = docById(state.activeDocId);
  if (!doc) { body.innerHTML = ''; return; }
  const top = scroller.scrollTop;
  const segs = state.segments.filter(s => s.docId === doc.id);
  const pts = state.ptags.filter(p => p.docId === doc.id);
  const showLabels = doc.kind === 'csv';
  const hits = [];
  state.searchHits.forEach((h, i) => { if (h.docId === doc.id) hits.push({ s: h.s, e: h.e, i }); });
  body.innerHTML = doc.blocks.map((b, bi) => renderBlock(doc, b, bi, segs, pts, showLabels, hits)).join('');
  scroller.scrollTop = resetScroll ? 0 : top;
}

function renderBlock(doc, b, bi, segs, pts, showLabels, hits = []) {
  const inBlock = segs.filter(s => s.s < b.e && s.e > b.s);
  const blockHits = hits.filter(h => h.s < b.e && h.e > b.s);
  const cuts = new Set([b.s, b.e]);
  for (const s of inBlock) { cuts.add(Math.max(s.s, b.s)); cuts.add(Math.min(s.e, b.e)); }
  for (const h of blockHits) { cuts.add(Math.max(h.s, b.s)); cuts.add(Math.min(h.e, b.e)); }
  const pos = [...cuts].sort((x, y) => x - y);
  let html = '';
  for (let i = 0; i < pos.length - 1; i++) {
    const a = pos[i], z = pos[i + 1];
    if (z <= a) continue;
    const txt = escapeHtml(doc.text.slice(a, z));
    const cover = inBlock.filter(s => s.s <= a && s.e >= z);
    // Search hits: one hit at most per piece (hits never overlap)
    const hit = blockHits.find(h => h.s <= a && h.e >= z);
    const hitAttr = hit ? ` data-hit="${hit.i}"` : '';
    const hitCls = hit ? (hit.i === state.searchIdx ? ' search-hit search-hit-current' : ' search-hit') : '';
    if (!cover.length) { html += `<span data-s="${a}"${hitAttr}${hitCls ? ` class="${hitCls.trim()}"` : ''}>${txt}</span>`; continue; }
    const codeIds = [];
    for (const s of cover) for (const c of s.codeIds) if (!codeIds.includes(c)) codeIds.push(c);
    const colors = codeIds.map(id => codeById(id)?.color).filter(Boolean);
    const ms = markerStyle();
    const bg = ms.bg ? hexAlpha(colors[0] || '#94a3b8', codeIds.length > 1 ? ms.bgMulti : ms.bg) : 'transparent';
    const shadows = colors.slice(0, 4).map((c, k) => `inset 0 -${(k + 1) * ms.lineW}px 0 ${ms.line < 1 ? hexAlpha(c, ms.line) : c}`).join(',');
    const active = cover.some(s => s.id === state.activeSegId) ? ' seg-active' : '';
    const title = codeIds.map(id => codeById(id)?.name).filter(Boolean).join(' · ');
    html += `<span class="seg${active}${hitCls}" data-s="${a}"${hitAttr} data-segs="${cover.map(s => s.id).join(' ')}" style="background:${bg};box-shadow:${shadows}" title="${escapeHtml(title)}">${txt}</span>`;
  }

  // Gutter: participant(s) of this line (explicit tag, else document default in grey)
  const bp = pts.filter(p => p.s < b.e && p.e > b.s);
  let gutter = '';
  if (bp.length) {
    const ids = [...new Set(bp.map(p => p.participantId))];
    gutter = ids.map(id => { const p = participantById(id); return p ? `<span class="par-chip" style="background:${hexAlpha(p.color, 0.14)};color:${p.color};border-color:${hexAlpha(p.color, 0.4)}">${escapeHtml(p.label)}</span>` : ''; }).join('');
  } else if (doc.defaultParticipantId && participantById(doc.defaultParticipantId)) {
    gutter = `<span class="par-chip par-chip-default">${escapeHtml(participantById(doc.defaultParticipantId).label)}</span>`;
  }

  // Margin: codes of segments that start on this line (coding stripes)
  const starting = inBlock.filter(s => s.s >= b.s && s.s < b.e || (bi === 0 && s.s < b.s));
  const margin = starting.map(s => s.codeIds.map(cid => {
    const c = codeById(cid);
    return c ? `<button class="margin-chip${s.id === state.activeSegId ? ' ring-2 ring-indigo-400' : ''}" data-seg="${s.id}" style="border-color:${c.color};color:${c.color}" title="${escapeHtml(c.name)}${s.key ? ` (${escapeHtml(tr('seg.keyExtract'))})` : ''}">${s.key ? '★ ' : ''}${escapeHtml(clip(c.name, 22))}</button>` : '';
  }).join('')).join('');

  return `<div class="ta-block" data-bi="${bi}" data-bs="${b.s}" data-be="${b.e}">
    <div class="ta-gutter">${showLabels && b.label ? `<div class="ta-block-label">${escapeHtml(b.label)}</div>` : ''}${gutter}</div>
    <div class="ta-text">${html}</div>
    <div class="ta-margin">${margin}</div>
  </div>`;
}

// DOM point inside the viewer → character offset in doc.text
function pointToOffset(node, off) {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) {
    const span = node.parentElement && node.parentElement.closest('[data-s]');
    return span ? Number(span.dataset.s) + off : null;
  }
  const el = node;
  if (el.matches && el.matches('[data-s]')) return Number(el.dataset.s) + (off > 0 ? el.textContent.length : 0);
  const kids = el.childNodes;
  for (let i = off; i < kids.length; i++) {
    const k = kids[i];
    if (k.nodeType !== 1) continue;
    const sp = k.matches('[data-s]') ? k : k.querySelector('[data-s]');
    if (sp) return Number(sp.dataset.s);
  }
  const spans = el.querySelectorAll ? el.querySelectorAll('[data-s]') : [];
  if (spans.length) { const l = spans[spans.length - 1]; return Number(l.dataset.s) + l.textContent.length; }
  const blk = el.closest && el.closest('.ta-block');
  return blk ? Number(blk.dataset.be) : null;
}

function captureSelection() {
  const sel = window.getSelection();
  const body = document.getElementById('viewerBody');
  const doc = docById(state.activeDocId);
  if (!doc || !sel.rangeCount || sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  if (!body.contains(r.commonAncestorContainer)) return false;
  let s = pointToOffset(r.startContainer, r.startOffset);
  let e = pointToOffset(r.endContainer, r.endOffset);
  if (s == null || e == null) return false;
  if (s > e) [s, e] = [e, s];
  while (s < e && /\s/.test(doc.text[s])) s++;
  while (e > s && /\s/.test(doc.text[e - 1])) e--;
  if (e <= s) return false;
  state.pendingSel = { docId: doc.id, s, e, text: doc.text.slice(s, e) };
  renderSelectionPanel();
  renderParticipantList();
  return true;
}

function clearPendingSelection() {
  state.pendingSel = null;
  const sel = window.getSelection();
  if (sel) sel.removeAllRanges();
  renderSelectionPanel();
  renderParticipantList();
}

function setupViewerEvents() {
  const body = document.getElementById('viewerBody');
  body.addEventListener('mouseup', () => setTimeout(captureSelection, 0));
  body.addEventListener('click', (e) => {
    const chip = e.target.closest('.margin-chip');
    if (chip) { selectSegment(chip.dataset.seg); return; }
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const seg = e.target.closest('.seg');
    if (seg) {
      // Several overlapping segments: cycle through them, shortest first
      const ids = seg.dataset.segs.split(' ').map(id => state.segments.find(s => s.id === id)).filter(Boolean).sort((a, b) => (a.e - a.s) - (b.e - b.s)).map(s => s.id);
      const cur = ids.indexOf(state.activeSegId);
      selectSegment(ids[(cur + 1) % ids.length]);
      return;
    }
    if (state.pendingSel) clearPendingSelection();
    if (state.activeSegId) { state.activeSegId = null; renderViewer(); renderSegmentPanel(); }
  });

  // Drag a code or a participant onto the text
  const scroller = document.getElementById('viewerScroll');
  const isOurs = e => [...e.dataTransfer.types].some(t => t === 'text/x-ta-code' || t === 'text/x-ta-participant');
  scroller.addEventListener('dragover', (e) => {
    if (!isOurs(e)) return;
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll('.ta-block.drop-target').forEach(x => x.classList.remove('drop-target'));
    const blk = e.target.closest && e.target.closest('.ta-block');
    if (blk) blk.classList.add('drop-target');
  });
  scroller.addEventListener('dragleave', (e) => {
    if (e.target.closest && e.target.closest('.ta-block')) e.target.closest('.ta-block').classList.remove('drop-target');
  });
  scroller.addEventListener('drop', async (e) => {
    if (!isOurs(e)) return;
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll('.ta-block.drop-target').forEach(x => x.classList.remove('drop-target'));
    const doc = docById(state.activeDocId);
    const blk = e.target.closest && e.target.closest('.ta-block');
    if (!doc || !blk) return;
    const bs = Number(blk.dataset.bs), be = Number(blk.dataset.be);
    // Dropped on the current selection → code the selection; otherwise code the whole line / answer
    const ps = state.pendingSel;
    const range = (ps && ps.docId === doc.id && ps.s < be && ps.e > bs) ? ps : { docId: doc.id, s: bs, e: be, text: doc.text.slice(bs, be) };
    const codeId = e.dataTransfer.getData('text/x-ta-code');
    const parId = e.dataTransfer.getData('text/x-ta-participant');
    if (codeId) await applyCodeToRange(codeId, range);
    else if (parId) await tagParticipant(parId, range);
  });
}

function selectSegment(segId) {
  state.activeSegId = segId;
  renderViewer();
  renderSegmentPanel();
  if (state.pendingSel) renderSelectionPanel(); // offers "use the selection as this extract's range"
}

// ========================================================
// CODING ACTIONS
// ========================================================
async function applyCodeToRange(codeId, range) {
  const code = codeById(codeId);
  const doc = docById(range.docId);
  if (!code || !doc) return;
  let seg = state.segments.find(x => x.docId === doc.id && x.s === range.s && x.e === range.e);
  if (seg && seg.codeIds.includes(codeId)) { showToast(tr('code.alreadyCoded', { code: code.name })); return; }
  if (seg) seg.codeIds.push(codeId);
  else {
    seg = { id: uid('seg'), docId: doc.id, s: range.s, e: range.e, text: doc.text.slice(range.s, range.e), codeIds: [codeId], memo: '', key: false, createdBy: state.researcherId || '', createdAt: Date.now() };
    state.segments.push(seg);
  }
  // Render first, persist after: a re-render that lands later would wipe the next selection the user starts
  state.activeSegId = seg.id;
  clearPendingSelection();
  renderViewer();
  renderDocList();
  renderCodebook();
  renderSegmentPanel();
  await dbPut('segments', seg);
  await recordLog({ category: 'coding', ak: 'log.coded', ap: { code: code.name }, detail: `${doc.name} · “${clip(seg.text, 120)}”` });
}

// Adds the code to state at once (so it can be applied and rendered in the same tick); `saved` persists it
function makeCode(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  if (!clean) return { code: null, saved: Promise.resolve() };
  const existing = state.codes.find(c => c.name.toLowerCase() === clean.toLowerCase());
  if (existing) return { code: existing, saved: Promise.resolve() };
  const code = { id: uid('code'), name: clean, description: '', color: nextCodeColor(), themeIds: [], createdAt: Date.now(), order: state.codes.length };
  state.codes.push(code);
  const saved = dbPut('codes', code).then(() => recordLog({ category: 'codebook', ak: 'log.codeCreated', ap: { code: code.name } }));
  return { code, saved };
}

async function quickCode() {
  const inp = document.getElementById('quickCodeInput');
  const { code, saved } = makeCode(inp.value);
  if (!code) return;
  inp.value = '';
  const active = state.segments.find(x => x.id === state.activeSegId);
  let applied = null;
  if (state.pendingSel) applied = applyCodeToRange(code.id, state.pendingSel);
  else if (active) applied = applyCodeToRange(code.id, active); // add another code to the extract just coded
  else { renderCodebook(); showToast(tr('code.ready', { code: code.name })); }
  await saved;
  await applied;
}

async function inVivoCode() {
  if (!state.pendingSel) { showToast(tr('code.selectFirst')); return; }
  const { code, saved } = makeCode(clip(state.pendingSel.text, 60));
  const applied = applyCodeToRange(code.id, state.pendingSel);
  await saved;
  await applied;
}

async function tagParticipant(participantId, range) {
  const p = participantById(participantId);
  const doc = docById(range.docId);
  if (!p || !doc) return;
  const { s, e } = range;
  // One participant per character: cut overlapping ranges, then add the new one
  const next = [], removed = [];
  for (const t of state.ptags) {
    if (t.docId !== doc.id || t.e <= s || t.s >= e) { next.push(t); continue; }
    removed.push(t.id);
    if (t.s < s) next.push({ ...t, id: uid('pt'), e: s });
    if (t.e > e) next.push({ ...t, id: uid('pt'), s: e });
  }
  const added = { id: uid('pt'), docId: doc.id, s, e, participantId };
  next.push(added);
  const fresh = next.filter(t => !state.ptags.includes(t));
  state.ptags = next;
  clearPendingSelection();
  renderViewer();
  renderParticipantList();
  renderSegmentPanel();
  await dbDeleteMany('ptags', removed);
  await dbPutMany('ptags', fresh);
  await recordLog({ category: 'participants', ak: 'log.tagged', ap: { label: p.label }, detail: `${doc.name} · “${clip(doc.text.slice(s, e), 100)}”` });
}

async function clearParticipantInSelection() {
  const r = state.pendingSel;
  if (!r) return;
  const next = [], removed = [];
  for (const t of state.ptags) {
    if (t.docId !== r.docId || t.e <= r.s || t.s >= r.e) { next.push(t); continue; }
    removed.push(t.id);
    if (t.s < r.s) next.push({ ...t, id: uid('pt'), e: r.s });
    if (t.e > r.e) next.push({ ...t, id: uid('pt'), s: r.e });
  }
  const fresh = next.filter(t => !state.ptags.includes(t));
  state.ptags = next;
  await dbDeleteMany('ptags', removed);
  await dbPutMany('ptags', fresh);
  clearPendingSelection();
  renderViewer();
  renderParticipantList();
}

// "A: ..." / "インタビュアー：..." at the start of a line → speaker tag for that line
async function detectSpeakers() {
  const doc = docById(state.activeDocId);
  if (!doc) return;
  const re = /^\s*[【\[(（]?([^\s:：】\])）「」]{1,24})[】\])）]?\s*[:：]/;
  const found = new Map();
  doc.blocks.forEach((b, i) => {
    const m = doc.text.slice(b.s, b.e).match(re);
    if (m) { const k = m[1]; if (!found.has(k)) found.set(k, []); found.get(k).push(i); }
  });
  if (!found.size) { alert(tr('spk.none')); return; }
  const list = [...found.entries()].map(([k, v]) => `• ${k} — ${tr('spk.lines', { n: v.length })}`).join('\n');
  if (!confirm(tr('spk.confirm', { doc: doc.name, list }))) return;
  pushUndo(['undo.detectSpeakers', { doc: doc.name }], ['ptags', 'participants']);
  const lineIdx = new Set([...found.values()].flat());
  const keep = state.ptags.filter(t => t.docId !== doc.id || !doc.blocks.some((b, i) => lineIdx.has(i) && t.s < b.e && t.e > b.s));
  const removed = state.ptags.filter(t => !keep.includes(t)).map(t => t.id);
  const add = [];
  for (const [label, idxs] of found) {
    const p = await ensureParticipant(label);
    for (const i of idxs) add.push({ id: uid('pt'), docId: doc.id, s: doc.blocks[i].s, e: doc.blocks[i].e, participantId: p.id });
  }
  state.ptags = keep.concat(add);
  commitUndo();
  await dbDeleteMany('ptags', removed);
  await dbPutMany('ptags', add);
  await recordLog({ category: 'participants', ak: 'log.speakersDetected', ap: { doc: doc.name }, detail: [...found.keys()].join(', ') });
  renderAll();
}

async function deleteActiveDocument() {
  const doc = docById(state.activeDocId);
  if (!doc) return;
  const n = state.segments.filter(s => s.docId === doc.id).length;
  if (!confirm(tr('doc.confirmRemove', { doc: doc.name, n }))) return;
  pushUndo(['undo.removeDoc', { doc: doc.name }], ['docs', 'segments', 'ptags']);
  const segIds = state.segments.filter(s => s.docId === doc.id).map(s => s.id);
  const ptIds = state.ptags.filter(t => t.docId === doc.id).map(t => t.id);
  state.segments = state.segments.filter(s => s.docId !== doc.id);
  state.ptags = state.ptags.filter(t => t.docId !== doc.id);
  state.docs = state.docs.filter(d => d.id !== doc.id);
  commitUndo();
  await dbDeleteMany('segments', segIds);
  await dbDeleteMany('ptags', ptIds);
  await dbDelete('docs', doc.id);
  await recordLog({ category: 'import', ak: 'log.docRemoved', ap: { doc: doc.name }, dk: 'log.d.extractsRemoved', dp: { n } });
  state.activeDocId = state.docs[0]?.id || null;
  state.activeSegId = null;
  renderAll();
}

// ========================================================
// RIGHT: SELECTION, CODEBOOK, SEGMENT DETAILS
// ========================================================
function renderSelectionPanel() {
  if (typeof refreshJournalContext === 'function') refreshJournalContext();
  const el = document.getElementById('selectionPanel');
  const ps = state.pendingSel;
  if (!ps) {
    el.innerHTML = `<div class="text-[11px] text-slate-500 leading-relaxed">${tr('sel.howTo')}</div>`; // trusted dictionary HTML
    return;
  }
  const open = activeSegment();
  const resizable = open && open.docId === ps.docId && !(open.s === ps.s && open.e === ps.e);
  el.innerHTML = `
    <div class="flex items-center justify-between mb-1">
      <span class="text-[11px] font-bold text-indigo-700 uppercase tracking-wide">${escapeHtml(tr('sel.title'))}</span>
      <button id="selClear" class="text-[11px] text-slate-400 hover:text-slate-700 cursor-pointer">${escapeHtml(tr('sel.clear'))}</button>
    </div>
    <div class="text-xs text-slate-700 bg-white border border-indigo-200 rounded p-2 max-h-24 overflow-y-auto leading-relaxed">“${escapeHtml(clip(ps.text, 400))}”</div>
    <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
      <button id="selInVivo" class="px-2 py-1 text-[11px] font-bold rounded bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer" title="${escapeHtml(tr('sel.inVivoTitle'))}">${escapeHtml(tr('sel.inVivo'))}</button>
      <button id="selClearPar" class="px-2 py-1 text-[11px] rounded bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer" title="${escapeHtml(tr('sel.clearSpeakerTitle'))}">${escapeHtml(tr('sel.clearSpeaker'))}</button>
      <span class="text-[10px] text-slate-400">${escapeHtml(tr('sel.speakerHint'))}</span>
    </div>
    ${resizable ? `<button id="selResize" class="mt-1.5 w-full px-2 py-1 text-[11px] font-bold rounded bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 cursor-pointer flex items-center justify-center gap-1" title="${escapeHtml(tr('sel.resizeTitle'))}"><i class="ph ph-arrows-out-line-horizontal"></i>${escapeHtml(tr('sel.resize'))}</button>` : ''}`;
  el.querySelector('#selResize')?.addEventListener('click', () => { const seg = activeSegment(); if (seg) resizeSegment(seg, ps.s, ps.e); });
  el.querySelector('#selClear').onclick = clearPendingSelection;
  el.querySelector('#selInVivo').onclick = inVivoCode;
  el.querySelector('#selClearPar').onclick = clearParticipantInSelection;
}

function renderCodebook() {
  renderExtractFilters();
  const el = document.getElementById('codeList');
  const q = state.codeFilter.toLowerCase();
  const codes = sortedCodes().filter(c => !q || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
  document.getElementById('codeCount').textContent = String(state.codes.length);
  if (!state.codes.length) {
    el.innerHTML = `<div class="text-[11px] text-slate-400 px-1 py-2">${escapeHtml(tr('code.empty'))}</div>`;
    return;
  }
  const hasSel = !!state.pendingSel;
  el.innerHTML = codes.map(c => {
    const segs = segmentsForCode(c.id);
    const cov = coverage(segs);
    const open = state.openCodeExtracts.has(c.id);
    const themes = c.themeIds.map(t => themeById(t)?.name).filter(Boolean);
    return `<div class="code-item rounded-md border ${hasSel ? 'border-indigo-200 hover:bg-indigo-50' : 'border-transparent hover:bg-slate-50'}" data-code="${c.id}">
      <div class="code-row flex items-center space-x-1.5 px-1.5 py-1 cursor-pointer" draggable="true" title="${escapeHtml(c.description || tr(hasSel ? 'code.clickToCode' : 'code.clickToList'))}">
        <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:${c.color}"></span>
        <span class="flex-1 text-xs text-slate-800 truncate">${escapeHtml(c.name)}</span>
        ${themes.length ? `<i class="ph ph-shapes text-[11px] text-slate-400" title="${escapeHtml(tr('code.inTheme', { themes: themes.join(', ') }))}"></i>` : ''}
        ${state.showCounts ? `<span class="text-[10px] text-slate-400 shrink-0" title="${escapeHtml(tr('code.countsTitle', { n: segs.length, p: cov.participants.size }))}">${segs.length}<span class="text-slate-300">/</span>${cov.participants.size}</span>` : ''}
        <button class="code-edit text-slate-300 hover:text-slate-700 cursor-pointer" title="${escapeHtml(tr('code.editTitle'))}"><i class="ph ph-dots-three-vertical"></i></button>
      </div>
      ${open ? `<div class="px-2 pb-2 space-y-1">${extractListHtml(segs)}</div>` : ''}
    </div>`;
  }).join('');
  el.querySelectorAll('.code-item').forEach(item => {
    const cid = item.dataset.code;
    const row = item.querySelector('.code-row');
    row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-ta-code', cid); e.dataTransfer.effectAllowed = 'copy'; });
    row.addEventListener('click', (e) => {
      if (e.target.closest('.code-edit')) return;
      if (state.pendingSel) { applyCodeToRange(cid, state.pendingSel); return; }
      if (state.openCodeExtracts.has(cid)) state.openCodeExtracts.delete(cid); else state.openCodeExtracts.add(cid);
      renderCodebook();
    });
    item.querySelector('.code-edit').addEventListener('click', () => openCodeEditor(cid));
  });
  bindExtractLinks(el);
}

// A clickable extract (used in the codebook, theme cards and segment lists)
function extractLinkHtml(seg) {
  const doc = docById(seg.docId);
  const parts = participantLabels(participantsForRange(seg.docId, seg.s, seg.e));
  return `<button class="extract-link block w-full text-left text-[11px] leading-snug bg-white border border-slate-200 hover:border-indigo-300 rounded px-2 py-1 cursor-pointer" data-seg="${seg.id}">
    <span class="text-slate-700">${seg.key ? '<span class="text-amber-500">★</span> ' : ''}“${escapeHtml(clip(seg.text, 160))}”</span>
    <span class="block text-[10px] text-slate-400 mt-0.5">${escapeHtml(parts || tr('seg.noParticipant'))} · ${escapeHtml(doc?.name || '')}</span>
  </button>`;
}
function bindExtractLinks(root) {
  root.querySelectorAll('.extract-link').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const seg = state.segments.find(s => s.id === b.dataset.seg);
    if (!seg) return;
    if (state.activeTab !== 'code') switchTab('code');
    openDocument(seg.docId, seg.id);
  });
}

function openCodeEditor(codeId) {
  const c = codeById(codeId);
  if (!c) return;
  const modal = document.getElementById('codeModal');
  document.getElementById('codeEditName').value = c.name;
  document.getElementById('codeEditDesc').value = c.description || '';
  document.getElementById('codeEditColor').value = c.color;
  const merge = document.getElementById('codeEditMerge');
  merge.innerHTML = `<option value="">${escapeHtml(tr('codeEdit.mergeNone'))}</option>` + sortedCodes().filter(x => x.id !== c.id).map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
  document.getElementById('codeEditUsage').textContent = tr('n.extracts', { n: segmentsForCode(c.id).length });
  document.getElementById('codeEditReason').value = '';
  modal.classList.remove('hidden');

  document.getElementById('codeEditSave').onclick = async () => {
    const name = document.getElementById('codeEditName').value.replace(/\s+/g, ' ').trim();
    const desc = document.getElementById('codeEditDesc').value.trim();
    const color = document.getElementById('codeEditColor').value;
    if (!name) { alert(tr('codeEdit.needName')); return; }
    if (name.toLowerCase() !== c.name.toLowerCase() && state.codes.some(x => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase())) {
      alert(tr('codeEdit.exists', { name })); return;
    }
    const reason = document.getElementById('codeEditReason').value.trim();
    const target = merge.value;
    if (name !== c.name) await recordLog({ category: 'codebook', ak: 'log.codeRenamed', from: c.name, to: name, reason: target ? '' : reason });
    if (desc !== (c.description || '')) await recordLog({ category: 'codebook', ak: 'log.codeDesc', ap: { code: name }, from: c.description || '', to: desc });
    c.name = name; c.description = desc; c.color = color;
    await dbPut('codes', c);
    modal.classList.add('hidden');
    if (target) await mergeCodes(c.id, target, reason);
    renderAll();
  };
  const splitBtn = document.getElementById('codeEditSplit');
  splitBtn.disabled = segmentsForCode(c.id).length < 1;
  splitBtn.onclick = () => { modal.classList.add('hidden'); openSplitModal(c.id); };
  document.getElementById('codeEditDelete').onclick = async () => {
    const n = segmentsForCode(c.id).length;
    if (!confirm(tr('codeEdit.confirmDelete', { code: c.name, n }))) return;
    modal.classList.add('hidden');
    await deleteCode(c.id, document.getElementById('codeEditReason').value.trim());
  };
}

async function mergeCodes(sourceId, targetId, reason = '') {
  const src = codeById(sourceId), tgt = codeById(targetId);
  if (!src || !tgt) return;
  pushUndo(['undo.merge', { src: src.name, tgt: tgt.name }], ['codes', 'segments']);
  const changed = [];
  for (const s of state.segments) {
    if (!s.codeIds.includes(sourceId)) continue;
    s.codeIds = s.codeIds.filter(x => x !== sourceId);
    if (!s.codeIds.includes(targetId)) s.codeIds.push(targetId);
    changed.push(s);
  }
  for (const t of src.themeIds) if (!tgt.themeIds.includes(t)) tgt.themeIds.push(t);
  if (src.description && !tgt.description.includes(src.description)) tgt.description = [tgt.description, `[from “${src.name}”] ${src.description}`].filter(Boolean).join('\n');
  state.codes = state.codes.filter(x => x.id !== sourceId);
  commitUndo();
  await dbPutMany('segments', changed);
  await dbPut('codes', tgt);
  await dbDelete('codes', sourceId);
  await recordLog({ category: 'codebook', ak: 'log.merged', ap: { src: src.name, tgt: tgt.name }, dk: 'log.d.recoded', dp: { n: changed.length }, from: src.name, to: tgt.name, reason });
  showToast(tr('toast.merged', { tgt: tgt.name }), 'success');
  renderAll();
}

async function deleteCode(codeId, reason = '') {
  const c = codeById(codeId);
  if (!c) return;
  pushUndo(['undo.deleteCode', { code: c.name }], ['codes', 'segments']);
  const changed = [], removed = [];
  for (const s of state.segments) {
    if (!s.codeIds.includes(codeId)) continue;
    s.codeIds = s.codeIds.filter(x => x !== codeId);
    (s.codeIds.length ? changed : removed).push(s);
  }
  state.segments = state.segments.filter(s => !removed.includes(s));
  state.codes = state.codes.filter(x => x.id !== codeId);
  commitUndo();
  await dbPutMany('segments', changed);
  await dbDeleteMany('segments', removed.map(s => s.id));
  await dbDelete('codes', codeId);
  await recordLog({ category: 'codebook', ak: 'log.codeDeleted', ap: { code: c.name }, dk: 'log.d.affected', dp: { n: changed.length + removed.length }, reason });
  if (removed.some(s => s.id === state.activeSegId)) state.activeSegId = null;
  renderAll();
}

function renderSegmentPanel() {
  flushAllPendingSaves(); // the memo box is rebuilt below
  if (typeof refreshJournalContext === 'function') refreshJournalContext();
  const el = document.getElementById('segmentPanel');
  const seg = state.segments.find(s => s.id === state.activeSegId);
  if (!seg) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  const parts = participantsForRange(seg.docId, seg.s, seg.e);
  const others = sortedCodes().filter(c => !seg.codeIds.includes(c.id));
  el.innerHTML = `
    <div class="flex items-center justify-between mb-1.5">
      <span class="text-[11px] font-bold text-slate-600 uppercase tracking-wide">${escapeHtml(tr('seg.title'))}</span>
      <div class="flex items-center gap-1">
        <button id="segKey" class="px-1.5 py-0.5 text-[11px] rounded border cursor-pointer ${seg.key ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}" title="${escapeHtml(tr('seg.keyTitle'))}">${seg.key ? '★' : '☆'} ${escapeHtml(tr('seg.keyExtract'))}</button>
        <button id="segClose" class="text-slate-400 hover:text-slate-700 cursor-pointer px-1" title="${escapeHtml(tr('common.close'))}"><i class="ph ph-x"></i></button>
      </div>
    </div>
    <div class="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 max-h-28 overflow-y-auto leading-relaxed">“${escapeHtml(seg.text)}”</div>
    <div class="text-[10px] text-slate-500 mt-1">${escapeHtml(tr('seg.participant'))}: <b>${escapeHtml(participantLabels(parts) || '—')}</b>${seg.createdBy ? ` · ${escapeHtml(tr('seg.codedBy', { by: seg.createdBy }))}` : ''}</div>
    <div class="flex flex-wrap gap-1 mt-2">
      ${seg.codeIds.map(cid => { const c = codeById(cid); return c ? `<span class="inline-flex items-center gap-1 text-[11px] pl-1.5 pr-1 py-0.5 rounded border" style="border-color:${c.color};background:${hexAlpha(c.color, 0.12)}">${escapeHtml(c.name)}<button class="seg-uncode text-slate-400 hover:text-rose-600 cursor-pointer" data-code="${cid}" title="${escapeHtml(tr('seg.uncodeTitle'))}"><i class="ph ph-x text-[10px]"></i></button></span>` : ''; }).join('')}
    </div>
    ${others.length ? `<select id="segAddCode" class="mt-2 w-full text-[11px] border border-slate-300 rounded px-1.5 py-1 bg-white"><option value="">${escapeHtml(tr('seg.addCode'))}</option>${others.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select>` : ''}
    <div class="flex items-center gap-1.5 mt-2">
      <button id="segWholeLine" class="px-1.5 py-0.5 text-[10px] rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap" title="${escapeHtml(tr('seg.wholeLineTitle'))}"><i class="ph ph-text-align-justify"></i> ${escapeHtml(tr('seg.wholeLine'))}</button>
      <span class="text-[10px] text-slate-400 leading-tight">${escapeHtml(tr('seg.resizeHint'))}</span>
    </div>
    <textarea id="segMemo" rows="2" placeholder="${escapeHtml(tr('seg.memoPh'))}" class="mt-2 w-full text-[11px] border border-slate-300 rounded px-2 py-1 resize-y focus:outline-none focus:border-indigo-500">${escapeHtml(seg.memo || '')}</textarea>
    <button id="segDelete" class="mt-1 text-[11px] text-rose-600 hover:underline cursor-pointer">${escapeHtml(tr('seg.remove'))}</button>`;
  el.querySelector('#segClose').onclick = () => { state.activeSegId = null; renderViewer(); renderSegmentPanel(); if (state.pendingSel) renderSelectionPanel(); };
  el.querySelector('#segKey').onclick = async () => {
    seg.key = !seg.key;
    await dbPut('segments', seg);
    renderViewer(); renderSegmentPanel();
  };
  el.querySelectorAll('.seg-uncode').forEach(b => b.onclick = async () => {
    const c = codeById(b.dataset.code);
    if (seg.codeIds.length === 1) { await deleteSegment(seg); return; }
    seg.codeIds = seg.codeIds.filter(x => x !== b.dataset.code);
    await dbPut('segments', seg);
    await recordLog({ category: 'coding', ak: 'log.uncoded', ap: { code: c?.name || '' }, detail: `“${clip(seg.text, 120)}”` });
    renderViewer(); renderCodebook(); renderSegmentPanel();
  });
  const add = el.querySelector('#segAddCode');
  if (add) add.onchange = () => add.value && applyCodeToRange(add.value, seg);
  const memo = el.querySelector('#segMemo');
  bindPendingCommit(memo, async () => {
    const v = memo.value.trim();
    if (v === (seg.memo || '')) return;
    seg.memo = v;
    await dbPut('segments', seg);
  });
  el.querySelector('#segDelete').onclick = () => deleteSegment(seg);
  const whole = wholeLineRange(seg);
  const wl = el.querySelector('#segWholeLine');
  if (whole.s === seg.s && whole.e === seg.e) wl.disabled = true, wl.classList.add('opacity-40');
  else wl.onclick = () => resizeSegment(seg, whole.s, whole.e);
}

async function deleteSegment(seg) {
  pushUndo(['undo.removeExtract', {}], ['segments']);
  state.segments = state.segments.filter(s => s.id !== seg.id);
  commitUndo();
  await dbDelete('segments', seg.id);
  await recordLog({ category: 'coding', ak: 'log.extractRemoved', detail: `${seg.codeIds.map(c => codeById(c)?.name).filter(Boolean).join(', ')} · “${clip(seg.text, 120)}”` });
  state.activeSegId = null;
  renderViewer(); renderDocList(); renderCodebook(); renderSegmentPanel();
}

function setupCodingEvents() {
  document.getElementById('importBtn').onclick = () => document.getElementById('fileInput').click();
  document.getElementById('fileInput').onchange = async (e) => { await importFiles(e.target.files); e.target.value = ''; };
  document.getElementById('newParticipantInput').addEventListener('keydown', e => { if (e.key === 'Enter') addParticipantFromInput(); });
  document.getElementById('addParticipantBtn').onclick = addParticipantFromInput;
  document.getElementById('quickCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); quickCode(); } });
  document.getElementById('codeSearch').addEventListener('input', e => { state.codeFilter = e.target.value; renderCodebook(); });
  setupTextSearchEvents();
  document.getElementById('detectSpeakersBtn').onclick = detectSpeakers;
  document.getElementById('deleteDocBtn').onclick = deleteActiveDocument;
  document.getElementById('docDefaultParticipant').onchange = async (e) => {
    const doc = docById(state.activeDocId);
    if (!doc) return;
    doc.defaultParticipantId = e.target.value || null;
    await dbPut('docs', doc);
    await recordLog({ category: 'participants', ak: 'log.defaultPar', ap: { doc: doc.name }, to: participantById(doc.defaultParticipantId)?.label || '—' });
    renderViewer(); renderParticipantList();
  };
  document.getElementById('docNoteToggle').onclick = () => document.getElementById('docNotePanel').classList.toggle('hidden');
  const docNote = document.getElementById('docNote');
  bindPendingCommit(docNote, async () => {
    const doc = docById(docNote.dataset.doc);
    if (!doc) return;
    const v = docNote.value.trim();
    if (v === (doc.note || '')) return;
    const had = !!doc.note;
    doc.note = v;
    await dbPut('docs', doc);
    if (!had && doc.note) await recordLog({ category: 'familiarisation', ak: 'log.famNotes', ap: { doc: doc.name } });
    renderDocHeader();
  });
  setupViewerEvents();
}

// ========================================================
// EXTRACT RANGE (widen / narrow a coded extract)
// ========================================================
function activeSegment() {
  return state.segments.find(s => s.id === state.activeSegId) || null;
}
// The full line(s) / answer(s) an extract sits in
function wholeLineRange(seg) {
  const doc = docById(seg.docId);
  if (!doc) return { s: seg.s, e: seg.e };
  const first = doc.blocks.find(b => b.e > seg.s) || doc.blocks[0];
  const last = [...doc.blocks].reverse().find(b => b.s < seg.e) || first;
  return { s: Math.min(first.s, seg.s), e: Math.max(last.e, seg.e) };
}
// Codes, memo and key mark stay with the extract; if another extract already has exactly this range, the two
// become one (one segment per exact range)
async function resizeSegment(seg, s, e) {
  const doc = docById(seg.docId);
  if (!doc || e <= s || (s === seg.s && e === seg.e)) return;
  pushUndo(['undo.resizeExtract', {}], ['segments']);
  const oldText = seg.text;
  const twin = state.segments.find(x => x !== seg && x.docId === seg.docId && x.s === s && x.e === e);
  let keep = seg;
  if (twin) {
    for (const c of seg.codeIds) if (!twin.codeIds.includes(c)) twin.codeIds.push(c);
    twin.memo = [twin.memo, seg.memo].filter(Boolean).join('\n');
    twin.key = !!(twin.key || seg.key);
    state.segments = state.segments.filter(x => x !== seg);
    keep = twin;
  } else {
    seg.s = s; seg.e = e; seg.text = doc.text.slice(s, e);
  }
  commitUndo();
  state.activeSegId = keep.id;
  clearPendingSelection();
  renderViewer(); renderDocList(); renderCodebook(); renderSegmentPanel();
  if (twin) await dbDelete('segments', seg.id);
  await dbPut('segments', keep);
  await recordLog({ category: 'coding', ak: 'log.extractResized', ap: { codes: keep.codeIds.map(c => codeById(c)?.name).filter(Boolean).join(', ') }, detail: doc.name, from: clip(oldText, 160), to: clip(keep.text, 160) });
  showToast(tr(twin ? 'toast.resizedMerged' : 'toast.resized'), 'success');
}

// ========================================================
// FULL-TEXT SEARCH (all documents)
// ========================================================
// Case-insensitive; full-width and half-width letters, digits and spaces match each other.
// The folded text keeps the length of the original, so positions carry over unchanged.
function foldForSearch(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code >= 0xFF01 && code <= 0xFF5E) code -= 0xFEE0;
    else if (code === 0x3000) code = 0x20;
    const ch = String.fromCharCode(code);
    const low = ch.toLowerCase();
    out += low.length === 1 ? low : ch;
  }
  return out;
}
const foldedDocCache = new Map(); // docId → { text, folded } (document text never changes)
function foldedDocText(doc) {
  const c = foldedDocCache.get(doc.id);
  if (c && c.text === doc.text) return c.folded;
  const folded = foldForSearch(doc.text);
  foldedDocCache.set(doc.id, { text: doc.text, folded });
  return folded;
}
const SEARCH_MAX_HITS = 2000;
function computeSearchHits() {
  const prev = state.searchHits[state.searchIdx];
  const q = foldForSearch(state.textQuery.replace(/\s+/g, ' ').trim());
  const hits = [];
  if (q) {
    const allowed = extractFilterParticipants();
    for (const doc of state.docs) {
      const hay = foldedDocText(doc);
      let i = hay.indexOf(q);
      while (i >= 0 && hits.length < SEARCH_MAX_HITS) {
        if (matchesExtractFilter(doc.id, i, i + q.length, allowed)) hits.push({ docId: doc.id, s: i, e: i + q.length });
        i = hay.indexOf(q, i + q.length);
      }
      if (hits.length >= SEARCH_MAX_HITS) break;
    }
  }
  state.searchHits = hits;
  // Keep the current hit when the list is rebuilt (e.g. after an import)
  state.searchIdx = prev ? hits.findIndex(h => h.docId === prev.docId && h.s === prev.s && h.e === prev.e) : -1;
}

function renderSearchResults() {
  const active = !!state.textQuery.trim();
  document.querySelectorAll('#viewCode .browse-pane').forEach(x => x.classList.toggle('hidden', active));
  const el = document.getElementById('searchResults');
  el.classList.toggle('hidden', !active);
  document.getElementById('textSearchClear').classList.toggle('hidden', !state.textQuery);
  if (!active) { el.innerHTML = ''; return; }
  const hits = state.searchHits;
  const nDocs = new Set(hits.map(h => h.docId)).size;
  const group = extractFilterLabel();
  let html = `<div class="px-1 pb-1.5 text-[11px] text-slate-500 leading-snug">${escapeHtml(hits.length ? tr('search.summary', { n: hits.length, d: nDocs, more: hits.length >= SEARCH_MAX_HITS ? '+' : '' }) : tr('search.none'))}${group ? `<div class="text-amber-700">${escapeHtml(tr('search.inGroup', { group }))}</div>` : ''}${hits.length ? `<div class="text-slate-400">${escapeHtml(tr('search.keys'))}</div>` : ''}</div>`;
  const SHOW = 300;
  let lastDoc = null;
  hits.slice(0, SHOW).forEach((h, i) => {
    const doc = docById(h.docId);
    if (h.docId !== lastDoc) {
      lastDoc = h.docId;
      const n = hits.filter(x => x.docId === h.docId).length;
      html += `<div class="mt-2 mb-1 px-1 text-[11px] font-bold text-slate-600 flex items-center gap-1"><i class="ph ph-file-text"></i><span class="truncate flex-1">${escapeHtml(doc?.name || '')}</span><span class="font-normal text-slate-400">${n}</span></div>`;
    }
    // Context on the same line only: up to 36 characters before and 60 after
    let bs = Math.max(0, h.s - 36);
    const nl = doc.text.lastIndexOf('\n', h.s - 1);
    if (nl >= bs) bs = nl + 1;
    let ae = Math.min(doc.text.length, h.e + 60);
    const nl2 = doc.text.indexOf('\n', h.e);
    if (nl2 >= 0 && nl2 < ae) ae = nl2;
    const lead = bs > 0 && doc.text[bs - 1] !== '\n' ? '…' : '';
    const trail = ae < doc.text.length && doc.text[ae] !== '\n' ? '…' : '';
    const par = participantLabels(participantsForRange(h.docId, h.s, h.e));
    html += `<button class="search-link block w-full text-left text-[11px] leading-snug rounded px-2 py-1 border cursor-pointer ${i === state.searchIdx ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200 hover:border-indigo-300'}" data-i="${i}">
      <span class="text-slate-600">${lead}${escapeHtml(doc.text.slice(bs, h.s))}<mark class="search-mark">${escapeHtml(doc.text.slice(h.s, h.e))}</mark>${escapeHtml(doc.text.slice(h.e, ae))}${trail}</span>
      ${par ? `<span class="block text-[10px] text-slate-400 mt-0.5">${escapeHtml(par)}</span>` : ''}
    </button>`;
  });
  if (hits.length > SHOW) html += `<div class="px-1 py-2 text-[11px] text-slate-400">${escapeHtml(tr('search.moreHits', { n: hits.length - SHOW }))}</div>`;
  el.innerHTML = html;
  el.querySelectorAll('.search-link').forEach(b => b.onclick = () => goToSearchHit(Number(b.dataset.i)));
}

function goToSearchHit(i) {
  const hits = state.searchHits;
  if (!hits.length) return;
  i = ((i % hits.length) + hits.length) % hits.length;
  state.searchIdx = i;
  const h = hits[i];
  if (state.activeDocId !== h.docId) openDocument(h.docId);
  else renderViewer();
  const els = document.querySelectorAll(`#viewerBody [data-hit="${i}"]`);
  if (els[0]) els[0].scrollIntoView({ block: 'center' });
  els.forEach(x => { x.classList.remove('seg-flash'); void x.offsetWidth; x.classList.add('seg-flash'); });
  renderSearchResults();
  document.querySelector(`#searchResults .search-link[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' });
}

function runTextSearch() {
  computeSearchHits();
  renderSearchResults();
  if (state.activeTab === 'code') renderViewer();
}

function setupTextSearchEvents() {
  const inp = document.getElementById('textSearchInput');
  let timer = null;
  inp.addEventListener('input', () => {
    state.textQuery = inp.value;
    clearTimeout(timer);
    timer = setTimeout(runTextSearch, 180);
    document.getElementById('textSearchClear').classList.toggle('hidden', !inp.value);
  });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(timer);
      if (state.textQuery !== inp.value || !state.searchHits.length) { state.textQuery = inp.value; computeSearchHits(); }
      goToSearchHit(state.searchIdx < 0 ? (e.shiftKey ? -1 : 0) : state.searchIdx + (e.shiftKey ? -1 : 1));
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      clearTextSearch();
    }
  });
  document.getElementById('textSearchClear').onclick = clearTextSearch;
  // Ctrl/⌘+F inside the coding tab: focus the search box (the browser's own find does not see other documents)
  document.addEventListener('keydown', (e) => {
    if (state.activeTab === 'code' && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault(); inp.focus(); inp.select();
    }
  });
}
function clearTextSearch() {
  const inp = document.getElementById('textSearchInput');
  inp.value = '';
  state.textQuery = '';
  runTextSearch();
}

// ========================================================
// SPLIT A CODE (the reverse of merging)
// ========================================================
function openSplitModal(codeId) {
  const c = codeById(codeId);
  if (!c) return;
  const modal = document.getElementById('splitModal');
  const segs = segmentsForCode(codeId);
  document.getElementById('splitTitle').textContent = tr('split.title', { code: c.name });
  const nameInp = document.getElementById('splitName');
  nameInp.value = '';
  document.getElementById('splitCodeOptions').innerHTML = sortedCodes().filter(x => x.id !== codeId).map(x => `<option value="${escapeHtml(x.name)}"></option>`).join('');
  document.getElementById('splitFilter').value = '';
  document.getElementById('splitReason').value = '';
  document.getElementById('splitKeep').checked = false;
  const sameThemes = document.getElementById('splitSameThemes');
  sameThemes.checked = c.themeIds.length > 0;
  sameThemes.closest('label').classList.toggle('hidden', !c.themeIds.length);
  const list = document.getElementById('splitList');
  list.innerHTML = segs.map(s => {
    const doc = docById(s.docId);
    const parts = participantLabels(participantsForRange(s.docId, s.s, s.e));
    return `<label class="split-row flex items-start gap-2 px-2 py-1.5 border-b border-slate-100 hover:bg-slate-50 cursor-pointer" data-text="${escapeHtml(foldForSearch(`${s.text} ${s.memo || ''} ${parts} ${doc?.name || ''}`))}">
      <input type="checkbox" class="split-chk mt-0.5" value="${s.id}">
      <span class="flex-1 min-w-0 text-xs leading-snug">
        <span class="text-slate-700">${s.key ? '<span class="text-amber-500">★</span> ' : ''}“${escapeHtml(clip(s.text, 240))}”</span>
        <span class="block text-[10px] text-slate-400 mt-0.5">${escapeHtml(parts || tr('seg.noParticipant'))} · ${escapeHtml(doc?.name || '')}${s.codeIds.length > 1 ? ` · ${escapeHtml(tr('split.alsoCoded', { codes: s.codeIds.filter(x => x !== codeId).map(x => codeById(x)?.name).filter(Boolean).join(', ') }))}` : ''}</span>
        ${s.memo ? `<span class="block text-[10px] text-purple-700 mt-0.5">${escapeHtml(clip(s.memo, 140))}</span>` : ''}
      </span>
    </label>`;
  }).join('');
  const okBtn = document.getElementById('splitOk');
  const update = () => {
    const n = list.querySelectorAll('.split-chk:checked').length;
    okBtn.textContent = tr(document.getElementById('splitKeep').checked ? 'split.okCopy' : 'split.ok', { n });
    okBtn.disabled = !n;
  };
  list.onchange = update;
  document.getElementById('splitKeep').onchange = update;
  document.getElementById('splitFilter').oninput = (e) => {
    const q = foldForSearch(e.target.value.trim());
    list.querySelectorAll('.split-row').forEach(r => r.classList.toggle('hidden', !!q && !r.dataset.text.includes(q)));
  };
  document.getElementById('splitAll').onclick = () => {
    const visible = [...list.querySelectorAll('.split-row:not(.hidden) .split-chk')];
    const on = visible.some(x => !x.checked);
    visible.forEach(x => x.checked = on);
    update();
  };
  update();
  okBtn.onclick = async () => {
    const name = nameInp.value.replace(/\s+/g, ' ').trim();
    if (!name) { alert(tr('split.needName')); nameInp.focus(); return; }
    if (name.toLowerCase() === c.name.toLowerCase()) { alert(tr('split.sameName')); nameInp.focus(); return; }
    const ids = [...list.querySelectorAll('.split-chk:checked')].map(x => x.value);
    if (!ids.length) return;
    modal.classList.add('hidden');
    await splitCode(codeId, ids, name, { keep: document.getElementById('splitKeep').checked, sameThemes: sameThemes.checked, reason: document.getElementById('splitReason').value.trim() });
  };
  modal.classList.remove('hidden');
  nameInp.focus();
}

async function splitCode(sourceId, segIds, name, { keep = false, sameThemes = true, reason = '' } = {}) {
  const src = codeById(sourceId);
  if (!src) return;
  const existing = state.codes.find(x => x.name.toLowerCase() === name.toLowerCase());
  pushUndo(['undo.split', { src: src.name, tgt: existing?.name || name }], ['codes', 'segments']);
  const { code: tgt, saved } = makeCode(name);
  await saved;
  if (sameThemes) for (const t of src.themeIds) if (!tgt.themeIds.includes(t)) tgt.themeIds.push(t);
  const changed = [];
  for (const s of state.segments) {
    if (!segIds.includes(s.id) || !s.codeIds.includes(sourceId)) continue;
    if (!keep) s.codeIds = s.codeIds.filter(x => x !== sourceId);
    if (!s.codeIds.includes(tgt.id)) s.codeIds.push(tgt.id);
    changed.push(s);
  }
  commitUndo();
  renderAll();
  await dbPut('codes', tgt);
  await dbPutMany('segments', changed);
  await recordLog({ category: 'codebook', ak: keep ? 'log.codeSplitCopy' : 'log.codeSplit', ap: { src: src.name, tgt: tgt.name }, dk: 'log.d.recoded', dp: { n: changed.length }, from: src.name, to: tgt.name, reason });
  showToast(tr('toast.split', { n: changed.length, tgt: tgt.name }), 'success');
}

// ========================================================
// EXTRACT FILTER (read the extracts of one group or one participant)
// ========================================================
// Shown in the codebook (tab 1) and the code pool (tab 2); also narrows the full-text search.
function extractFilterValue(f = state.extractFilter) {
  if (!f) return '';
  return f.type === 'par' ? `par\u0001${f.id}` : `attr\u0001${f.key}\u0001${f.value}`;
}
function renderExtractFilters() {
  const keys = new Map(); // attribute → Set of values
  for (const p of countedParticipants()) {
    for (const [k, v] of Object.entries(p.attributes || {})) {
      const val = String(v ?? '').trim();
      if (!val) continue;
      if (!keys.has(k)) keys.set(k, new Set());
      keys.get(k).add(val);
    }
  }
  const pars = [...countedParticipants()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  // A filter whose group no longer exists is dropped
  if (state.extractFilter && !(extractFilterParticipants() || new Set()).size) state.extractFilter = null;
  const cur = extractFilterValue();
  const opts = `<option value="">${escapeHtml(tr('xf.all'))}</option>`
    + [...keys.entries()].map(([k, vals]) => `<optgroup label="${escapeHtml(k)}">${[...vals].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(v => { const val = `attr\u0001${k}\u0001${v}`; return `<option value="${escapeHtml(val)}" ${val === cur ? 'selected' : ''}>${escapeHtml(`${k}: ${v}`)}</option>`; }).join('')}</optgroup>`).join('')
    + (pars.length ? `<optgroup label="${escapeHtml(tr('xf.participant'))}">${pars.map(p => { const val = `par\u0001${p.id}`; return `<option value="${escapeHtml(val)}" ${val === cur ? 'selected' : ''}>${escapeHtml(p.label)}</option>`; }).join('')}</optgroup>` : '');
  document.querySelectorAll('.extract-filter-host').forEach(host => {
    const on = !!state.extractFilter;
    host.innerHTML = `<div class="flex items-center gap-1">
        <i class="ph ph-funnel text-[11px] ${on ? 'text-amber-600' : 'text-slate-400'}"></i>
        <select class="extract-filter flex-1 min-w-0 text-[11px] border rounded px-1 py-0.5 ${on ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold' : 'bg-white border-slate-200 text-slate-600'}" title="${escapeHtml(tr('xf.title'))}">${opts}</select>
        ${on ? `<button class="extract-filter-clear text-slate-400 hover:text-slate-700 cursor-pointer" title="${escapeHtml(tr('xf.clear'))}"><i class="ph ph-x text-[11px]"></i></button>` : ''}
      </div>
      ${on ? `<div class="text-[10px] text-amber-800 leading-snug mt-0.5">${escapeHtml(tr('xf.note'))}</div>` : ''}`;
    host.querySelector('.extract-filter').onchange = (e) => setExtractFilter(e.target.value);
    host.querySelector('.extract-filter-clear')?.addEventListener('click', () => setExtractFilter(''));
  });
}
function setExtractFilter(value) {
  const [type, a, b] = String(value || '').split('\u0001');
  state.extractFilter = type === 'par' ? { type: 'par', id: a } : type === 'attr' ? { type: 'attr', key: a, value: b } : null;
  if (state.textQuery.trim()) { computeSearchHits(); renderSearchResults(); }
  if (state.activeTab === 'code') { renderViewer(); renderCodebook(); }
  else if (state.activeTab === 'themes') renderThemesView();
}
// A list of extracts that follows the filter (codebook, code pool, theme cards)
function extractListHtml(segs) {
  const shown = filterSegments(segs);
  if (shown.length) return shown.map(s => extractLinkHtml(s)).join('');
  const msg = segs.length && state.extractFilter ? tr('xf.noneInGroup', { group: extractFilterLabel() }) : tr('code.noExtracts');
  return `<div class="text-[11px] text-slate-400">${escapeHtml(msg)}</div>`;
}
