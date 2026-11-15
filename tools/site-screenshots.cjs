// Screenshots for the website (site/assets/img/{ja,en}/*.webp), built from the practice data in samples/tutorial.
// Builds a small, realistic demo project in each language through the app's own functions, then captures each view.
// Needs Playwright (with Chromium) and Python 3 with Pillow (PNG → WebP):
//   node tools/site-screenshots.cjs
// Re-run after visible UI changes so the 101 and the guide keep matching the app.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP = 'file://' + path.join(ROOT, 'ta_canvas.html');
const DATA = path.join(ROOT, 'samples', 'tutorial');
const OUT = path.join(ROOT, 'site', 'assets', 'img');

// ---------------------------------------------------------------------------------------------------------
// Demo analysis: [file, phrase in the text, code]. Phrases must occur in the file exactly.
// ---------------------------------------------------------------------------------------------------------
const PLAN = {
  ja: {
    researcher: 'RS',
    project: { name: '夜勤で働く人たちの経験', question: '病院や介護施設で夜勤をする人たちは、夜に働くことをどのように経験しているか。', theory: '経験的な志向。ケアの倫理と感情労働の議論を参照する。', orientInductive: 'mostlyInductive', orientLatent: 'both', dataPrep: '逐語録は話者ラベル（I／P01 など）付きで作成。固有名詞は削除し、参加者は仮名の ID で示した。' },
    attrs: { P01: { 年代: '40代', 職種: '看護師', 夜勤の形態: '2交代' }, P02: { 年代: '30代', 職種: '介護福祉士', 夜勤の形態: '一人夜勤' }, P03: { 年代: '20代', 職種: '看護師', 夜勤の形態: '2交代' } },
    notes: { 'interview_P01.txt': '「最後の砦」という言葉が強く残った。責任の話なのに、語り口は淡々としている。自分も夜勤経験者なので、共感しすぎていないか注意する。' },
    coding: [
      ['interview_P01.txt', '正直、年々こたえるようになってきました', '年齢とともに回復しにくい体'],
      ['survey.csv', '年齢とともに回復が遅くなった。', '年齢とともに回復しにくい体'],
      ['interview_P01.txt', '点滴の計算を二回確かめるようになりました。間違えたらと思うと怖くて。', '明け方の判断への不安'],
      ['interview_P01.txt', '急変はだいたい明け方なんですよ。', '明け方の判断への不安'],
      ['survey.csv', '急変が起きるのはいつも明け方で、気が張りつめている。', '明け方の判断への不安'],
      ['interview_P01.txt', 'だから最初の判断は自分たちでするしかないんです。', '最初の判断は自分たち'],
      ['interview_P02.txt', 'コールが二つ同時に鳴ったら、どっちに先に行くか、自分で決めないといけない。', '最初の判断は自分たち'],
      ['interview_P03.txt', '先輩は別の部屋にいて、私が先生に電話しないといけなかった。手が震えました。', '最初の判断は自分たち'],
      ['interview_P01.txt', '「自分が見逃したら誰も気づかない」って。夜は自分が最後の砦なんだと思います。', '「自分が最後の砦」'],
      ['interview_P02.txt', '夜中に起こすのはやっぱり悪いなって思っちゃって。電話するかどうかで、まず悩む。', '相談をためらう'],
      ['survey.csv', '判断に迷ったとき、看護師さんに電話していいのか分からない。', '相談をためらう'],
      ['interview_P02.txt', '結局、朝まで自分の中で抱えていることが多いです。', '一人で抱える'],
      ['survey.csv', '一人夜勤のとき、何かあっても相談できる人がいない。', '一人で抱える'],
      ['interview_P01.txt', '誰かが「休憩行っておいで、見とくから」って言ってくれるだけで、全然違うんです。', '休憩を回し合う'],
      ['survey.csv', '先輩が休憩を回してくれること。', '休憩を回し合う'],
      ['interview_P01.txt', '夜勤の人は何か持ってくるのが暗黙のルールになってて（笑）。あれで救われてる気がします。', 'お菓子という暗黙のルール'],
      ['survey.csv', '夜勤のメンバーで差し入れを持ち寄る習慣。', 'お菓子という暗黙のルール'],
      ['interview_P01.txt', '夜中の2時に「これ食べて」って渡されると、ああ一人じゃないなって思える。', '一人じゃないと感じる瞬間'],
      ['interview_P02.txt', 'それだけなんですけど、返事が来るとほっとする。', '一人じゃないと感じる瞬間'],
      ['interview_P02.txt', '「おつかれさま、何もなかった？」って声をかけてくれるんです。それで一気に力が抜けます。', '一人じゃないと感じる瞬間'],
      ['survey.csv', '朝、早番の人の顔を見ると安心する。', '一人じゃないと感じる瞬間'],
      ['interview_P01.txt', '寝てる私を見て「ママはいつも寝てる」って。', '家族と時間がずれる'],
      ['survey.csv', '家族と生活時間が合わず、会話が減った。', '家族と時間がずれる'],
      ['survey.csv', '子どもの送り迎えと重なる日は、ほとんど寝ないまま次の勤務に入ることになる。', '家族と時間がずれる'],
      ['interview_P02.txt', 'なんか、自分だけ違う時間を生きてる感じがします。', '違う時間を生きる'],
      ['interview_P02.txt', '友達との約束も、シフトが出るまで入れられないし、だんだん誘われなくなりました。', '違う時間を生きる'],
      ['survey.csv', '友人との予定が立てられない。', '違う時間を生きる'],
      ['interview_P02.txt', '頭が冴えちゃって。気づいたら昼の情報番組を見てる。', '明けの一日が消える'],
      ['interview_P03.txt', '寝て起きたら夕方で、「今日なにしたっけ」ってなる。', '明けの一日が消える'],
      ['interview_P03.txt', '夜は、自分のペースで看られるんです。', '夜は自分のペースで看られる'],
      ['interview_P02.txt', '昼には見せない顔を見せてくれることがあって。', '夜は自分のペースで看られる'],
      ['survey.csv', '特にない。夜は落ち着いて仕事ができるので好き。', '夜は自分のペースで看られる'],
      ['interview_P03.txt', '夜は任されてる感じがして。もちろん責任は重いんですけど、自分で考えて動ける。', '任されている感覚'],
      ['interview_P03.txt', '夜に育ててもらった、みたいな（笑）。', '任されている感覚'],
      ['interview_P01.txt', '夜にどれだけのことが起きてるか、昼の人には見えてないと思うんです。', '夜の出来事は昼に見えない'],
      ['interview_P01.txt', '朝の申し送りで「特変なし」って言っちゃうと、それで終わりなんですよね。', '夜の出来事は昼に見えない'],
      ['survey.csv', '夜の出来事が朝の申し送りで一言にまとめられて、伝わらないこと。', '夜の出来事は昼に見えない'],
      ['interview_P03.txt', '休憩の時間に、昼間には聞けないようなことを教えてくれたりして。', '夜の休憩室での学び'],
      ['interview_P03.txt', '夜の休憩室で、カップラーメン食べながら話すのが、けっこう大事な時間なんだと思います。', '夜の休憩室での学び']
    ],
    keys: ['夜は自分が最後の砦', 'ああ一人じゃないな', '自分だけ違う時間を生きてる'],
    memos: { '夜は自分が最後の砦': '責任の重さを「大げさかもしれない」と自分で打ち消している。重さを語ることへのためらい？' },
    themes: [
      { name: '「夜は、自分が最後の砦」', status: 'defined', codes: ['明け方の判断への不安', '最初の判断は自分たち', '「自分が最後の砦」', '相談をためらう', '一人で抱える'],
        definition: '夜には、患者や入居者の安全を左右する最初の判断が、少人数の夜勤者に委ねられる。このテーマの中心にあるのは、制度上の配置だけでなく「夜中に人を起こしてはいけない」という配慮によっても、判断と責任が一人の側に寄せられていく経験である。',
        narrative: '夜勤者は、夜の病棟や施設で「最初の判断」を自分で下す立場に置かれていた。P01 は「夜は自分が最後の砦なんだと思います」と語り、自分が見逃せば誰も気づかないという感覚を述べた。この感覚は、相談できる相手がいるにもかかわらず相談をためらう語り（P02）にも表れていた。責任は、人員配置だけでなく、夜中に人を起こしてはいけないという配慮によっても、一人の側に寄せられていた。',
        subs: [{ name: '任されることの手応え', status: 'reviewed', codes: ['任されている感覚', '夜は自分のペースで看られる'],
          definition: '同じ責任が、裁量と成長の機会として経験されることもある。最後の砦であることの重さと手応えは、同じ経験の両面として語られた。' }] },
      { name: '「お互いさま」で夜を越える', status: 'defined', codes: ['休憩を回し合う', 'お菓子という暗黙のルール', '一人じゃないと感じる瞬間', '夜の休憩室での学び'],
        definition: '夜勤者どうしの小さな気づかい（休憩を回す、お菓子を渡す、メッセージを送り合う）が、夜を越えるための非公式なケアの網になっている。制度の外にあるが、夜勤者自身は欠かせないものとして語る。',
        narrative: '「最後の砦」としての孤独は、夜勤者どうしの小さな気づかいによって和らげられていた。P01 は、夜中の2時にお菓子を渡されると「ああ一人じゃないなって思える」と語った。' },
      { name: '昼の世界からずれていく', status: 'reviewed', codes: ['年齢とともに回復しにくい体', '家族と時間がずれる', '違う時間を生きる', '明けの一日が消える'],
        definition: '夜勤は勤務時間の中だけで終わらず、体の回復、家族との時間、友人との関係を少しずつ昼の世界からずらしていく。' },
      { name: '夜は昼から見えない', status: 'candidate', codes: ['夜の出来事は昼に見えない'] }
    ],
    links: [[0, 1, '支えがあるから越えられる'], [0, 3, '負担が見えない'], [2, 1, '']],
    overview: '三つのテーマは、夜勤が「夜に働く」以上の経験であることを示している。夜勤者は判断と責任を一人で引き受けながら、同僚どうしの小さなケアに支えられて夜を越え、その代償として昼の世界から少しずつずれていく。',
    journal: [
      ['jt.positionality', '私自身、病棟で5年間夜勤をしていた。夜勤者の「大変さ」を前提に読んでしまわないよう、P03 のように夜勤を肯定的に語る声に注意して読みたい。'],
      ['jt.decision', '「夜は自分のペースで看られる」を最初は独立したテーマ候補にしていたが、P03 と R10 を読み直すと「最後の砦」の裏側として語られていると考え、サブテーマに移した。']
    ],
    search: '一人',
    splitCode: '一人じゃないと感じる瞬間',
    splitName: '朝の「おつかれさま」'
  },
  en: {
    researcher: 'RS',
    project: { name: 'Experiences of working night shifts', question: 'How do people who work night shifts in hospitals and care homes experience working at night?', theory: 'Experiential orientation, informed by the ethics of care and by work on emotional labour.', orientInductive: 'mostlyInductive', orientLatent: 'both', dataPrep: 'Transcripts were made with speaker labels (I, P01 …). Names of people and places were removed; participants are referred to by pseudonymous IDs.' },
    attrs: { P01: { 'Age group': '40s', Role: 'Nurse', 'Shift pattern': 'Two-shift' }, P02: { 'Age group': '30s', Role: 'Care worker', 'Shift pattern': 'Lone night' }, P03: { 'Age group': '20s', Role: 'Nurse', 'Shift pattern': 'Two-shift' } },
    notes: { 'interview_P01.txt': '"The last line of defence" stays with me. She talks about heavy responsibility in a very matter-of-fact way. I worked nights myself, so I need to watch that I do not over-identify.' },
    coding: [
      ['interview_P01.txt', 'Honestly... they hit me harder every year.', 'Body recovers more slowly with age'],
      ['survey.csv', 'I recover more slowly with age.', 'Body recovers more slowly with age'],
      ['interview_P01.txt', "I've started double-checking every drip calculation. I'm scared of getting one wrong.", 'Anxiety about early-hours judgement'],
      ['interview_P01.txt', 'Patients nearly always deteriorate in the early hours.', 'Anxiety about early-hours judgement'],
      ['survey.csv', "Deteriorations always seem to happen in the early hours so I'm constantly on edge.", 'Anxiety about early-hours judgement'],
      ['interview_P01.txt', 'The first call is ours to make.', 'The first call is ours'],
      ['interview_P02.txt', 'If two call bells go off at once, you have to decide which one to go to first. On your own.', 'The first call is ours'],
      ['interview_P03.txt', 'My senior was in another room and I had to phone the doctor myself. My hands were shaking.', 'The first call is ours'],
      ['interview_P01.txt', '"If I miss it, nobody will notice." At night I\'m the last line of defence.', '"The last line of defence"'],
      ['interview_P02.txt', 'But it feels wrong to wake them in the middle of the night. So first you agonise over whether to call at all.', 'Hesitating to ask for help'],
      ['survey.csv', "When I'm unsure I don't know if it's OK to phone the nurse.", 'Hesitating to ask for help'],
      ['interview_P02.txt', 'In the end I mostly carry it myself until the morning.', 'Carrying it alone'],
      ['survey.csv', "On lone nights there's nobody to turn to if something happens.", 'Carrying it alone'],
      ['interview_P01.txt', 'Someone saying "go and take your break, I\'ll keep an eye on things" makes all the difference.', "Covering each other's breaks"],
      ['survey.csv', 'Seniors who make sure everyone gets a break.', "Covering each other's breaks"],
      ['interview_P01.txt', "there's an unwritten rule that night staff bring something in (laughs). Honestly, it keeps me going.", 'The unwritten snack rule'],
      ['survey.csv', "The night team's habit of bringing in snacks to share.", 'The unwritten snack rule'],
      ['interview_P01.txt', 'when someone hands you something at two in the morning and says "have this", you feel you\'re not on your own.', 'Moments of not being alone'],
      ['interview_P02.txt', "That's all it is, but when a reply comes I feel relieved.", 'Moments of not being alone'],
      ['interview_P02.txt', 'they ask "well done, was it a quiet one?" That\'s when all the tension drains out of me.', 'Moments of not being alone'],
      ['survey.csv', 'Seeing the early-shift staff walk in in the morning.', 'Moments of not being alone'],
      ['interview_P01.txt', 'They\'d see me asleep and say "Mummy is always sleeping".', 'Out of step with family'],
      ['survey.csv', 'My family and I live on different clocks and we talk less.', 'Out of step with family'],
      ['survey.csv', 'On days when the school run clashes I go into the next shift having barely slept.', 'Out of step with family'],
      ['interview_P02.txt', "It feels like I'm living in a different time zone from everyone.", 'Living in a different time zone'],
      ['interview_P02.txt', "I can't make plans with friends until the rota comes out, so gradually they stopped asking.", 'Living in a different time zone'],
      ['survey.csv', "I can't make plans with friends.", 'Living in a different time zone'],
      ['interview_P02.txt', "My head is too wired. Next thing I know I'm watching daytime TV.", 'The lost day after'],
      ['interview_P03.txt', 'I wake up and it\'s evening and I think, "what did I even do today?"', 'The lost day after'],
      ['interview_P03.txt', 'At night I can care for them at my own pace.', 'Caring at my own pace'],
      ['interview_P02.txt', 'sometimes they show a side of themselves they never show in the day.', 'Caring at my own pace'],
      ['survey.csv', 'Nothing really. I like nights because I can work calmly.', 'Caring at my own pace'],
      ['interview_P03.txt', 'At night I feel trusted with things. Of course the responsibility is heavy, but I can think for myself and act.', 'Being trusted'],
      ['interview_P03.txt', 'Nights brought me up, in a way (laughs).', 'Being trusted'],
      ['interview_P01.txt', "I don't think the day staff see how much happens at night.", 'Night is invisible to the day'],
      ['interview_P01.txt', 'At handover you say "nothing to report" and that\'s the end of it.', 'Night is invisible to the day'],
      ['survey.csv', 'What happened in the night gets reduced to one line at handover and nobody hears it.', 'Night is invisible to the day'],
      ['interview_P03.txt', 'On breaks they teach me things I could never ask in the day.', 'Learning in the break room'],
      ['interview_P03.txt', "Talking in the break room at night over instant noodles — I think that's really important time.", 'Learning in the break room']
    ],
    keys: ["At night I'm the last line of defence", "you feel you're not on your own", 'different time zone'],
    memos: { "At night I'm the last line of defence": 'She immediately plays it down ("maybe that sounds dramatic"). Hesitation about claiming the weight of it?' },
    themes: [
      { name: '"At night, I\'m the last line of defence"', status: 'defined', codes: ['Anxiety about early-hours judgement', 'The first call is ours', '"The last line of defence"', 'Hesitating to ask for help', 'Carrying it alone'],
        definition: 'At night, the first decisions that shape patients\' and residents\' safety fall to a few night staff. At the centre of this theme is the experience of judgement and responsibility being pulled towards one person, not only by staffing but by a sense that one should not wake others in the night.',
        narrative: 'Night staff described being the ones who make "the first call". P01 said, "At night I\'m the last line of defence", conveying a sense that if she missed something, nobody would notice. The same sense ran through accounts of hesitating to ask for help that was, in principle, available (P02). Responsibility was pulled towards the individual not only by staffing levels but by a reluctance to wake others.',
        subs: [{ name: 'Trusted with the night', status: 'reviewed', codes: ['Being trusted', 'Caring at my own pace'],
          definition: 'The same responsibility can be lived as latitude and as a chance to grow. Its weight and its rewards were told as two sides of one experience.' }] },
      { name: 'Getting through on "we look after each other"', status: 'defined', codes: ["Covering each other's breaks", 'The unwritten snack rule', 'Moments of not being alone', 'Learning in the break room'],
        definition: 'Small acts between night staff (covering breaks, handing over snacks, texting each other) form an informal web of care that gets people through the night. It sits outside any formal system, yet night staff describe it as indispensable.',
        narrative: 'The loneliness of being the last line of defence was eased by small acts of care between colleagues. P01 described being handed a snack at two in the morning: "you feel you\'re not on your own".' },
      { name: 'Drifting out of step with the day world', status: 'reviewed', codes: ['Body recovers more slowly with age', 'Out of step with family', 'Living in a different time zone', 'The lost day after'],
        definition: 'Night work does not end with the shift: it gradually moves recovery, family time and friendships out of step with the day world.' },
      { name: 'Night stays unseen by the day', status: 'candidate', codes: ['Night is invisible to the day'] }
    ],
    links: [[0, 1, 'made bearable by'], [0, 3, 'burden goes unseen'], [2, 1, '']],
    overview: 'Together the three themes show that night work is more than working at night. Night staff take on judgement and responsibility largely alone, get through the night on small acts of care between colleagues, and in return drift gradually out of step with the day world.',
    journal: [
      ['jt.positionality', 'I worked night shifts on a ward for five years. I want to avoid reading every account through the assumption that nights are simply hard, and to pay attention to voices like P03 who speak positively about nights.'],
      ['jt.decision', 'I first had "Caring at my own pace" as a separate candidate theme, but re-reading P03 and R10 it seems to be the other side of "the last line of defence", so I moved it into a subtheme.']
    ],
    search: 'own',
    splitCode: 'Moments of not being alone',
    splitName: 'The morning "well done"'
  }
};

