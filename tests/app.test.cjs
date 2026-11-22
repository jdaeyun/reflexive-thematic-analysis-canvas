// Browser tests: open ta_canvas.html over file:// in Chromium (Playwright) and drive the app's own functions.
// Run: npm test   (needs Playwright with Chromium: npm install, then npx playwright install chromium)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const APP_URL = pathToFileURL(path.join(__dirname, '..', 'ta_canvas.html')).href;
let browser;
before(async () => { browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}); });
after(async () => { await browser?.close(); });

// A fresh browser context per test = an empty IndexedDB
async function openApp() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.taReady === true);
  await page.evaluate(() => document.querySelectorAll('.ta-modal').forEach(m => m.classList.add('hidden')));
  return { page, errors, close: () => context.close() };
}

// One document with two coded extracts (codes A and B)
async function seed(page) {
  return page.evaluate(async () => {
    const text = 'P1: I felt alone at first.\nP1: Later the group helped me.\nP2: Nobody listened.';
    const { blocks } = textToDoc(text);
    const doc = await addDocument({ name: 'd.txt', kind: 'txt', encoding: 'UTF-8', text, blocks });
    const a = makeCode('A').code, b = makeCode('B').code;
    await applyCodeToRange(a.id, { docId: doc.id, s: 4, e: 26 });
    await applyCodeToRange(b.id, { docId: doc.id, s: 31, e: 57 });
    return { docId: doc.id, a: a.id, b: b.id };
  });
}

test('undo of a deletion keeps the work done after it', async () => {
  const { page, errors, close } = await openApp();
  const ids = await seed(page);
  const r = await page.evaluate(async ({ docId, a, b }) => {
    await deleteCode(a);
    const c = makeCode('C').code;
    await applyCodeToRange(c.id, { docId, s: 62, e: 79 });  // later work
    await applyCodeToRange(b, { docId, s: 62, e: 79 });     // later work on the same extract
    await performUndo();
    return {
      codes: state.codes.map(x => x.name).sort(),
      segs: state.segments.map(s => [s.s, s.codeIds.map(id => codeById(id).name).sort().join('+')]).sort(),
      stored: (await dbGetAll('segments')).length
    };
  }, ids);
  assert.deepEqual(r.codes, ['A', 'B', 'C']);
  assert.deepEqual(r.segs, [[31, 'B'], [4, 'A'], [62, 'B+C']].sort());
  assert.equal(r.stored, 3);
  assert.deepEqual(errors, []);
  await close();
});

test('undo merges a later change to the same extract', async () => {
  const { page, close } = await openApp();
  const ids = await seed(page);
  const r = await page.evaluate(async ({ docId, a, b }) => {
    await applyCodeToRange(b, { docId, s: 4, e: 26 }); // extract 4–26 now has A + B
    await deleteCode(a);                                 // → B only
    const c = makeCode('C').code;
    await applyCodeToRange(c.id, { docId, s: 4, e: 26 }); // later: B + C
    await performUndo();
    const seg = state.segments.find(s => s.s === 4);
    return seg.codeIds.map(id => codeById(id).name).sort();
  }, ids);
  assert.deepEqual(r, ['A', 'B', 'C']);
  await close();
});

test('undo of a split removes the new code but keeps later extracts coded with other codes', async () => {
  const { page, close } = await openApp();
  const ids = await seed(page);
  const r = await page.evaluate(async ({ docId, a, b }) => {
    const seg = state.segments.find(s => s.s === 4);
    await splitCode(a, [seg.id], 'A2');
    const a2 = state.codes.find(c => c.name === 'A2').id;
    await applyCodeToRange(a2, { docId, s: 62, e: 79 }); // uses the code the split created
    await applyCodeToRange(b, { docId, s: 62, e: 79 });
    await performUndo();
    return { codes: state.codes.map(c => c.name).sort(), late: state.segments.find(s => s.s === 62)?.codeIds.map(id => codeById(id)?.name) };
  }, ids);
  assert.deepEqual(r.codes, ['A', 'B']);
  assert.deepEqual(r.late, ['B']); // dangling A2 reference removed, B kept
  await close();
});

