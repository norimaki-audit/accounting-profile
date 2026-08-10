// 公開前チェック。依存パッケージなしで動く。
//
//   npm test
//
// ここに入れるのは「人が毎回確かめるのは無理だが、壊れると公開に響く」もの。
//   - 16アーキタイプ / 動物 / 画像 / 静的ページ の整合
//   - スコアリングの境界（引き分け・僅差・修飾語）
//   - 受験していない人が最後まで到達できるか、再開判定が正しいか
//   - 排他選択（とくになし / 受験経験なし）
//   - 共有 URL と OGP の宣言
//
// ブラウザ API に触る処理（canvas での画像生成など）はここでは検証できない。

import { readFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as D from "../src/data.js";
import * as S from "../src/scoring.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const exists = (p) => access(join(ROOT, p)).then(() => true, () => false);

let failed = 0;
let count = 0;
const groups = [];

function group(name) { groups.push(name); console.log(`\n${name}`); }
function ok(label, cond, detail = "") {
  count++;
  if (cond) { console.log(`  PASS  ${label}`); return true; }
  failed++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  return false;
}
const eq = (label, got, want) =>
  ok(label, Object.is(got, want), `期待 ${JSON.stringify(want)} / 実際 ${JSON.stringify(got)}`);

// ---------------------------------------------------------------- データの整合

group("16アーキタイプ");
eq("typeOrder は16件", D.typeOrder.length, 16);
eq("types も16件", Object.keys(D.types).length, 16);
eq("animals も16件", Object.keys(D.animals).length, 16);
ok("コードは4軸の極の組合せ", D.typeOrder.every((c) =>
  D.styleAxes.every((ax, i) => c[i] === ax.L || c[i] === ax.R)));
ok("コードに重複がない", new Set(D.typeOrder).size === 16);
ok("動物名に重複がない", new Set(Object.values(D.animals)).size === 16);
ok("すべての type に名前・コピー・2色がある", D.typeOrder.every((c) => {
  const t = D.types[c];
  return t && t.name && t.copy && Array.isArray(t.c) && t.c.length === 2;
}));

group("画像と静的ページ");
for (const code of D.typeOrder) {
  const [full, thumb, card, page] = await Promise.all([
    exists(`assets/archetypes/${code}.jpg`),
    exists(`assets/archetypes/thumb/${code}.jpg`),
    exists(`assets/cards/${code}.jpg`),
    exists(`t/${code}/index.html`),
  ]);
  ok(`${code} 画像720 / サムネ320 / カード / ページ`, full && thumb && card && page,
    `720=${full} 320=${thumb} card=${card} page=${page}`);
}

group("静的ページの中身");
for (const code of D.typeOrder) {
  const html = await readFile(join(ROOT, `t/${code}/index.html`), "utf8");
  const tp = D.types[code];
  const checks = [
    html.includes(`<title>${tp.name}（${D.animals[code]}） — 会計人プロフィール</title>`),
    html.includes(`/assets/cards/${code}.jpg`),
    html.includes('content="summary_large_image"'),
    html.includes(`/t/${code}/`),
  ];
  ok(`${code} タイトル・og:image・カード種別・canonical`, checks.every(Boolean), checks.join(","));
}
{
  const html = await readFile(join(ROOT, "index.html"), "utf8");
  ok("トップに og:image と summary_large_image がある",
    html.includes("/assets/og.jpg") && html.includes('content="summary_large_image"'));
  ok("トップの og:image が存在する", await exists("assets/og.jpg"));
}

// ---------------------------------------------------------------- 出題フロー

group("出題ページ");
eq("全体で19ページ（同点の二択を含む）", S.pageCount(), 19);
eq("コアは5ページ（二択は同点のときだけ出す）", S.corePageCount(), 5);
eq("同点が無ければコアは4ページ", S.activePages({}, {}).filter((p) => p.core).length, 4);
eq("コアは16問（Work Style のみ）", S.coreCount(), 16);
eq("全回答数は56", S.totalCount(), 56);
ok("コアは Work Style と同点の二択だけ",
  S.pages().filter((p) => p.core).every((p) => p.sec === "B" || p.kind === "tie"));
eq("設問番号は Work Style が Q01 から",
  S.likertDisplayNo(S.pages()[0].indices[0]), 1);
eq("設問番号の最大は49", Math.max(...S.likertItems().map((_, i) => S.likertDisplayNo(i))), 49);

group("受験していない人");
{
  const noExam = { S0: [S.NO_EXAM] };
  const withExam = { S0: ["税理士系"] };
  eq("科目リストは空", S.subjectPool(noExam).length, 0);
  eq("出題ページは15（科目3問を飛ばす）", S.activePages(noExam).length, 15);
  eq("受験ありなら18ページ", S.activePages(withExam).length, 18);
  eq("任意パートは37回答", S.optionalCount(noExam), 37);
  eq("出題される総数は53", S.plannedCount(noExam), 53);
  eq("受験ありは56", S.plannedCount(withExam), 56);
  const s0 = S.pages().findIndex((p) => p.op?.id === "S0");
  ok("S0 のあとは Practice へ飛ぶ",
    S.pages()[S.nextPageIndex(s0, noExam)].op?.id === "P1");
  ok("S0 がレイヤーの終端になる", S.isLayerEnd(s0, noExam) === true);
  ok("受験ありなら S0 は終端でない", S.isLayerEnd(s0, withExam) === false);

  // 全部答えたら「つづきから再開」を出さない（実際の総数と比べる）
  const ans = {};
  S.likertItems().forEach((_, i) => { ans[i] = 1; });
  const ops = { S0: [S.NO_EXAM], P1: [S.NONE], P2: [S.NONE], P3: [S.NONE] };
  const saved = S.answeredCount(ans, ops);
  eq("全部答えると53", saved, 53);
  ok("53/53 で「つづきから再開」を出さない", S.canResume(ans, ops) === false,
    `saved=${saved} planned=${S.plannedCount(ops)}`);
  ok("途中なら「つづきから再開」を出す", S.canResume({ 25: 1 }, ops) === true);
  ok("受験ありで56問すべてなら出さない", (() => {
    const full = {}; S.likertItems().forEach((_, i) => { full[i] = 1; });
    const o = { S0: ["税理士系"], S1: ["簿記論"], S2: ["簿記論"], S3: ["簿記論"],
                P1: [S.NONE], P2: [S.NONE], P3: [S.NONE] };
    return S.answeredCount(full, o) === 56 && S.canResume(full, o) === false;
  })());
  ok("何も答えていなければ出さない", S.canResume({}, {}) === false);
  ok("未回答レイヤーとして科目を促さない",
    !S.missingLayers(S.computeResult(ans, ops), ops).some((l) => l.key === "subject"));
}

group("「とくになし」で答えた人");
{
  const ans = {};
  S.likertItems().forEach((_, i) => { ans[i] = 1; });
  const ops = { S0: [S.NO_EXAM], P1: [S.NONE], P2: [S.NONE], P3: [S.NONE] };
  const r = S.computeResult(ans, ops);
  eq("Practice DNA は空になる", r.practiceTop.length, 0);
  ok("それでも実務を未回答として促さない",
    !S.missingLayers(r, ops).some((l) => l.key === "practice"));
}

group("排他選択");
ok("排他の対象は「とくになし」と「受験経験なし」",
  S.EXCLUSIVE_CHOICES.includes(S.NONE) && S.EXCLUSIVE_CHOICES.includes(S.NO_EXAM));
ok("S0 の選択肢に「受験経験なし」がある", D.profile.groupOptions.includes(S.NO_EXAM));
ok("「受験経験なし」は subjectGroups の見出しではない",
  !Object.keys(D.profile.subjectGroups).includes(S.NO_EXAM));
ok("受験経験なしと他資格の同時選択は経験ありと解釈しない",
  // UI 側で排他にしているが、万一混ざっても科目が出ない側へ倒れないことを明示
  S.hasExamExperience({ S0: [S.NO_EXAM] }) === false);

// ---------------------------------------------------------------- スコアリング

group("Work Style の境界");
{
  const uniform = (v) => {
    const ans = {};
    S.likertItems().forEach((_, i) => { ans[i] = v; });
    return S.computeResult(ans, {});
  };
  for (const v of [2, 1, 0, -1, -2]) {
    const r = uniform(v);
    ok(`全部「${D.choices.find((c) => c.v === v).label}」→ 全軸が引き分け(50)`,
      r.axes.every((a) => a.pct === 50));
  }
  ok("僅差タグ（どっちもいける）は廃止済み",
    S.SOFT_MAX_PCT === undefined && S.isSoftAxis === undefined &&
    S.computeResult({}, {}).axes.every((a) => !("soft" in a)));
}

group("修飾語");
{
  const bf = (o) => ({ bf: { E: 50, A: 50, C: 50, S: 50, O: 50, ...o } });
  eq("協調性100 → まわりを立てる", S.archetypeModifier(bf({ A: 100 })), "まわりを立てる");
  eq("協調性0 → 率直な", S.archetypeModifier(bf({ A: 0 })), "率直な");
  eq("情動安定性100 → 動じない", S.archetypeModifier(bf({ S: 100 })), "動じない");
  eq("情動安定性0 → 機微に気づく", S.archetypeModifier(bf({ S: 0 })), "機微に気づく");
  eq("70で付く", S.archetypeModifier(bf({ A: 70 })), "まわりを立てる");
  eq("69では付かない", S.archetypeModifier(bf({ A: 69 })), null);
  eq("突出なしでは付かない", S.archetypeModifier(bf({})), null);
  eq("両方突出したら差の大きいほう", S.archetypeModifier(bf({ A: 100, S: 25 })), "まわりを立てる");
  eq("性格未回答なら付かない", S.archetypeModifier({ bf: null }), null);
  ok("使うのは協調性と情動安定性だけ",
    S.archetypeModifier(bf({ E: 100, C: 100, O: 100 })) === null);
}

group("Study Behavior");
{
  const ans = {};
  const items = S.likertItems();
  items.forEach((q, i) => { if (q.sec === "C") ans[i] = -2; });
  const r = S.computeResult(ans, {});
  ok("すべて0でも空バーではなくタグになる", S.studyGroups(r).every((g) => g.names.length > 0));
  ok("0は「これから試せる」段に入る",
    S.studyGroups(r).every((g) => g.key === "off"));
  eq("上位が届かないときは型ラベルを出さない", S.studyLabel(r), "");
}

group("DNA はタグで出す");
{
  const ops = {
    S0: ["税理士系"], S1: ["簿記論"], S2: ["簿記論"], S3: ["簿記論"],
    P1: ["記帳・仕訳", "経理・決算"],              // 経験あり
    P2: ["記帳・仕訳", "経理・決算", "監査"],       // 好き
    P3: ["記帳・仕訳", "申告書作成", "監査"],       // やりたい（順位順）
  };
  const r = S.computeResult({}, ops);
  const tags = (label) => (r.practiceTop.find((d) => d.label === label) || {}).tags;

  ok("科目に数値を持たせない", r.subjectTop.every((d) => d.score === undefined));
  eq("3問すべてで選んだ科目は3タグ", r.subjectTop[0].tags.length, 3);
  ok("実務に数値を持たせない", r.practiceTop.every((d) => d.score === undefined));

  // 好き / やりたい / 経験あり の 4 通りの組み合わせを網羅する
  eq("好き×やりたい×経験あり → コア・経験あり",
    JSON.stringify(tags("記帳・仕訳")), JSON.stringify(["コア", "経験あり"]));
  eq("好き×やりたい×未経験 → コア・フロンティア",
    JSON.stringify(tags("監査")), JSON.stringify(["コア", "フロンティア"]));
  eq("好き×経験あり（やりたくはない）→ 好き・経験あり",
    JSON.stringify(tags("経理・決算")), JSON.stringify(["好き", "経験あり"]));
  eq("やりたい×未経験（好きではない）→ フロンティア",
    JSON.stringify(tags("申告書作成")), JSON.stringify(["フロンティア"]));
}

group("実務領域の語");
eq("24領域", D.profile.practiceDomains.length, 24);
ok("重複なし", new Set(D.profile.practiceDomains).size === D.profile.practiceDomains.length);
ok("日々の作業が先頭に並ぶ",
  D.profile.practiceDomains.slice(0, 6).includes("記帳・仕訳"));
ok("サービス名ではなく作業名（記帳代行を含まない）",
  !D.profile.practiceDomains.includes("記帳代行"));

group("同点の軸");
{
  const items = S.likertItems();
  const tie = {};
  items.forEach((q, i) => { if (q.sec === "B") tie[i] = 1; });   // 全部「やや当てはまる」

  eq("全部同じ答えだと4軸とも同点", S.tiedAxes(tie).length, 4);
  ok("答え終わっていない軸は同点と呼ばない", S.tiedAxes({}).length === 0);
  eq("二択の設問は4軸ぶん", D.styleTie.length, 4);
  ok("二択は軸ごとに1問ずつ",
    D.styleAxes.every((_, ai) => D.styleTie.filter((t) => t.ax === ai).length === 1));
  ok("二択に「どちらでもない」を置かない",
    D.styleTie.every((t) => t.l && t.r && !("m" in t)));
  // 極の名前を見せると、いつもの自分ではなく「その言葉に合うほう」を選んでしまう
  ok("二択の文面に極の名前を出さない", (() => {
    const poles = D.styleAxes.flatMap((ax) => [ax.lName, ax.rName]);
    return D.styleTie.every((t) => poles.every((w) => !`${t.t}${t.l}${t.r}`.includes(w)));
  })());

  // 同点があるときだけ二択ページを出す
  const tiePage = S.pages().find((p) => p.kind === "tie");
  ok("同点が無ければ二択ページは出ない", S.pageApplies(tiePage, {}, {}) === false);
  ok("同点があれば二択ページを出す", S.pageApplies(tiePage, {}, tie) === true);
  ok("二択ページは Work Style の直後", S.pages()[4] === tiePage);
  ok("二択に答えるまで先へ進めない", S.isPageDone(tiePage, tie, {}) === false);
  ok("Work Style の最終ページは終端にならない（二択が続く）",
    S.isLayerEnd(3, {}, tie) === false && S.isLayerEnd(3, {}, {}) === true);

  // 本人が選んだ極になり、同点のまま断定しない
  const picked = { ...tie, t0: "L", t1: "R", t2: "L", t3: "R" };
  const r = S.computeResult(picked, {});
  eq("二択の答えで極が決まる", r.code, "PXSC");
  ok("二択で決まった軸は 50 のままにしない", r.axes.every((a) => a.pct === 56));
  ok("二択で決まった軸は answer 扱い", r.axes.every((a) => a.resolved === "answer"));
  eq("二択ページが埋まる", S.isPageDone(tiePage, picked, {}), true);

  const flipped = S.computeResult({ ...tie, t0: "R", t1: "L", t2: "R", t3: "L" }, {});
  eq("逆を選べば逆の極になる", flipped.code, "BVAD");

  // 二択に答えていない同点は、そこから出る行動を断定しない
  const raw = S.computeResult(tie, {});
  ok("未回答の同点は fallback 扱い", raw.axes.every((a) => a.resolved === "fallback"));
  const rawLines = S.habitLines(raw, raw.code).map((l) => l.k);
  ok("fallback の軸からは行動を断定しない",
    !rawLines.includes("調べ物は") && !rawLines.includes("締切前は") && !rawLines.includes("意見が割れたら"));
  const okLines = S.habitLines(r, r.code).map((l) => l.k);
  ok("答えで決まった軸からは行動を出す",
    okLines.includes("調べ物は") && okLines.includes("締切前は") && okLines.includes("意見が割れたら"));

  // 進捗・再開の数え方
  eq("同点があるとコアの出題数が増える", S.coreTotal(tie), 20);
  eq("同点が無ければコアは16問のまま", S.coreTotal({}), 16);
  eq("二択は「出題される総数」に数えない", S.answeredCount(picked, {}), 16);
}

group("経験がなく判断できない（NA）");
{
  // ルール: 実務経験を前提にする語を設問に入れない。だから NA の逃げ道も要らない。
  // 例外を作るなら、その軸の左右の本数が崩れることを承知のうえで決めること。
  const na = S.likertItems().filter((q) => q.na);
  ok("NA を出す設問を持たない", na.length === 0, na.map((q) => q.t).join(" / "));

  // 各軸は左2問・右2問。ここが崩れると、1問欠けただけで残った側へ寄る
  ok("Work Style の各軸は左右2問ずつ", D.styleAxes.every((ax, ai) => {
    const items = D.style.filter((q) => q.ax === ai);
    return items.filter((q) => q.p === ax.L).length === 2
      && items.filter((q) => q.p === ax.R).length === 2;
  }));

  // 欠測は 0 点にせず平均から外す。1問抜けても残りの答え方どおりのスコアになる
  const items = S.likertItems();
  const full = {};
  items.forEach((q, i) => { if (q.sec === "A" && q.tr === "E") full[i] = q.d * 2; });
  const idxE = items.reduce((a, q, i) => (q.sec === "A" && q.tr === "E" ? a.concat(i) : a), []);
  const dropped = { ...full };
  delete dropped[idxE[0]];
  eq("全部そろえば外向性100", S.computeResult(full, {}).bf.E, 100);
  eq("1問欠けても100のまま（0点扱いにしない）", S.computeResult(dropped, {}).bf.E, 100);
}

group("日々の傾向");
{
  // 見出しは habitLines() が付ける。データ側にも書き出しがあると二重になる
  const heads = ["調べ物は", "締切前は", "意見が割れたら", "結論が出ないときは"];
  ok("habits の文面に見出しを含めない",
    Object.values(D.habits).every((v) => heads.every((hd) => !v.startsWith(hd))));
  const items = S.likertItems();
  const ans = {};
  items.forEach((q, i) => { if (q.sec === "B") ans[i] = q.p === "P" || q.p === "V" || q.p === "S" || q.p === "D" ? 2 : -2; });
  const r = S.computeResult(ans, {});
  const lines = S.habitLines(r, r.code);
  ok("行と見出しが重複しない", lines.every((l) => !l.v.startsWith(l.k)));
  ok("4軸すべてから行が出る",
    ["調べ物は", "締切前は", "意見が割れたら", "結論が出ないときは"].every((hd) => lines.some((l) => l.k === hd)));
  ok("habits は8極すべてぶんある", Object.keys(D.habits).length === 8);
}

group("共有リンク");
{
  const r = S.resultFromPcts("BVSD", [81, 69, 88, 100]);
  eq("コードから4軸を復元する", r.axes.map((a) => a.pct).join("."), "81.69.88.100");
  ok("共有リンクからは性格を復元しない", r.bf === null);
}

group("共有ボタン");
{
  // X は「リンクとして開く」だけにする。クリックを横取りして navigator.share() を
  // 呼ぶと、X ではなく OS の共有シートが開いてしまい、押しても X に飛べなくなる。
  const src = await readFile(join(ROOT, "src", "screens", "result.js"), "utf8");
  const xLink = src.slice(src.indexOf("ap-share-link"), src.indexOf("igBtn,"));
  ok("Xボタンはクリックを横取りしない", !/onClick/.test(xLink));
  ok("Xボタンは新しいタブへのリンク", /href:\s*intentUrl\(/.test(xLink) && /target:\s*"_blank"/.test(xLink));
  // 共有シートを使うのは Instagram だけ（画像しか渡せない先なので添付が要る）
  eq("navigator.share を呼ぶのは1箇所だけ", (src.match(/navigator\.share\(\{/g) || []).length, 1);

  // Instagram は共有シートが出る。X と同じ「〜でシェア」だと直行すると読めてしまう
  ok("Instagramボタンは直行すると読める文言にしない", !/Instagramでシェア/.test(src));
  // 画像ができる前に押すと黙って保存に落ちていたので、できるまで押せなくする
  ok("画像ができるまでInstagramボタンを押せなくする",
    /igBtn\.disabled = true;/.test(src) && /prepareSquareFile\([^)]*\)\.then/.test(src));
  // 保存しただけで終わらせず、Instagram へ行ける（Web版は PC からも投稿できる）
  ok("保存のあとに Instagram を開く導線を出す",
    /INSTAGRAM_URL = "https:\/\/www\.instagram\.com\/"/.test(src) && /Instagramを開く/.test(src));
}

group("アーキタイプの出やすさ");
{
  // 引き分け（合計0）をすべて同じ側に倒すと分布が大きく偏る。決定的なタイエで
  // 左右に散らしているので、16タイプの最大／最小が極端にならないことを担保する。
  const items = S.likertItems();
  const pLeft = D.styleAxes.map((ax, ai) => {
    const idx = [];
    items.forEach((q, i) => { if (q.sec === "B" && q.ax === ai) idx.push(i); });
    let left = 0, total = 0;
    const walk = (k, ans) => {
      if (k === idx.length) {
        total++;
        if (S.computeResult(ans, {}).axes[ai].letter === ax.L) left++;
        return;
      }
      for (let v = -2; v <= 2; v++) walk(k + 1, { ...ans, [idx[k]]: v });
    };
    walk(0, {});
    return left / total;
  });
  const probs = [];
  for (let m = 0; m < 16; m++) {
    let pr = 1;
    for (let ai = 0; ai < 4; ai++) pr *= (m >> ai) & 1 ? 1 - pLeft[ai] : pLeft[ai];
    probs.push(pr);
  }
  const ratio = Math.max(...probs) / Math.min(...probs);
  ok("各軸の左右がほぼ半々（45〜55%）", pLeft.every((p) => p > 0.45 && p < 0.55),
    pLeft.map((p) => `${(p * 100).toFixed(2)}%`).join(" / "));
  ok("最も出やすい型と出にくい型の差が1.5倍未満", ratio < 1.5, `${ratio.toFixed(2)}倍`);
}

// ---------------------------------------------------------------- 方針の担保

group("方針");
ok("総合点を持たない", !("total" in S.computeResult({}, {})) && !("score" in S.computeResult({}, {})));
ok("アーキタイプは Work Style だけで決まる", (() => {
  const base = {}; const items = S.likertItems();
  items.forEach((q, i) => { if (q.sec === "B") base[i] = q.p === "P" || q.p === "V" || q.p === "S" || q.p === "D" ? 2 : -2; });
  const withPersonality = { ...base };
  items.forEach((q, i) => { if (q.sec !== "B") withPersonality[i] = 2; });
  return S.computeResult(base, {}).code === S.computeResult(withPersonality, {}).code;
})());
ok("経験（P1）はスコアに加点しない",
  D.profile.ops.find((o) => o.id === "P1").w === 0);

console.log(`\n${failed ? "FAILED" : "OK"} — ${count - failed}/${count} passed`);
process.exit(failed ? 1 : 0);
