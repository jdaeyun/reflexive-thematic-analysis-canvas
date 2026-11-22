// Reflexive Thematic Analysis Canvas — File importers
// MIT License · https://github.com/jdaeyun/reflexive-thematic-analysis-canvas
// Every source is converted once, at import, into fixed plain text + blocks (paragraphs / lines / CSV cells).
// Codes and participant tags point at character offsets in that text, so the text must never change afterwards.
//   .txt  — UTF-8 / UTF-16 (BOM) / Shift_JIS, detected automatically
//   .csv  — Papa Parse; the user picks text columns, the participant ID column and attribute columns
//   .docx — mammoth.js (raw text)
//   .doc  — Word 97–2003 binary: small built-in reader (OLE compound file + piece table), no library
//   .qdpx — REFI-QDA project from other QDA software: see refi-qda.js (added to the current project)

// ========================================================
// TEXT DECODING
// ========================================================
function decodeTextBytes(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return { text: new TextDecoder('utf-8').decode(b.subarray(3)), encoding: 'UTF-8 (BOM)' };
  if (b[0] === 0xFF && b[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 'UTF-16LE' };
  if (b[0] === 0xFE && b[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 'UTF-16BE' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'UTF-8' };
  } catch (e) {
    // Not valid UTF-8: in Japanese settings this is almost always Shift_JIS (Windows Notepad / Excel CSV)
    return { text: new TextDecoder('shift_jis').decode(b), encoding: 'Shift_JIS' };
  }
}

// Normalise line breaks, drop empty lines, and build one block per remaining line.
// Speaker-turn transcripts are line based, and .docx/.doc paragraphs become lines too.
// Unicode NFC first (e.g. が, not か + combining ゛, as text from macOS sometimes arrives): the text is fixed from
// here on and every offset points into it, so this is the only moment it can be done. (.qdpx keeps its text as is:
// its coding positions refer to the original.)
function textToDoc(raw) {
  const lines = String(raw).normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u000b\u000c\u2028\u2029]/g, '\n')
    .replace(/ /g, ' ')
    .split('\n')
    .map(l => l.replace(/[\t ]+$/g, ''))
    .filter(l => l.trim() !== '');
  let text = '';
  const blocks = [];
  lines.forEach((line, i) => {
    if (i > 0) text += '\n';
    blocks.push({ s: text.length, e: text.length + line.length, label: '' });
    text += line;
  });
  return { text, blocks };
}

// ========================================================
// .doc (Word 97–2003) — OLE compound file + piece table
// ========================================================
function readCompoundFile(buf) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const sig = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  if (!sig.every((v, i) => u8[i] === v)) throw new Error(tr('imp.notDoc'));
  const secSize = 1 << dv.getUint16(0x1E, true);
  const miniSize = 1 << dv.getUint16(0x20, true);
  const numFat = dv.getUint32(0x2C, true);
  const firstDir = dv.getUint32(0x30, true);
  const miniCutoff = dv.getUint32(0x38, true);
  const firstMiniFat = dv.getUint32(0x3C, true);
  let difatSec = dv.getUint32(0x44, true);
  const secOff = n => (n + 1) * secSize;
  const ENDCHAIN = 0xFFFFFFFE, FREESECT = 0xFFFFFFFF;

  // FAT sector list from the header DIFAT (109 entries) and DIFAT chain
  const fatSecs = [];
  for (let i = 0; i < 109 && fatSecs.length < numFat; i++) {
    const v = dv.getUint32(0x4C + i * 4, true);
    if (v !== FREESECT) fatSecs.push(v);
  }
  let guard = 0;
  while (difatSec !== ENDCHAIN && difatSec !== FREESECT && fatSecs.length < numFat && guard++ < 10000) {
    const off = secOff(difatSec);
    const per = secSize / 4 - 1;
    for (let i = 0; i < per && fatSecs.length < numFat; i++) {
      const v = dv.getUint32(off + i * 4, true);
      if (v !== FREESECT) fatSecs.push(v);
    }
    difatSec = dv.getUint32(off + per * 4, true);
  }
  const fat = [];
  for (const s of fatSecs) {
    const off = secOff(s);
    for (let i = 0; i < secSize / 4; i++) fat.push(dv.getUint32(off + i * 4, true));
  }
  const chain = (start, table) => {
    const out = [];
    let s = start, g = 0;
    while (s !== ENDCHAIN && s !== FREESECT && s < table.length && g++ < 1e6) { out.push(s); s = table[s]; }
    return out;
  };
  const readChain = (start, size) => {
    const secs = chain(start, fat);
    const out = new Uint8Array(secs.length * secSize);
    secs.forEach((s, i) => out.set(u8.subarray(secOff(s), secOff(s) + secSize), i * secSize));
    return size != null ? out.subarray(0, size) : out;
  };

  // Directory
  const dirBytes = readChain(firstDir);
  const ddv = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
  const entries = [];
  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const nameLen = ddv.getUint16(off + 0x40, true);
    const type = ddv.getUint8(off + 0x42);
    if (!type) continue;
    let name = '';
    for (let i = 0; i < Math.max(0, nameLen / 2 - 1); i++) name += String.fromCharCode(ddv.getUint16(off + i * 2, true));
    entries.push({ name, type, start: ddv.getUint32(off + 0x74, true), size: ddv.getUint32(off + 0x78, true) });
  }
  const root = entries.find(e => e.type === 5);
  const miniStream = root ? readChain(root.start, root.size) : new Uint8Array(0);
  const miniFat = [];
  if (firstMiniFat !== ENDCHAIN && firstMiniFat !== FREESECT) {
    const mf = readChain(firstMiniFat);
    const mdv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
    for (let i = 0; i < mf.length / 4; i++) miniFat.push(mdv.getUint32(i * 4, true));
  }
  const getStream = (name) => {
    const e = entries.find(x => x.type === 2 && x.name === name);
    if (!e) return null;
    if (e.size < miniCutoff) {
      const secs = chain(e.start, miniFat);
      const out = new Uint8Array(secs.length * miniSize);
      secs.forEach((s, i) => out.set(miniStream.subarray(s * miniSize, (s + 1) * miniSize), i * miniSize));
      return out.subarray(0, e.size);
    }
    return readChain(e.start, e.size);
  };
  return { getStream };
}

