// Thematic Analysis Canvas — Tab 1: Familiarise & Code (Braun & Clarke phases 1–2)
// MIT License · https://github.com/jdaeyun/thematic-analysis-canvas
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
    el.innerHTML = `<div class="text-[11px] text-slate-400 px-2 py-3 leading-relaxed">No documents yet. Import .txt, .csv, .docx or .doc files, or drop them on the window.</div>`;
    return;
  }
  const icon = { txt: 'ph-file-text', csv: 'ph-file-csv', docx: 'ph-file-doc', doc: 'ph-file-doc' };
  el.innerHTML = state.docs.map(d => {
    const n = state.segments.filter(s => s.docId === d.id).length;
    const active = d.id === state.activeDocId;
    return `<button data-doc="${d.id}" class="doc-item w-full text-left px-2 py-1.5 rounded-md flex items-center space-x-2 text-xs cursor-pointer ${active ? 'bg-indigo-50 text-indigo-800 font-semibold border border-indigo-200' : 'hover:bg-slate-50 text-slate-700 border border-transparent'}">
      <i class="ph ${icon[d.kind] || 'ph-file'} text-sm shrink-0"></i>
      <span class="truncate flex-1" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</span>
      <span class="text-[10px] text-slate-400 shrink-0" title="Coded extracts">${n}</span>
    </button>`;
  }).join('');
  el.querySelectorAll('.doc-item').forEach(b => b.onclick = () => openDocument(b.dataset.doc));
}

