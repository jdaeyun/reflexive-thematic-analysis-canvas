// Thematic Analysis Canvas — Tab 4: Write-up tables (Braun & Clarke phase 6)
// MIT License · https://github.com/jdaeyun/thematic-analysis-canvas
// Every table is built once as a spec { title, note, headers, rows } by getTableSpec(); the HTML preview,
// rich-text copy, Markdown, CSV and .docx renderers all read the same spec.

const EXPORT_TABLES = [
  { id: 'summary', label: 'Analysis summary' },
  { id: 'participants', label: 'Table 1. Participants' },
  { id: 'themes', label: 'Table 2. Themes & extracts' },
  { id: 'matrix', label: 'Table 3. Theme × participant' },
  { id: 'codebook', label: 'Table 4. Codebook' },
  { id: 'appendix', label: 'Appendix A. Audit trail' }
];

function exportOptions() {
  return {
    maxExtracts: Math.max(1, Math.min(10, Number(document.getElementById('optMaxExtracts')?.value) || 2)),
    includeCodingActions: !!document.getElementById('optIncludeCoding')?.checked,
    includeSetAside: !!document.getElementById('optIncludeSetAside')?.checked
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
function extractCite(seg) {
  const p = participantLabels(participantsForRange(seg.docId, seg.s, seg.e));
  return `“${clip(seg.text, 300)}” (${p || docById(seg.docId)?.name || '—'})`;
}

function getTableSpec(id, opts = exportOptions()) {
  const nPart = countedParticipants().length;
  if (id === 'summary') {
    const themes = liveThemes(opts);
    const subs = themes.reduce((a, t) => a + liveSubthemes(t, opts).length, 0);
    const kinds = {};
    for (const d of state.docs) kinds[d.kind] = (kinds[d.kind] || 0) + 1;
    const journal = state.logs.filter(l => l.category === 'journal').length;
    const statusLine = Object.entries(THEME_STATUS).map(([k, v]) => `${v.label}: ${state.themes.filter(t => t.status === k).length}`).join(' · ');
    return {
      title: 'Analysis summary',
      note: 'Counts generated from the project. Describe your approach to thematic analysis and your reflexive process in your own words.',
      headers: ['Item', 'Value'],
      rows: [
        ['Project', state.meta.name || '—'],
        ['Research question', state.meta.question || '—'],
        ['Approach', { reflexive: 'Reflexive thematic analysis (Braun & Clarke)', codebook: 'Codebook thematic analysis', other: 'Other' }[state.meta.approach] || '—'],
        ['Dataset', `${state.docs.length} document(s) — ${Object.entries(kinds).map(([k, v]) => `${v} ${k.toUpperCase()}`).join(', ') || 'none'}`],
        ['Participants', String(nPart)],
        ['Coded extracts', String(state.segments.length)],
        ['Codes', String(state.codes.length)],
        ['Themes', `${themes.length} theme(s), ${subs} subtheme(s)`],
        ['Theme status', statusLine],
        ['Reflexive journal entries', String(journal)],
        ['Audit trail entries', String(state.logs.length)]
      ]
    };
  }
  if (id === 'participants') {
    const keys = [];
    for (const p of countedParticipants()) for (const k of Object.keys(p.attributes || {})) if (!keys.includes(k)) keys.push(k);
    const parts = countedParticipants().sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    return {
      title: 'Table 1. Participant characteristics',
      note: 'Attributes come from the CSV columns or from Edit participant (key: value lines). Interviewers and moderators are not listed.',
      headers: ['Participant', ...keys, 'Documents', 'Coded extracts'],
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
        `${t.name}${t.status === 'discarded' ? ' (set aside)' : ''}\n[${cov.participants.size}${nPart ? `/${nPart}` : ''} participants]`,
        subs.length ? '' : '—',
        t.definition || '—',
        own.map(c => c.name).join('; ') || '—',
        pickExtracts(ownSegs, opts.maxExtracts).map(extractCite).join('\n') || '—'
      ]);
      for (const s of subs) {
        rows.push([
          '',
          `${s.name}${s.status === 'discarded' ? ' (set aside)' : ''}`,
          s.definition || '—',
          codesForTheme(s.id, false).map(c => c.name).join('; ') || '—',
          pickExtracts(segmentsForTheme(s.id, false), opts.maxExtracts).map(extractCite).join('\n') || '—'
        ]);
      }
    }
    return {
      title: 'Table 2. Themes, subthemes and illustrative extracts',
      note: 'Key extracts (★ in tab 1) are used first; otherwise extracts are spread across participants.',
      headers: ['Theme', 'Subtheme', 'Definition', 'Codes', 'Illustrative extracts'],
      rows
    };
  }
  if (id === 'matrix') {
    const parts = countedParticipants().sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
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
      title: 'Table 3. Contribution of participants to themes',
      note: '● = at least one coded extract from the participant sits in a code of the theme (or its subthemes). In reflexive TA, prevalence does not decide what is a theme.',
      headers: ['Theme', ...parts.map(p => p.label), 'n'],
      rows
    };
  }
  if (id === 'codebook') {
    return {
      title: 'Table 4. Codebook',
      note: '',
      headers: ['Code', 'Description', 'Theme(s)', 'Extracts', 'Participants', 'Documents'],
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
      title: 'Appendix A. Audit trail and reflexive journal',
      note: (opts.includeCodingActions ? 'All entries, including single coding actions.' : 'Interpretive decisions and journal entries (single coding actions omitted).') + ' “Why” is the reason recorded with a decision; “About” links a note to an earlier entry.',
      headers: ['Date', 'Type', 'Entry', 'Details'],
      rows: logs.map(l => [
        fmtTime(l.ts) + (l.by ? `\n${l.by}` : ''),
        (LOG_CATEGORIES[l.category] || LOG_CATEGORIES.system).label,
        l.action,
        [
          l.detail,
          l.from ? `From: ${l.from}` : '',
          l.to ? `To: ${l.to}` : '',
          l.reason ? `Why: ${l.reason}` : '',
          l.linkedLogId ? `About: ${state.logs.find(x => x.id === l.linkedLogId)?.action || '(removed entry)'}` : '',
          logContextText(l.ctx)
        ].filter(Boolean).join('\n') || '—'
      ])
    };
  }
  return { title: '', note: '', headers: [], rows: [] };
}

