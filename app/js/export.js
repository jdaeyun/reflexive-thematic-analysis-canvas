// Thematic Analysis Canvas — Tab 4: Writing up (Braun & Clarke phase 6)
// MIT License · https://github.com/jdaeyun/thematic-analysis-canvas
// Phase 6 is writing an analytic narrative, not producing tables: the first view is a writing space per theme
// (theme.narrative, meta.storyline). Supporting tables are secondary. Every table is built once as a spec
// { title, note, headers, rows } by getTableSpec(); preview, copy, Markdown, CSV and .docx all read it.
// Prevalence (theme × participant) and the code list are optional and left out by default.

const EXPORT_VIEWS = ['narrative', 'summary', 'participants', 'themes', 'matrix', 'codelist', 'appendix']; // labels: tr('exp.nav.<id>')
const NUMBERED_TABLES = ['participants', 'themes', 'matrix', 'codelist'];
const OPTIONAL_TABLES = { matrix: 'includeCounts', codelist: 'includeCodeList' };

// Tables that go into the combined Markdown / .docx, in order
function includedTables(opts) {
  return EXPORT_VIEWS.filter(id => id !== 'narrative' && (!OPTIONAL_TABLES[id] || opts[OPTIONAL_TABLES[id]]));
}
// "Table n." follows the tables actually included
function tableNumber(id, opts) {
  const nums = includedTables(opts).filter(x => NUMBERED_TABLES.includes(x));
  const i = nums.indexOf(id);
  return i >= 0 ? i + 1 : null;
}

// Table language can differ from the interface (e.g. Japanese interface, English manuscript)
function tableLang() {
  const v = document.getElementById('optTableLang')?.value || 'ui';
  return v === 'ui' ? LANG : v;
}

function exportOptions() {
  return {
    maxExtracts: Math.max(1, Math.min(10, Number(document.getElementById('optMaxExtracts')?.value) || 2)),
    includeCodingActions: !!document.getElementById('optIncludeCoding')?.checked,
    includeSetAside: !!document.getElementById('optIncludeSetAside')?.checked,
    includeCounts: !!document.getElementById('optCounts')?.checked,
    includeCodeList: !!document.getElementById('optCodeList')?.checked,
    participantRows: !!document.getElementById('optParticipantRows')?.checked,
    lang: tableLang()
  };
}

function liveThemes(opts) {
  return sortedThemes(null).filter(t => opts.includeSetAside || t.status !== 'discarded');
}
function liveSubthemes(t, opts) {
  return sortedThemes(t.id).filter(s => opts.includeSetAside || s.status !== 'discarded');
}

// Up to n extracts: key extracts first, then spread across participants
function pickExtracts(segs, n) {
  const sorted = [...segs].sort((a, b) => (b.key ? 1 : 0) - (a.key ? 1 : 0) || a.createdAt - b.createdAt);
  const out = [], seenPart = new Set();
  for (const s of sorted) {
    if (out.length >= n) break;
    const p = participantsForRange(s.docId, s.s, s.e).join(',');
    if (!s.key && seenPart.has(p) && sorted.some(x => !out.includes(x) && !seenPart.has(participantsForRange(x.docId, x.s, x.e).join(',')))) continue;
    out.push(s); seenPart.add(p);
  }
  for (const s of sorted) { if (out.length >= n) break; if (!out.includes(s)) out.push(s); }
  return out;
}
function extractCite(seg, L) {
  const p = participantLabels(participantsForRange(seg.docId, seg.s, seg.e));
  const text = clip(seg.text, 300);
  const who = p || docById(seg.docId)?.name || '—';
  // Do not double the quotation marks when the extract is already a quotation
  const quoted = /^[「『“"].*[」』”"]$/s.test(text);
  if (L === 'ja') return quoted ? `${text}（${who}）` : `「${text}」（${who}）`;
  return quoted ? `${text} (${who})` : `“${text}” (${who})`;
}