function openDocument(docId, flashSegId = null) {
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
    el.innerHTML = `<div class="text-[11px] text-slate-400 px-2 py-2 leading-relaxed">Add participants, or use “Detect speakers” on a transcript. CSV imports create them from the ID column.</div>`;
    return;
  }
  const hasSel = !!state.pendingSel;
  el.innerHTML = [...state.participants].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })).map(p => {
    const nDocs = new Set(state.ptags.filter(t => t.participantId === p.id).map(t => t.docId).concat(state.docs.filter(d => d.defaultParticipantId === p.id).map(d => d.id))).size;
    const attrs = Object.entries(p.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
    return `<div class="par-item group flex items-center space-x-1.5 px-2 py-1 rounded-md hover:bg-slate-50 text-xs" draggable="true" data-par="${p.id}" title="${escapeHtml(attrs || 'Drag onto a line, or select text and press Tag')}">
      <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${p.color}"></span>
      <span class="truncate flex-1 font-medium ${p.role === 'interviewer' ? 'text-slate-400' : 'text-slate-700'}">${escapeHtml(p.label)}${p.role === 'interviewer' ? ' <span class="text-[9px] font-bold uppercase text-slate-400 border border-slate-200 rounded px-1">interviewer</span>' : ''}</span>
      <span class="text-[10px] text-slate-400">${nDocs}</span>
      ${hasSel ? `<button class="par-tag px-1.5 py-0.5 text-[10px] font-bold rounded bg-teal-600 text-white cursor-pointer" title="Tag the selected text as spoken by ${escapeHtml(p.label)}">Tag</button>` : ''}
      <button class="par-edit opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 cursor-pointer" title="Edit participant"><i class="ph ph-pencil-simple"></i></button>
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
  if (state.participants.some(p => p.label === label)) { showToast(`${label} already exists`); return; }
  const p = await ensureParticipant(label);
  await recordLog({ category: 'participants', action: `Added participant ${p.label}` });
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
    if (label !== p.label && state.participants.some(x => x.label === label)) { alert(`${label} already exists.`); return; }
    const attrs = {};
    for (const line of document.getElementById('parEditAttrs').value.split('\n')) {
      const m = line.match(/^\s*([^:：]+?)\s*[:：]\s*(.*)$/);
      if (m && m[1]) attrs[m[1]] = m[2].trim();
    }
    if (label !== p.label) await recordLog({ category: 'participants', action: 'Renamed participant', from: p.label, to: label });
    const role = document.getElementById('parEditInterviewer').checked ? 'interviewer' : 'participant';
    if (role !== (p.role || 'participant')) await recordLog({ category: 'participants', action: `${label} marked as ${role}` });
    p.label = label;
    p.attributes = attrs;
    p.role = role;
    await dbPut('participants', p);
    modal.classList.add('hidden');
    renderAll();
  };
  document.getElementById('parEditDelete').onclick = async () => {
    if (!confirm(`Delete participant ${p.label}? Their speaker tags are removed; coded extracts stay.`)) return;
    pushUndo(`Delete participant ${p.label}`, ['participants', 'ptags', 'docs']);
    const gone = state.ptags.filter(t => t.participantId === pid).map(t => t.id);
    state.ptags = state.ptags.filter(t => t.participantId !== pid);
    await dbDeleteMany('ptags', gone);
    for (const d of state.docs) if (d.defaultParticipantId === pid) { d.defaultParticipantId = null; await dbPut('docs', d); }
    state.participants = state.participants.filter(x => x.id !== pid);
    await dbDelete('participants', pid);
    await recordLog({ category: 'participants', action: `Deleted participant ${p.label}` });
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
  document.getElementById('docMeta').textContent = `${doc.kind.toUpperCase()} · ${doc.encoding} · ${doc.text.length.toLocaleString()} chars · ${doc.blocks.length} ${doc.kind === 'csv' ? 'answers' : 'lines'}`;
  const sel = document.getElementById('docDefaultParticipant');
  sel.innerHTML = `<option value="">— none —</option>` + state.participants.map(p => `<option value="${p.id}" ${doc.defaultParticipantId === p.id ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('');
  const note = document.getElementById('docNote');
  if (document.activeElement !== note) note.value = doc.note || '';
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
  body.innerHTML = doc.blocks.map((b, bi) => renderBlock(doc, b, bi, segs, pts, showLabels)).join('');
  scroller.scrollTop = resetScroll ? 0 : top;
}

function renderBlock(doc, b, bi, segs, pts, showLabels) {
  const inBlock = segs.filter(s => s.s < b.e && s.e > b.s);
  const cuts = new Set([b.s, b.e]);
  for (const s of inBlock) { cuts.add(Math.max(s.s, b.s)); cuts.add(Math.min(s.e, b.e)); }
  const pos = [...cuts].sort((x, y) => x - y);
  let html = '';
  for (let i = 0; i < pos.length - 1; i++) {
    const a = pos[i], z = pos[i + 1];
    if (z <= a) continue;
    const txt = escapeHtml(doc.text.slice(a, z));
    const cover = inBlock.filter(s => s.s <= a && s.e >= z);
    if (!cover.length) { html += `<span data-s="${a}">${txt}</span>`; continue; }
    const codeIds = [];
    for (const s of cover) for (const c of s.codeIds) if (!codeIds.includes(c)) codeIds.push(c);
    const colors = codeIds.map(id => codeById(id)?.color).filter(Boolean);
    const bg = hexAlpha(colors[0] || '#94a3b8', codeIds.length > 1 ? 0.34 : 0.24);
    const shadows = colors.slice(0, 4).map((c, k) => `inset 0 -${(k + 1) * 3}px 0 ${c}`).join(',');
    const active = cover.some(s => s.id === state.activeSegId) ? ' seg-active' : '';
    const title = codeIds.map(id => codeById(id)?.name).filter(Boolean).join(' · ');
    html += `<span class="seg${active}" data-s="${a}" data-segs="${cover.map(s => s.id).join(' ')}" style="background:${bg};box-shadow:${shadows}" title="${escapeHtml(title)}">${txt}</span>`;
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
    return c ? `<button class="margin-chip${s.id === state.activeSegId ? ' ring-2 ring-indigo-400' : ''}" data-seg="${s.id}" style="border-color:${c.color};color:${c.color}" title="${escapeHtml(c.name)}${s.key ? ' (key extract)' : ''}">${s.key ? '★ ' : ''}${escapeHtml(clip(c.name, 22))}</button>` : '';
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
}

// ========================================================
// CODING ACTIONS
// ========================================================
async function applyCodeToRange(codeId, range) {
  const code = codeById(codeId);
  const doc = docById(range.docId);
  if (!code || !doc) return;
  let seg = state.segments.find(x => x.docId === doc.id && x.s === range.s && x.e === range.e);
  if (seg && seg.codeIds.includes(codeId)) { showToast(`Already coded with “${code.name}”`); return; }
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
  await recordLog({ category: 'coding', action: `Coded extract with “${code.name}”`, detail: `${doc.name} · “${clip(seg.text, 120)}”` });
}

// Adds the code to state at once (so it can be applied and rendered in the same tick); `saved` persists it
function makeCode(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  if (!clean) return { code: null, saved: Promise.resolve() };
  const existing = state.codes.find(c => c.name.toLowerCase() === clean.toLowerCase());
  if (existing) return { code: existing, saved: Promise.resolve() };
  const code = { id: uid('code'), name: clean, description: '', color: nextCodeColor(), themeIds: [], createdAt: Date.now(), order: state.codes.length };
  state.codes.push(code);
  const saved = dbPut('codes', code).then(() => recordLog({ category: 'codebook', action: `Created code “${code.name}”` }));
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
  else { renderCodebook(); showToast(`Code “${code.name}” ready — select text, then click it`); }
  await saved;
  await applied;
}

async function inVivoCode() {
  if (!state.pendingSel) { showToast('Select a short phrase in the text first'); return; }
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
  await recordLog({ category: 'participants', action: `Tagged text as ${p.label}`, detail: `${doc.name} · “${clip(doc.text.slice(s, e), 100)}”` });
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
  if (!found.size) { alert('No speaker labels found. Lines need to start like “A: …”, “P01：…” or “インタビュアー：…”.'); return; }
  const list = [...found.entries()].map(([k, v]) => `• ${k} — ${v.length} line${v.length > 1 ? 's' : ''}`).join('\n');
  if (!confirm(`Speakers found in “${doc.name}”:\n\n${list}\n\nTag each line with its speaker? Existing speaker tags on those lines are replaced. Labels such as I, Interviewer or インタビュアー are marked as interviewer and are not counted as participants (change this in Edit participant).`)) return;
  pushUndo(`Detect speakers in ${doc.name}`, ['ptags', 'participants']);
  const lineIdx = new Set([...found.values()].flat());
  const keep = state.ptags.filter(t => t.docId !== doc.id || !doc.blocks.some((b, i) => lineIdx.has(i) && t.s < b.e && t.e > b.s));
  const removed = state.ptags.filter(t => !keep.includes(t)).map(t => t.id);
  const add = [];
  for (const [label, idxs] of found) {
    const p = await ensureParticipant(label);
    for (const i of idxs) add.push({ id: uid('pt'), docId: doc.id, s: doc.blocks[i].s, e: doc.blocks[i].e, participantId: p.id });
  }
  state.ptags = keep.concat(add);
  await dbDeleteMany('ptags', removed);
  await dbPutMany('ptags', add);
  await recordLog({ category: 'participants', action: `Detected speakers in “${doc.name}”`, detail: [...found.keys()].join(', ') });
  renderAll();
}

async function deleteActiveDocument() {
  const doc = docById(state.activeDocId);
  if (!doc) return;
  const n = state.segments.filter(s => s.docId === doc.id).length;
  if (!confirm(`Remove “${doc.name}” from the project?${n ? ` Its ${n} coded extract(s) are removed too.` : ''} (You can undo.)`)) return;
  pushUndo(`Remove document ${doc.name}`, ['docs', 'segments', 'ptags']);
  const segIds = state.segments.filter(s => s.docId === doc.id).map(s => s.id);
  const ptIds = state.ptags.filter(t => t.docId === doc.id).map(t => t.id);
  state.segments = state.segments.filter(s => s.docId !== doc.id);
  state.ptags = state.ptags.filter(t => t.docId !== doc.id);
  state.docs = state.docs.filter(d => d.id !== doc.id);
  await dbDeleteMany('segments', segIds);
  await dbDeleteMany('ptags', ptIds);
  await dbDelete('docs', doc.id);
  await recordLog({ category: 'import', action: `Removed document “${doc.name}”`, detail: `${n} coded extract(s) removed` });
  state.activeDocId = state.docs[0]?.id || null;
  state.activeSegId = null;
  renderAll();
}

// ========================================================
// RIGHT: SELECTION, CODEBOOK, SEGMENT DETAILS
// ========================================================
function renderSelectionPanel() {
  const el = document.getElementById('selectionPanel');
  const ps = state.pendingSel;
  if (!ps) {
    el.innerHTML = `<div class="text-[11px] text-slate-500 leading-relaxed"><b>How to code:</b> select text, then click a code (or type a new one and press Enter). You can also drag a code onto a line. Click highlighted text to see its codes.</div>`;
    return;
  }
  el.innerHTML = `
    <div class="flex items-center justify-between mb-1">
      <span class="text-[11px] font-bold text-indigo-700 uppercase tracking-wide">Selected text</span>
      <button id="selClear" class="text-[11px] text-slate-400 hover:text-slate-700 cursor-pointer">Clear (Esc)</button>
    </div>
    <div class="text-xs text-slate-700 bg-white border border-indigo-200 rounded p-2 max-h-24 overflow-y-auto leading-relaxed">“${escapeHtml(clip(ps.text, 400))}”</div>
    <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
      <button id="selInVivo" class="px-2 py-1 text-[11px] font-bold rounded bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer" title="Create a code named with these exact words">In-vivo code</button>
      <button id="selClearPar" class="px-2 py-1 text-[11px] rounded bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer" title="Remove speaker tags inside the selection">Clear speaker</button>
      <span class="text-[10px] text-slate-400">Speaker: press “Tag” in the participant list</span>
    </div>`;
  el.querySelector('#selClear').onclick = clearPendingSelection;
  el.querySelector('#selInVivo').onclick = inVivoCode;
  el.querySelector('#selClearPar').onclick = clearParticipantInSelection;
}

function renderCodebook() {
  const el = document.getElementById('codeList');
  const q = state.codeFilter.toLowerCase();
  const codes = sortedCodes().filter(c => !q || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
  document.getElementById('codeCount').textContent = String(state.codes.length);
  if (!state.codes.length) {
    el.innerHTML = `<div class="text-[11px] text-slate-400 px-1 py-2">No codes yet. Type one above and press Enter.</div>`;
    return;
  }
  const hasSel = !!state.pendingSel;
  el.innerHTML = codes.map(c => {
    const segs = segmentsForCode(c.id);
    const cov = coverage(segs);
    const open = state.openCodeExtracts.has(c.id);
    const themes = c.themeIds.map(t => themeById(t)?.name).filter(Boolean);
    return `<div class="code-item rounded-md border ${hasSel ? 'border-indigo-200 hover:bg-indigo-50' : 'border-transparent hover:bg-slate-50'}" data-code="${c.id}">
      <div class="code-row flex items-center space-x-1.5 px-1.5 py-1 cursor-pointer" draggable="true" title="${escapeHtml(c.description || (hasSel ? 'Click to code the selection' : 'Click to list extracts; drag onto a line to code it'))}">
        <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:${c.color}"></span>
        <span class="flex-1 text-xs text-slate-800 truncate">${escapeHtml(c.name)}</span>
        ${themes.length ? `<i class="ph ph-shapes text-[11px] text-slate-400" title="In theme: ${escapeHtml(themes.join(', '))}"></i>` : ''}
        <span class="text-[10px] text-slate-400 shrink-0" title="${segs.length} extracts · ${cov.participants.size} participants">${segs.length}<span class="text-slate-300">/</span>${cov.participants.size}</span>
        <button class="code-edit text-slate-300 hover:text-slate-700 cursor-pointer" title="Edit, merge or delete"><i class="ph ph-dots-three-vertical"></i></button>
      </div>
      ${open ? `<div class="px-2 pb-2 space-y-1">${segs.length ? segs.map(s => extractLinkHtml(s)).join('') : '<div class="text-[11px] text-slate-400">No extracts yet.</div>'}</div>` : ''}
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
    <span class="block text-[10px] text-slate-400 mt-0.5">${escapeHtml(parts || 'no participant')} · ${escapeHtml(doc?.name || '')}</span>
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
  merge.innerHTML = `<option value="">— merge into another code —</option>` + sortedCodes().filter(x => x.id !== c.id).map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
  document.getElementById('codeEditUsage').textContent = `${segmentsForCode(c.id).length} extracts`;
  modal.classList.remove('hidden');

  document.getElementById('codeEditSave').onclick = async () => {
    const name = document.getElementById('codeEditName').value.replace(/\s+/g, ' ').trim();
    const desc = document.getElementById('codeEditDesc').value.trim();
    const color = document.getElementById('codeEditColor').value;
    if (!name) { alert('A code needs a name.'); return; }
    if (name.toLowerCase() !== c.name.toLowerCase() && state.codes.some(x => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase())) {
      alert(`A code called “${name}” already exists. Use “Merge” instead.`); return;
    }
    if (name !== c.name) await recordLog({ category: 'codebook', action: 'Renamed code', from: c.name, to: name });
    if (desc !== (c.description || '')) await recordLog({ category: 'codebook', action: `Updated description of “${name}”`, from: c.description || '', to: desc });
    c.name = name; c.description = desc; c.color = color;
    await dbPut('codes', c);
    const target = merge.value;
    modal.classList.add('hidden');
    if (target) await mergeCodes(c.id, target);
    renderAll();
  };
  document.getElementById('codeEditDelete').onclick = async () => {
    const n = segmentsForCode(c.id).length;
    if (!confirm(`Delete code “${c.name}”?${n ? ` It is removed from ${n} extract(s); extracts with no other code are removed.` : ''} (You can undo.)`)) return;
    modal.classList.add('hidden');
    await deleteCode(c.id);
  };
}

async function mergeCodes(sourceId, targetId) {
  const src = codeById(sourceId), tgt = codeById(targetId);
  if (!src || !tgt) return;
  pushUndo(`Merge “${src.name}” into “${tgt.name}”`, ['codes', 'segments']);
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
  await dbPutMany('segments', changed);
  await dbPut('codes', tgt);
  await dbDelete('codes', sourceId);
  await recordLog({ category: 'codebook', action: `Merged code “${src.name}” into “${tgt.name}”`, detail: `${changed.length} extract(s) recoded`, from: src.name, to: tgt.name });
  showToast(`Merged into “${tgt.name}”`, 'success');
  renderAll();
}

async function deleteCode(codeId) {
  const c = codeById(codeId);
  if (!c) return;
  pushUndo(`Delete code “${c.name}”`, ['codes', 'segments']);
  const changed = [], removed = [];
  for (const s of state.segments) {
    if (!s.codeIds.includes(codeId)) continue;
    s.codeIds = s.codeIds.filter(x => x !== codeId);
    (s.codeIds.length ? changed : removed).push(s);
  }
  state.segments = state.segments.filter(s => !removed.includes(s));
  state.codes = state.codes.filter(x => x.id !== codeId);
  await dbPutMany('segments', changed);
  await dbDeleteMany('segments', removed.map(s => s.id));
  await dbDelete('codes', codeId);
  await recordLog({ category: 'codebook', action: `Deleted code “${c.name}”`, detail: `${changed.length + removed.length} extract(s) affected` });
  if (removed.some(s => s.id === state.activeSegId)) state.activeSegId = null;
  renderAll();
}

function renderSegmentPanel() {
  const el = document.getElementById('segmentPanel');
  const seg = state.segments.find(s => s.id === state.activeSegId);
  if (!seg) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  const parts = participantsForRange(seg.docId, seg.s, seg.e);
  const others = sortedCodes().filter(c => !seg.codeIds.includes(c.id));
  el.innerHTML = `
    <div class="flex items-center justify-between mb-1.5">
      <span class="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Coded extract</span>
      <div class="flex items-center gap-1">
        <button id="segKey" class="px-1.5 py-0.5 text-[11px] rounded border cursor-pointer ${seg.key ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}" title="Mark as a key extract for the write-up (used first in the theme table)">${seg.key ? '★ Key extract' : '☆ Key extract'}</button>
        <button id="segClose" class="text-slate-400 hover:text-slate-700 cursor-pointer px-1" title="Close"><i class="ph ph-x"></i></button>
      </div>
    </div>
    <div class="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 max-h-28 overflow-y-auto leading-relaxed">“${escapeHtml(seg.text)}”</div>
    <div class="text-[10px] text-slate-500 mt-1">Participant: <b>${escapeHtml(participantLabels(parts) || '—')}</b>${seg.createdBy ? ` · coded by ${escapeHtml(seg.createdBy)}` : ''}</div>
    <div class="flex flex-wrap gap-1 mt-2">
      ${seg.codeIds.map(cid => { const c = codeById(cid); return c ? `<span class="inline-flex items-center gap-1 text-[11px] pl-1.5 pr-1 py-0.5 rounded border" style="border-color:${c.color};background:${hexAlpha(c.color, 0.12)}">${escapeHtml(c.name)}<button class="seg-uncode text-slate-400 hover:text-rose-600 cursor-pointer" data-code="${cid}" title="Remove this code from the extract"><i class="ph ph-x text-[10px]"></i></button></span>` : ''; }).join('')}
    </div>
    ${others.length ? `<select id="segAddCode" class="mt-2 w-full text-[11px] border border-slate-300 rounded px-1.5 py-1 bg-white"><option value="">+ Add another code to this extract…</option>${others.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select>` : ''}
    <textarea id="segMemo" rows="2" placeholder="Analytic memo on this extract…" class="mt-2 w-full text-[11px] border border-slate-300 rounded px-2 py-1 resize-y focus:outline-none focus:border-indigo-500">${escapeHtml(seg.memo || '')}</textarea>
    <button id="segDelete" class="mt-1 text-[11px] text-rose-600 hover:underline cursor-pointer">Remove extract (all codes)</button>`;
  el.querySelector('#segClose').onclick = () => { state.activeSegId = null; renderViewer(); renderSegmentPanel(); };
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
    await recordLog({ category: 'coding', action: `Removed code “${c?.name}” from extract`, detail: `“${clip(seg.text, 120)}”` });
    renderViewer(); renderCodebook(); renderSegmentPanel();
  });
  const add = el.querySelector('#segAddCode');
  if (add) add.onchange = () => add.value && applyCodeToRange(add.value, seg);
  const memo = el.querySelector('#segMemo');
  memo.onchange = async () => { seg.memo = memo.value.trim(); await dbPut('segments', seg); };
  el.querySelector('#segDelete').onclick = () => deleteSegment(seg);
}

async function deleteSegment(seg) {
  pushUndo('Remove coded extract', ['segments']);
  state.segments = state.segments.filter(s => s.id !== seg.id);
  await dbDelete('segments', seg.id);
  await recordLog({ category: 'coding', action: 'Removed coded extract', detail: `${seg.codeIds.map(c => codeById(c)?.name).filter(Boolean).join(', ')} · “${clip(seg.text, 120)}”` });
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
  document.getElementById('detectSpeakersBtn').onclick = detectSpeakers;
  document.getElementById('deleteDocBtn').onclick = deleteActiveDocument;
  document.getElementById('docDefaultParticipant').onchange = async (e) => {
    const doc = docById(state.activeDocId);
    if (!doc) return;
    doc.defaultParticipantId = e.target.value || null;
    await dbPut('docs', doc);
    await recordLog({ category: 'participants', action: `Set default participant of “${doc.name}”`, to: participantById(doc.defaultParticipantId)?.label || '—' });
    renderViewer(); renderParticipantList();
  };
  document.getElementById('docNoteToggle').onclick = () => document.getElementById('docNotePanel').classList.toggle('hidden');
  document.getElementById('docNote').addEventListener('change', async (e) => {
    const doc = docById(state.activeDocId);
    if (!doc) return;
    const had = !!doc.note;
    doc.note = e.target.value.trim();
    await dbPut('docs', doc);
    if (!had && doc.note) await recordLog({ category: 'familiarisation', action: `Added familiarisation notes for “${doc.name}”` });
    renderDocHeader();
  });
  setupViewerEvents();
}
