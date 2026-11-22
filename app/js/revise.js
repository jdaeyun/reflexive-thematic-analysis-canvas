// Reflexive Thematic Analysis Canvas — replacing a document with a corrected version
// MIT License · https://github.com/jdaeyun/reflexive-thematic-analysis-canvas
// The imported text is fixed, and everything points at character offsets in it. When the researcher corrects the
// source file (a missed pseudonym, a transcription error), the corrected file is read the same way as at import, the
// old and new texts are compared (lines first, then characters inside changed lines), and coded extracts, speaker
// tags and blocks are moved onto the new text. Nothing is guessed: the old text is still here, so this is an exact
// alignment, not fuzzy matching. The change, its reason and what it did to the extracts go into the analysis record.
// For a missed pseudonym the old wording is never written to the record, the quotes in the record are corrected too,
// and undo is cleared (an undo would bring the name back).

// ---- Diff (Myers, O((N+M)·D)) over two arrays; returns runs of '=', '-', '+' with lengths in elements ----
function myersDiff(a, b, maxD = 4000) {
  const n = a.length, m = b.length, max = n + m;
  const v = new Map([[1, 0]]);
  const trace = [];
  for (let d = 0; d <= Math.min(max, maxD); d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1))) ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v.set(k, x);
      if (x >= n && y >= m) return backtrack(trace, n, m);
    }
  }
  return null; // too different: the caller treats the whole range as replaced
}
function backtrack(trace, n, m) {
  const runs = [];
  const push = (t) => { const last = runs[0]; if (last && last.t === t) last.n++; else runs.unshift({ t, n: 1 }); };
  let x = n, y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const v = trace[d], k = x - y;
    const prevK = (k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1))) ? k + 1 : k - 1;
    const prevX = v.get(prevK) ?? 0, prevY = prevX - prevK;
    while (x > prevX && y > prevY) { push('='); x--; y--; }
    if (d > 0) { if (x === prevX) push('+'); else push('-'); }
    x = prevX; y = prevY;
  }
  while (x > 0 && y > 0) { push('='); x--; y--; }
  return runs;
}

// Character-level edit script between two texts: [{ eq: true, o, n } | { eq: false, o, n }] (o, n = lengths in old / new)
function textEditScript(oldText, newText) {
  const ops = [];
  const add = (eq, o, n) => {
    if (!o && !n) return;
    const last = ops[ops.length - 1];
    if (last && last.eq === eq) { last.o += o; last.n += n; } else ops.push({ eq, o, n });
  };
  const charDiff = (a, b) => {
    // common prefix / suffix first, then Myers on what is left (small for corrections)
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    add(true, p, p);
    const am = a.slice(p, a.length - s), bm = b.slice(p, b.length - s);
    // Myers on code points (a surrogate pair is never split), lengths converted back to UTF-16
    const A = [...am], B = [...bm];
    const runs = (A.length && B.length) ? myersDiff(A, B, 1500) : null;
    if (runs) {
      let i = 0, j = 0;
      for (const r of runs) {
        if (r.t === '=') { const t = A.slice(i, i + r.n).join(''); add(true, t.length, t.length); i += r.n; j += r.n; }
        else if (r.t === '-') { add(false, A.slice(i, i + r.n).join('').length, 0); i += r.n; }
        else { add(false, 0, B.slice(j, j + r.n).join('').length); j += r.n; }
      }
    } else {
      // Too different to align character by character: fine for a short replaced phrase, but a long one would pull
      // every extract inside it onto the whole replacement, so the caller refuses it
      if (A.length && B.length && (A.length > 400 || B.length > 400)) ops.tooDifferent = true;
      add(false, am.length, bm.length);
    }
    add(true, s, s);
  };
  // Lines first: unchanged lines are matched cheaply, characters are compared only inside changed stretches
  const split = t => t.split(/(?<=\n)/);
  const A = split(oldText), B = split(newText);
  const runs = myersDiff(A, B, 1500);
  if (!runs) { ops.tooDifferent = true; return ops; }
  let i = 0, j = 0, pendO = '', pendN = '';
  const flush = () => { if (pendO || pendN) charDiff(pendO, pendN); pendO = ''; pendN = ''; };
  for (const r of runs) {
    if (r.t === '=') {
      flush();
      const t = A.slice(i, i + r.n).join('');
      add(true, t.length, t.length);
      i += r.n; j += r.n;
    } else if (r.t === '-') { pendO += A.slice(i, i + r.n).join(''); i += r.n; }
    else { pendN += B.slice(j, j + r.n).join(''); j += r.n; }
  }
  flush();
  return mergeNearbyChanges(ops, oldText);
}