function getTableSpec(id, opts = exportOptions()) {
  const L = opts.lang || LANG;
  const T = (k, p) => tr(k, p, L);
  const nPart = countedParticipants().length;
  const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { numeric: true });
  const setAside = st => st === 'discarded' ? ` (${statusLabel('discarded', L)})` : '';
  const numbered = (key) => { const n = tableNumber(id, opts); return (n ? T('exp.tableN', { n }) + ' ' : '') + T(key); };
  if (id === 'summary') {
    const themes = liveThemes(opts);
    const subs = themes.reduce((a, t) => a + liveSubthemes(t, opts).length, 0);
    const kinds = {};
    for (const d of state.docs) kinds[d.kind] = (kinds[d.kind] || 0) + 1;
    const journal = state.logs.filter(l => l.category === 'journal').length;
    const statusLine = Object.keys(THEME_STATUS).map(k => `${statusLabel(k, L)}: ${state.themes.filter(t => t.status === k).length}`).join(' · ');
    return {
      title: T('exp.summary.title'),
      note: T('exp.summary.note'),
      headers: [T('exp.h.item'), T('exp.h.value')],
      rows: [
        [T('exp.r.project'), state.meta.name || '—'],
        [T('exp.r.question'), state.meta.question || '—'],
        [T('exp.r.approach'), T('approach.reflexive')],
        [T('exp.r.theory'), state.meta.theory || '—'],
        [T('exp.r.orientation'), orientationText(L)],
        [T('exp.r.dataset'), T('exp.v.dataset', { n: state.docs.length, kinds: Object.entries(kinds).map(([k, v]) => `${v} ${k.toUpperCase()}`).join(', ') || '—' })],
        [T('exp.r.length'), datasetLengthText(L)],
        [T('exp.r.dataPrep'), state.meta.dataPrep || '—'],
        [T('exp.r.participants'), String(nPart)],
        [T('exp.r.extracts'), String(state.segments.length)],
        [T('exp.r.codes'), String(state.codes.length)],
        [T('exp.r.themes'), T('exp.v.themes', { t: themes.length, s: subs })],
        [T('exp.r.status'), statusLine],
        [T('exp.r.journal'), String(journal)],
        [T('exp.r.audit'), String(state.logs.length)]
      ]
    };
  }
  if (id === 'participants') {
    const keys = [];
    for (const p of countedParticipants()) for (const k of Object.keys(p.attributes || {})) if (!keys.includes(k)) keys.push(k);
    const parts = countedParticipants().sort(byLabel);
    // RTARG: situate the participant group without compromising anonymity — aggregate by default
    if (!opts.participantRows) {
      const rows = keys.map(k => {
        const tally = new Map();
        for (const p of parts) { const v = String((p.attributes || {})[k] || '').trim() || T('exp.v.notStated'); tally.set(v, (tally.get(v) || 0) + 1); }
        const vals = [...tally.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
        return [k, vals.map(([v, n]) => T('exp.v.tally', { v, n })).join(L === 'ja' ? '、' : ', ')];
      });
      return {
        title: numbered('exp.participants.titleAgg'),
        note: T('exp.participants.noteAgg'),
        headers: [T('exp.h.characteristic'), T('exp.h.groupN', { n: parts.length })],
        rows: rows.length ? rows : [[T('exp.r.participants'), String(parts.length)]]
      };
    }
    return {
      title: numbered('exp.participants.title'),
      note: T('exp.participants.noteRows'),
      headers: [T('exp.h.participant'), ...keys, T('exp.h.documents'), T('exp.h.extracts')],
      rows: parts.map(p => {
        const segs = state.segments.filter(s => participantsForRange(s.docId, s.s, s.e).includes(p.id));
        const docs = new Set(state.ptags.filter(t => t.participantId === p.id).map(t => t.docId).concat(state.docs.filter(d => d.defaultParticipantId === p.id).map(d => d.id)));
        return [p.label, ...keys.map(k => (p.attributes || {})[k] || '—'), String(docs.size), String(segs.length)];
      })
    };
  }
  if (id === 'themes') {
    const rows = [];
    for (const t of liveThemes(opts)) {
      const subs = liveSubthemes(t, opts);
      const own = codesForTheme(t.id, false);
      const ownSegs = segmentsForTheme(t.id, false);
      const cov = coverage(segmentsForTheme(t.id, true));
      rows.push([
        `${t.name}${setAside(t.status)}` + (opts.includeCounts ? `\n[${T('n.participantsOf', { n: cov.participants.size, of: nPart })}]` : ''),
        subs.length ? '' : '—',
        t.definition || '—',
        own.map(c => c.name).join('; ') || '—',
        pickExtracts(ownSegs, opts.maxExtracts).map(s => extractCite(s, L)).join('\n') || '—'
      ]);
      for (const s of subs) {
        rows.push([
          '',
          `${s.name}${setAside(s.status)}`,
          s.definition || '—',
          codesForTheme(s.id, false).map(c => c.name).join('; ') || '—',
          pickExtracts(segmentsForTheme(s.id, false), opts.maxExtracts).map(x => extractCite(x, L)).join('\n') || '—'
        ]);
      }
    }
    return {
      title: numbered('exp.themes.title'),
      note: T('exp.themes.note'),
      headers: [T('exp.h.theme'), T('exp.h.subtheme'), T('exp.h.definition'), T('exp.h.codes'), T('exp.h.illustrative')],
      rows
    };
  }
  if (id === 'matrix') {
    const parts = countedParticipants().sort(byLabel);
    const rows = [];
    const rowFor = (t, prefix) => {
      const cov = coverage(segmentsForTheme(t.id, true));
      return [prefix + t.name, ...parts.map(p => cov.participants.has(p.id) ? '●' : ''), `${cov.participants.size}/${parts.length}`];
    };
    for (const t of liveThemes(opts)) {
      rows.push(rowFor(t, ''));
      for (const s of liveSubthemes(t, opts)) rows.push(rowFor(s, '↳ '));
    }
    return {
      title: numbered('exp.matrix.title'),
      note: T('exp.matrix.note'),
      headers: [T('exp.h.theme'), ...parts.map(p => p.label), 'n'],
      rows
    };
  }
  if (id === 'codelist') {
    return {
      title: numbered('exp.codelist.title'),
      note: T('exp.codelist.note'),
      headers: [T('exp.h.code'), T('exp.h.description'), T('exp.h.themes'), T('exp.h.extractsShort'), T('exp.h.participants'), T('exp.h.documents')],
      rows: sortedCodes().map(c => {
        const segs = segmentsForCode(c.id);
        const cov = coverage(segs);
        return [c.name, c.description || '—', c.themeIds.map(t => themeById(t)?.name).filter(Boolean).join('; ') || '—', String(segs.length), String(cov.participants.size), String(cov.docs.size)];
      })
    };
  }
  if (id === 'appendix') {
    const logs = opts.includeCodingActions ? state.logs.filter(l => l.category !== 'system') : filteredLogs('decisions');
    return {
      title: T('exp.appendix.title'),
      note: T(opts.includeCodingActions ? 'exp.appendix.noteAll' : 'exp.appendix.noteDecisions') + ' ' + T('exp.appendix.noteWhy'),
      headers: [T('exp.h.date'), T('exp.h.type'), T('exp.h.entry'), T('exp.h.details')],
      rows: logs.map(l => {
        const linked = l.linkedLogId ? state.logs.find(x => x.id === l.linkedLogId) : null;
        return [
          fmtTime(l.ts, L) + (l.by ? `\n${l.by}` : ''),
          categoryLabel(l.category, L),
          logAction(l, L),
          [
            logDetail(l, L),
            l.from ? `${T('exp.d.from')}: ${logFromTo(l, l.from, L)}` : '',
            l.to ? `${T('exp.d.to')}: ${logFromTo(l, l.to, L)}` : '',
            l.reason ? `${T('audit.why')}: ${l.reason}` : '',
            l.linkedLogId ? `${T('audit.about')}: ${linked ? logAction(linked, L) : T('exp.d.removedEntry')}` : '',
            logContextText(l.ctx, L)
          ].filter(Boolean).join('\n') || '—'
        ];
      })
    };
  }
  return { title: '', note: '', headers: [], rows: [] };
}

