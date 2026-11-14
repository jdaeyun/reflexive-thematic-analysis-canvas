# 🏷️ Thematic Analysis Canvas

**Version 0.1.0 (prototype)**

**Thematic Analysis Canvas** is an open-source, zero-backend browser workspace for **reflexive thematic analysis** (Braun & Clarke) of qualitative text data. It follows the six phases of reflexive TA and produces tables you can put straight into a manuscript.

> **Scope:** reflexive TA only. Coding is treated as interpretive, so the app does not calculate inter-coder agreement (coding-reliability TA). Codebook approaches (template, framework analysis) are not supported yet.

* **Nothing to install, no account, no server.** Open `ta_canvas.html` in a desktop browser. Double-clicking the file works offline too.
* **Your data stays on your computer.** Documents are read and stored only in this browser (IndexedDB). Nothing is uploaded.
* **No AI.** No language model reads, codes or summarises your data.
* **No counting as a shortcut.** Following reflexive TA, prevalence counts are hidden unless you ask for them, there is no inter-coder agreement, and codes are an analytic record rather than a codebook.
* **English and Japanese (日本語).** The interface follows your browser language automatically, or choose it in Settings. Write-up tables can be exported in either language.

> 📌 **Status:** early prototype. Feedback from qualitative researchers is very welcome in [Issues](https://github.com/jdaeyun/thematic-analysis-canvas/issues). Keep a JSON backup of real projects.

---

## ✨ Workflow (4 tabs)

1. **Familiarise & Code (Phases 1–2)**
   * Import interview or focus-group transcripts (`.txt`, `.docx`, `.doc`) and open-ended survey answers (`.csv`).
   * Select text and click a code, type a new code and press Enter, or drag a code onto a line. Codes can overlap, and one extract can carry several codes. In-vivo codes, key extracts and memos are supported.
   * **Speakers are a separate layer.** “Detect speakers” tags lines that start with `P01：`, `A:` and so on. Interviewers and moderators are tagged but not counted as participants. CSV rows become participants, and other columns become their attributes.
   * Familiarisation notes for each document.
2. **Themes (Phases 3–5)**
   One board for generating, reviewing and defining themes, plus a **thematic map** where you arrange themes and name the relationships between them (exported as .svg and as a figure in the Word write-up). Drag codes into candidate themes and subthemes. Each theme moves through **Candidate → Reviewed → Defined** (or *Set aside*), with review checks against the coded extracts and the full dataset, review notes and a definition. It also shows how many participants each theme draws on.
3. **Audit & Journal**
   Every interpretive change (codes created, renamed, merged or deleted; theme changes; status, definitions) is logged automatically, next to a timestamped reflexive journal.
4. **Writing up (Phase 6)**
   Writing is part of the analysis, so the first view is a writing space: an overview of the analysis and an analytic narrative for each theme and subtheme, with the theme's extracts at hand to insert as evidence. Supporting tables follow:
   * Analysis summary, participants, and themes with definitions and illustrative extracts
   * Optional, off by default: prevalence (participants per theme, theme × participant) and the code list
   * Appendix A: audit trail and reflexive journal

   Export the narrative and tables as rich copy, Markdown or **Word (`.docx`)**, tables as CSV, and all coded extracts as long-format CSV.

## 🧭 Reporting: RTARG

[`docs/rtarg-mapping.md`](docs/rtarg-mapping.md) ([日本語](docs/rtarg-mapping.ja.md)) maps the Reflexive Thematic Analysis Reporting Guidelines (Braun & Clarke, 2024) to what the app does: what it supports, what stays the researcher's writing, and what still needs work.

## 📂 Supported files

| Format | Notes |
|---|---|
| `.txt` | UTF-8, UTF-16 (BOM) and Shift_JIS are detected automatically |
| `.csv` | Choose the participant ID column, the free-text column(s) to code and the attribute columns |
| `.docx` | Text is extracted with mammoth.js |
| `.doc` | Word 97–2003, read by a small built-in reader. Password-protected files and Word 95 or older are not supported |

On import, every file is turned into fixed plain text, one block per line or answer. Codes point at character positions in that text.

## 🚀 Running it

* Clone or download this repository, then double-click `ta_canvas.html` (Chrome, Edge or Firefox).
* Or serve the folder: `npm run serve` (after `npm install`), then open http://localhost:8080/ta_canvas.html.
* Try it with the fictional files in [`samples/`](samples/).

**Backups:** use **Backup** in the top bar regularly. Clearing the browser's site data deletes the project. The backup `.json` contains the full text of your documents, so store it like raw data.

## 🏗️ Architecture

* Single page, classic `<script>` files in a shared global scope (works from `file://`), no build step to run it.
* `app/js/core.js` (state, IndexedDB, audit log, undo) → `importers.js` → `coding.js` (tab 1) → `themes.js` (tab 2) → `audit.js` (tab 3) → `export.js` (tab 4) → `app.js` (startup).
* Bundled libraries in `app/vendor/` (no CDN): Tailwind CSS 3.4.17 (prebuilt), Phosphor Icons 2.1.1, docx 8.5.0, mammoth.js 1.13.0, Papa Parse 5.7.0. See [`app/vendor/THIRD_PARTY_NOTICES.md`](app/vendor/THIRD_PARTY_NOTICES.md).
* To update libraries or Tailwind classes: `npm install`, then `npm run build`.

## 🔗 Related

Thematic Analysis Canvas is derived from [Meta-Ethnography Canvas](https://github.com/jdaeyun/meta-ethnography-canvas) ([DOI 10.5281/zenodo.24200375](https://doi.org/10.5281/zenodo.24200375)), a workspace for meta-ethnography qualitative evidence synthesis.

## 📚 Reference

Braun, V., & Clarke, V. (2022). *Thematic analysis: A practical guide*. SAGE.

## 📄 License

Released under the [MIT License](LICENSE). Copyright © 2026 Jeong, Dae Yun.