function parseDocBinary(buf) {
  const cf = readCompoundFile(buf);
  const wd = cf.getStream('WordDocument');
  if (!wd) throw new Error(tr('imp.notWord'));
  const w = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
  if (w.getUint16(0, true) !== 0xA5EC) throw new Error(tr('imp.oldWord'));
  const flags = w.getUint16(0x0A, true);
  if (flags & 0x0100) throw new Error(tr('imp.encrypted'));
  const table = cf.getStream((flags & 0x0200) ? '1Table' : '0Table');
  if (!table) throw new Error(tr('imp.broken'));

  // FIB: FibBase (32) · csw + fibRgW · cslw + fibRgLw · cbRgFcLcb + fibRgFcLcb
  let p = 32;
  const csw = w.getUint16(p, true); p += 2 + csw * 2;
  const cslw = w.getUint16(p, true); p += 2;
  const lwStart = p;
  const ccpText = w.getInt32(lwStart + 3 * 4, true); // main document length in characters
  p += cslw * 4;
  p += 2; // cbRgFcLcb
  const fcClx = w.getUint32(p + 33 * 8, true);
  const lcbClx = w.getUint32(p + 33 * 8 + 4, true);
  if (!lcbClx) throw new Error(tr('imp.broken'));

  const t = new DataView(table.buffer, table.byteOffset, table.byteLength);
  let q = fcClx;
  const end = fcClx + lcbClx;
  while (q < end && t.getUint8(q) === 0x01) q += 3 + t.getInt16(q + 1, true); // skip Prc entries
  if (t.getUint8(q) !== 0x02) throw new Error(tr('imp.broken'));
  const lcb = t.getUint32(q + 1, true);
  const plc = q + 5;
  const n = (lcb - 4) / 12;
  const cp = i => t.getUint32(plc + i * 4, true);
  const win1252 = new TextDecoder('windows-1252');
  const utf16 = new TextDecoder('utf-16le');
  let text = '';
  for (let i = 0; i < n; i++) {
    const cpStart = cp(i), cpEnd = cp(i + 1);
    if (cpStart >= ccpText) break;
    const len = Math.min(cpEnd, ccpText) - cpStart;
    const fcRaw = t.getUint32(plc + (n + 1) * 4 + i * 8 + 2, true);
    const compressed = (fcRaw & 0x40000000) !== 0;
    const fc = fcRaw & 0x3FFFFFFF;
    if (compressed) text += win1252.decode(wd.subarray(fc / 2, fc / 2 + len));
    else text += utf16.decode(wd.subarray(fc, fc + len * 2));
  }
  return cleanWordSpecialChars(text);
}