function logContextText(ctx, L = LANG) {
  if (!ctx) return '';
  const q = s => L === 'ja' ? `「${s}」` : `“${s}”`;
  const parts = [];
  if (ctx.doc) parts.push(`${tr('ctx.doc', {}, L)} ${q(ctx.doc.name)}`);
  if (ctx.extract) parts.push(`${tr('ctx.extract', {}, L)} ${q(clip(ctx.extract.text, 80))}`);
  if (ctx.quote) parts.push(`${tr('ctx.quote', {}, L)} ${q(clip(ctx.quote.text, 80))}`);
  if (ctx.theme) parts.push(`${tr('ctx.theme', {}, L)} ${q(ctx.theme.name)}`);
  return parts.length ? `${tr('ctx.label', {}, L)}: ${parts.join(' · ')}` : '';
}

// ========================================================
// RENDERERS
// ========================================================
function specToHtml(spec, L = tableLang()) {
  const cell = v => escapeHtml(v).replace(/\n/g, '<br>');
  return `<h3 style="font-family:Georgia,serif;font-size:15px;font-weight:bold;color:#0f172a;margin:0 0 6px">${escapeHtml(spec.title)}</h3>
    <table class="pub-table"><thead><tr>${spec.headers.map(h => `<th>${cell(h)}</th>`).join('')}</tr></thead>
    <tbody>${spec.rows.length ? spec.rows.map(r => `<tr>${r.map(v => `<td>${cell(v)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${spec.headers.length}" style="color:#94a3b8">${escapeHtml(tr('exp.noData', {}, L))}</td></tr>`}</tbody></table>
    ${spec.note ? `<p style="font-family:Georgia,serif;font-size:11px;color:#64748b;font-style:italic;margin-top:6px">${escapeHtml(tr('exp.noteLabel', {}, L))} ${escapeHtml(spec.note)}</p>` : ''}`;
}
function specToMarkdown(spec, L = tableLang()) {
  const esc = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  let md = `### ${spec.title}\n\n| ${spec.headers.map(esc).join(' | ')} |\n| ${spec.headers.map(() => '---').join(' | ')} |\n`;
  for (const r of spec.rows) md += `| ${r.map(esc).join(' | ')} |\n`;
  if (spec.note) md += `\n*${tr('exp.noteLabel', {}, L)}* ${spec.note}\n`;
  return md + '\n';
}
function rowsToCsv(headers, rows) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '﻿' + [headers, ...rows].map(r => r.map(q).join(',')).join('\r\n');
}