test('undo of a journal deletion does not remove entries logged afterwards', async () => {
  const { page, close } = await openApp();
  await seed(page);
  const r = await page.evaluate(async () => {
    const note = await recordLog({ category: 'journal', ak: 'jt.memo', detail: 'first thought' });
    pushUndo(['undo.deleteJournal', {}], ['logs']);
    state.logs = state.logs.filter(l => l.id !== note.id);
    commitUndo();
    await dbDelete('logs', note.id);
    await recordLog({ category: 'journal', ak: 'jt.memo', detail: 'later thought' });
    await performUndo();
    const stored = await dbGetAll('logs');
    return { mem: state.logs.map(l => l.detail), stored: stored.map(l => l.detail) };
  });
  assert.ok(r.mem.includes('first thought') && r.mem.includes('later thought'));
  assert.ok(r.stored.includes('first thought') && r.stored.includes('later thought'));
  await close();
});

test('deleting a theme removes its map links; undo brings both back', async () => {
  const { page, close } = await openApp();
  await seed(page);
  const r = await page.evaluate(async () => {
    await createTheme('Being alone together');
    await createTheme('Finding a voice');
    const [t1, t2] = state.themes;
    state.meta.mapLinks = [{ id: 'lnk_1', from: t1.id, to: t2.id, label: 'leads to' }];
    await saveMeta();
    await deleteTheme(t1.id);
    const afterDelete = state.meta.mapLinks.length;
    await performUndo();
    return { afterDelete, themes: state.themes.length, links: state.meta.mapLinks.length };
  });
  assert.deepEqual(r, { afterDelete: 0, themes: 2, links: 1 });
  await close();
});