// Word control characters: keep field results, drop field codes and object anchors
function cleanWordSpecialChars(s) {
  let out = '';
  const stack = []; // per open field: true while inside the field code (before \x14)
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c === 0x13) { stack.push(true); continue; }
    if (c === 0x14) { if (stack.length) stack[stack.length - 1] = false; continue; }
    if (c === 0x15) { stack.pop(); continue; }
    if (stack.length && stack[stack.length - 1]) continue;
    if (c === 0x0D || c === 0x07 || c === 0x0B || c === 0x0C) { out += '\n'; continue; }
    if (c === 0x1E) { out += '-'; continue; }
    if (c === 0x1F || c === 0x01 || c === 0x02 || c === 0x08 || c === 0x05) continue;
    if (c === 0x09) { out += '\t'; continue; }
    if (c < 0x20) continue;
    out += ch;
  }
  return out;
}

// ========================================================
// DISPATCH
// ========================================================
function fileKind(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return ['txt', 'csv', 'docx', 'doc', 'qdpx'].includes(ext) ? ext : null;
}

async function importFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  let added = 0;
  for (const f of files) {
    const kind = fileKind(f.name);
    if (!kind) { showToast(tr('imp.skipped', { file: f.name }), 'error'); continue; }
    if (kind === 'qdpx') {
      try { await importQdpx(f); } catch (e) { commitUndo(); renderAll(); console.error(e); showToast(tr('imp.failed', { file: f.name, msg: e.message }), 'error'); }
      continue;
    }
    if (state.docs.some(d => d.name === f.name)) {
      if (!confirm(tr('imp.duplicate', { file: f.name }))) continue;
    }
    try {
      const buf = await f.arrayBuffer();
      if (kind === 'csv') {
        const { text, encoding } = decodeTextBytes(buf);
        await openCsvImportDialog(f.name, text.normalize('NFC'), encoding); // NFC: see textToDoc
        continue; // the dialog adds the document itself
      }
      let raw = '', encoding = '';
      if (kind === 'txt') ({ text: raw, encoding } = decodeTextBytes(buf));
      else if (kind === 'docx') {
        if (typeof mammoth === 'undefined') throw new Error(tr('err.mammoth'));
        const res = await mammoth.extractRawText({ arrayBuffer: buf });
        raw = res.value; encoding = 'Word (.docx)';
      } else if (kind === 'doc') {
        raw = parseDocBinary(buf); encoding = 'Word 97–2003 (.doc)';
      }
      const { text, blocks } = textToDoc(raw);
      if (!text) throw new Error(tr('imp.noText'));
      await addDocument({ name: f.name, kind, encoding, text, blocks });
      added++;
    } catch (e) {
      console.error(e);
      showToast(tr('imp.failed', { file: f.name, msg: e.message }), 'error');
    }
  }
  if (added) showToast(tr('imp.done', { n: added }), 'success');
}

async function addDocument({ name, kind, encoding, text, blocks, ptags = [] }) {
  const doc = { id: uid('doc'), name, kind, encoding, text, blocks, defaultParticipantId: null, note: '', createdAt: Date.now() };
  state.docs.push(doc);
  await dbPut('docs', doc);
  for (const p of ptags) p.docId = doc.id;
  state.ptags.push(...ptags);
  await dbPutMany('ptags', ptags);
  await recordLog({ category: 'import', ak: 'log.imported', ap: { doc: name }, dk: 'log.d.imported', dp: { kind: kind.toUpperCase(), enc: encoding, chars: text.length, n: blocks.length } });
  state.activeDocId = doc.id;
  renderAll();
  return doc;
}

// Find or create a participant by its label
async function ensureParticipant(label, attributes = {}) {
  const clean = String(label).trim();
  let p = state.participants.find(x => x.label === clean);
  if (!p) {
    p = { id: uid('par'), label: clean, role: INTERVIEWER_LABEL.test(clean) ? 'interviewer' : 'participant', attributes: {}, color: PARTICIPANT_COLORS[state.participants.length % PARTICIPANT_COLORS.length], createdAt: Date.now() };
    state.participants.push(p);
  }
  for (const [k, v] of Object.entries(attributes)) if (v !== '' && v != null) p.attributes[k] = v;
  await dbPut('participants', p);
  return p;
}

