// スコアリング — 設計書 §8 準拠。
//
// 最重要原則: 5 レイヤー（Personality / Work Style / Subject DNA / Practice DNA /
// Study Behavior）は別系統で集計し、相互に加点しない。総合点は作らない。
// 適職判定・求人推薦・採用評価は行わない。
//
// Likert: とても +2 〜 まったく −2。逆転項目は符号反転。
// "NA"（経験がなく判断できない）と未回答は欠測として扱い、平均から除外する（0 点にしない）。

import * as D from "./data.js";

export const NA = "NA";

/** Likert 49 問（Personality 25 + Work Style 16 + Study 8）を出題順に並べた配列 */
export function likertItems() {
  const bf = D.bigfive
    .filter((_, i) => !D.profile.dropBF.includes(i))
    .map((q) => ({ ...q, sec: "A" }));
  return bf
    .concat(D.style.map((q) => ({ ...q, sec: "B" })))
    .concat(D.study.map((q) => ({ ...q, sec: "C" })));
}

// ページ分割 — セクションの切れ目とページの切れ目を一致させる。
//
// 「コア」= Personality + Work Style（41問・9ページ）。ここまでで結果を出す。
// アーキタイプは Work Style から生成するので、コアだけでシェアできる形が完成する。
// 「任意」= Study Behavior + Subject/Practice DNA（15回答・9ページ）。続けたい人だけ進む。
const LIKERT_SECTIONS = [
  { sec: "A", perPage: 5, core: true },   // Personality 25 → 5ページ
  { sec: "B", perPage: 4, core: true },   // Work Style   16 → 4ページ
  { sec: "C", perPage: 4, core: false },  // Study         8 → 2ページ
];

let pagesCache = null;

/**
 * 出題ページの一覧。
 * likert ページは { kind:"likert", sec, core, indices }、DNA ページは { kind:"op", op, core:false }。
 */
export function pages() {
  if (pagesCache) return pagesCache;
  const items = likertItems();
  const out = [];
  LIKERT_SECTIONS.forEach(({ sec, perPage, core }) => {
    const idx = items.reduce((a, q, i) => (q.sec === sec ? a.concat(i) : a), []);
    for (let i = 0; i < idx.length; i += perPage) {
      out.push({ kind: "likert", sec, core, indices: idx.slice(i, i + perPage) });
    }
  });
  D.profile.ops.forEach((op) => out.push({ kind: "op", op, core: false }));
  pagesCache = out;
  return out;
}

export const pageCount = () => pages().length;
/** コアの最終ページの次 = 任意パートの先頭ページ番号 */
export const corePageCount = () => pages().filter((p) => p.core).length;

/** コア（Personality + Work Style）の Likert インデックス */
export const coreIndices = () => pages().filter((p) => p.core).flatMap((p) => p.indices);

export const totalCount = () => likertItems().length + D.profile.ops.length;
export const coreCount = () => coreIndices().length;
export const optionalCount = () => totalCount() - coreCount();

/** コアの回答済み数 */
export function answeredCore(ans) {
  return coreIndices().filter((i) => ans[i] != null).length;
}

/** 任意パート（Study + DNA）の回答済み数 */
export function answeredOptional(ans, ops) {
  const study = pages()
    .filter((p) => p.kind === "likert" && !p.core)
    .flatMap((p) => p.indices)
    .filter((i) => ans[i] != null).length;
  const opsDone = D.profile.ops.filter((op) => (ops[op.id] || []).length > 0).length;
  return study + opsDone;
}

/** S0（経験資格）に応じて出題する科目リストを切り替える。未選択なら全科目。 */
export function subjectPool(ops) {
  const selected = ops.S0 || [];
  let pool = [];
  selected.forEach((g) => {
    if (D.profile.subjectGroups[g]) pool = pool.concat(D.profile.subjectGroups[g]);
  });
  if (!pool.length) {
    Object.values(D.profile.subjectGroups).forEach((a) => { pool = pool.concat(a); });
  }
  return pool;
}

const isMissing = (v) => v == null || v === NA;