function logContextText(ctx) {
  if (!ctx) return '';
  const parts = [];
  if (ctx.doc) parts.push(`document “${ctx.doc.name}”`);
  if (ctx.extract) parts.push(`extract “${clip(ctx.extract.text, 80)}”`);
  if (ctx.quote) parts.push(`passage “${clip(ctx.quote.text, 80)}”`);
  if (ctx.theme) parts.push(`theme “${ctx.theme.name}”`);
  return parts.length ? `Context: ${parts.join(' · ')}` : '';
}

// ========================================================
// RENDERERS
// ========================================================
function specToHtml(spec) {
  const cell = v => escapeHtml(v).replace(/\n/g, '<br>');
  return `<h3 style="font-family:Georgia,serif;font-size:15px;font-weight:bold;color:#0f172a;margin:0 0 6px">${escapeHtml(spec.title)}</h3>
    <table class="pub-table"><thead><tr>${spec.headers.map(h => `<th>${cell(h)}</th>`).join('')}</tr></thead>
    <tbody>${spec.rows.length ? spec.rows.map(r => `<tr>${r.map(v => `<td>${cell(v)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${spec.headers.length}" style="color:#94a3b8">No data yet.</td></tr>`}</tbody></table>
    ${spec.note ? `<p style="font-family:Georgia,serif;font-size:11px;color:#64748b;font-style:italic;margin-top:6px">Note. ${escapeHtml(spec.note)}</p>` : ''}`;
}
function specToMarkdown(spec) {
  const esc = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  let md = `### ${spec.title}\n\n| ${spec.headers.map(esc).join(' | ')} |\n| ${spec.headers.map(() => '---').join(' | ')} |\n`;
  for (const r of spec.rows) md += `| ${r.map(esc).join(' | ')} |\n`;
  if (spec.note) md += `\n*Note.* ${spec.note}\n`;
  return md + '\n';
}
function rowsToCsv(headers, rows) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '﻿' + [headers, ...rows].map(r => r.map(q).join(',')).join('\r\n');
}

function renderExportView() {
  const nav = document.getElementById('exportNav');
  nav.innerHTML = EXPORT_TABLES.map(t => `<button data-t="${t.id}" class="w-full text-left px-3 py-2 text-xs rounded-md cursor-pointer ${state.exportTable === t.id ? 'bg-indigo-600 text-white font-bold' : 'text-slate-700 hover:bg-slate-100'}">${t.label}</button>`).join('');
  nav.querySelectorAll('button').forEach(b => b.onclick = () => { state.exportTable = b.dataset.t; renderExportView(); });
  document.getElementById('exportPreview').innerHTML = specToHtml(getTableSpec(state.exportTable));
}