// ========================================================
// CSV IMPORT DIALOG
// ========================================================
function openCsvImportDialog(filename, text, encoding) {
  return new Promise((resolve) => {
    const parsed = Papa.parse(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
    const rows = parsed.data;
    if (!rows.length || rows.length < 2) { showToast(tr('csv.needRows', { file: filename }), 'error'); resolve(); return; }
    const header = rows[0].map((h, i) => String(h || '').trim() || tr('csv.column', { n: i + 1 }));
    const data = rows.slice(1);
    // Guess: the longest average column is free text; a column named like ID is the participant
    const avgLen = header.map((_, ci) => data.reduce((a, r) => a + String(r[ci] || '').length, 0) / data.length);
    const idGuess = header.findIndex(h => /^(id|participant|respondent|no\.?|番号|回答者|参加者|対象者|ID)/i.test(h));
    const textGuess = avgLen.map((v, i) => ({ v, i })).filter(x => x.i !== idGuess && x.v >= 15).map(x => x.i);

    const modal = document.getElementById('csvModal');
    document.getElementById('csvModalTitle').textContent = filename;
    document.getElementById('csvModalInfo').textContent = tr('csv.info', { rows: data.length, cols: header.length, enc: encodingLabel(encoding) });
    const tbody = document.getElementById('csvColumnRows');
    tbody.innerHTML = header.map((h, i) => `
      <tr class="border-b border-slate-100">
        <td class="py-1.5 pr-2 text-xs font-semibold text-slate-800">${escapeHtml(h)}</td>
        <td class="py-1.5 pr-2 text-[11px] text-slate-500 max-w-[260px] truncate">${escapeHtml(clip(data[0][i], 60))}</td>
        <td class="py-1.5 text-center"><input type="radio" name="csvIdCol" value="${i}" ${i === idGuess ? 'checked' : ''}></td>
        <td class="py-1.5 text-center"><input type="checkbox" class="csv-text" value="${i}" ${textGuess.includes(i) ? 'checked' : ''}></td>
        <td class="py-1.5 text-center"><input type="checkbox" class="csv-attr" value="${i}" ${!textGuess.includes(i) && i !== idGuess ? 'checked' : ''}></td>
      </tr>`).join('') + `
      <tr><td class="py-1.5 text-[11px] text-slate-500" colspan="2">${escapeHtml(tr('csv.noIdCol'))}</td>
        <td class="py-1.5 text-center"><input type="radio" name="csvIdCol" value="-1" ${idGuess < 0 ? 'checked' : ''}></td><td></td><td></td></tr>`;
    modal.classList.remove('hidden');

    const close = () => { modal.classList.add('hidden'); okBtn.onclick = null; cancelBtn.onclick = null; resolve(); };
    const okBtn = document.getElementById('csvImportOk');
    const cancelBtn = document.getElementById('csvImportCancel');
    cancelBtn.onclick = close;
    okBtn.onclick = async () => {
      const idCol = Number((modal.querySelector('input[name="csvIdCol"]:checked') || {}).value ?? -1);
      const textCols = [...modal.querySelectorAll('.csv-text:checked')].map(x => Number(x.value));
      const attrCols = [...modal.querySelectorAll('.csv-attr:checked')].map(x => Number(x.value)).filter(i => i !== idCol && !textCols.includes(i));
      if (!textCols.length) { alert(tr('csv.needTextCol')); return; }
      let fullText = '';
      const blocks = [], ptags = [];
      for (let r = 0; r < data.length; r++) {
        const row = data[r];
        const label = idCol >= 0 && String(row[idCol] || '').trim() ? String(row[idCol]).trim() : tr('csv.row', { n: r + 1 });
        const attrs = {};
        for (const ci of attrCols) attrs[header[ci]] = String(row[ci] ?? '').trim();
        const cells = textCols.map(ci => ({ ci, v: String(row[ci] ?? '').replace(/\r\n?/g, '\n').replace(/\n+/g, ' ').trim() })).filter(x => x.v);
        if (!cells.length) continue;
        const part = await ensureParticipant(label, attrs);
        for (const { ci, v } of cells) {
          if (fullText) fullText += '\n';
          const s = fullText.length;
          fullText += v;
          blocks.push({ s, e: fullText.length, label: `${label} · ${header[ci]}` });
          ptags.push({ id: uid('pt'), docId: null, s, e: fullText.length, participantId: part.id });
        }
      }
      if (!fullText) { alert(tr('csv.empty')); return; }
      modal.classList.add('hidden');
      await addDocument({ name: filename, kind: 'csv', encoding, text: fullText, blocks, ptags });
      showToast(tr('csv.done', { file: filename, n: blocks.length }), 'success');
      okBtn.onclick = null; cancelBtn.onclick = null;
      resolve();
    };
  });
}