function renderExportView() {
  const opts = exportOptions();
  const nav = document.getElementById('exportNav');
  const navBtn = (id) => {
    const excluded = OPTIONAL_TABLES[id] && !opts[OPTIONAL_TABLES[id]];
    const n = tableNumber(id, opts);
    const label = (n ? tr('exp.tableN', { n }) + ' ' : '') + tr(`exp.nav.${id}`);
    const on = state.exportTable === id;
    return `<button data-t="${id}" class="w-full text-left px-3 py-2 text-xs rounded-md cursor-pointer ${on ? 'bg-indigo-600 text-white font-bold' : excluded ? 'text-slate-400 hover:bg-slate-100' : 'text-slate-700 hover:bg-slate-100'}">
      ${id === 'narrative' ? '<i class="ph ph-pen-nib"></i> ' : ''}${escapeHtml(label)}${excluded ? ` <span class="text-[10px] ${on ? 'text-indigo-200' : 'text-slate-400'}">${escapeHtml(tr('exp.notIncluded'))}</span>` : ''}</button>`;
  };
  nav.innerHTML = navBtn('narrative') + `<div class="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-3 pt-3 pb-1">${escapeHtml(tr('exp.supporting'))}</div>` +
    EXPORT_VIEWS.filter(id => id !== 'narrative').map(navBtn).join('');
  nav.querySelectorAll('button').forEach(b => b.onclick = () => { state.exportTable = b.dataset.t; renderExportView(); });
  const isNarr = state.exportTable === 'narrative';
  document.getElementById('csvBtn').disabled = isNarr;
  document.getElementById('copyTableLabel').textContent = tr(isNarr ? 'exp.copyText' : 'exp.copy');
  if (isNarr) renderNarrativeEditor();
  else document.getElementById('exportPreview').innerHTML = specToHtml(getTableSpec(state.exportTable));
}

// ========================================================
// PHASE 6: ANALYTIC NARRATIVE (writing is part of the analysis)
// ========================================================
function narrativeThemes(opts = exportOptions()) {
  const out = [];
  for (const t of liveThemes(opts)) {
    out.push({ t, depth: 0 });
    for (const s of liveSubthemes(t, opts)) out.push({ t: s, depth: 1 });
  }
  return out;
}

const narrativeSavers = {};
function saveNarrativeSoon(key, fn) {
  clearTimeout(narrativeSavers[key]);
  narrativeSavers[key] = setTimeout(fn, 600);
}