// A character diff matches stray letters inside a replaced name ("Mr Tanaka" → "[Senior nurse]" shares a, n …).
// Two changes separated only by a short or within-word stretch are one change, as a person would read it.
function mergeNearbyChanges(ops, oldText) {
  const out = [];
  let o = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = { ...ops[i] };
    const prev = out[out.length - 1], next = ops[i + 1];
    if (op.eq && prev && !prev.eq && next && !next.eq) {
      const between = oldText.slice(o, o + op.o);
      if (op.o <= 4 || !/[\s\p{P}]/u.test(between)) { prev.o += op.o; prev.n += op.n; o += op.o; continue; }
    }
    if (!op.eq && prev && !prev.eq) { prev.o += op.o; prev.n += op.n; }
    else out.push(op);
    o += op.o;
  }
  if (ops.tooDifferent) out.tooDifferent = true;
  return out;
}

// Maps old offsets to new ones. start(): a start inside a replaced stretch goes to the start of its replacement and
// skips a pure insertion at that point; end(): an end inside a replaced stretch goes to the end of its replacement
// and stops before a pure insertion. A range that was only deleted collapses (start >= end).
function offsetMapper(ops) {
  return {
    start(p) {
      let o = 0, n = 0;
      for (const op of ops) {
        if (op.eq) { if (p < o + op.o) return n + (p - o); }
        else if (op.o > 0 && p < o + op.o) return n;
        o += op.o; n += op.n;
      }
      return n;
    },
    end(p) {
      let o = 0, n = 0;
      for (const op of ops) {
        if (op.eq) { if (p <= o + op.o) return n + (p - o); }
        else if (op.o > 0 && p <= o + op.o && p > o) return n + op.n;
        o += op.o; n += op.n;
      }
      return n;
    }
  };
}

// The replaced wordings, widened to whole words for Latin script (so "Yamada" → "Yamamoto" is one pair, not "da" → "moto")
const REVISE_WORD = /[A-Za-z0-9À-ɏ]/;
function changedFragments(oldText, newText, ops) {
  const out = [];
  let o = 0, n = 0;
  ops.forEach((op, idx) => {
    if (!op.eq) {
      let o0 = o, o1 = o + op.o, n0 = n, n1 = n + op.n;
      const prevEq = idx > 0 && ops[idx - 1].eq ? ops[idx - 1].o : 0;
      const nextEq = idx < ops.length - 1 && ops[idx + 1].eq ? ops[idx + 1].o : 0;
      let k = 0;
      while (k < prevEq && REVISE_WORD.test(oldText[o0 - k - 1] || '') && (REVISE_WORD.test(oldText[o0] || '') || REVISE_WORD.test(newText[n0] || '') || o0 === o1)) k++;
      o0 -= k; n0 -= k;
      let j = 0;
      while (j < nextEq && REVISE_WORD.test(oldText[o1 + j] || '') && (REVISE_WORD.test(oldText[o1 - 1] || '') || REVISE_WORD.test(newText[n1 - 1] || ''))) j++;
      o1 += j; n1 += j;
      // shared whitespace at either end is not part of the change
      while (o1 > o0 && n1 > n0 && /\s/.test(oldText[o1 - 1]) && oldText[o1 - 1] === newText[n1 - 1]) { o1--; n1--; }
      while (o1 > o0 && n1 > n0 && /\s/.test(oldText[o0]) && oldText[o0] === newText[n0]) { o0++; n0++; }
      out.push({ from: oldText.slice(o0, o1), to: newText.slice(n0, n1), at: o0, inserted: op.o === 0 });
    }
    o += op.o; n += op.n;
  });
  return out;
}

