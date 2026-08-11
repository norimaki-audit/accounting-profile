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

import { readFile, access, readdir } from "node:fs/promises";
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
  // 説明文（og:description / twitter:description / meta description / noscript）は
  // copy と tokucho から作る。data.js を直して再生成し忘れると、リンクカードだけ
  // 古い文言のまま残る。中身まで照合する。
  const desc = `「${tp.copy}」${tp.tokucho}`;
  const esc = (s) => String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const checks = [
    html.includes(`<title>${tp.name}（${D.animals[code]}） — 会計人プロフィール</title>`),
    html.includes(`/assets/cards/${code}.jpg`),
    html.includes('content="summary_large_image"'),
    html.includes(`/t/${code}/`),
    html.includes(`property="og:description" content="${esc(desc)}"`),
    html.includes(`name="twitter:description" content="${esc(desc)}"`),
    html.includes(`<p>「${esc(tp.copy)}」</p>`),
    html.includes(`<p>${esc(tp.tokucho)}</p>`),
  ];
  ok(`${code} タイトル・og:image・カード種別・canonical・説明文`, checks.every(Boolean), checks.join(","));
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

  // 全部答えたら「つづきから再開」を出さない（実際の総数と比べる）。
  // 全問「やや当てはまる」だと4軸とも同点になるので、二択にも答えた状態にする。
  // ここを空のままにすると「答え終わった人」を表せない。
  const ans = {};
  S.likertItems().forEach((_, i) => { ans[i] = 1; });
  S.tiedAxes(ans).forEach((ai) => { ans[S.TIE_KEY(ai)] = "L"; });
  const ops = { S0: [S.NO_EXAM], P1: [S.NONE], P2: [S.NONE], P3: [S.NONE] };
  const saved = S.answeredCount(ans, ops);
  eq("全部答えると53", saved, 53);
  ok("53/53 で「つづきから再開」を出さない", S.canResume(ans, ops) === false,
    `saved=${saved} planned=${S.plannedCount(ops)}`);
  ok("途中なら「つづきから再開」を出す", S.canResume({ 25: 1 }, ops) === true);
  ok("受験ありで56問すべてなら出さない", (() => {
    const full = {}; S.likertItems().forEach((_, i) => { full[i] = 1; });
    S.tiedAxes(full).forEach((ai) => { full[S.TIE_KEY(ai)] = "L"; });
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

group("タイプ同士の距離");
{
  // 1軸だけ違う4タイプ。相性ではなく「どの軸が入れ替わるか」だけを出す
  const n = S.neighbors("PVSD");
  eq("1軸違いは4つ", n.length, 4);
  ok("どれも1軸だけ違う",
    n.every((x) => S.axisDiff("PVSD", x.code).length === 1));
  ok("軸の順に並ぶ", n.map((x) => x.ax.name).join() === D.styleAxes.map((a) => a.name).join());
  eq("入れ替わる極を持つ", `${n[0].fromName}→${n[0].toName}`, "精密→俯瞰");
  ok("存在しないコードでは何も返さない", S.neighbors("ZZZZ").length === 0);

  // 距離の計算
  eq("同じタイプは0軸違い", S.axisDiff("PVSD", "PVSD").length, 0);
  eq("正反対は4軸違い", S.axisDiff("PVSD", "BXAC").length, 4);
  ok("違う軸の名前を返す", S.axisDiff("PVSD", "BVAD").map((a) => a.name).join("・") === "視座・進め方");

  // 画面に出す文言で相性・優劣を言わない（コメントには方針として出てくるので除く）
  const strip = (t) => t.split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(" ");
  const view = strip(await readFile(join(ROOT, "src", "screens", "types.js"), "utf8"))
    + strip(await readFile(join(ROOT, "src", "screens", "result.js"), "utf8"));
  ok("相性・優劣の言い方をしない",
    !/相性|向いてい|優れ/.test(view));
  // 4×4 の配置。たて・よこに隣り合うタイプが必ず1軸だけ違うこと（端の回り込み含む）
  {
    const g = S.typeGrid();
    const flat = g.cells.flat();
    eq("16タイプすべてが1回ずつ並ぶ", new Set(flat).size, 16);
    ok("並ぶのは実在するコードだけ", flat.every((c) => !!D.types[c]));
    let bad = 0;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (S.axisDiff(g.cells[i][j], g.cells[i][(j + 1) % 4]).length !== 1) bad++;
        if (S.axisDiff(g.cells[i][j], g.cells[(i + 1) % 4][j]).length !== 1) bad++;
      }
    }
    eq("隣り合うのは必ず1軸違い（端の回り込み含む32組）", bad, 0);
    ok("たては視座・推論、よこは進め方・作業様式",
      g.rowAxes.map((a) => a.name).join() === "視座,推論" &&
      g.colAxes.map((a) => a.name).join() === "進め方,作業様式");
    ok("見出しは極の名前", g.rows[0].join("・") === "精密・検証" && g.cols[0].join("・") === "構造・深掘");
  }

  // 違いの数を出さない（1→4 の段階に見え、近いほうが良いという順位になる）
  ok("違いを数で言わない", !/軸違い/.test(view));
  // 他人の結果（共有リンクからの復元）を自分のタイプとして使わない
  ok("図鑑の比較は自分の結果のときだけ",
    /state\.result && state\.result\.fromAnswers/.test(
      await readFile(join(ROOT, "src", "screens", "types.js"), "utf8")));
}

group("極の意味");
{
  // 8極すべてに一言がある。Profile Map（既定で畳んである）を開かないと
  // 意味が分からない状態だったので、名前だけが出る場所には一言を添える
  ok("8極すべてに一言がある",
    D.styleAxes.every((a) => a.lHint && a.rHint));
  ok("左右を1行に並べられる長さ（各8字以内）",
    D.styleAxes.every((a) => a.lHint.length <= 8 && a.rHint.length <= 8),
    D.styleAxes.map((a) => `${a.lHint}/${a.rHint}`).join(" "));
  eq("1行の形", D.axisHint(D.styleAxes[0]), "精密＝数値の正確さ ／ 俯瞰＝全体の構造");

  const res = await readFile(join(ROOT, "src", "screens", "result.js"), "utf8");
  const types = await readFile(join(ROOT, "src", "screens", "types.js"), "utf8");
  ok("Work Style のバーの下に出す", /ap-axis-hint[\s\S]{0,80}axisHint/.test(res));
  ok("図鑑の表の下に凡例を出す", /ap-axis-legend[\s\S]{0,200}axisHint/.test(types));
}

group("細かな抜け");
{
  const res = await readFile(join(ROOT, "src", "screens", "result.js"), "utf8");
  const app = await readFile(join(ROOT, "src", "app.js"), "utf8");
  const css = await readFile(join(ROOT, "styles", "app.css"), "utf8");
  const html = await readFile(join(ROOT, "index.html"), "utf8");

  // コピーは成功したときだけ成功と言う
  ok("コピーは Promise の結果を見てから伝える",
    /writeText\(url\)\.then\(/.test(res) && !/writeText\([^)]*\)\.catch\(\(\) => \{\}\)/.test(res));
  ok("コピーできなかったことを伝える", /コピーできませんでした/.test(res));

  // 戻る／進むのどちら向きでもスクロール位置が戻る。
  // history.state は「進むとき」しか更新できないので、離れる瞬間の位置を控える。
  ok("画面を離れる瞬間に位置を控える",
    /function keepScroll/.test(app) && /scrollByNav/.test(app));
  // 進むとき（pushHistory）と戻るとき（onPopState）の両方で控える必要がある
  eq("進むときと戻るときの両方で控える", (app.match(/keepScroll\(\);/g) || []).length, 2);
  {
    const at = app.indexOf("function onPopState");
    const body = app.slice(at, app.indexOf("\n}", at));
    ok("戻る操作でも控える", /keepScroll\(\);/.test(body));
  }
  ok("復元は控えた位置を優先する", /scrollByNav\.has\(saved\)/.test(app));
  // 描画していないタブでは scroll イベントも rAF も飛ばない。どちらにも頼らない
  ok("スクロール復元は scroll イベントに頼らない", !/addEventListener\("scroll"/.test(app));

  // 丸はマスからはみ出さない（はみ出すと隣のマスの上に乗り、押す場所がずれる）
  ok("回答の丸はマスより大きくしない", /width: min\(var\(--ap-dot\), 100%\)/.test(css));
  // 狭い画面ではラベルを別の行に出してマスを広げる
  ok("狭い画面でラベルを丸の行から出す", /@media \(max-width: 360px\)/.test(css));

  // 使われていないセレクタを残さない
  for (const sel of ["ap-type-diff-n", "ap-bar--sm"]) {
    ok(`${sel} は残っていない`, !css.includes(sel));
  }

  // 対象者の書き方をそろえる（og:description だけ略していた）
  const audience = "公認会計士・税理士から、受験生・監査アシスタント・会計事務所職員・経理／経理補助まで";
  ok("meta description の対象者", html.includes(audience));
  const og = html.match(/property="og:description" content="([^"]*)"/);
  ok("og:description の対象者", !!og && og[1].startsWith(audience), og ? og[1].slice(0, 40) : "(見つからない)");
  const home = await readFile(join(ROOT, "src", "screens", "home.js"), "utf8");
  ok("トップの対象者", home.includes(`${audience}。`));

  // 全部答えたあとに戻って同点を作ったら、二択へ戻す道を残す
  const items = S.likertItems();
  const ops = { S0: [S.NO_EXAM], P1: [S.NONE], P2: [S.NONE], P3: [S.NONE] };
  // 同点の出ない答え方で全部埋める（極の向きにそろえる）
  const full = {};
  items.forEach((q, i) => {
    full[i] = q.sec === "B" ? (q.p === D.styleAxes[q.ax].L ? 2 : -2) : 1;
  });
  eq("この答え方なら同点は出ない", S.tiedAxes(full).length, 0);
  ok("全部答え終われば再開を出さない", S.canResume(full, ops) === false);

  // 完了後に戻って1軸を同点にする（二択は未回答のまま）
  const tied = { ...full };
  items.forEach((q, i) => { if (q.sec === "B" && q.ax === 0) tied[i] = 1; });
  eq("1軸だけ同点になる", S.tiedAxes(tied).length, 1);
  eq("回答数は変わらない", S.answeredCount(tied, ops), S.answeredCount(full, ops));
  ok("二択が未回答なら再開を出す", S.canResume(tied, ops) === true,
    `tied=${S.tiedAxes(tied)} answeredTie=${S.answeredTie(tied)}`);
  const answered = { ...tied };
  S.tiedAxes(tied).forEach((ai) => { answered[S.TIE_KEY(ai)] = "L"; });
  ok("二択に答えたら再開は消える", S.canResume(answered, ops) === false);
}

group("プライバシー文言");
{
  // 画像（Instagram 用の正方形カード）には性格から作った一言も描かれる。
  // 「性格は渡しません」と書くと、実際に渡っているものを隠すことになる。
  const home = await readFile(join(ROOT, "src", "screens", "home.js"), "utf8");
  const exportSrc = await readFile(join(ROOT, "src", "export.js"), "utf8");
  const square = exportSrc.slice(exportSrc.indexOf("export async function renderSquareCard"));

  // まず実装side: 正方形カードが本当に性格を描いているか
  ok("正方形カードは性格から作った一言を描く",
    /archetypeModifier\(result\)/.test(square) && /personalityTags\(result\)/.test(square));

  // 文言がそれを認めているか
  ok("画像に性格が入ることを書いている", /画像[^"]{0,20}性格/.test(home));
  ok("性格は渡さない、と書いていない", !/性格・科目・実務・勉強の回答は渡しません/.test(home));
  // 通常利用と共有操作の区別は保つ
  ok("通常利用では送信しないことを書いている", /通常利用では回答・結果を外部へ送信しません/.test(home));
  ok("渡るのは共有操作のときだけ、と書いている", /共有操作を行った場合に限り/.test(home));
}

group("トップの導線");
{
  // コア16問で終えるのが本線。ここを「つづき」と排他にすると、本線どおりに
  // 答えた人が翌日に自分の結果を開けない（つづきは性格の1ページ目に着地し、
  // そこから結果へ戻る道が無い）。
  const home = await readFile(join(ROOT, "src", "screens", "home.js"), "utf8");
  const at = home.indexOf("前回の結果をもう一度見る");
  const around = home.slice(Math.max(0, at - 400), at);
  ok("結果の再表示を「つづき」と排他にしない", !/canReplay && !canResume/.test(around));
  ok("コアが埋まっていれば結果を再表示できる", /canReplay &&\s*$/m.test(around.trimEnd())
    || /canReplay &&/.test(around));

  // 「コアが埋まっている」の判定そのもの
  const items = S.likertItems();
  const core = {};
  items.forEach((q, i) => { if (q.sec === "B") core[i] = 1; });
  eq("コア16問だけでコアは埋まる", S.answeredCore(core), S.coreCount());
  ok("コアだけの人はまだ続きがある", S.canResume(core, {}) === true);
  // → 上の2つが同時に真になる人がいる。だから排他にしてはいけない
}

group("戻る操作（履歴）");
{
  const raw = await readFile(join(ROOT, "src", "app.js"), "utf8");
  // コメントには経緯として API 名が出てくるので、コードの行だけ見る
  const app = raw.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

  ok("画面が変わったら履歴を積む",
    app.includes('history.pushState({ nav: key, scroll: 0 }, "");'));
  // URL を渡すと #p= が消え、共有リンクから開いた人が戻ったとき4軸を失う
  eq("pushState は1か所だけ", (app.match(/history\.pushState\(/g) || []).length, 1);
  ok("戻るを受ける", /addEventListener\("popstate"/.test(app));

  // 戻すのは画面の位置だけ。ans / ops / result を popstate で書き換えない
  const at = app.indexOf("function onPopState");
  const fn = app.slice(at, app.indexOf("\n}", at));
  // 読むのは構わない（どのページへ寄せるかの判断に要る）。上書きしないことを見る。
  const patches = [...fn.matchAll(/setState\(\{([^}]*)\}/g)].map((m) => m[1]);
  ok("戻る操作で setState を呼んでいる", patches.length > 0);
  ok("戻ったときに回答や結果は捨てない",
    patches.every((p) => !/\b(ans|ops|result)\s*:/.test(p)),
    patches.filter((p) => /\b(ans|ops|result)\s*:/.test(p)).join(" / "));

  // URL をルートへ戻すときに履歴の状態まで消さない
  ok("normalizeUrl は history.state を残す",
    /history\.replaceState\(history\.state, "", root\)/.test(app));
  ok("スクロールは自前で戻す", /history\.scrollRestoration = "manual"/.test(app));

  // 4問そろえた直後に戻ると、350ms 後の自動送りが戻った先で発火して画面が進む
  ok("戻るときに自動送りの予約を取り消す", /cancelAutoAdvance\(\);/.test(app));
  const quiz = await readFile(join(ROOT, "src", "screens", "quiz.js"), "utf8");
  ok("自動送りの取り消し口がある", /export function cancelAutoAdvance/.test(quiz));
  ok("質問画面を離れていたら自動送りで進めない",
    /if \(state\.screen !== "quiz"\) return;/.test(quiz));

  // 積んだあとに回答を変えると、そのページが出題対象でなくなることがある。
  // 素通しすると設問ゼロの空ページや、回答ゼロの結果が出る
  // 宣言があるだけでは足りない。onPopState が実際に呼んでいることを見る
  ok("復元先が成立するか確かめる",
    /function reachable/.test(app) && /\breachable\(/.test(fn));
  ok("出題対象外なら行くべきページへ寄せる", /firstIncompletePage\(state\.ans, state\.ops\)/.test(app));
  ok("見せる結果が無ければトップへ返す", /screen: "home", preview: false/.test(app));
  // タブが表に出ていないと発火しないので、位置の復元に rAF は使わない
  ok("スクロール復元に requestAnimationFrame を使わない", !/requestAnimationFrame/.test(app));
}

group("共有リンクの転送");
{
  // 共有リンクを開いた人がもう一度コピーしても、数値が落ちないこと。
  // 以前は fromAnswers を条件にしていたため、1回転送するだけで数値が消えた。
  const src = await readFile(join(ROOT, "src", "screens", "result.js"), "utf8");
  const at = src.indexOf("function shareUrl");
  // コメントには経緯として fromAnswers が出てくるので、コードの行だけ見る
  const fn = src.slice(at, src.indexOf("\n}", at))
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  ok("数値を載せる条件は fromAnswers ではない", !/fromAnswers/.test(fn));
  ok("4軸がそろっていれば載せる", /axes\.every\(\(a\) => a\.pct != null\)/.test(fn));

  // 復元した結果も4軸を持っている（= 転送しても同じリンクを作れる）
  const restored = S.resultFromPcts("PVSD", [100, 100, 100, 100]);
  ok("復元した結果も4軸の数値を持つ", restored.axes.every((a) => a.pct != null));

  // 読むときは ?p= も受ける（フラグメントを落とすアプリがあっても開けるように）。
  // ただしこちらから ?p= を作ることはしない（作るとサーバーの記録に数値が残る）
  const app = await readFile(join(ROOT, "src", "app.js"), "utf8");
  ok("?p= も読める", /SHARE_DATA = \/\[#\?&\]p=/.test(app));
  ok("結果リンクは #p= で作る", /#p=\$\{/.test(src));

  // src 全体を見る。テンプレートリテラルの綴りだけを見ていると、文字列連結で
  // 書き換えられたときに素通りする（実際に "?p=" + code に変えても通ってしまった）。
  // 読む側の宣言（SHARE_DATA）以外に ?p= が現れたら失敗させる。
  {
    const files = (await readdir(join(ROOT, "src"), { recursive: true }))
      .filter((f) => f.endsWith(".js"));
    const offenders = [];
    for (const f of files) {
      const text = await readFile(join(ROOT, "src", f), "utf8");
      text.split(/\r?\n/).forEach((l, i) => {
        if (l.trim().startsWith("//")) return;          // コメントの説明は対象外
        if (!l.includes("?p=")) return;
        if (l.includes("SHARE_DATA")) return;           // 読む側の宣言だけ許す
        offenders.push(`src/${f}:${i + 1}`);
      });
    }
    ok("生成するのは #p= だけ（src 全体）", offenders.length === 0, offenders.join(" / "));
  }

  // 数値なしで /t/{CODE}/ に来た人に、個人の結果ではないと分かる文を出す
  ok("数値なしの紹介ページはその旨を出す",
    /previewFromPath/.test(app) && /個人の結果（4軸の数値）は含まれていません/.test(src));
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

  // プレビュー中は自分の結果を画像に混ぜない。混ぜると、別タイプの名前と動物の上に
  // 自分の4軸バーが乗った、名前とバーが食い違うカードが保存される。
  ok("プレビューでは結果を画像に渡さない",
    /const shareRes = state\.preview \? null : res;/.test(src)
    && /shareToInstagram\(shareRes,/.test(src)
    && /prepareSquareFile\(shareRes,/.test(src));
  // モジュール変数のカードは、いま画面に出ているものか確かめてから使う
  ok("作り置きのカードは指紋を照合してから使う",
    /squareKey === shareKey\(result, code\)/.test(src));

  // カードには性格から作った一言（修飾語・タグ）も乗る。修飾語（協調性/情動安定性・
  // 差20以上）だけを指紋にすると、外向性だけ突出した人でタグの変化を取りこぼす。
  ok("カードの指紋は性格そのものを含む", /JSON\.stringify\(result\.bf \|\| null\)/.test(src));
  ok("修飾語だけを指紋にしない", !/shareKey[\s\S]{0,200}archetypeModifier/.test(src));
  // 画像ができる前に押すと黙って保存に落ちていたので、できるまで押せなくする
  ok("画像ができるまでInstagramボタンを押せなくする",
    /igBtn\.disabled = true;/.test(src) && /prepareSquareFile\([^)]*\)\.then/.test(src));
  // 保存しただけで終わらせず、Instagram へ行ける（Web版は PC からも投稿できる）
  ok("保存のあとに Instagram を開く導線を出す",
    /INSTAGRAM_URL = "https:\/\/www\.instagram\.com\/"/.test(src) && /Instagramを開く/.test(src));
  // web の URL ではアプリは開かない（ルート URL はユニバーサルリンクではない）
  ok("アプリはカスタムスキームで開く", /INSTAGRAM_APP = "instagram:\/\/app"/.test(src));
  ok("href は web のまま（アプリ未導入でリンクが壊れないように）",
    src.includes("href: INSTAGRAM_URL,") && !src.includes("href: INSTAGRAM_APP"));
  // 押した瞬間に Instagram が開くわけではない（相手はシートで選ぶ）ので、その場に案内を出す
  ok("共有シートを出すときに何をすればいいか出す",
    /共有シートから Instagram を選んでください。/.test(src));
  // 共有シートの有無ではなく、アプリが在りうる端末かで判定する
  // （X のアプリ内ブラウザは canShare を持たないことがあるが、アプリは入っている）
  ok("アプリを試す判定は canShare ではなく端末",
    /function openInstagram[\s\S]*?if \(!isTouchDevice\(\)\) return;/.test(src));
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