function renderNarrativeEditor() {
  const el = document.getElementById('exportPreview');
  const items = narrativeThemes();
  el.innerHTML = `
    <div class="max-w-3xl">
      <div class="text-[11px] text-slate-500 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 leading-relaxed mb-4">${tr('narr.intro')}</div>
      <label class="block text-xs font-bold text-slate-700 mb-1">${escapeHtml(tr('narr.overview'))}</label>
      <textarea id="narrOverview" rows="4" class="w-full text-sm leading-relaxed border border-slate-300 rounded-lg px-3 py-2 resize-y focus:outline-none focus:border-emerald-500" placeholder="${escapeHtml(tr('narr.overviewPh'))}">${escapeHtml(state.meta.storyline || '')}</textarea>
      ${items.length ? items.map(({ t, depth }) => {
        const segs = [...segmentsForTheme(t.id, depth === 0 ? false : true)].sort((a, b) => (b.key ? 1 : 0) - (a.key ? 1 : 0));
        return `<section class="narr-section mt-6 ${depth ? 'ml-6' : ''}" data-theme="${t.id}">
          <div class="flex items-baseline gap-2">
            <h3 class="${depth ? 'text-sm' : 'text-base'} font-bold text-slate-900">${depth ? '<span class="text-slate-400">↳</span> ' : ''}${escapeHtml(t.name)}</h3>
            <span class="text-[10px] font-bold border rounded px-1 ${THEME_STATUS[t.status]?.cls || ''}">${escapeHtml(statusLabel(t.status))}</span>
          </div>
          ${t.definition ? `<div class="text-[11px] text-slate-500 italic mt-0.5">${escapeHtml(t.definition)}</div>` : `<div class="text-[11px] text-amber-700 mt-0.5">${escapeHtml(tr('narr.noDefinition'))}</div>`}
          <textarea class="narr-text mt-2 w-full text-sm leading-relaxed border border-slate-300 rounded-lg px-3 py-2 resize-y focus:outline-none focus:border-emerald-500" rows="${depth ? 5 : 8}" placeholder="${escapeHtml(tr('narr.themePh'))}">${escapeHtml(t.narrative || '')}</textarea>
          <details class="mt-1">
            <summary class="text-[11px] font-semibold text-indigo-700 cursor-pointer select-none">${escapeHtml(tr('narr.extracts', { n: segs.length }))}</summary>
            <div class="mt-1 space-y-1 max-h-64 overflow-y-auto">${segs.map(s => `<div class="flex items-start gap-1.5">
              <button type="button" class="narr-insert shrink-0 text-[10px] font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded px-1.5 py-0.5 cursor-pointer" data-seg="${s.id}" title="${escapeHtml(tr('narr.insertTitle'))}">${escapeHtml(tr('narr.insert'))}</button>
              <div class="flex-1 min-w-0">${extractLinkHtml(s)}</div></div>`).join('') || `<div class="text-[11px] text-slate-400">${escapeHtml(tr('code.noExtracts'))}</div>`}</div>
          </details>
        </section>`;
      }).join('') : `<div class="mt-6 text-xs text-slate-400">${escapeHtml(tr('narr.noThemes'))}</div>`}
      <label class="block text-xs font-bold text-slate-700 mt-8 mb-1">${escapeHtml(tr('narr.conclusions'))}</label>
      <div class="text-[11px] text-slate-500 mb-1">${escapeHtml(tr('narr.conclusionsHelp'))}</div>
      <textarea id="narrConclusions" rows="6" class="w-full text-sm leading-relaxed border border-slate-300 rounded-lg px-3 py-2 resize-y focus:outline-none focus:border-emerald-500" placeholder="${escapeHtml(tr('narr.conclusionsPh'))}">${escapeHtml(state.meta.conclusions || '')}</textarea>
    </div>`;

  const cc = el.querySelector('#narrConclusions');
  const ccStart = state.meta.conclusions || '';
  cc.addEventListener('input', () => { state.meta.conclusions = cc.value; saveNarrativeSoon('meta', saveMeta); });
  cc.addEventListener('change', async () => {
    if ((state.meta.conclusions || '') === ccStart) return;
    await saveMeta();
    await recordLog({ category: 'themes', ak: 'log.conclusions', dk: 'log.d.chars', dp: { n: (state.meta.conclusions || '').length } });
  });

  const ov = el.querySelector('#narrOverview');
  const ovStart = state.meta.storyline || '';
  ov.addEventListener('input', () => { state.meta.storyline = ov.value; saveNarrativeSoon('meta', saveMeta); });
  ov.addEventListener('change', async () => {
    if ((state.meta.storyline || '') === ovStart) return;
    await saveMeta();
    await recordLog({ category: 'themes', ak: 'log.storyline', dk: 'log.d.chars', dp: { n: (state.meta.storyline || '').length } });
  });
  el.querySelectorAll('.narr-section').forEach(sec => {
    const t = themeById(sec.dataset.theme);
    const ta = sec.querySelector('.narr-text');
    let caret = ta.value.length;
    const start = t.narrative || '';
    const remember = () => { caret = ta.selectionStart ?? ta.value.length; };
    ['keyup', 'click', 'blur', 'input'].forEach(ev => ta.addEventListener(ev, remember));
    ta.addEventListener('input', () => { t.narrative = ta.value; saveNarrativeSoon(t.id, () => dbPut('themes', t)); });
    ta.addEventListener('change', async () => {
      await dbPut('themes', t);
      if ((t.narrative || '') !== start) await recordLog({ category: 'themes', ak: 'log.narrative', ap: { theme: t.name }, dk: 'log.d.chars', dp: { n: (t.narrative || '').length } });
    });
    sec.querySelectorAll('.narr-insert').forEach(b => b.onclick = () => {
      const seg = state.segments.find(s => s.id === b.dataset.seg);
      if (!seg) return;
      const quote = extractCite(seg, LANG);
      const before = ta.value.slice(0, caret), after = ta.value.slice(caret);
      const pad = before && !/\s$/.test(before) ? ' ' : '';
      ta.value = before + pad + quote + after;
      caret = (before + pad + quote).length;
      ta.focus(); ta.setSelectionRange(caret, caret);
      t.narrative = ta.value;
      saveNarrativeSoon(t.id, () => dbPut('themes', t));
    });
  });
  bindExtractLinks(el);
}