test('restore builds the project setup from the backup only and drops unsafe data', async () => {
  const { page, close } = await openApp();
  const r = await page.evaluate(async () => {
    state.meta.storyline = 'storyline of the open project';
    state.meta.mapLinks = [{ id: 'lnk_x', from: 'a', to: 'b', label: '' }];
    await saveMeta();
    const backup = {
      app: 'reflexive-thematic-analysis-canvas', meta: { name: 'Other', question: 'Q?' },
      docs: [{ id: 'doc_1', name: 'x.txt', kind: 'txt', text: 'hello world', blocks: [{ s: 0, e: 11 }], createdAt: 1 }],
      codes: [
        { id: 'code_1', name: 'ok', color: 'red;background:url(x)', themeIds: ['thm_gone'] },
        { id: '"><img src=x onerror=alert(1)>', name: 'bad id', color: '#000000' }
      ],
      segments: [
        { id: 'seg_1', docId: 'doc_1', s: 0, e: 5, text: 'hello', codeIds: ['code_1'] },
        { id: 'seg_2', docId: 'doc_1', s: 0, e: 500, text: 'out of range', codeIds: ['code_1'] },
        { id: 'seg_3', docId: 'doc_1', s: 6, e: 11, text: 'world', codeIds: 'code_1' }
      ],
      themes: [], participants: [], ptags: [], logs: []
    };
    const file = new File([JSON.stringify(backup)], 'b.json', { type: 'application/json' });
    await restoreProject(file);
    return {
      meta: { name: state.meta.name, storyline: state.meta.storyline, links: state.meta.mapLinks },
      codes: state.codes.map(c => [c.id, /^#[0-9a-f]{6}$/i.test(c.color), c.themeIds.length]),
      segs: state.segments.map(s => s.id)
    };
  });
  assert.equal(r.meta.name, 'Other');
  assert.equal(r.meta.storyline, undefined);
  assert.equal(r.meta.links, undefined);
  assert.deepEqual(r.codes, [['code_1', true, 0]]);
  assert.deepEqual(r.segs, ['seg_1']); // out of range and malformed codeIds dropped
  await close();
});

test('tagging a participant cuts overlapping ranges (one participant per character)', async () => {
  const { page, close } = await openApp();
  const ids = await seed(page);
  const r = await page.evaluate(async ({ docId }) => {
    const p1 = await ensureParticipant('P1'), p2 = await ensureParticipant('P2');
    await tagParticipant(p1.id, { docId, s: 0, e: 57 });
    await tagParticipant(p2.id, { docId, s: 20, e: 40 });
    return state.ptags.filter(t => t.docId === docId).map(t => [t.s, t.e, participantById(t.participantId).label]).sort((a, b) => a[0] - b[0]);
  }, ids);
  assert.deepEqual(r, [[0, 20, 'P1'], [20, 40, 'P2'], [40, 57, 'P1']]);
  await close();
});

test('theme table shows key extracts only; counts follow the prevalence option', async () => {
  const { page, close } = await openApp();
  const ids = await seed(page);
  const r = await page.evaluate(async ({ a, b }) => {
    await createTheme('Being alone together');
    const t = state.themes[0];
    await addCodeToTheme(a, t.id, null);
    await addCodeToTheme(b, t.id, null);
    const opts = { ...exportOptions(), maxExtracts: 3, includeCounts: false, participantRows: true, includeCodeList: true };
    const none = getTableSpec('themes', opts).rows[0][4];
    state.segments.find(s => s.s === 31).key = true;
    const one = getTableSpec('themes', opts).rows[0][4];
    const summaryLabels = getTableSpec('summary', opts).rows.map(r => r[0]);
    const withCounts = getTableSpec('summary', { ...opts, includeCounts: true }).rows.map(r => r[0]);
    return {
      none, one,
      summaryHasExtracts: summaryLabels.includes(tr('exp.r.extracts', {}, opts.lang)),
      countsHasExtracts: withCounts.includes(tr('exp.r.extracts', {}, opts.lang)),
      parHeaders: getTableSpec('participants', opts).headers.length,
      parHeadersCounts: getTableSpec('participants', { ...opts, includeCounts: true }).headers.length,
      codeListCols: getTableSpec('codelist', opts).headers.length
    };
  }, ids);
  assert.equal(r.none, await page.evaluate(() => tr('exp.v.noKeyExtract', {}, exportOptions().lang)));
  assert.match(r.one, /Later the group helped me/);
  assert.doesNotMatch(r.one, /alone at first/);
  assert.equal(r.summaryHasExtracts, false);
  assert.equal(r.countsHasExtracts, true);
  assert.equal(r.parHeadersCounts, r.parHeaders + 1);
  assert.equal(r.codeListCols, 3);
  await close();
});

test('setting a theme to defined without a definition is allowed and shows a gentle hint', async () => {
  const { page, close } = await openApp();
  await seed(page);
  const r = await page.evaluate(async () => {
    await createTheme('Being alone together');
    switchTab('themes');
    const sel = document.querySelector('.theme-card .theme-status');
    sel.value = 'defined';
    sel.dispatchEvent(new Event('change'));
    await new Promise(res => setTimeout(res, 50));
    return { status: state.themes[0].status, hint: document.querySelector('.theme-card').textContent.includes(tr('hint.noDefinition')), phaseInOption: [...sel.options].some(o => /\(/.test(o.textContent)) };
  });
  assert.deepEqual(r, { status: 'defined', hint: true, phaseInOption: false });
  await close();
});

test('a code can be added to a theme without drag and drop', async () => {
  const { page, close } = await openApp();
  const ids = await seed(page);
  await page.evaluate(async () => { await createTheme('Being alone together'); switchTab('themes'); });
  await page.selectOption('.theme-card .theme-add-code', ids.a);
  await page.waitForFunction(a => codeById(a).themeIds.length === 1, ids.a);
  await close();
});

test('REFI-QDA export and import round-trip the coded extracts', async () => {
  const { page, close } = await openApp();
  await seed(page);
  const r = await page.evaluate(async () => {
    const before = state.segments.map(s => s.text).sort();
    const blob = buildQdpx();
    for (const c of COLLECTIONS) { state[c] = []; await dbReplaceAll(c, []); }
    await importQdpx(new File([blob], 'p.qdpx'));
    return { before, after: state.segments.map(s => s.text).sort(), codes: state.codes.map(c => c.name).sort() };
  });
  assert.deepEqual(r.after, r.before);
  assert.deepEqual(r.codes, ['A', 'B']);
  await close();
});

test('Escape closes only the top dialog and asks before discarding typed text', async () => {
  const { page, close } = await openApp();
  const asked = [];
  page.removeAllListeners('dialog');
  page.on('dialog', d => { asked.push(d.message()); d.dismiss(); });
  await page.evaluate(() => openProjectModal());
  await page.fill('#projName', 'typed');
  await page.keyboard.press('Escape');
  assert.equal(asked.length, 1);
  assert.equal(await page.isVisible('#projectModal'), true);
  await close();
});

// ---- Text fields: saved and logged without relying on a blur (closing the tab, re-renders) ----

async function seedTheme(page) {
  return page.evaluate(async () => {
    await createTheme('Feeling alone');
    document.getElementById('notePrompt').classList.add('hidden'); // the gentle prompt after a first theme
    switchTab('themes');
    return state.themes[0].id;
  });
}
const logsOf = (page, ak) => page.evaluate(k => state.logs.filter(l => l.ak === k).length, ak);

test('text typed in a theme card is saved and logged when the page is hidden before any blur', async () => {
  const { page, errors, close } = await openApp();
  await seedTheme(page);
  await page.click('.theme-details[data-k="review"] summary');
  await page.click('.theme-details[data-k="def"] summary');
  await page.evaluate(() => renderThemeBoard()); // the sections opened by hand stay open
  await page.fill('.theme-def', 'Being alone as a stage people pass through');
  await page.fill('.theme-review', 'Checked against all three interviews');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(200);
  const r = await page.evaluate(async () => {
    const stored = (await dbGetAll('themes'))[0];
    return { def: stored.definition, review: stored.reviewNote };
  });
  assert.equal(r.def, 'Being alone as a stage people pass through');
  assert.equal(r.review, 'Checked against all three interviews');
  assert.equal(await logsOf(page, 'log.definition'), 1);
  assert.equal(await logsOf(page, 'log.reviewNote'), 1);
  assert.deepEqual(errors, []);
  await close();
});

test('a re-render keeps a theme name being typed and logs it once', async () => {
  const { page, close } = await openApp();
  await seedTheme(page);
  await page.fill('.theme-name', 'Loneliness as a passage');
  await page.evaluate(() => { renderThemeBoard(); renderThemeBoard(); });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => state.themes[0].name), 'Loneliness as a passage');
  assert.equal(await page.inputValue('.theme-name'), 'Loneliness as a passage');
  assert.equal(await logsOf(page, 'log.themeRenamed'), 1);
  await close();
});

test('the analytic narrative is logged when the tab is switched, and an inserted extract counts as an edit', async () => {
  const { page, close } = await openApp();
  const ids = await seed(page);
  await page.evaluate(async ({ a }) => {
    await createTheme('Feeling alone');
    await addCodeToTheme(a, state.themes[0].id, null);
    document.getElementById('notePrompt').classList.add('hidden');
    state.exportTable = 'narrative';
    switchTab('export');
  }, ids);
  await page.fill('#narrOverview', 'Two stories run through the data.');
  await page.evaluate(() => switchTab('themes'));
  await page.waitForTimeout(100);
  assert.equal(await logsOf(page, 'log.storyline'), 1);
  assert.equal(await page.evaluate(async () => (await dbGetAll('meta'))[0].storyline), 'Two stories run through the data.');
  await page.evaluate(() => switchTab('export'));
  await page.click('.narr-section details summary');
  await page.click('.narr-insert');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(200);
  assert.equal(await logsOf(page, 'log.narrative'), 1);
  assert.match(await page.evaluate(async () => (await dbGetAll('themes'))[0].narrative), /felt alone/);
  await close();
});

test('a familiarisation note stays with its document when another document is opened', async () => {
  const { page, close } = await openApp();
  const first = await seed(page);
  const second = await page.evaluate(async () => {
    const { blocks } = textToDoc('P3: Another text.');
    return (await addDocument({ name: 'e.txt', kind: 'txt', encoding: 'UTF-8', text: 'P3: Another text.', blocks })).id;
  });
  await page.evaluate(id => openDocument(id), first.docId);
  await page.evaluate(() => document.getElementById('docNotePanel').classList.remove('hidden'));
  await page.fill('#docNote', 'Long pauses before talking about the group.');
  await page.evaluate(id => openDocument(id), second);
  await page.waitForTimeout(100);
  const notes = await page.evaluate(() => Object.fromEntries(state.docs.map(d => [d.name, d.note || ''])));
  assert.deepEqual(notes, { 'd.txt': 'Long pauses before talking about the group.', 'e.txt': '' });
  await close();
});

// ---- Start-up and safety ----

test('the app starts when browser storage (localStorage) is blocked', async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.taReady === true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a second tab with the same project shows a warning in both tabs, and it clears when one closes', async () => {
  const context = await browser.newContext();
  const open = async () => {
    const p = await context.newPage();
    p.on('dialog', d => d.accept());
    await p.goto(APP_URL);
    await p.waitForFunction(() => window.taReady === true);
    return p;
  };
  const shown = p => p.isVisible('#multiTabBanner');
  const p1 = await open();
  await p1.waitForTimeout(200);
  assert.equal(await shown(p1), false);
  const p2 = await open();
  await p2.waitForTimeout(300);
  assert.equal(await shown(p1), true);
  assert.equal(await shown(p2), true);
  await p2.close({ runBeforeUnload: true });
  await p1.waitForTimeout(300);
  assert.equal(await shown(p1), false);
  await context.close();
});