async function copyCurrentTable() {
  const spec = getTableSpec(state.exportTable);
  const html = specToHtml(spec).replace('class="pub-table"', 'border="1" style="border-collapse:collapse;font-family:Times New Roman;font-size:10pt"');
  const text = [spec.title, spec.headers.join('\t'), ...spec.rows.map(r => r.join('\t').replace(/\n/g, ' / '))].join('\n');
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    showToast('Table copied — paste into Word or Google Docs', 'success');
  } catch (e) {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('exportPreview'));
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    document.execCommand('copy');
    sel.removeAllRanges();
    showToast('Table copied', 'success');
  }
}

function downloadMarkdown() {
  const opts = exportOptions();
  const md = `# ${state.meta.name || 'Thematic analysis'}\n\n` + EXPORT_TABLES.map(t => specToMarkdown(getTableSpec(t.id, opts))).join('');
  downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${safeFileStem()}_tables.md`);
}
function downloadCurrentCsv() {
  const spec = getTableSpec(state.exportTable);
  downloadBlob(new Blob([rowsToCsv(spec.headers, spec.rows)], { type: 'text/csv;charset=utf-8' }), `${safeFileStem()}_${state.exportTable}.csv`);
}
// Long format: one row per extract × code, for re-analysis in R / Excel
function downloadExtractsCsv() {
  const headers = ['Document', 'Participant', 'Code', 'Theme(s)', 'Extract', 'Key extract', 'Memo', 'Start', 'End', 'Coded by', 'Coded at'];
  const rows = [];
  for (const s of state.segments) {
    for (const cid of s.codeIds) {
      const c = codeById(cid);
      if (!c) continue;
      rows.push([docById(s.docId)?.name || '', participantLabels(participantsForRange(s.docId, s.s, s.e)), c.name,
        c.themeIds.map(t => themeById(t)?.name).filter(Boolean).join('; '), s.text, s.key ? 'yes' : '', s.memo || '', s.s, s.e, s.createdBy || '', new Date(s.createdAt).toISOString()]);
    }
  }
  downloadBlob(new Blob([rowsToCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }), `${safeFileStem()}_extracts.csv`);
}

async function downloadDocx() {
  if (typeof docx === 'undefined') { alert('docx library not loaded'); return; }
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, PageOrientation } = docx;
  const opts = exportOptions();
  const thick = { style: BorderStyle.SINGLE, size: 12, color: '0F172A' };
  const thin = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const run = (text, extra = {}) => new TextRun({ text, font: 'Times New Roman', size: 20, ...extra });
  const cellOf = (v, { header = false, last = false } = {}) => new TableCell({
    children: String(v ?? '').split('\n').map(line => new Paragraph({ children: [run(line, { bold: header })], spacing: { after: 40 } })),
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    borders: { top: header ? thick : none, bottom: header ? thick : (last ? thick : thin), left: none, right: none }
  });
  const children = [new Paragraph({ children: [run(state.meta.name || 'Thematic analysis', { bold: true, size: 28 })], spacing: { after: 240 } })];
  for (const t of EXPORT_TABLES) {
    const spec = getTableSpec(t.id, opts);
    children.push(new Paragraph({ children: [run(spec.title, { bold: true, size: 24 })], spacing: { before: 360, after: 120 } }));
    const rows = spec.rows.length ? spec.rows : [spec.headers.map((_, i) => i === 0 ? 'No data yet.' : '')];
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: spec.headers.map(h => cellOf(h, { header: true })) }),
        ...rows.map((r, i) => new TableRow({ children: r.map(v => cellOf(v, { last: i === rows.length - 1 })) }))
      ]
    }));
    if (spec.note) children.push(new Paragraph({ children: [run('Note. ', { italics: true, size: 18 }), run(spec.note, { size: 18 })], spacing: { before: 80 } }));
  }
  const d = new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } }, children }] });
  const blob = await Packer.toBlob(d);
  downloadBlob(blob, `${safeFileStem()}_tables.docx`);
  await recordLog({ category: 'system', action: 'Exported write-up tables (.docx)' });
}

function setupExportEvents() {
  document.getElementById('copyTableBtn').onclick = copyCurrentTable;
  document.getElementById('mdBtn').onclick = downloadMarkdown;
  document.getElementById('csvBtn').onclick = downloadCurrentCsv;
  document.getElementById('extractsCsvBtn').onclick = downloadExtractsCsv;
  document.getElementById('docxBtn').onclick = downloadDocx;
  ['optMaxExtracts', 'optIncludeCoding', 'optIncludeSetAside'].forEach(id => document.getElementById(id).addEventListener('change', renderExportView));
}