async function buildProject(page, lang) {
  const P = PLAN[lang];
  page.on('dialog', d => d.accept());
  await page.evaluate(() => document.getElementById('projectModal').classList.add('hidden'));
  await page.evaluate(async (P) => {
    state.researcherId = P.researcher;
    Object.assign(state.meta, P.project);
    await saveMeta();
  }, P);
  // Interviews: import, then detect speakers in each
  const dir = path.join(DATA, lang);
  await page.setInputFiles('#fileInput', ['interview_P01.txt', 'interview_P02.txt', 'interview_P03.txt'].map(f => path.join(dir, f)));
  await page.waitForTimeout(600);
  await page.evaluate(async () => { for (const d of [...state.docs]) { openDocument(d.id); await detectSpeakers(); } });
  // Survey: the CSV dialog (captured later on its own) — accept the suggested columns
  await page.setInputFiles('#fileInput', path.join(dir, 'survey.csv'));
  await page.waitForSelector('#csvModal:not(.hidden)');
  await page.click('#csvImportOk');
  await page.waitForTimeout(500);
  await page.evaluate(async (P) => {
    for (const [label, attrs] of Object.entries(P.attrs)) { const p = state.participants.find(x => x.label === label); p.attributes = attrs; await dbPut('participants', p); }
    for (const [name, note] of Object.entries(P.notes)) { const d = state.docs.find(x => x.name === name); d.note = note; await dbPut('docs', d); }
    const docByName = n => state.docs.find(d => d.name === n);
    for (const [file, phrase, codeName] of P.coding) {
      const d = docByName(file);
      const s = d.text.indexOf(phrase);
      if (s < 0) throw new Error(`Phrase not found in ${file}: ${phrase}`);
      const { code, saved } = makeCode(codeName); await saved;
      await applyCodeToRange(code.id, { docId: d.id, s, e: s + phrase.length });
    }
    for (const k of P.keys) { const seg = state.segments.find(s => s.text.includes(k)); seg.key = true; await dbPut('segments', seg); }
    for (const [k, m] of Object.entries(P.memos)) { const seg = state.segments.find(s => s.text.includes(k)); seg.memo = m; await dbPut('segments', seg); }
    const codeId = n => state.codes.find(c => c.name === n).id;
    const made = [];
    for (const [i, t] of P.themes.entries()) {
      await createTheme(t.name);
      const th = state.themes[state.themes.length - 1];
      made.push(th);
      Object.assign(th, { status: t.status, definition: t.definition || '', narrative: t.narrative || '', checkedExtracts: t.status !== 'candidate', checkedDataset: t.status === 'defined' });
      for (const c of t.codes) await addCodeToTheme(codeId(c), th.id, null);
      for (const s of t.subs || []) {
        await createTheme(s.name, th.id);
        const st = state.themes[state.themes.length - 1];
        Object.assign(st, { status: s.status, definition: s.definition || '', checkedExtracts: true });
        for (const c of s.codes) await addCodeToTheme(codeId(c), st.id, null);
        await dbPut('themes', st);
      }
      await dbPut('themes', th);
    }
    const pos = [[60, 250], [560, 250], [560, 470], [60, 30]]; // the candidate theme sits above the first, clear of its subtheme
    made.forEach((t, i) => { t.mapX = pos[i][0]; t.mapY = pos[i][1]; });
    await dbPutMany('themes', made);
    state.meta.mapLinks = P.links.map(([a, b, label], i) => ({ id: 'lnk' + i, from: made[a].id, to: made[b].id, label }));
    state.meta.storyline = P.overview;
    await saveMeta();
    for (const [ak, text] of P.journal) await recordLog({ category: 'journal', ak, detail: text, snapshot: takeSnapshot() });
    document.getElementById('notePrompt').classList.add('hidden');
  }, P);
  await page.evaluate(() => { document.querySelectorAll('#toastHost > *').forEach(x => x.remove()); });
}