/** Personality: 特性ごとの有効回答平均 m → round((m+2)/4×100)。有効 3 問未満は null（判定不能）。 */
function scorePersonality(ans, items) {
  const out = {};
  D.traitOrder.forEach((tr) => {
    const vals = [];
    items.forEach((q, i) => {
      if (q.sec !== "A" || q.tr !== tr) return;
      const v = ans[i];
      if (!isMissing(v)) vals.push(q.d * v);
    });
    out[tr] = vals.length >= 3
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length + 2) / 4 * 100)
      : null;
  });
  return out;
}

// 僅差の軸（|s| <= 2、pct <= 63）は、1 問ぶんの答え方で極が入れ替わる。
// これを「測定の不確かさ」として警告するのではなく、どちらの極も使える人という
// 持ち味として扱う（本サービスは心理検査ではないため、注記ではなくタグで出す）。
export const SOFT_MAX_PCT = 63;
export const isSoftAxis = (pct) => pct != null && pct <= SOFT_MAX_PCT;

/** Work Style: 軸ごと 4 問を極方向に合計 s(−8..+8) → pct = round(50 + 50|s|/8)。s≥0 で左極。 */
function scoreWorkStyle(ans, items) {
  return D.styleAxes.map((ax, ai) => {
    let s = 0;
    items.forEach((q, i) => {
      if (q.sec !== "B" || q.ax !== ai) return;
      const v = ans[i];
      if (!isMissing(v)) s += q.p === ax.L ? v : -v;
    });
    const pct = Math.round(50 + (50 * Math.abs(s)) / 8);
    return {
      ax,
      letter: s >= 0 ? ax.L : ax.R,   // s=0 は既定極
      pct,
      soft: isSoftAxis(pct),
      s,
    };
  });
}

/** Study Behavior: 各指標 1 問 → (v+2)/4×100。単一項目のため参考値。 */
function scoreStudy(ans, items) {
  const out = {};
  items.forEach((q, i) => {
    if (q.sec !== "C") return;
    const v = ans[i];
    out[q.ind] = isMissing(v) ? null : Math.round(((v + 2) / 4) * 100);
  });
  return out;
}

// Subject / Practice DNA は選択操作の集計であって測定値ではない。0–100 の数値で出すと
// 精度のないところに数値の顔をさせてしまうため、「なぜこの科目・領域が挙がったか」を
// そのままタグとして見せる。並び順にだけ内部の重み（w）を使う。
const SUBJECT_TAG = { S1: "苦にならない", S2: "面白い", S3: "いまも語れる" };

/** Subject DNA: 選ばれた設問をタグにして上位 3。並びはタグ数 → 重み。 */
function scoreSubject(ops) {
  const map = {};
  D.profile.ops.forEach((op) => {
    if (op.kind !== "subject") return;
    (ops[op.id] || []).forEach((label) => {
      const e = (map[label] = map[label] || { tags: [], w: 0 });
      e.tags.push(SUBJECT_TAG[op.id]);
      e.w += op.w;
    });
  });
  return Object.entries(map)
    .map(([label, e]) => ({ label, tags: e.tags, w: e.w }))
    .sort((a, b) => b.tags.length - a.tags.length || b.w - a.w)
    .slice(0, 3);
}

/** Practice DNA: P1 経験 / P2 好き / P3 やりたい の組み合わせをタグにして上位 4。 */
function scorePractice(ops) {
  const weights = {};
  const experienced = (ops.P1 || []).filter((l) => l !== "とくになし");
  const liked = ops.P2 || [];
  const wanted = ops.P3 || [];

  liked.forEach((l) => { weights[l] = (weights[l] || 0) + 2; });
  wanted.forEach((l, rank) => { weights[l] = (weights[l] || 0) + [3, 2, 1][rank]; });

  return Object.entries(weights)
    .map(([label, w]) => {
      const exp = experienced.includes(label);
      const isLiked = liked.includes(label);
      const isWanted = wanted.includes(label);
      const core = isLiked && isWanted;      // コア = 好き × やりたい
      const frontier = isWanted && !exp;     // フロンティア = 未経験 × やりたい
      // コア/フロンティアに当てはまらないものは、選ばれた設問をそのまま理由にする
      const tags = [];
      if (core) tags.push("コア");
      else if (isLiked) tags.push("好き");
      else if (isWanted && !frontier) tags.push("やりたい");
      if (frontier) tags.push("フロンティア");
      if (exp) tags.push("経験あり");
      return { label, tags, w, core, frontier, exp };
    })
    .sort((a, b) => b.w - a.w)
    .slice(0, 4);
}