// ---- Plan: what the corrected version would do, before anything changes ----
function planRevision(doc, newText, newBlocks) {
  const ops = textEditScript(doc.text, newText);
  if (ops.tooDifferent) throw new Error(tr('revise.tooDifferent'));
  const map = offsetMapper(ops);
  const segs = state.segments.filter(s => s.docId === doc.id).map(seg => {
    const s = map.start(seg.s), e = map.end(seg.e);
    const text = s < e ? newText.slice(s, e) : '';
    return { seg, s, e, text, status: s >= e ? 'lost' : text === seg.text ? 'same' : 'changed' };
  });
  const ptags = state.ptags.filter(p => p.docId === doc.id).map(pt => ({ pt, s: map.start(pt.s), e: map.end(pt.e) }));
  const fragments = changedFragments(doc.text, newText, ops);
  // Old wordings worth looking for elsewhere (at least two characters: a single letter is everywhere)
  const removed = [...new Set(fragments.filter(f => !f.inserted).map(f => f.from.trim()).filter(f => [...f].length >= 2))];
  const writings = [];
  if (removed.length) {
    const has = t => typeof t === 'string' && removed.some(r => t.includes(r));
    const addW = (kind, item, field, label) => { if (has(item[field])) writings.push({ kind, item, field, label }); };
    for (const s of state.segments) addW('segments', s, 'memo', tr('revise.w.memo', { text: clip(s.text, 40) }));
    for (const d of state.docs) addW('docs', d, 'note', tr('revise.w.docNote', { doc: d.name }));
    for (const c of state.codes) addW('codes', c, 'description', tr('revise.w.code', { code: c.name }));
    for (const t of state.themes) for (const f of ['definition', 'reviewNote', 'narrative']) addW('themes', t, f, tr(`revise.w.theme.${f}`, { theme: t.name }));
    for (const f of ['storyline', 'conclusions', 'dataPrep']) addW('meta', state.meta, f, tr(`revise.w.meta.${f}`));
    for (const l of state.logs) {
      if (l.category === 'journal') addW('logs', l, 'detail', tr('revise.w.journal', { time: fmtTime(l.ts) }));
      addW('logs', l, 'reason', tr('revise.w.reason', { time: fmtTime(l.ts) }));
    }
  }
  const elsewhere = removed.length ? state.docs.filter(d => d.id !== doc.id && removed.some(r => d.text.includes(r))).map(d => d.name) : [];
  return { doc, newText, newBlocks, ops, segs, ptags, fragments, removed, writings, elsewhere,
    counts: { same: segs.filter(x => x.status === 'same').length, changed: segs.filter(x => x.status === 'changed').length, lost: segs.filter(x => x.status === 'lost').length, edits: fragments.length } };
}