async function shot(page, lang, name, clip) {
  await page.evaluate(() => { document.querySelectorAll('#toastHost > *').forEach(x => x.remove()); document.getElementById('notePrompt').classList.add('hidden'); });
  await page.waitForTimeout(250);
  const png = path.join(OUT, lang, name + '.png');
  await page.screenshot({ path: png, clip });
  execFileSync('python3', ['-c', 'import sys; from PIL import Image; im = Image.open(sys.argv[1]); im.save(sys.argv[2], "WEBP", quality=88, method=6)', png, png.replace(/\.png$/, '.webp')]);
  fs.unlinkSync(png);
  console.log('  ', lang, name);
}

(async () => {
  const browser = await chromium.launch();
  for (const lang of ['ja', 'en']) {
    fs.mkdirSync(path.join(OUT, lang), { recursive: true });
    const P = PLAN[lang];
    const ctx = await browser.newContext({ locale: lang === 'ja' ? 'ja-JP' : 'en-GB', viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.error('page error:', e.message));
    await page.goto(APP);
    await page.waitForTimeout(400);

    // Project setup (first run)
    await page.evaluate((P) => { openProjectModal(); document.getElementById('projName').value = P.project.name; document.getElementById('projQuestion').value = P.project.question; }, P);
    await shot(page, lang, 'setup', { x: 380, y: 170, width: 680, height: 520 });
    await buildProject(page, lang);

    // CSV import dialog
    await page.setInputFiles('#fileInput', path.join(DATA, lang, 'survey.csv'));
    await page.waitForSelector('#csvModal:not(.hidden)');
    await shot(page, lang, 'csv-import', { x: 300, y: 120, width: 840, height: 620 });
    await page.click('#csvImportCancel');

    // Coding: P01 open, the key extract selected
    await page.evaluate((k) => { switchTab('code'); const seg = state.segments.find(s => s.text.includes(k)); openDocument(seg.docId, seg.id); state.openCodeExtracts = new Set(); renderCodebook(); }, P.keys[0]);
    await shot(page, lang, 'coding');

    // A new selection with the selection panel
    await page.evaluate(() => {
      const d = state.docs[0]; const b = d.blocks[3];
      state.activeSegId = null; renderViewer(); renderSegmentPanel();
      const body = document.getElementById('viewerBody');
      const spans = [...body.querySelectorAll(`.ta-block[data-bi="3"] [data-s]`)];
      const r = document.createRange(); r.setStart(spans[0].firstChild, 4); const last = spans[spans.length - 1]; r.setEnd(last.firstChild, Math.min(last.textContent.length, 30));
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); captureSelection();
    });
    await shot(page, lang, 'selection', { x: 280, y: 60, width: 1160, height: 520 });
    await page.evaluate(() => clearPendingSelection());

    // Full-text search
    await page.fill('#textSearchInput', P.search);
    await page.waitForTimeout(400);
    await page.press('#textSearchInput', 'Enter');
    await shot(page, lang, 'search', { x: 0, y: 0, width: 1120, height: 600 });
    await page.evaluate(() => clearTextSearch());

    // Split a code
    await page.evaluate((c) => { openSplitModal(state.codes.find(x => x.name === c).id); }, P.splitCode);
    await page.fill('#splitName', P.splitName);
    await page.evaluate(() => { const rows = [...document.querySelectorAll('#splitList .split-chk')]; rows[2].checked = true; document.getElementById('splitList').dispatchEvent(new Event('change')); });
    await shot(page, lang, 'split', { x: 360, y: 60, width: 720, height: 740 });
    await page.evaluate(() => document.getElementById('splitModal').classList.add('hidden'));

    // Themes board, with one theme's extracts open and the filter on one role
    await page.evaluate(() => { switchTab('themes'); setThemeView('board'); document.getElementById('poolUnassignedOnly').checked = false; state.openThemeExtracts = new Set([state.themes[0].id]); renderThemesView(); });
    await shot(page, lang, 'themes');
    const role = lang === 'ja' ? 'attr\u0001職種\u0001介護福祉士' : 'attr\u0001Role\u0001Care worker';
    await page.evaluate((v) => { setExtractFilter(v); state.openCodeExtracts = new Set([state.codes.find(c => /最初の判断|first call/i.test(c.name)).id]); renderCodePool(); }, role);
    await shot(page, lang, 'filter', { x: 0, y: 50, width: 900, height: 620 });
    await page.evaluate(() => { setExtractFilter(''); state.openCodeExtracts = new Set(); state.openThemeExtracts = new Set(); });

    // Thematic map
    await page.evaluate(() => { setThemeView('map'); renderThemesView(); });
    await shot(page, lang, 'map', { x: 272, y: 50, width: 900, height: 800 });
    await page.evaluate(() => setThemeView('board'));

    // Journal drawer while reading an extract
    await page.evaluate((k) => { switchTab('code'); const seg = state.segments.find(s => s.text.includes(k)); openDocument(seg.docId, seg.id); openJournal(); }, P.keys[1]);
    await page.waitForTimeout(300);
    await shot(page, lang, 'journal', { x: 700, y: 0, width: 740, height: 760 });
    await page.evaluate(() => closeJournal());

    // Audit trail
    await page.evaluate(() => switchTab('audit'));
    await shot(page, lang, 'audit');

    // Writing up: the narrative editor
    await page.evaluate(() => { switchTab('export'); });
    await page.waitForTimeout(300);
    // Top of the narrative editor, with the first theme's extracts open next to its narrative
    await page.evaluate(() => { const d = document.querySelector('#exportPreview details'); if (d) d.open = true; document.getElementById('exportPreview').parentElement.scrollTop = 0; });
    await shot(page, lang, 'writing');

    await ctx.close();
  }
  await browser.close();
})();