/** 全回答から結果を確定する。5 レイヤーは合算しない。 */
export function computeResult(ans, ops) {
  const items = likertItems();
  const axes = scoreWorkStyle(ans, items);
  return {
    code: axes.map((a) => a.letter).join(""),  // アーキタイプは Work Style のみから生成
    axes,
    bf: scorePersonality(ans, items),
    study: scoreStudy(ans, items),
    subjectTop: scoreSubject(ops),
    practiceTop: scorePractice(ops),
    fromAnswers: true,
  };
}

// アーキタイプ名に前置する修飾語。
//
// Work Style 4 軸のうち 3 軸は Big Five と意味が重なる（推論=開放性 / 進め方=誠実性 /
// 作業様式=外向性）。そこから修飾語を採ると同じことを二度言うだけになるので、
// 重ならない 協調性(A) と 情動安定性(S) の 2 特性だけを使う。
// どちらも 50 から十分離れていないときは修飾語を付けない（全員にラベルを貼らない）。
const MODIFIERS = {
  A: { hi: "まわりを立てる", lo: "率直な" },
  S: { hi: "動じない", lo: "機微に気づく" },
};
const MODIFIER_MIN_GAP = 20;   // 70 以上 または 30 以下

/** 突出した特性から修飾語を 1 つ選ぶ。突出がなければ null。 */
export function archetypeModifier(result) {
  if (!result || !result.bf) return null;
  let best = null;
  Object.keys(MODIFIERS).forEach((tr) => {
    const v = result.bf[tr];
    if (v == null) return;
    const gap = Math.abs(v - 50);
    if (gap < MODIFIER_MIN_GAP) return;
    if (!best || gap > best.gap) best = { gap, word: MODIFIERS[tr][v >= 50 ? "hi" : "lo"] };
  });
  return best ? best.word : null;
}

/**
 * まだ答えていない任意レイヤーの一覧（結果画面の「続きへ」導線に使う）。
 * コアだけで結果を見た人と、最後まで答えた人で同じ結果画面を使い回すための判定。
 */
export function missingLayers(result) {
  if (!result || !result.fromAnswers) return [];
  const out = [];
  if (!studyGroups(result).length) out.push({ key: "study", name: "Study Behavior", jp: "勉強のしかた", n: D.study.length });
  if (!result.subjectTop || !result.subjectTop.length) {
    out.push({ key: "subject", name: "Subject DNA", jp: "好きな科目", n: D.profile.ops.filter((o) => o.kind === "subject" || o.kind === "groups").length });
  }
  if (!result.practiceTop || !result.practiceTop.length) {
    out.push({ key: "practice", name: "Practice DNA", jp: "興味のある実務", n: D.profile.ops.filter((o) => o.kind === "practice").length });
  }
  return out;
}

/** 共有リンク（#p=CODE.pct.pct.pct.pct）からの復元。Work Style とアーキタイプのみ。 */
export function resultFromPcts(code, pcts) {
  const axes = D.styleAxes.map((ax, i) => {
    const pct = Math.max(50, Math.min(100, pcts[i]));
    return { ax, letter: code[i], pct, soft: isSoftAxis(pct) };
  });
  return { code, axes, bf: null, study: null, subjectTop: null, practiceTop: null, fromAnswers: false };
}