// ---- Apply ----
// reason: 'pseudonym' | 'transcription' | 'other'; note: free text (optional, required for 'other' by the dialog)
async function applyRevision(plan, reason, note = '', { replaceInWritings = reason === 'pseudonym' } = {}) {
  flushAllPendingSaves();
  const pseudo = reason === 'pseudonym';
  const doc = plan.doc;
  const before = { meta: JSON.parse(JSON.stringify(state.meta)) };
  for (const c of COLLECTIONS) before[c] = JSON.parse(JSON.stringify(state[c]));
  if (!pseudo) pushUndo(['undo.revise', { doc: doc.name }], ['docs', 'segments', 'ptags', 'themes']);
  // Only replaced or deleted wording is looked for elsewhere (an insertion removes nothing); longest first
  const pairs = plan.fragments.filter(f => !f.inserted && [...f.from.trim()].length >= 2).sort((a, b) => b.from.length - a.from.length);
  const scrub = t => pairs.reduce((acc, f) => acc.split(f.from).join(f.to), t);

  // The document
  doc.text = plan.newText;
  doc.blocks = plan.newBlocks;
  // Extracts: moved, re-read from the new text, or removed when their text was deleted. Two extracts that now cover
  // the same range become one (one extract per exact range).
  const lost = new Set(plan.segs.filter(x => x.status === 'lost').map(x => x.seg.id));
  const byRange = new Map();
  for (const x of plan.segs) {
    if (lost.has(x.seg.id)) continue;
    Object.assign(x.seg, { s: x.s, e: x.e, text: x.text });
    const key = `${x.s}:${x.e}`, other = byRange.get(key);
    if (other) {
      other.codeIds = [...new Set([...other.codeIds, ...x.seg.codeIds])];
      other.memo = [other.memo, x.seg.memo].filter(Boolean).join('\n');
      other.key = other.key || x.seg.key;
      lost.add(x.seg.id);
    } else byRange.set(key, x.seg);
  }
  state.segments = state.segments.filter(s => !lost.has(s.id));
  // Speaker tags follow the same mapping (they cannot start to overlap: the mapping keeps the order)
  const goneTags = new Set();
  for (const x of plan.ptags) { if (x.s >= x.e) goneTags.add(x.pt.id); else Object.assign(x.pt, { s: x.s, e: x.e }); }
  state.ptags = state.ptags.filter(p => !goneTags.has(p.id));

  if (pseudo) {
    // Quotes the app wrote into the record (and journal context) are corrected; what the researcher wrote only if chosen
    for (const l of state.logs) {
      if (QUOTING_LOGS.has(l.ak)) for (const f of ['detail', 'from', 'to']) if (typeof l[f] === 'string') l[f] = scrub(l[f]);
      if (l.ctx) for (const k of ['extract', 'quote']) if (l.ctx[k] && typeof l.ctx[k].text === 'string') l.ctx[k].text = scrub(l.ctx[k].text);
    }
    if (replaceInWritings) for (const w of plan.writings) w.item[w.field] = scrub(w.item[w.field]);
  }
  repairReferences();
  if (!pseudo) commitUndo();
  try {
    await dbReplaceProject(state, state.meta);
  } catch (e) {
    for (const c of COLLECTIONS) state[c] = before[c];
    state.meta = before.meta;
    if (!pseudo) state.undoStack.pop();
    renderAll();
    throw e;
  }
  if (pseudo) { state.undoStack = []; updateUndoButton(); } // an undo would bring the old wording back
  const dp = { changed: plan.counts.changed, lost: plan.counts.lost, edits: plan.counts.edits };
  const changes = pseudo ? '' : plan.fragments.map(f => `“${clip(f.from, 60)}” → “${clip(f.to, 60)}”`).join('\n');
  await recordLog({ category: 'familiarisation', ak: 'log.docRevised', ap: { doc: doc.name, reason: `revise.r.${reason}` }, dk: 'log.d.revised', dp, reason: note || '', to: changes });
  state.activeSegId = null;
  renderAll();
  return dp;
}

// ---- Dialog ----
async function readCorrectedVersion(doc, file) {
  const kind = fileKind(file.name);
  const buf = await file.arrayBuffer();
  if (doc.kind === 'csv') {
    if (kind !== 'csv') throw new Error(tr('revise.needCsv'));
    const { text, encoding } = decodeTextBytes(buf);
    const res = await openCsvImportDialog(file.name, text.normalize('NFC'), encoding, { buildOnly: true });
    return res ? { text: res.text, blocks: res.blocks } : null;
  }
  if (!['txt', 'docx', 'doc'].includes(kind)) throw new Error(tr('revise.needText'));
  const { text, blocks } = textToDoc((await readPlainText(buf, kind)).raw);
  if (!text) throw new Error(tr('imp.noText'));
  return { text, blocks };
}

async function startRevision(file) {
  const doc = docById(state.activeDocId);
  if (!doc || !file) return;
  let read;
  try { read = await readCorrectedVersion(doc, file); } catch (e) { showToast(tr('imp.failed', { file: file.name, msg: e.message }), 'error'); return; }
  if (!read) return;
  if (read.text === doc.text) { showToast(tr('revise.same')); return; }
  let plan;
  try { plan = planRevision(doc, read.text, read.blocks); } catch (e) { alert(e.message); return; }
  openRevisionDialog(plan, file.name);
}

