// Reflexive Thematic Analysis Canvas — Thematic map (Tab 2, "Map" view)
// MIT License · https://github.com/jdaeyun/reflexive-thematic-analysis-canvas
// A thematic map shows themes, their subthemes and the relationships the researcher sees between themes
// (Braun & Clarke; RTARG: "overview of themes or thematic structure — a list, map or table").
// Positions are layout only (theme.mapX / mapY, not logged). Links between themes are interpretive
// claims, so adding, labelling and removing them is logged. Themes set aside are not drawn.
// buildMapSvg() returns a standalone SVG used for the screen, the SVG download and the .docx figure.

const MAP = { themeW: 210, subW: 176, pad: 12, lineH: 17, subLineH: 15 };
const mapUi = { linkMode: false, linkFrom: null, drag: null, popover: null };

function mapLinks() {
  if (!Array.isArray(state.meta.mapLinks)) state.meta.mapLinks = [];
  return state.meta.mapLinks;
}
function mapThemes() {
  const out = [];
  for (const t of sortedThemes(null)) {
    if (t.status === 'discarded') continue;
    out.push({ t, depth: 0 });
    for (const s of sortedThemes(t.id)) if (s.status !== 'discarded') out.push({ t: s, depth: 1 });
  }
  return out;
}

// Word wrap with real text widths (works for Japanese, which has no spaces)
let mapMeasureCtx = null;
function wrapText(text, maxW, font) {
  if (!mapMeasureCtx) mapMeasureCtx = document.createElement('canvas').getContext('2d');
  mapMeasureCtx.font = font;
  const lines = [];
  let line = '';
  const tokens = String(text).match(/[A-Za-z0-9'’\-]+\s*|\s+|./gu) || [];
  for (const tok of tokens) {
    const next = line + tok;
    if (mapMeasureCtx.measureText(next.trimEnd()).width > maxW && line) { lines.push(line.trimEnd()); line = tok.trimStart(); }
    else line = next;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.slice(0, 5);
}

// Node boxes with default positions for themes that were never placed
function mapLayout() {
  const items = mapThemes();
  const tops = items.filter(i => i.depth === 0);
  const nodes = new Map();
  // Default layout: each theme gets a column wide enough for its subthemes; columns wrap into rows
  const ROW_MAX = 1250, ROW_H = 300;
  let cx = 30, cy = 40;
  tops.forEach(({ t }) => {
    const lines = wrapText(t.name, MAP.themeW - MAP.pad * 2, '600 13px sans-serif');
    const h = MAP.pad * 2 + lines.length * MAP.lineH + 14;
    const nSubs = items.filter(i => i.depth === 1 && i.t.parentId === t.id).length;
    const colW = Math.max(MAP.themeW, nSubs * (MAP.subW + 16) - 16) + 50;
    if (cx > 30 && cx + colW > ROW_MAX) { cx = 30; cy += ROW_H; }
    const x = Number.isFinite(t.mapX) ? t.mapX : cx + (colW - 50) / 2 - MAP.themeW / 2;
    const y = Number.isFinite(t.mapY) ? t.mapY : cy;
    nodes.set(t.id, { t, depth: 0, x, y, w: MAP.themeW, h, lines });
    cx += colW;
  });
  for (const { t } of items.filter(i => i.depth === 1)) {
    const parent = nodes.get(t.parentId);
    if (!parent) continue;
    const sibs = items.filter(i => i.depth === 1 && i.t.parentId === t.parentId).map(i => i.t.id);
    const k = sibs.indexOf(t.id);
    const lines = wrapText(t.name, MAP.subW - MAP.pad * 2, '12px sans-serif');
    const h = MAP.pad * 2 + lines.length * MAP.subLineH;
    const x = Number.isFinite(t.mapX) ? t.mapX : Math.max(10, parent.x + parent.w / 2 - MAP.subW / 2 + (k - (sibs.length - 1) / 2) * (MAP.subW + 16));
    const y = Number.isFinite(t.mapY) ? t.mapY : parent.y + parent.h + 70;
    nodes.set(t.id, { t, depth: 1, x, y, w: MAP.subW, h, lines });
  }
  return nodes;
}

// Point where the line from a box centre towards (tx, ty) leaves the box
function boxEdge(n, tx, ty) {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const sx = (n.w / 2) / Math.abs(dx || 1e-9), sy = (n.h / 2) / Math.abs(dy || 1e-9);
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}

const MAP_STATUS_COLORS = { candidate: '#d97706', reviewed: '#0284c7', defined: '#059669' };

function buildMapSvg({ interactive = false, lang = LANG } = {}) {
  const nodes = mapLayout();
  if (!nodes.size) return '';
  let maxX = 0, maxY = 0, minX = Infinity, minY = Infinity;
  for (const n of nodes.values()) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h); }
  // Exported pictures are cropped to the content; the screen keeps the origin so dragging stays predictable
  const ox = interactive ? 0 : minX - 30, oy = interactive ? 0 : minY - 30;
  const W = (interactive ? Math.max(maxX + 60, 900) : maxX - minX + 60), H = (interactive ? Math.max(maxY + 80, 520) : maxY - minY + 60);
  const parts = [];
  // subtheme connectors
  for (const n of nodes.values()) {
    if (n.depth !== 1) continue;
    const p = nodes.get(n.t.parentId);
    if (!p) continue;
    const [x1, y1] = boxEdge(p, n.x + n.w / 2, n.y + n.h / 2), [x2, y2] = boxEdge(n, p.x + p.w / 2, p.y + p.h / 2);
    parts.push(`<line x1="${x1 - ox}" y1="${y1 - oy}" x2="${x2 - ox}" y2="${y2 - oy}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 3"/>`);
  }
  // relationships between themes (researcher's links)
  for (const l of mapLinks()) {
    const a = nodes.get(l.from), b = nodes.get(l.to);
    if (!a || !b) continue;
    const [x1, y1] = boxEdge(a, b.x + b.w / 2, b.y + b.h / 2), [x2, y2] = boxEdge(b, a.x + a.w / 2, a.y + a.h / 2);
    const mx = (x1 + x2) / 2 - ox, my = (y1 + y2) / 2 - oy;
    parts.push(`<g ${interactive ? `class="map-link" data-link="${l.id}" style="cursor:pointer"` : ''}>
      ${interactive ? `<line x1="${x1 - ox}" y1="${y1 - oy}" x2="${x2 - ox}" y2="${y2 - oy}" stroke="transparent" stroke-width="12"/>` : ''}
      <line x1="${x1 - ox}" y1="${y1 - oy}" x2="${x2 - ox}" y2="${y2 - oy}" stroke="#475569" stroke-width="2"/>
      ${l.label ? (() => {
        const lines = wrapText(l.label, 150, '11px sans-serif');
        const lw = Math.min(160, Math.max(...lines.map(s => { mapMeasureCtx.font = '11px sans-serif'; return mapMeasureCtx.measureText(s).width; })) + 12);
        const lh = lines.length * 14 + 6;
        return `<rect x="${mx - lw / 2}" y="${my - lh / 2}" width="${lw}" height="${lh}" rx="4" fill="#ffffff" stroke="#cbd5e1"/>` +
          lines.map((s, i) => `<text x="${mx}" y="${my - lh / 2 + 15 + i * 14}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#334155">${escapeHtml(s)}</text>`).join('');
      })() : ''}
    </g>`);
  }
  // theme and subtheme boxes
  for (const n of nodes.values()) {
    const col = MAP_STATUS_COLORS[n.t.status] || '#64748b';
    const sel = interactive && mapUi.linkFrom === n.t.id;
    const x = n.x - ox, y = n.y - oy;
    const top = n.depth === 0;
    parts.push(`<g ${interactive ? `class="map-node" data-theme="${n.t.id}" style="cursor:${mapUi.linkMode ? 'crosshair' : 'grab'}"` : ''}>
      <rect x="${x}" y="${y}" width="${n.w}" height="${n.h}" rx="${top ? 12 : 9}" fill="${top ? '#ffffff' : '#f8fafc'}" stroke="${sel ? '#7c3aed' : col}" stroke-width="${sel ? 3 : top ? 2 : 1.5}"/>
      ${n.lines.map((s, i) => `<text x="${x + n.w / 2}" y="${y + MAP.pad + (top ? 13 : 12) + i * (top ? MAP.lineH : MAP.subLineH)}" text-anchor="middle" font-family="sans-serif" font-size="${top ? 13 : 12}" font-weight="${top ? 600 : 400}" fill="#0f172a">${escapeHtml(s)}</text>`).join('')}
      ${top ? `<text x="${x + n.w / 2}" y="${y + n.h - 9}" text-anchor="middle" font-family="sans-serif" font-size="9.5" fill="${col}">${escapeHtml(statusLabel(n.t.status, lang))}</text>` : ''}
    </g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${interactive ? '' : `<rect width="${W}" height="${H}" fill="#ffffff"/>`}${parts.join('')}</svg>`;
}

// ========================================================
// SCREEN
// ========================================================
function renderThemeMap() {
  const wrap = document.getElementById('themeMapWrap');
  const svg = buildMapSvg({ interactive: true });
  document.getElementById('mapLinkBtn').classList.toggle('map-link-on', mapUi.linkMode);
  document.getElementById('mapHint').textContent = tr(mapUi.linkMode ? (mapUi.linkFrom ? 'map.hintLinkTo' : 'map.hintLinkFrom') : 'map.hint');
  if (!svg) {
    wrap.innerHTML = `<div class="text-xs text-slate-400 p-10 text-center">${escapeHtml(tr('map.empty'))}</div>`;
    return;
  }
  wrap.innerHTML = svg;
  const svgEl = wrap.querySelector('svg');
  svgEl.querySelectorAll('.map-node').forEach(g => {
    g.addEventListener('pointerdown', (e) => {
      const id = g.dataset.theme;
      if (mapUi.linkMode) { e.preventDefault(); onMapLinkClick(id); return; }
      const t = themeById(id);
      const n = mapLayout().get(id);
      mapUi.drag = { id, t, startX: e.clientX, startY: e.clientY, x0: n.x, y0: n.y, moved: false };
      svgEl.setPointerCapture(e.pointerId);
    });
  });
  svgEl.addEventListener('pointermove', (e) => {
    const d = mapUi.drag;
    if (!d) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    d.moved = true;
    // Moving a theme moves its subthemes with it
    const subs = sortedThemes(d.id);
    if (!d.subStart) { const lay = mapLayout(); d.subStart = subs.map(s => [s, lay.get(s.id)?.x ?? 0, lay.get(s.id)?.y ?? 0]); }
    d.t.mapX = Math.max(0, Math.round(d.x0 + dx)); d.t.mapY = Math.max(0, Math.round(d.y0 + dy));
    for (const [s, sx, sy] of d.subStart) { s.mapX = Math.max(0, Math.round(sx + dx)); s.mapY = Math.max(0, Math.round(sy + dy)); }
    if (!d.raf) d.raf = requestAnimationFrame(() => { d.raf = null; renderThemeMap(); });
  });
  svgEl.addEventListener('pointerup', async () => {
    const d = mapUi.drag;
    mapUi.drag = null;
    if (!d || !d.moved) return;
    renderThemeMap();
    await dbPutMany('themes', [d.t, ...(d.subStart || []).map(x => x[0])]);
  });
  svgEl.querySelectorAll('.map-link').forEach(g => g.addEventListener('click', (e) => openLinkEditor(g.dataset.link, e)));
}

async function onMapLinkClick(themeId) {
  if (!mapUi.linkFrom) { mapUi.linkFrom = themeId; renderThemeMap(); return; }
  if (mapUi.linkFrom === themeId) { mapUi.linkFrom = null; renderThemeMap(); return; }
  const from = mapUi.linkFrom, to = themeId;
  mapUi.linkFrom = null;
  if (mapLinks().some(l => (l.from === from && l.to === to) || (l.from === to && l.to === from))) { showToast(tr('map.linkExists')); renderThemeMap(); return; }
  const link = { id: uid('lnk'), from, to, label: '' };
  mapLinks().push(link);
  renderThemeMap();
  await saveMeta();
  await recordLog({ category: 'themes', ak: 'log.mapLinked', ap: { a: themeById(from)?.name || '', b: themeById(to)?.name || '' } });
  openLinkEditor(link.id);
}

// Small popover to label or remove a relationship
function openLinkEditor(linkId, ev) {
  const l = mapLinks().find(x => x.id === linkId);
  if (!l) return;
  const pop = document.getElementById('mapLinkPopover');
  const a = themeById(l.from)?.name || '', b = themeById(l.to)?.name || '';
  pop.innerHTML = `
    <div class="text-[11px] font-bold text-slate-700 mb-1">${escapeHtml(tr('map.linkBetween', { a: clip(a, 30), b: clip(b, 30) }))}</div>
    <input id="mapLinkLabel" class="w-full text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-indigo-500" value="${escapeHtml(l.label || '')}" placeholder="${escapeHtml(tr('map.labelPh'))}">
    <div class="flex justify-between mt-2">
      <button type="button" id="mapLinkDelete" class="text-[11px] text-rose-700 hover:underline cursor-pointer">${escapeHtml(tr('map.removeLink'))}</button>
      <button type="button" id="mapLinkOk" class="px-2 py-1 text-[11px] font-bold rounded bg-indigo-600 text-white cursor-pointer">${escapeHtml(tr('common.save'))}</button>
    </div>`;
  const wrapRect = document.getElementById('themeMapScroll').getBoundingClientRect();
  pop.style.left = `${Math.max(8, (ev ? ev.clientX : wrapRect.left + 200) - wrapRect.left - 120)}px`;
  pop.style.top = `${Math.max(8, (ev ? ev.clientY : wrapRect.top + 120) - wrapRect.top + 12)}px`;
  pop.classList.remove('hidden');
  const input = pop.querySelector('#mapLinkLabel');
  input.focus();
  const save = async () => {
    const v = input.value.trim();
    pop.classList.add('hidden');
    if (v === (l.label || '')) return;
    const before = l.label || '';
    l.label = v;
    renderThemeMap();
    await saveMeta();
    await recordLog({ category: 'themes', ak: 'log.mapLabel', ap: { a, b }, from: before, to: v });
  };
  pop.querySelector('#mapLinkOk').onclick = save;
  input.onkeydown = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') pop.classList.add('hidden'); };
  pop.querySelector('#mapLinkDelete').onclick = async () => {
    pop.classList.add('hidden');
    state.meta.mapLinks = mapLinks().filter(x => x.id !== l.id);
    renderThemeMap();
    await saveMeta();
    await recordLog({ category: 'themes', ak: 'log.mapUnlinked', ap: { a, b }, detail: l.label || '' });
  };
}

function downloadMapSvg() {
  const svg = buildMapSvg();
  if (!svg) { showToast(tr('map.empty')); return; }
  downloadBlob(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: 'image/svg+xml' }), `${safeFileStem()}_thematic-map.svg`);
}

// PNG bytes for the .docx figure (SVG → canvas). Resolves null if the browser cannot rasterise it.
function mapPng(lang = LANG, scale = 2) {
  const svg = buildMapSvg({ lang });
  if (!svg) return Promise.resolve(null);
  const m = svg.match(/width="([\d.]+)" height="([\d.]+)"/);
  const w = Number(m[1]), h = Number(m[2]);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
        const ctx = c.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        c.toBlob(async (b) => resolve(b ? { data: new Uint8Array(await b.arrayBuffer()), w, h } : null), 'image/png');
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

function setThemeView(view) {
  state.themeView = view;
  try { localStorage.setItem('ta_theme_view', view); } catch (e) { /* private mode */ }
  renderThemesView();
}

function setupMapEvents() {
  document.getElementById('viewBoardBtn').onclick = () => setThemeView('board');
  document.getElementById('viewMapBtn').onclick = () => setThemeView('map');
  document.getElementById('mapLinkBtn').onclick = () => { mapUi.linkMode = !mapUi.linkMode; mapUi.linkFrom = null; renderThemeMap(); };
  document.getElementById('mapSvgBtn').onclick = downloadMapSvg;
  document.getElementById('mapResetBtn').onclick = async () => {
    if (!confirm(tr('map.confirmReset'))) return;
    const changed = state.themes.filter(t => Number.isFinite(t.mapX) || Number.isFinite(t.mapY));
    for (const t of changed) { delete t.mapX; delete t.mapY; }
    renderThemeMap();
    await dbPutMany('themes', changed);
  };
  document.addEventListener('pointerdown', (e) => {
    const pop = document.getElementById('mapLinkPopover');
    if (!pop.classList.contains('hidden') && !e.target.closest('#mapLinkPopover, .map-link')) pop.classList.add('hidden');
  });
}