/** Profile Map 用: 各軸で勝ち極に寄与の大きかった回答 上位 2 件。 */
export function evidence(result, ans) {
  if (!result.fromAnswers) return result.axes.map(() => []);
  const items = likertItems();
  return result.axes.map((a, ai) => {
    const cands = [];
    items.forEach((q, i) => {
      if (q.sec !== "B" || q.ax !== ai) return;
      const v = ans[i];
      if (isMissing(v)) return;
      const contrib = q.p === a.letter ? v : -v;
      if (contrib > 0) cands.push({ q: q.t, contrib, v });
    });
    cands.sort((x, y) => y.contrib - x.contrib);
    return cands.slice(0, 2).map((c) => ({
      q: c.q,
      ans: D.choices.find((ch) => ch.v === c.v).label,
    }));
  });
}

/** Study の上位 2 指標（補助ラベルの生成にのみ使用） */
function topStudy(result) {
  if (!result.study) return [];
  return Object.entries(result.study)
    .filter(([, v]) => v != null)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
}

// Study Behavior は各指標 1 問しかない。0–100 のバーで見せると「0 と答えた／低めに
// 答えただけ」が空バーとして並び、実際より欠落した印象になる。1 問ぶんの情報量に見合う
// 「当てはまる／どちらともいえない／当てはまらない」の 3 段のタグとして扱う。
// 「当てはまらない」も欠点ではなく「これから試せる」として置く。
export const STUDY_TIERS = [
  { key: "on", title: "いまの学習スタイル", note: "「当てはまる」と答えた項目" },
  { key: "mid", title: "ときどき", note: "「どちらともいえない」" },
  { key: "off", title: "これから試せる", note: "いまは当てはまらない項目" },
];

/** 0–100 のスコア（0/25/50/75/100 のいずれか）を 3 段のどれかに割り当てる。 */
export const studyTier = (v) => (v >= 75 ? "on" : v >= 50 ? "mid" : "off");

/** Study を 3 段にまとめる。空の段は返さない。 */
export function studyGroups(result) {
  if (!result || !result.study) return [];
  const buckets = { on: [], mid: [], off: [] };
  Object.entries(result.study).forEach(([name, v]) => {
    if (v != null) buckets[studyTier(v)].push(name);
  });
  return STUDY_TIERS
    .map((tier) => ({ ...tier, names: buckets[tier.key] }))
    .filter((g) => g.names.length);
}

/** 「いまの学習スタイル」に入った指標名。傾向文・SNS 表示に使う。 */
export function studyOn(result) {
  const g = studyGroups(result).find((x) => x.key === "on");
  return g ? g.names : [];
}

/** Study の補助ラベル（例:「演習先行→エラー分析型」）。SNS 向けの表現であり分類ではない。 */
export function studyLabel(result) {
  // 上位が「当てはまる」に届いていないときは、型として名乗らせない
  const top = topStudy(result);
  return top.length === 2 && top[0][1] >= 75 && top[1][1] >= 75
    ? `${top[0][0]}→${top[1][0]}型`
    : "";
}

/** 「日々の傾向」の行。断定を避け「〜しやすい」の表現に留める。 */
export function habitLines(result, code) {
  const tp = D.types[code];
  if (!tp) return [];
  const on = studyOn(result);
  const lines = [
    { k: "仕事では", v: `${tp.tsuyomi}が自然に出やすい` },
    { k: "調べ物は", v: D.habits[code[0]] },
    { k: "締切前は", v: D.habits[code[2]] },
    { k: "チームでは", v: tp.kyodo },
    { k: "意見が割れたら", v: D.habits[code[1]] },
  ];
  if (on.length) {
    lines.push({ k: "勉強では", v: `${on.slice(0, 2).join("・")}を取り入れた学習になりやすい` });
  }
  if (result.practiceTop && result.practiceTop.length) {
    const labels = result.practiceTop.slice(0, 3).map((d) => d.label).join("・");
    lines.push({ k: "興味が向くのは", v: `${labels} のような領域` });
  }
  return lines;
}

/** 回答済み数（Likert + DNA 操作） */
export function answeredCount(ans, ops) {
  const likert = Object.keys(ans).length;
  const opsDone = D.profile.ops.filter((op) => (ops[op.id] || []).length > 0).length;
  return likert + opsDone;
}