test('focus moves into a dialog and back to the button that opened it', async () => {
  const { page, close } = await openApp();
  await page.focus('#menuBtn');
  await page.evaluate(() => { document.getElementById('menuBtn').blur(); document.getElementById('backupBtn').focus(); openProjectModal(); });
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => document.getElementById('projectModal').contains(document.activeElement)), true);
  for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.getElementById('projectModal').contains(document.activeElement)), true, 'Tab stays inside');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#projectModal'), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'backupBtn');
  await close();
});

// ---- Layout ----

test('the header fits laptop widths without overlap (English and Japanese)', async () => {
  for (const lang of ['en', 'ja']) {
    for (const width of [1024, 1280, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();
      await page.goto(APP_URL);
      await page.waitForFunction(() => window.taReady === true);
      const r = await page.evaluate(async (l) => {
        setLanguage(l);
        document.querySelectorAll('.ta-modal').forEach(m => m.classList.add('hidden'));
        await new Promise(res => setTimeout(res, 50));
        const hdr = document.querySelector('header');
        const groups = [...hdr.children].map(c => c.getBoundingClientRect());
        let overlap = false;
        for (let i = 1; i < groups.length; i++) if (groups[i].left < groups[i - 1].right - 1) overlap = true;
        // every visible control inside the header lies within it
        const outside = [...hdr.querySelectorAll('button, input, a, span')].filter(el => {
          const b = el.getBoundingClientRect();
          return b.width > 0 && (b.right > hdr.clientWidth + 1 || b.left < -1);
        }).length;
        return { overflow: hdr.scrollWidth > hdr.clientWidth + 1, overlap, outside };
      }, lang);
      assert.deepEqual(r, { overflow: false, overlap: false, outside: 0 }, `${lang} @ ${width}px`);
      await context.close();
    }
  }
});

// ---- Release and wording ----

test('every version marker (CITATION.cff, README, site) matches app/version.js', () => {
  const r = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'sync-version.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Reflexive TA wording (see the table in CLAUDE.md). Only words that have no legitimate use in the app or on the site
// are blocked here; most wording needs judgement when reading new text.
const SMALL_Q = {
  en: [/\bemerg(e|es|ed|ing|ence|ent)\b/i, /\bsaturat\w*/i, /\bdiscover(y|ed|ing)?\b/i, /\btriangulat\w*/i, /\bconsensus\b/i, /\b(themes?|patterns?) (were|was|are|is) (found|identified)\b/i, /\bidentif(y|ied|ying) (the )?themes\b/i],
  ja: [/浮かび上が/, /浮上/, /飽和/, /発見/, /トライアンギュレーション/, /合意/, /テーマを(抽出|特定)/, /テーマが(抽出|特定)/]
};
test('no small-q wording in the interface (both languages)', async () => {
  const { page, close } = await openApp();
  const dict = await page.evaluate(() => ({ en: I18N.en, ja: I18N.ja }));
  const hits = [];
  for (const lang of ['en', 'ja']) {
    for (const [k, v] of Object.entries(dict[lang])) for (const re of SMALL_Q[lang]) if (re.test(v)) hits.push(`${lang} ${k}: ${re}`);
  }
  assert.deepEqual(hits, []);
  await close();
});
test('no small-q wording on the website or in the README', () => {
  const fs = require('node:fs');
  const root = path.join(__dirname, '..');
  const hits = [];
  const scan = (file, res) => {
    const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/<[^>]+>/g, ' ');
    for (const re of res) if (re.test(text)) hits.push(`${file}: ${re} → “${text.match(re)[0]}”`);
  };
  for (const lang of ['en', 'ja']) for (const f of fs.readdirSync(path.join(root, 'site', lang))) if (f.endsWith('.html')) scan(`site/${lang}/${f}`, SMALL_Q[lang]);
  scan('README.md', SMALL_Q.en);
  assert.deepEqual(hits, []);
});

test('imported text is NFC, and a decomposed search query still finds it', async () => {
  const { page, close } = await openApp();
  const r = await page.evaluate(async () => {
    const raw = 'P1: がんばる'; // か゛ん は゛る (decomposed)
    const { text, blocks } = textToDoc(raw);
    await addDocument({ name: 'nfd.txt', kind: 'txt', encoding: 'UTF-8', text, blocks });
    state.textQuery = 'ばる'; // decomposed query
    computeSearchHits();
    return { text, hits: state.searchHits.length };
  });
  assert.equal(r.text, 'P1: がんばる');
  assert.equal(r.hits, 1);
  await close();
});

test('the bundled .doc sample is read as text', async () => {
  const { page, close } = await openApp();
  const b64 = require('node:fs').readFileSync(path.join(__dirname, '..', 'samples', 'interview_P02.doc')).toString('base64');
  const text = await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return parseDocBinary(bytes.buffer);
  }, b64);
  assert.ok(text.length > 100);
  assert.doesNotMatch(text, /[\u0000-\u0008\u000e-\u001f]/);
  await close();
});