// "Mostly inductive · Mostly latent" from the Project setup (RTARG: specific orientation to RTA)
function orientationText(L = LANG) {
  const parts = [];
  if (state.meta.orientInductive) parts.push(tr(`orient.ind.${state.meta.orientInductive}`, {}, L));
  if (state.meta.orientLatent) parts.push(tr(`orient.lat.${state.meta.orientLatent}`, {}, L));
  return parts.join(' · ') || '—';
}

// RTARG: size and scope of the dataset, e.g. range and mean length. Descriptive only — not a marker of quality.
function datasetLengthText(L = LANG) {
  const fmt = n => Math.round(n).toLocaleString(localeOf(L));
  const spaced = s => (s.match(/\s/g) || []).length / Math.max(1, s.length) > 0.08; // space-delimited script → words make sense
  const words = s => s.trim().split(/\s+/).filter(Boolean).length;
  const describe = (texts, key) => {
    if (!texts.length) return '';
    const chars = texts.map(t => t.replace(/\n/g, '').length);
    let out = tr(key, { n: texts.length, min: fmt(Math.min(...chars)), max: fmt(Math.max(...chars)), mean: fmt(chars.reduce((a, b) => a + b, 0) / chars.length) }, L);
    if (texts.every(spaced)) {
      const w = texts.map(words);
      out += tr('exp.v.lenWords', { min: fmt(Math.min(...w)), max: fmt(Math.max(...w)), mean: fmt(w.reduce((a, b) => a + b, 0) / w.length) }, L);
    }
    return out;
  };
  const docs = state.docs.filter(d => d.kind !== 'csv').map(d => d.text);
  const answers = state.docs.filter(d => d.kind === 'csv').flatMap(d => d.blocks.map(b => d.text.slice(b.s, b.e)));
  return [describe(docs, 'exp.v.lenDocs'), describe(answers, 'exp.v.lenAnswers')].filter(Boolean).join('\n') || '—';
}

