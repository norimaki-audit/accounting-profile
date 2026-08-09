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

export const PER_PAGE = 4;
export const likertPageCount = () => Math.ceil(likertItems().length / PER_PAGE);
export const pageCount = () => likertPageCount() + D.profile.ops.length;
export const totalCount = () => likertItems().length + D.profile.ops.length;

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

/** Work Style: 軸ごと 4 問を極方向に合計 s(−8..+8) → pct = round(50 + 50|s|/8)。s≥0 で左極。 */
function scoreWorkStyle(ans, items) {
  return D.styleAxes.map((ax, ai) => {
    let s = 0;
    items.forEach((q, i) => {
      if (q.sec !== "B" || q.ax !== ai) return;
      const v = ans[i];
      if (!isMissing(v)) s += q.p === ax.L ? v : -v;
    });
    return {
      ax,
      letter: s >= 0 ? ax.L : ax.R,   // s=0 は既定極 + 「両極型」注記
      tie: s === 0,
      pct: Math.round(50 + (50 * Math.abs(s)) / 8),
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

/** Subject DNA: S1 各+2 / S2 +3 / S3 各+2 → 最大値 100 で正規化し上位 3。 */
function scoreSubject(ops) {
  const scores = {};
  D.profile.ops.forEach((op) => {
    if (op.kind !== "subject") return;
    (ops[op.id] || []).forEach((label) => {
      scores[label] = (scores[label] || 0) + op.w;
    });
  });
  const max = Math.max(1, ...Object.values(scores));
  return Object.entries(scores)
    .map(([label, v]) => ({ label, score: Math.round((v / max) * 100) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/** Practice DNA: P2 各+2 / P3 順位 3・2・1 → 正規化し上位 4。P1 は経験フラグのみ（加点なし）。 */
function scorePractice(ops) {
  const scores = {};
  const experienced = (ops.P1 || []).filter((l) => l !== "とくになし");
  const liked = ops.P2 || [];
  const wanted = ops.P3 || [];

  liked.forEach((l) => { scores[l] = (scores[l] || 0) + 2; });
  wanted.forEach((l, rank) => { scores[l] = (scores[l] || 0) + [3, 2, 1][rank]; });

  const max = Math.max(1, ...Object.values(scores));
  return Object.entries(scores)
    .map(([label, v]) => ({
      label,
      score: Math.round((v / max) * 100),
      exp: experienced.includes(label),
      core: liked.includes(label) && wanted.includes(label),           // コア = 好き × やりたい
      frontier: wanted.includes(label) && !experienced.includes(label), // フロンティア = 未経験 × やりたい
    }))
    .sort((a, b) => b.score - a.score)
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

/** 共有リンク（#p=CODE.pct.pct.pct.pct）からの復元。Work Style とアーキタイプのみ。 */
export function resultFromPcts(code, pcts) {
  const axes = D.styleAxes.map((ax, i) => ({
    ax,
    letter: code[i],
    tie: false,
    pct: Math.max(50, Math.min(100, pcts[i])),
  }));
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

/** Study の上位 2 指標（補助ラベル・傾向文に使用） */
export function topStudy(result) {
  if (!result.study) return [];
  return Object.entries(result.study)
    .filter(([, v]) => v != null)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
}

/** Study の補助ラベル（例:「演習先行→エラー分析型」）。SNS 向けの表現であり分類ではない。 */
export function studyLabel(result) {
  const top = topStudy(result);
  return top.length === 2 ? `${top[0][0]}→${top[1][0]}型` : "";
}

/** 「日々の傾向」の行。断定を避け「〜しやすい」の表現に留める。 */
export function habitLines(result, code) {
  const tp = D.types[code];
  if (!tp) return [];
  const top = topStudy(result);
  const lines = [
    { k: "仕事では", v: `${tp.tsuyomi}が自然に出やすい` },
    { k: "調べ物は", v: D.habits[code[0]] },
    { k: "締切前は", v: D.habits[code[2]] },
    { k: "チームでは", v: tp.kyodo },
    { k: "意見が割れたら", v: D.habits[code[1]] },
  ];
  if (top.length) {
    lines.push({ k: "勉強では", v: `${top[0][0]}を軸にした学習が定着している（${top[0][1]}）` });
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