function openRevisionDialog(plan, fileName) {
  const modal = document.getElementById('reviseModal');
  const body = document.getElementById('reviseBody');
  const okBtn = document.getElementById('reviseOk');
  const c = plan.counts;
  const segLine = x => `<li class="px-2 py-1 border-b border-slate-100 text-[11px] leading-snug">
      <div class="text-slate-400 line-through decoration-slate-300">“${escapeHtml(clip(x.seg.text, 140))}”</div>
      ${x.status === 'changed' ? `<div class="text-slate-800">“${escapeHtml(clip(x.text, 140))}”</div>` : ''}
      <div class="text-[10px] text-slate-400">${escapeHtml(x.seg.codeIds.map(id => codeById(id)?.name).filter(Boolean).join(', '))}</div></li>`;
  const changed = plan.segs.filter(x => x.status === 'changed'), lost = plan.segs.filter(x => x.status === 'lost');
  body.innerHTML = `
    <p class="text-[11px] text-slate-500">${escapeHtml(tr('revise.summary', { doc: plan.doc.name, file: fileName, edits: c.edits, same: c.same, changed: c.changed, lost: c.lost }))}</p>
    <fieldset class="space-y-1">
      <legend class="text-xs font-bold text-slate-700 mb-1">${escapeHtml(tr('revise.reason'))}</legend>
      ${['pseudonym', 'transcription', 'other'].map(r => `<label class="flex items-start gap-1.5 text-xs text-slate-700"><input type="radio" name="reviseReason" value="${r}" class="mt-0.5"> <span>${escapeHtml(tr(`revise.r.${r}`))}<span class="block text-[10px] text-slate-400">${escapeHtml(tr(`revise.r.${r}.help`))}</span></span></label>`).join('')}
      <input id="reviseNote" class="mt-1 w-full text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-teal-500" placeholder="${escapeHtml(tr('revise.notePh'))}">
    </fieldset>
    ${changed.length ? `<details open><summary class="text-xs font-semibold text-slate-700 cursor-pointer">${escapeHtml(tr('revise.changed', { n: changed.length }))}</summary><ul class="mt-1 max-h-48 overflow-y-auto border border-slate-200 rounded">${changed.map(segLine).join('')}</ul></details>` : ''}
    ${lost.length ? `<details open><summary class="text-xs font-semibold text-rose-700 cursor-pointer">${escapeHtml(tr('revise.lost', { n: lost.length }))}</summary><p class="text-[10px] text-slate-500 mt-0.5">${escapeHtml(tr('revise.lostHelp'))}</p><ul class="mt-1 max-h-40 overflow-y-auto border border-rose-200 rounded">${lost.map(segLine).join('')}</ul></details>` : ''}
    <div id="revisePseudo" class="hidden space-y-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-900 leading-relaxed">
      <div>${escapeHtml(tr('revise.pseudoNote'))}</div>
      ${plan.writings.length ? `<label class="flex items-start gap-1.5"><input type="checkbox" id="reviseWritings" checked class="mt-0.5"> <span>${escapeHtml(tr('revise.writings', { n: plan.writings.length }))}<ul class="list-disc ml-4 text-[10px] text-amber-800">${plan.writings.slice(0, 12).map(w => `<li>${escapeHtml(w.label)}</li>`).join('')}${plan.writings.length > 12 ? '<li>…</li>' : ''}</ul></span></label>` : ''}
      ${plan.elsewhere.length ? `<div class="font-semibold">${escapeHtml(tr('revise.elsewhere', { docs: plan.elsewhere.join(', ') }))}</div>` : ''}
    </div>`;
  const reasonOf = () => (modal.querySelector('input[name="reviseReason"]:checked') || {}).value || '';
  const update = () => {
    const r = reasonOf();
    document.getElementById('revisePseudo').classList.toggle('hidden', r !== 'pseudonym');
    okBtn.disabled = !r || (r === 'other' && !document.getElementById('reviseNote').value.trim());
  };
  body.querySelectorAll('input[name="reviseReason"]').forEach(x => x.addEventListener('change', update));
  document.getElementById('reviseNote').addEventListener('input', update);
  update();
  okBtn.onclick = async () => {
    const reason = reasonOf();
    if (!reason) return;
    if (reason === 'pseudonym' && !confirm(tr('revise.pseudoConfirm'))) return;
    okBtn.disabled = true;
    try {
      const res = await applyRevision(plan, reason, document.getElementById('reviseNote').value.trim(), { replaceInWritings: !!document.getElementById('reviseWritings')?.checked });
      modal.classList.add('hidden');
      showToast(tr('revise.done', res), 'success');
    } catch (e) {
      console.error(e);
      alert(tr('revise.failed', { error: e?.message || String(e) }));
      okBtn.disabled = false;
    }
  };
  modal.classList.remove('hidden');
}

function setupRevisionEvents() {
  const input = document.getElementById('reviseInput');
  document.getElementById('reviseDocBtn').onclick = () => input.click();
  input.onchange = async () => { const f = input.files[0]; input.value = ''; await startRevision(f); };
}