// The narrative as a list of blocks, shared by copy / Markdown / .docx
function narrativeBlocks(opts) {
  const L = opts.lang;
  // RTARG: the heading is "Analysis", not "Results" or "Findings" (statistics / themes "found")
  const blocks = [{ type: 'h1', text: tr('narr.analysisTitle', {}, L) }];
  const paras = s => String(s || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  for (const p of paras(state.meta.storyline)) blocks.push({ type: 'p', text: p });
  // RTARG: an overview of the thematic structure (list, map or table) previews the analysis
  if (typeof mapThemes === 'function' && mapThemes().length) blocks.push({ type: 'figure', text: tr('narr.figureMap', {}, L) });
  for (const { t, depth } of narrativeThemes(opts)) {
    blocks.push({ type: depth ? 'h3' : 'h2', text: t.name });
    const ps = paras(t.narrative);
    if (ps.length) ps.forEach(p => blocks.push({ type: 'p', text: p }));
    else blocks.push({ type: 'p', text: tr('narr.notWritten', {}, L), muted: true });
  }
  // Final section: conclusions across themes (RTARG has no preferred heading; "General discussion" avoids false certainty)
  const concl = paras(state.meta.conclusions);
  if (concl.length) {
    blocks.push({ type: 'h1', text: tr('narr.conclusionsTitle', {}, L) });
    concl.forEach(p => blocks.push({ type: 'p', text: p }));
  }
  return blocks;
}

async function copyCurrentTable() {
  if (state.exportTable === 'narrative') {
    const blocks = narrativeBlocks(exportOptions());
    const html = blocks.filter(b => b.type !== 'figure').map(b => b.type === 'p' ? `<p>${escapeHtml(b.text).replace(/\n/g, '<br>')}</p>` : `<${b.type}>${escapeHtml(b.text)}</${b.type}>`).join('');
    const text = blocks.filter(b => b.type !== 'figure').map(b => b.text).join('\n\n');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    } catch (e) {
      await navigator.clipboard.writeText(text).catch(() => {});
    }
    showToast(tr('toast.textCopied'), 'success');
    return;
  }
  const spec = getTableSpec(state.exportTable);
  const html = specToHtml(spec).replace('class="pub-table"', 'border="1" style="border-collapse:collapse;font-family:Times New Roman;font-size:10pt"');
  const text = [spec.title, spec.headers.join('\t'), ...spec.rows.map(r => r.join('\t').replace(/\n/g, ' / '))].join('\n');
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    showToast(tr('toast.tableCopied'), 'success');
  } catch (e) {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('exportPreview'));
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    document.execCommand('copy');
    sel.removeAllRanges();
    showToast(tr('toast.tableCopiedShort'), 'success');
  }
}

