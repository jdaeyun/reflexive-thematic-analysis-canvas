// Thematic Analysis Canvas — Tab 4: Write-up tables (Braun & Clarke phase 6)
// MIT License · https://github.com/jdaeyun/thematic-analysis-canvas
// Every table is built once as a spec { title, note, headers, rows } by getTableSpec(); the HTML preview,
// rich-text copy, Markdown, CSV and .docx renderers all read the same spec.

const EXPORT_TABLES = ['summary', 'participants', 'themes', 'matrix', 'codebook', 'appendix']; // labels: tr('exp.nav.<id>')

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
  return L === 'ja' ? `「${text}」（${who}）` : `“${text}” (${who})`;
}

function getTableSpec(id, opts = exportOptions()) {
  const L = opts.lang || LANG;
  const T = (k, p) => tr(k, p, L);
  const nPart = countedParticipants().length;
  const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { numeric: true });
  const setAside = st => st === 'discarded' ? ` (${statusLabel('discarded', L)})` : '';
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
        [T('exp.r.dataset'), T('exp.v.dataset', { n: state.docs.length, kinds: Object.entries(kinds).map(([k, v]) => `${v} ${k.toUpperCase()}`).join(', ') || '—' })],
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
    return {
      title: T('exp.participants.title'),
      note: T('exp.participants.note'),
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
        `${t.name}${setAside(t.status)}\n[${T('n.participantsOf', { n: cov.participants.size, of: nPart })}]`,
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
      title: T('exp.themes.title'),
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
      title: T('exp.matrix.title'),
      note: T('exp.matrix.note'),
      headers: [T('exp.h.theme'), ...parts.map(p => p.label), 'n'],
      rows
    };
  }
  if (id === 'codebook') {
    return {
      title: T('exp.codebook.title'),
      note: '',
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
  const nav = document.getElementById('exportNav');
  nav.innerHTML = EXPORT_TABLES.map(id => `<button data-t="${id}" class="w-full text-left px-3 py-2 text-xs rounded-md cursor-pointer ${state.exportTable === id ? 'bg-indigo-600 text-white font-bold' : 'text-slate-700 hover:bg-slate-100'}">${escapeHtml(tr(`exp.nav.${id}`))}</button>`).join('');
  nav.querySelectorAll('button').forEach(b => b.onclick = () => { state.exportTable = b.dataset.t; renderExportView(); });
  document.getElementById('exportPreview').innerHTML = specToHtml(getTableSpec(state.exportTable));
}

async function copyCurrentTable() {
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
  const md = `# ${state.meta.name || tr('exp.docTitle', {}, opts.lang)}\n\n` + EXPORT_TABLES.map(id => specToMarkdown(getTableSpec(id, opts), opts.lang)).join('');
  downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${safeFileStem()}_tables.md`);
}
function downloadCurrentCsv() {
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
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, PageOrientation } = docx;
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
  const children = [new Paragraph({ children: [run(state.meta.name || tr('exp.docTitle', {}, L), { bold: true, size: 28 })], spacing: { after: 240 } })];
  for (const id of EXPORT_TABLES) {
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
  const d = new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } }, children }] });
  const blob = await Packer.toBlob(d);
  downloadBlob(blob, `${safeFileStem()}_tables.docx`);
  await recordLog({ category: 'system', ak: 'log.exportedDocx' });
}

function setupExportEvents() {
  document.getElementById('copyTableBtn').onclick = copyCurrentTable;
  document.getElementById('mdBtn').onclick = downloadMarkdown;
  document.getElementById('csvBtn').onclick = downloadCurrentCsv;
  document.getElementById('extractsCsvBtn').onclick = downloadExtractsCsv;
  document.getElementById('docxBtn').onclick = downloadDocx;
  ['optMaxExtracts', 'optIncludeCoding', 'optIncludeSetAside', 'optTableLang'].forEach(id => document.getElementById(id).addEventListener('change', renderExportView));
}