test('participants of a range follow speaker ranges, also right after tagging in the same task', async () => {
  const { page, close } = await openApp();
  const ids = await seed(page);
  const r = await page.evaluate(async ({ docId }) => {
    const p1 = await ensureParticipant('P1'), p2 = await ensureParticipant('P2');
    await tagParticipant(p1.id, { docId, s: 0, e: 57 });
    const before = participantLabels(participantsForRange(docId, 30, 40));
    // same synchronous run: the cached index must notice the new ranges
    state.ptags = [
      { id: 'pt_a', docId, s: 0, e: 30, participantId: p1.id },
      { id: 'pt_x', docId, s: 30, e: 40, participantId: p2.id },
      { id: 'pt_b', docId, s: 40, e: 57, participantId: p1.id }
    ];
    const after = participantLabels(participantsForRange(docId, 30, 40));
    const across = participantLabels(participantsForRange(docId, 25, 45));
    return { before, after, across };
  }, ids);
  assert.deepEqual(r, { before: 'P1', after: 'P2', across: 'P1, P2' });
  await close();
});

test('re-rendering the viewer replaces only changed lines and shows new coding', async () => {
  const { page, close } = await openApp();
  const ids = await seed(page);
  const r = await page.evaluate(async ({ docId, b }) => {
    switchTab('code');
    const lines = [...document.querySelectorAll('#viewerBody .ta-block')];
    await applyCodeToRange(b, { docId, s: 62, e: 79 }); // third line
    const now = [...document.querySelectorAll('#viewerBody .ta-block')];
    return { kept0: now[0] === lines[0], replaced2: now[2] !== lines[2], coded: !!now[2].querySelector('.seg') };
  }, ids);
  assert.deepEqual(r, { kept0: true, replaced2: true, coded: true });
  await close();
});

test('theme review uses questions: no checkboxes, no counting thresholds', async () => {
  const { page, close } = await openApp();
  const ids = await seed(page);
  const r = await page.evaluate(async () => {
    for (let i = 0; i < 12; i++) await createTheme('Theme ' + i);
    const parent = state.themes[0];
    for (let i = 0; i < 5; i++) await createTheme('Sub ' + i, parent.id);
    switchTab('themes');
    const board = () => document.getElementById('themeBoard').textContent;
    const beforeReview = board().includes(tr('hint.themesQ'));
    parent.status = 'reviewed';
    renderThemesView();
    return {
      checkboxes: document.querySelectorAll('#themeBoard input[type=checkbox]').length,
      beforeReview,
      afterReview: board().includes(tr('hint.themesQ')),
      subQ: board().includes(tr('hint.subthemesQ')),
      noNumbersInQuestions: !/\d/.test(tr('hint.themesQ') + tr('hint.subthemesQ') + tr('theme.nameQ'))
    };
  });
  assert.deepEqual(r, { checkboxes: 0, beforeReview: false, afterReview: true, subQ: true, noNumbersInQuestions: true });
  await close();
});