function downloadMarkdown() {
  const opts = exportOptions();
  const narr = narrativeBlocks(opts).map(b => b.type === 'figure' ? `*${b.text} — ${tr('narr.figureMd', {}, opts.lang)}*` : b.type === 'h1' ? `## ${b.text}` : b.type === 'h2' ? `### ${b.text}` : b.type === 'h3' ? `#### ${b.text}` : (b.muted ? `*${b.text}*` : b.text)).join('\n\n');
  const md = `# ${state.meta.name || tr('exp.docTitle', {}, opts.lang)}\n\n${narr}\n\n## ${tr('exp.supporting', {}, opts.lang)}\n\n` + includedTables(opts).map(id => specToMarkdown(getTableSpec(id, opts), opts.lang)).join('');
  downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${safeFileStem()}_writeup.md`);
}
function downloadCurrentCsv() {
  if (state.exportTable === 'narrative') return;
  const spec = getTableSpec(state.exportTable);
  downloadBlob(new Blob([rowsToCsv(spec.headers, spec.rows)], { type: 'text/csv;charset=utf-8' }), `${safeFileStem()}_${state.exportTable}.csv`);
}
// Long format: one row per extract × code, for re-analysis in R / Excel
function downloadExtractsCsv() {
  const L = tableLang();
  const headers = ['csv.document', 'csv.participant', 'csv.code', 'csv.themes', 'csv.extract', 'csv.key', 'csv.memo', 'csv.start', 'csv.end', 'csv.codedBy', 'csv.codedAt'].map(k => tr(k, {}, L));
  const rows = [];
  for (const s of state.segments) {
    for (const cid of s.codeIds) {
      const c = codeById(cid);
      if (!c) continue;
      rows.push([docById(s.docId)?.name || '', participantLabels(participantsForRange(s.docId, s.s, s.e)), c.name,
        c.themeIds.map(t => themeById(t)?.name).filter(Boolean).join('; '), s.text, s.key ? tr('csv.yes', {}, L) : '', s.memo || '', s.s, s.e, s.createdBy || '', new Date(s.createdAt).toISOString()]);
    }
  }
  downloadBlob(new Blob([rowsToCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }), `${safeFileStem()}_extracts.csv`);
}

async function downloadDocx() {
  if (typeof docx === 'undefined') { alert(tr('err.docxLib')); return; }
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, PageOrientation, HeadingLevel } = docx;
  const opts = exportOptions();
  const thick = { style: BorderStyle.SINGLE, size: 12, color: '0F172A' };
  const thin = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const L = opts.lang;
  const font = L === 'ja' ? { ascii: 'Times New Roman', hAnsi: 'Times New Roman', eastAsia: 'MS Mincho' } : 'Times New Roman';
  const run = (text, extra = {}) => new TextRun({ text, font, size: 20, ...extra });
  const cellOf = (v, { header = false, last = false } = {}) => new TableCell({
    children: String(v ?? '').split('\n').map(line => new Paragraph({ children: [run(line, { bold: header })], spacing: { after: 40 } })),
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    borders: { top: header ? thick : none, bottom: header ? thick : (last ? thick : thin), left: none, right: none }
  });
  const title = new Paragraph({ children: [run(state.meta.name || tr('exp.docTitle', {}, L), { bold: true, size: 32 })], spacing: { after: 240 } });
  // Section 1 (portrait): the analytic narrative
  const { ImageRun, AlignmentType } = docx;
  const png = await mapPng(L);
  const narrative = narrativeBlocks(opts).flatMap(b => {
    if (b.type === 'figure') {
      if (!png) return [];
      const w = Math.min(600, png.w), h = Math.round(png.h * (w / png.w));
      return [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: png.data, transformation: { width: w, height: h } })], spacing: { before: 200 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [run(b.text, { italics: true, size: 18 })], spacing: { after: 240 } })
      ];
    }
    if (b.type === 'p') return new Paragraph({ children: [run(b.text, { size: 22, ...(b.muted ? { italics: true, color: '94A3B8' } : {}) })], spacing: { after: 160, line: 360 } });
    const size = b.type === 'h1' ? 28 : b.type === 'h2' ? 24 : 22;
    return new Paragraph({ heading: b.type === 'h1' ? HeadingLevel.HEADING_1 : b.type === 'h2' ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, children: [run(b.text, { bold: true, size, color: '0F172A' })], spacing: { before: 280, after: 120 } });
  });
  // Section 2 (landscape): supporting tables
  const children = [new Paragraph({ children: [run(tr('exp.supporting', {}, L), { bold: true, size: 28 })], spacing: { after: 120 } })];
  for (const id of includedTables(opts)) {
    const spec = getTableSpec(id, opts);
    children.push(new Paragraph({ children: [run(spec.title, { bold: true, size: 24 })], spacing: { before: 360, after: 120 } }));
    const rows = spec.rows.length ? spec.rows : [spec.headers.map((_, i) => i === 0 ? tr('exp.noData', {}, L) : '')];
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: spec.headers.map(h => cellOf(h, { header: true })) }),
        ...rows.map((r, i) => new TableRow({ children: r.map(v => cellOf(v, { last: i === rows.length - 1 })) }))
      ]
    }));
    if (spec.note) children.push(new Paragraph({ children: [run(tr('exp.noteLabel', {}, L) + ' ', { italics: true, size: 18 }), run(spec.note, { size: 18 })], spacing: { before: 80 } }));
  }
  const d = new Document({ sections: [
    { children: [title, ...narrative] },
    { properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } }, children }
  ] });
  const blob = await Packer.toBlob(d);
  downloadBlob(blob, `${safeFileStem()}_writeup.docx`);
  await recordLog({ category: 'system', ak: 'log.exportedDocx' });
}

function setupExportEvents() {
  document.getElementById('copyTableBtn').onclick = copyCurrentTable;
  document.getElementById('mdBtn').onclick = downloadMarkdown;
  document.getElementById('csvBtn').onclick = downloadCurrentCsv;
  document.getElementById('extractsCsvBtn').onclick = downloadExtractsCsv;
  document.getElementById('docxBtn').onclick = downloadDocx;
  ['optMaxExtracts', 'optIncludeCoding', 'optIncludeSetAside', 'optTableLang', 'optCounts', 'optCodeList', 'optParticipantRows'].forEach(id => document.getElementById(id).addEventListener('change', renderExportView));
}
