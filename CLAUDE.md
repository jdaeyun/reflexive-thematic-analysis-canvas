# Reflexive Thematic Analysis Canvas — notes for AI assistants

Browser-only app for reflexive thematic analysis of text data (Braun & Clarke). Reflexive TA is the only
approach, by design (hence the name): no inter-coder agreement statistics, no codebook / framework mode, and none
planned — those approaches need the opposite design choices and would belong in a separate app. No server, no build step to run it,
no AI features (a deliberate design choice: do not add LLM calls). Works online (GitHub Pages) and offline: opening
`ta_canvas.html` by double-click (file://) must keep working.
Third-party libraries are bundled in `app/vendor/` (committed): Tailwind 3.4.17 (prebuilt CSS), Phosphor Icons
2.1.1 (regular weight), docx 8.5.0, mammoth.js 1.13.0, Papa Parse 5.7.0. No CDN is used.
Derived from Meta-Ethnography Canvas (github.com/jdaeyun/meta-ethnography-canvas); same conventions. When a convention
there has matured (robustness helpers, release workflow, wording rules), port it here rather than inventing a second one.

## Layout

```
ta_canvas.html         markup only (4 tabs + modals); loads everything under app/
app/version.js         release info (version, date) — the one place to edit per release
app/js/prefs.js        lsGet / lsSet / lsRemove: per-browser display preferences (localStorage, never throws)
app/js/i18n.js         tr(), applyI18n(), setLanguage(); English + Japanese dictionaries (auto = browser language)
app/css/ta_canvas.css  app-specific CSS (everything else is Tailwind classes)
app/js/core.js         IndexedDB, `state`, lookups, participantsForRange(), coverage(), recordLog(),
                       bindPendingCommit() / saveSoon() / flushAllPendingSaves(), undo, repairReferences(), sanitizeProjectData()
app/js/importers.js    .txt/.csv/.docx/.doc → fixed plain text + blocks; CSV column dialog; built-in .doc reader (.qdpx → refi-qda.js)
app/js/coding.js       Tab 1 (phases 1–2): documents, participants, viewer, selection, codebook, extract panel,
                       full-text search, extract range changes, splitting codes, extract filter (also used in tab 2)
app/js/themes.js       Tab 2 (phases 3–5): code pool, theme board, status / review / definition, gentle RTARG hints
app/js/thematic-map.js Tab 2 "Map" view: draggable themes, named links between themes, SVG / PNG for exports
app/js/audit.js        Tab 3: audit trail timeline, reflexive journal
app/js/journal.js      journal drawer (Ctrl/⌘+J), optional "Why?" decision prompt, context capture, structure snapshots + diff
app/js/export.js       Tab 4 (phase 6): analytic narrative editor (first view) + supporting table specs; copy / Markdown / CSV / .docx
app/js/refi-qda.js     REFI-QDA .qdpx export / import (built-in zip writer/reader; positions in code points, not UTF-16)
app/js/app.js          startup (DOMContentLoaded → window.taReady), tabs, project setup, backup / restore / reset, drag & drop,
                       shortcuts, dialogs (focus, Esc), other-tab warning, auto-growing textareas
samples/               fictional test files in every supported format; samples/tutorial/{ja,en}: practice data for the 101
site/                  website (GitHub Pages): {ja,en}/index.html (landing), 101.html (tutorial; 入門 in Japanese), guide.html (reference),
                       rtarg.html (how the app maps to the RTARG, Braun & Clarke 2024: update it when a change affects reporting);
                       assets/site.css; assets/img/{ja,en}/*.webp screenshots. Plain HTML, no build step
tests/app.test.cjs     browser tests (Playwright, file://): undo, restore, exports, text commits, other tabs, dialogs, layout,
                       wording, version text; `npm test`, CI: .github/workflows/test.yml
tools/sync-version.mjs copies app/version.js into CITATION.cff, README.md and the site (`npm run sync-version`; --check only reports)
tools/site-screenshots.cjs  rebuilds the screenshots from samples/tutorial (needs Playwright + Python Pillow)
docs/rtarg-mapping*.md stubs pointing to site/{en,ja}/rtarg.html (kept so old links still lead somewhere)
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
- `themes`: `{ name, parentId, status: candidate|reviewed|defined|discarded, definition, reviewNote, order, narrative }`
  (`checkedExtracts` / `checkedDataset` may exist in older data; no longer shown or used).
  `narrative` = the phase 6 analytic write-up for the theme; `mapX`/`mapY` = position on the thematic map (layout only).
- `meta` (project setup): `{ name, question, approach: 'reflexive', theory, orientInductive, orientLatent, orientNote, dataPrep,
  storyline (overview), conclusions (general discussion), mapLinks: [{ id, from, to, label }], lastBackupAt }`.
- `logs`: the analysis record (formerly "audit trail"; internal names keep `audit`) and the journal `{ ts, category, action, detail, from, to, by, reason?, ctx?, snapshot?, linkedLogId? }`.
  `reason` = optional "why" for a decision; `ctx` = what was on screen (doc / extract / quote / theme);
  `snapshot` = theme tree + code names and counts (no extract text), taken on journal notes and theme status
  changes / deletes; `linkedLogId` = a note written about another entry.
- localStorage holds display preferences only (`ta_*` keys: tab, language, left width, marker style, counts toggle,
  theme view, researcher initials), always through `lsGet / lsSet / lsRemove`. Project data never goes there.

## Rules

### Code

- Classic `<script>` files sharing one global scope (not ES modules, so `file://` works). Keep the load order
  in `ta_canvas.html` (version → prefs → i18n → core → importers → coding → themes → thematic-map → audit → journal → export → refi-qda → app).
  Top-level code may only call functions from earlier files; anything else runs inside handlers or DOMContentLoaded.
- Never call `localStorage` directly: use `lsGet / lsSet / lsRemove` (prefs.js). Reading it throws when storage is
  blocked, and the app must still start (test "starts when localStorage is blocked").
- Log every interpretive change with `recordLog({ category, ak, ap, dk, dp, from, to })`. Single coding
  actions use category `coding` (omitted from the appendix by default).
- Text fields: a field that writes an audit entry, or whose text the user expects to be kept (memos, notes,
  definitions, narratives), uses `bindPendingCommit(el, commitFn)`, not a bare `onchange`. The commit then also runs on
  tab switch, re-render, undo, backup and when the page is hidden, so a saved text never lacks its log entry and text
  typed just before closing the tab is not lost. `commitFn` updates `state` before its first `await` and does nothing
  when the value did not change. Long texts also write while typing with `saveSoon(key, fn)`.
  A render function that rebuilds editable fields calls `flushAllPendingSaves()` first (see `renderThemeBoard`,
  `renderNarrativeEditor`, `renderSegmentPanel`, `openDocument`). A commit that belongs to one item captures that
  item (e.g. `docNote.dataset.doc`), never "whatever is active now".
- Before destructive changes call `pushUndo(label, [collections])`, and `commitUndo()` as soon as the change is in `state`
  (before awaiting any writes). Undo keeps only the items that change touched and puts back just those, merging with
  later edits, then `repairReferences()` drops dangling ids — so work done after the change is never rolled back.
  `'meta'` can be listed as a collection (compared field by field, e.g. `mapLinks`).
- Large projects (a survey with thousands of answers and respondents) must stay fast: no scan of all segments / ptags
  per line, code or participant inside a render. `byId` and `participantsForRange()` use cached indexes (checked on
  use, ptag index dropped at the next microtask); the viewer sorts items into lines once and replaces only lines whose
  HTML changed; long lists and selects are written with `setHtml()` (skips unchanged markup — every write to such an
  element must go through it); `.ta-block` has `content-visibility: auto`.
- Imported text is Unicode NFC (`textToDoc`, CSV) — never normalise afterwards (offsets); `.qdpx` text is kept as is.
- Restore and Reset replace the whole project with `dbReplaceProject()` (one IndexedDB transaction over every store):
  if writing fails, nothing changes in the browser and the project in memory is put back (test "a restore that fails").
- Deleting a journal entry removes its text but records `log.journalDeleted` (type and date only), which cannot be deleted.
- Update `state` and re-render first, then persist (`await dbPut…`). A render that lands after the user has
  started a new text selection would wipe it.
- Escape every user value interpolated into HTML with `escapeHtml()`. Data from outside (Restore) goes through
  `sanitizeProjectData()` first: ids must match `SAFE_ID`, colours `HEX_COLOR`; meta is built from `defaultMeta()`.
- Exports are built from `getTableSpec(id)`; change the spec, not the renderers separately.
- The extract filter (`state.extractFilter`, `filterSegments()`) only narrows what is read: never apply it to counts,
  the theme structure or exports.
- `.qdpx` export must keep validating against the REFI-QDA Project 1.0 schema (element order matters). Import always
  adds to the current project, behind one `pushUndo`.
- Write class names in full (no string concatenation such as `'bg-' + color`) so the Tailwind scanner can see them.

### Interface

- Every UI string goes through `tr(key, params)` with the message in BOTH `I18N.en` and `I18N.ja` (app/js/i18n.js);
  static HTML uses data-i18n / data-i18n-html / data-i18n-ph / data-i18n-title. Do not name a local variable `tr`.
  Audit log entries store message keys (`ak`/`ap`, `dk`/`dp`, `ft: 'status'`) and are rendered with logAction() /
  logDetail() / logFromTo() in the chosen language; user-written text stays as typed. Undo labels are
  `[key, params]`. Write-up tables take their own language (`optTableLang`, default = interface language).
- Layout: every tab is [left column `.left-col` (shared, resizable width `--left-w`, saved as `ta_left_w`)]
  [centre column: phase strip on top, content in `.center-col` (centred, one max width)] [+ right column in tab 1].
  Keep new tabs and views to this shape so switching tabs does not move the page.
- The app must fit laptop widths: no overflow or overlap in the header from 1024 px up, in English and Japanese
  (test "header fits laptop widths"). Long labels shorten below `xl` / `2xl` and keep the full text in `title`;
  toolbars wrap (`flex-wrap`, `gap-*`).
- Dialogs are `.ta-modal`: they get role="dialog", focus moves in when one opens and back when it closes, Tab stays
  inside, Esc closes only the top one and asks before discarding typed text. Icon-only buttons are named from `title`.
- Textareas grow with their text up to 60% of the window (`textarea.auto-grow`); after setting a value by code, call
  `growTextarea(el)`.
- The same project open in two tabs is warned about in both (`#multiTabBanner`, BroadcastChannel); nothing is blocked.
- Journal drawer: docked beside the workspace on wide screens; at ≤1100px it overlays and closes on an outside
  click (light dismiss). In tab 1 below 1700px it covers the right column instead of pushing the page (the
  viewer would be squeezed); `#viewerScroll` is a size container that compacts `.ta-block` when it is narrow.
  Closing never discards the draft (dot on the Journal button + edge handle).
- Coding highlights follow `markerStyle()` (MARKER_STYLES in core.js; gear menu, `ta_marker_style`): never hard-code
  highlight opacities in renderers.
- A section of a theme card the user opened or closed by hand stays that way across re-renders (`themeDetailsState`).

### Stance (reflexive TA)

- Reflexive notes are never required: no blocking dialogs asking for a note. Use `promptNote()` (small,
  self-dismissing) after significant decisions only, never after single coding actions.
- Prevalence counts are hidden by default (`state.showCounts`, counts toggle) and left out of exports unless `optCounts`;
  the code list is a record, not a codebook (`optCodeList`, off by default); phase 6 is the analytic narrative first,
  tables second; the participant table summarises the group unless `optParticipantRows` (RTARG: no line-by-line
  demographics); every count in a table follows `optCounts`. Illustrative extracts are only the key extracts the
  researcher marked (★), never filled in automatically. Statuses are not a sequence (no phase numbers on them; moving
  back is normal; the phase strip and theme-card sections name the phases without numbers, so the screen does not read as
  a sequence of steps). No numerical rules of thumb (how many themes / subthemes, name length) and no tick-box review:
  ask questions instead. Hints are gentle and never block (no `alert` gates). Do not add features that treat frequency,
  agreement or a fixed codebook as markers of quality.
- Wording (Big Q, reflexive TA), in UI text (both languages), logs, exports, samples, the site (including rtarg.html) and the README.
  Read new text for these before committing; the test "no small-q wording" blocks some of them, but most need judgement:

  | Avoid | Write instead |
  |---|---|
  | themes emerged / were found / identified / discovered; 浮かび上がった・見つかった・発見・テーマを抽出 | generated, developed, constructed (by the researcher); 生成した・作り上げた・展開した |
  | saturation; 飽和 | information power, richness of the data, the researcher's rationale |
  | inter-coder agreement / reliability, kappa, consensus coding; 一致率・信頼性・合意 | discussion, critical friend, reflexive conversation; 話し合い・批判的な友人 |
  | accurate / correct / valid coding, verify, validate (an interpretation); 正確・妥当・検証 | interpretation grounded in the data, coherent, well-evidenced; データに根ざした解釈 |
  | bias (subjectivity as something to remove); バイアス・偏り | subjectivity as a resource, positionality; 主観は分析の資源・ポジショナリティ |
  | codebook (for the code list) | code list (analytic record); コード一覧（分析を終えた時点） |
  | frequency / "most participants" as evidence of importance | meaning and significance for the question; counts only on request |
  | member checking, triangulation (as validation) | member reflections, critical friends |
  | Results / Findings (write-up heading) | Analysis; 分析 |
  | audit trail (a confirmability / verification notion); 監査証跡 | analysis record; 分析の記録 (tab: Record & Journal / 分析の記録・ジャーナル) |
  | extract filter as a way to compare groups | reading accounts in their context (it never shows or tests group differences) |

  Legitimate uses stay: saying what the app does NOT do and why (scope notes, FAQ, the project-setup note), the RTARG
  mapping quoting the guidelines, "validates against the REFI-QDA schema", "store it like raw data" (data protection),
  見出し (headings), 出現頻度 where counts are discussed as optional.
- Japanese wording: コーディング (not コード化), フェーズ for phases, ステータス for a theme's status.

## Tests

`npm test` runs the browser tests (tests/app.test.cjs, Playwright + Chromium over file://). First time: `npm install`,
then `npx playwright install chromium`; with a Chromium already on the machine, `CHROMIUM_PATH=/path/to/chromium npm test`.
Tests wait for `window.taReady` (start-up finished) before touching the page. Add a test when fixing a bug or
changing behaviour; run the whole suite more than once when a test depends on timing. Also try both http
(`npm run serve`, http://localhost:8080/ta_canvas.html) and double-clicking ta_canvas.html (file://) after changes.

## Building app/vendor (only when libraries or Tailwind classes change)

Node.js LTS required. `npm install`, then `npm run build` (= `npm run vendor`: copy libraries + licences into
app/vendor and write THIRD_PARTY_NOTICES.md; `npm run css`: Tailwind CLI scans ta_canvas.html + app/js/**/*.js).
Re-run `npm run css` after using a Tailwind class that appears nowhere else. `npm run serve` serves http://localhost:8080.

## Website (site/)

`.github/workflows/pages.yml` publishes site/ together with the app (ta_canvas.html, app/, samples/) and one practice-data
zip per language on every push to main; pages link to the app as `../ta_canvas.html`. When a change is visible in the
UI or changes how something works, update BOTH languages of the 101 and the guide, and re-run
`node tools/site-screenshots.cjs` if screenshots are affected. UI labels quoted on the site must match `I18N` exactly
(`<span class="ui">`). The Japanese pages call the tutorial 入門 (never "101", which few Japanese readers know);
the file name stays 101.html. Every page has the same nav and footer: Home / 101 (入門) / Guide / RTARG. The app's gear menu links to `{ja,en}/guide.html` (TA_SITE_URL in app.js).
Version text on the site sits in elements marked `data-ta="version"` / `data-ta="year"`, written by tools/sync-version.mjs:
mark new occurrences the same way instead of typing a version number.

## Releases

Edit ONLY `app/version.js` (version, released) and push to main (usually by merging a pull request). The
`Sync version and publish release` workflow (.github/workflows/sync-version.yml) then (1) runs `tools/sync-version.mjs`, which
copies the version into CITATION.cff, README.md and the site, and commits it; (2) creates the GitHub release tagged exactly
`v` + version (a hyphen, e.g. `1.0.0-beta.1`, makes it a pre-release; notes are generated from the merged pull requests);
(3) starts `offline-zip.yml`, which checks that the versions agree and attaches `reflexive-thematic-analysis-canvas-offline.zip`
(app + samples + README) to the release. Nothing happens if that release already exists, so bump the version only when
you want a release: one version per group of merged pull requests, not one per merge (patch = fixes, minor = new features).
