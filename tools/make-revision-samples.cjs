// Builds the sample .docx pair for "Replace with a corrected version" (samples/revision/{en,ja}):
// interview_P04.docx (as first transcribed, with names left in) and interview_P04_corrected.docx (pseudonymised,
// one transcription error fixed, one line removed). Fictional. Run: node tools/make-revision-samples.cjs
const fs = require('node:fs');
const path = require('node:path');
const { Document, Packer, Paragraph } = require('docx');

const SAMPLES = {
  en: {
    original: [
      'I: Thank you for joining. How did your first night shift go?',
      'P04: Honestly, I felt completely alone. Mr Tanaka, the charge nurse, had gone home early.',
      'I: What did you do then?',
      'P04: I called Dr Yamamoto twice, but nobody came. I just kept going.',
      'P04: Later the team at Kita Hospital helped me a lot, they really looked after each other.',
      'I: Anything else you remember?',
      'P04: The vending machine was broken again, which was annoying.',
      'P04: In the end I learnt to ask for help earlier.'
    ],
    corrected: [
      'I: Thank you for joining. How did your first night shift go?',
      'P04: Honestly, I felt completely alone. [Senior nurse], the charge nurse, had gone home early.',
      'I: What did you do then?',
      'P04: I called [Doctor A] twice, but nobody came. I just kept on going.',
      'P04: Later the team at [Hospital B] helped me a lot, they really looked after each other.',
      'I: Anything else you remember?',
      'P04: In the end I learnt to ask for help earlier.'
    ]
  },
  ja: {
    original: [
      'I：今日はありがとうございます。初めての夜勤はどうでしたか？',
      'P04：正直、すごく一人だと感じました。リーダーの田中さんが早めに帰ってしまって。',
      'I：そのとき、どうしましたか？',
      'P04：山本先生に二回電話したんですが、誰も来なくて。とにかく続けるしかなかったです。',
      'P04：あとで北病院のチームにはずいぶん助けられました。みんなでお互いを気にかけていて。',
      'I：ほかに覚えていることはありますか？',
      'P04：自動販売機がまた壊れていて、それが地味につらかったです。',
      'P04：結局、早めに助けを求めることを覚えました。'
    ],
    corrected: [
      'I：今日はありがとうございます。初めての夜勤はどうでしたか？',
      'P04：正直、すごく一人だと感じました。リーダーの［看護師A］が早めに帰ってしまって。',
      'I：そのとき、どうしましたか？',
      'P04：［医師B］に二回電話したんですが、誰も来なくて。とにかく続けるしかありませんでした。',
      'P04：あとで［病院C］のチームにはずいぶん助けられました。みんなでお互いを気にかけていて。',
      'I：ほかに覚えていることはありますか？',
      'P04：結局、早めに助けを求めることを覚えました。'
    ]
  }
};

(async () => {
  for (const [lang, s] of Object.entries(SAMPLES)) {
    const dir = path.join(__dirname, '..', 'samples', 'revision', lang);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, lines] of [['interview_P04.docx', s.original], ['interview_P04_corrected.docx', s.corrected]]) {
      const doc = new Document({ creator: 'Reflexive Thematic Analysis Canvas (sample)', sections: [{ children: lines.map(t => new Paragraph(t)) }] });
      fs.writeFileSync(path.join(dir, name), await Packer.toBuffer(doc));
      console.log('wrote', path.join('samples', 'revision', lang, name));
    }
  }
})();
