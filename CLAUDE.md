# Reflexive Thematic Analysis Canvas — notes for AI assistants

Browser-only app for reflexive thematic analysis of text data (Braun & Clarke). Reflexive TA is the only
approach, by design (hence the name): no inter-coder agreement statistics, no codebook / framework mode, and none
planned — those approaches need the opposite design choices and would belong in a separate app. No server, no build step to run it,
no AI features (a deliberate design choice: do not add LLM calls). Works online and offline: opening
`ta_canvas.html` by double-click (file://) must keep working.
Third-party libraries are bundled in `app/vendor/` (committed): Tailwind 3.4.17 (prebuilt CSS), Phosphor Icons
2.1.1 (regular weight), docx 8.5.0, mammoth.js 1.13.0, Papa Parse 5.7.0. No CDN is used.
Derived from Meta-Ethnography Canvas (github.com/jdaeyun/meta-ethnography-canvas); same conventions.

## Layout

```
ta_canvas.html         markup only (4 tabs + modals); loads everything under app/
app/version.js         release info (version, date) — the one place to edit per release
app/js/i18n.js         tr(), applyI18n(), setLanguage(); English + Japanese dictionaries (auto = browser language)
app/css/ta_canvas.css  app-specific CSS (everything else is Tailwind classes)
app/js/core.js         IndexedDB, `state`, lookups, participantsForRange(), coverage(), recordLog(), undo snapshots
app/js/importers.js    .txt/.csv/.docx/.doc → fixed plain text + blocks; CSV column dialog; built-in .doc reader (.qdpx → refi-qda.js)
app/js/coding.js       Tab 1 (phases 1–2): documents, participants, viewer, selection, codebook, extract panel,
                       full-text search, extract range changes, splitting codes, extract filter (also used in tab 2)
app/js/themes.js       Tab 2 (phases 3–5): code pool, theme board, status / review / definition, gentle RTARG hints
app/js/thematic-map.js Tab 2 "Map" view: draggable themes, named links between themes, SVG / PNG for exports
app/js/audit.js        Tab 3: audit trail timeline, reflexive journal
app/js/journal.js      journal drawer (Ctrl/⌘+J), optional "Why?" decision prompt, context capture, structure snapshots + diff
app/js/export.js       Tab 4 (phase 6): analytic narrative editor (first view) + supporting table specs; copy / Markdown / CSV / .docx
app/js/refi-qda.js     REFI-QDA .qdpx export / import (built-in zip writer/reader; positions in code points, not UTF-16)
app/js/app.js          startup (DOMContentLoaded), tabs, project setup, backup / restore / reset, drag & drop, shortcuts
samples/               fictional test files in every supported format; samples/tutorial/{ja,en}: practice data for the 101
site/                  website (GitHub Pages): {ja,en}/index.html (landing), 101.html (tutorial), guide.html (reference);
                       assets/site.css; assets/img/{ja,en}/*.webp screenshots. Plain HTML, no build step
tools/site-screenshots.cjs  rebuilds the screenshots from samples/tutorial (needs Playwright + Python Pillow)
docs/rtarg-mapping*.md how the app maps to the RTARG (Braun & Clarke 2024); update it when a change affects reporting
```

## Data model (IndexedDB `ReflexiveThematicAnalysisCanvasDB`)

Renamed from Thematic Analysis Canvas in the v0.1 beta: Restore still accepts backups whose `app` is
`thematic-analysis-canvas`. The old IndexedDB (`ThematicAnalysisCanvasDB`) is not migrated.


- `docs`: `{ id, name, kind, encoding, text, blocks: [{ s, e, label }], defaultParticipantId, note }`.
  `text` is fixed at import. Never change it afterwards: everything else points at character offsets in it.
- `segments` (coded extracts): `{ docId, s, e, text, codeIds[], memo, key }`. Segments may overlap.
  One segment per exact range; applying another code to the same range adds to `codeIds`.
- `ptags` (speaker layer): `{ docId, s, e, participantId }`. One participant per character: tagging cuts
  overlapping ranges. Untagged text falls back to `doc.defaultParticipantId`.
- `participants`: `{ label, role: 'participant'|'interviewer', attributes }`. Interviewers are excluded from
  counts (`countedParticipants()`, `coverage()`).
- `codes`: `{ name, description, color, themeIds[] }` (a code may sit in several themes).
- `themes`: `{ name, parentId, status: candidate|reviewed|defined|discarded, definition, reviewNote, checkedExtracts, checkedDataset, order, narrative }`.
  `narrative` = the phase 6 analytic write-up for the theme; `mapX`/`mapY` = position on the thematic map (layout only).
- `meta` (project setup): `{ name, question, approach: 'reflexive', theory, orientInductive, orientLatent, dataPrep,
  storyline (overview), conclusions (general discussion), mapLinks: [{ id, from, to, label }] }`.
- `logs`: audit trail and journal `{ ts, category, action, detail, from, to, by, reason?, ctx?, snapshot?, linkedLogId? }`.
  `reason` = optional "why" for a decision; `ctx` = what was on screen (doc / extract / quote / theme);
  `snapshot` = theme tree + code names and counts (no extract text), taken on journal notes and theme status
  changes / deletes; `linkedLogId` = a note written about another entry. `meta`: project setup.

## Rules

- Classic `<script>` files sharing one global scope (not ES modules, so `file://` works). Keep the load order
  in `ta_canvas.html` (version → i18n → core → importers → coding → themes → thematic-map → audit → journal → export → refi-qda → app). Top-level code may
  only call functions from earlier files; anything else runs inside handlers or DOMContentLoaded.
- Log every interpretive change with `recordLog({ category, action, detail, from, to })`. Single coding
  actions use category `coding` (omitted from the appendix by default).
- Layout: every tab is [left column `.left-col` (shared, resizable width `--left-w`, saved as `ta_left_w`)]
  [centre column: phase strip on top, content in `.center-col` (centred, one max width)] [+ right column in tab 1].
  Keep new tabs and views to this shape so switching tabs does not move the page.
- Journal drawer: docked beside the workspace on wide screens; at ≤1100px it overlays and closes on an
  outside click (light dismiss). Closing never discards the draft (dot on the Journal button + edge handle).
- Reflexive notes are never required: no blocking dialogs asking for a note. Use `promptNote()` (small,
  self-dismissing) after significant decisions only, never after single coding actions.
- Before destructive changes call `pushUndo(label, [collections])` (snapshots whole collections).
- Update `state` and re-render first, then persist (`await dbPut…`). A render that lands after the user has
  started a new text selection would wipe it.
- Escape every user value interpolated into HTML with `escapeHtml()`.
- Exports are built from `getTableSpec(id)`; change the spec, not the renderers separately.
- The extract filter (`state.extractFilter`, `filterSegments()`) only narrows what is read: never apply it to counts,
  the theme structure or exports.
- `.qdpx` export must keep validating against the REFI-QDA Project 1.0 schema (element order matters). Import always
  adds to the current project, behind one `pushUndo`.
- Stay coherent with reflexive TA: prevalence counts are hidden by default (`state.showCounts`, counts toggle) and
  left out of exports unless `optCounts`; the code list is a record, not a codebook (`optCodeList`, off by default);
  phase 6 is the analytic narrative first, tables second; the participant table summarises the group unless
  `optParticipantRows` (RTARG: no line-by-line demographics). Hints are gentle and never block. Do not add features that treat frequency, agreement
  or a fixed codebook as markers of quality.
- Every UI string goes through `tr(key, params)` with the message in BOTH `I18N.en` and `I18N.ja` (app/js/i18n.js);
  static HTML uses data-i18n / data-i18n-html / data-i18n-ph / data-i18n-title. Do not name a local variable `tr`.
  Audit log entries store message keys (`ak`/`ap`, `dk`/`dp`, `ft: 'status'`) and are rendered with logAction() /
  logDetail() / logFromTo() in the chosen language; user-written text stays as typed. Undo labels are
  `[key, params]`. Write-up tables take their own language (`optTableLang`, default = interface language).

## Building app/vendor (only when libraries or Tailwind classes change)

Node.js LTS required. `npm install`, then `npm run build` (= `npm run vendor`: copy libraries + licences into
app/vendor and write THIRD_PARTY_NOTICES.md; `npm run css`: Tailwind CLI scans ta_canvas.html + app/js/**/*.js).
Re-run `npm run css` after using a Tailwind class that appears nowhere else. Write class names in full
(no string concatenation) so the scanner can see them. `npm run serve` serves http://localhost:8080.
Test both ways after changes: http and double-clicking ta_canvas.html (file://).

## Website (site/)

`.github/workflows/pages.yml` publishes site/ together with the app (ta_canvas.html, app/, samples/) and one practice-data
zip per language on every push to main; pages link to the app as `../ta_canvas.html`. When a change is visible in the
UI or changes how something works, update BOTH languages of the 101 and the guide, and re-run
`node tools/site-screenshots.cjs` if screenshots are affected. UI labels quoted on the site must match `I18N` exactly
(`<span class="ui">`). Japanese wording: コーディング (not コード化), フェーズ for phases, ステータス for a theme's status. The app's gear menu links to `{ja,en}/guide.html` (TA_SITE_URL in app.js).

## Releases

Update `app/version.js` and `CITATION.cff` (same version and date), commit, then publish a GitHub release
tagged `vX.Y.Z`. `.github/workflows/offline-zip.yml` checks the versions and attaches
`reflexive-thematic-analysis-canvas-offline.zip` (app + samples + README) to the release.
