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
// 「コア」= Work Style 16問（4ページ）だけ。アーキタイプは Work Style だけから
// 生成するので、ここまでで動物とキャッチコピーが出そろう。Personality を
// コアに入れないのは、アーキタイプの決定に使わない 25 問を最初に置くと
// 「ちょっとやってみる」の範囲を超えてしまうため。
// 「任意」= Personality 25 → Study 8 → Subject/Practice DNA 7操作。
// 出題順はこの配列の順。likertItems() の並び（= 回答インデックス）は変えないので、
// 順序を入れ替えても保存済みの回答はそのまま使える。
const LIKERT_SECTIONS = [
  { sec: "B", perPage: 4, core: true },   // Work Style   16 → 4ページ
  { sec: "A", perPage: 5, core: false },  // Personality  25 → 5ページ
  { sec: "C", perPage: 4, core: false },  // Study         8 → 2ページ
];

let pagesCache = null;

/**
 * 出題ページの一覧。
 * likert ページは { kind:"likert", sec, core, indices }、DNA ページは { kind:"op", op, core:false }。
 */
// ページが属するレイヤー。レイヤーの切れ目でいったん結果画面へ戻す。
const SEC_LAYER = { B: "workstyle", A: "personality", C: "study" };
const OP_LAYER = { groups: "subject", subject: "subject", practice: "practice" };

export function pages() {
  if (pagesCache) return pagesCache;
  const items = likertItems();
  const out = [];
  LIKERT_SECTIONS.forEach(({ sec, perPage, core }) => {
    const idx = items.reduce((a, q, i) => (q.sec === sec ? a.concat(i) : a), []);
    for (let i = 0; i < idx.length; i += perPage) {
      out.push({ kind: "likert", sec, layer: SEC_LAYER[sec], core, indices: idx.slice(i, i + perPage) });
    }
    // 同点の軸があるときだけ出す二択ページ。Work Style の直後に置き、
    // アーキタイプが確定してから結果画面へ抜けるようにする。
    if (sec === "B") out.push({ kind: "tie", layer: SEC_LAYER[sec], core: true });
  });
  D.profile.ops.forEach((op) => out.push({ kind: "op", op, layer: OP_LAYER[op.kind], core: false }));
  pagesCache = out;
  return out;
}

// ---- 同点の軸（Work Style だけ）----

/** 同点解消の答えを ans に置くときのキー。likert のインデックス（数値）と衝突しない。 */
export const TIE_KEY = (ai) => `t${ai}`;
const TIE_KEY_RE = /^t\d+$/;

/**
 * 引き分けている軸の一覧。
 * その軸の 4 問がすべて埋まっていて、極方向の合計が 0 の軸だけを返す。
 * まだ答え終わっていない軸は（合計が 0 でも）引き分けとは呼ばない。
 */
export function tiedAxes(ans = {}) {
  const items = likertItems();
  const out = [];
  D.styleAxes.forEach((ax, ai) => {
    let s = 0, asked = 0, filled = 0;
    items.forEach((q, i) => {
      if (q.sec !== "B" || q.ax !== ai) return;
      asked++;
      const v = ans[i];
      if (v == null) return;
      filled++;
      if (v !== NA) s += q.p === ax.L ? v : -v;
    });
    if (filled === asked && s === 0) out.push(ai);
  });
  return out;
}

/** 引き分けの軸のうち、二択に答え終わった数。 */
export const answeredTie = (ans = {}) =>
  tiedAxes(ans).filter((ai) => ans[TIE_KEY(ai)] != null).length;

/** 二択も含めたコアの出題数（引き分けが無ければ 16 のまま）。 */
export const coreTotal = (ans = {}) => coreCount() + tiedAxes(ans).length;

export const NONE = "とくになし";
export const NO_EXAM = "受験経験なし";

/** 他の選択肢と同時に選べない選択肢（選ぶと他を消す・他を選ぶと消える）。 */
export const EXCLUSIVE_CHOICES = [NONE, NO_EXAM];

/** 受験経験があるか。S0 で「受験経験なし」だけを選んだ人は無し扱い。 */
export const hasExamExperience = (ops) =>
  (ops.S0 || []).some((g) => g !== NO_EXAM);

/**
 * そのページを出題するか。
 * 会計事務所職員・監査アシスタント・経理補助など受験していない人に、
 * 勉強したことのない科目を選ばせないための判定。
 */
export function pageApplies(page, ops, ans = {}) {
  if (page.kind === "op" && page.op.kind === "subject") return hasExamExperience(ops);
  if (page.kind === "tie") return tiedAxes(ans).length > 0;
  return true;
}

/** 出題対象のページだけを返す。 */
export const activePages = (ops, ans = {}) => pages().filter((p) => pageApplies(p, ops, ans));

/** i の次に出題するページ番号。出題しないページは飛ばす。-1 なら以降なし。 */
export function nextPageIndex(i, ops, dir = 1, ans = {}) {
  const all = pages();
  for (let k = i + dir; k >= 0 && k < all.length; k += dir) {
    if (pageApplies(all[k], ops, ans)) return k;
  }
  return -1;
}

/**
 * そのページがレイヤーの最終ページか。
 * ここで結果画面へ戻し、増えたレイヤーをその場で見せる（性格を足したら修飾語が付く、など）。
 */
export function isLayerEnd(i, ops = {}, ans = {}) {
  const next = nextPageIndex(i, ops, 1, ans);
  return next === -1 || pages()[next].layer !== pages()[i].layer;
}

// 画面に出す設問番号。回答インデックス（likertItems() の並び）ではなく
// 出題順で振る。Work Style を先頭に移したあとも Q01 から始まるようにするため
// （インデックスをそのまま出すと Work Style の1問目が Q26 になる）。
let displayNoCache = null;
export function likertDisplayNo(idx) {
  if (!displayNoCache) {
    displayNoCache = {};
    pages()
      .filter((p) => p.kind === "likert")
      .flatMap((p) => p.indices)
      .forEach((i, n) => { displayNoCache[i] = n + 1; });
  }
  return displayNoCache[idx];
}

export const pageCount = () => pages().length;
/** コアの最終ページの次 = 任意パートの先頭ページ番号 */
export const corePageCount = () => pages().filter((p) => p.core).length;

/** コア（Work Style）の Likert インデックス。二択ページは設問を持たないので除く。 */
export const coreIndices = () =>
  pages().filter((p) => p.core && p.kind === "likert").flatMap((p) => p.indices);

export const totalCount = () => likertItems().length + D.profile.ops.length;
export const coreCount = () => coreIndices().length;

/** 任意パートの回答数。出題しないページ（受験なしの科目3問）は数に入れない。 */
export const optionalCount = (ops = {}, ans = {}) =>
  activePages(ops, ans)
    .filter((p) => !p.core)
    .reduce((n, p) => n + (p.kind === "op" ? 1 : p.indices.length), 0);

/**
 * その人に実際に出題される回答の総数。
 * totalCount() は常に 56 だが、受験していない人には科目3問を出さないので
 * 上限は 53 になる。「つづきから再開」の判定はこちらで行う。
 */
export const plannedCount = (ops = {}, ans = {}) => coreCount() + optionalCount(ops, ans);

/**
 * 「つづきから再開」を出すか。
 * 比べる相手は totalCount()（常に56）ではなく、その人に出題される総数。
 * 受験していない人は 53 で終わるので、56 と比べると全部答えても未完了に見える。
 */
export function canResume(ans, ops = {}) {
  const a = ans || {};
  const saved = answeredCount(a, ops);
  if (saved === 0) return false;
  // 二択は「出題される総数」に数えていないので、件数の比較だけでは未回答を
  // 見落とす。全部答えたあとに戻って回答を変え、同点ができた場合がこれにあたる
  // （答える道が無くなり、極が内部の計算で決まったままになる）。
  if (answeredTie(a) < tiedAxes(a).length) return true;
  return saved < plannedCount(ops, a);
}

/** コアの回答済み数 */
export function answeredCore(ans) {
  return coreIndices().filter((i) => ans[i] != null).length;
}

/** 任意パート（Personality + Study + DNA）の回答済み数 */
export function answeredOptional(ans, ops) {
  return activePages(ops, ans)
    .filter((p) => !p.core)
    .reduce((n, p) => n + (p.kind === "op"
      ? ((ops[p.op.id] || []).length > 0 ? 1 : 0)
      : p.indices.filter((i) => ans[i] != null).length), 0);
}

/** ページが埋まっているか（Likert は全問回答、DNA は 1 つ以上選択）。 */
export function isPageDone(page, ans, ops) {
  if (!pageApplies(page, ops, ans)) return true;   // 出題しないページは埋まっている扱い
  if (page.kind === "tie") return tiedAxes(ans).every((ai) => ans[TIE_KEY(ai)] != null);
  return page.kind === "op"
    ? (ops[page.op.id] || []).length > 0
    : page.indices.every((i) => ans[i] != null);
}

/**
 * まだ埋まっていない最初のページ。
 * 中断からの再開に使う。保存済みの page 番号ではなく回答から求めるので、
 * 出題順を変えたあとに古い下書きを読んでも変なページに着地しない。
 */
export function firstIncompletePage(ans, ops, from = 0) {
  const all = pages();
  for (let i = from; i < all.length; i++) {
    if (!isPageDone(all[i], ans, ops)) return i;
  }
  return Math.max(from, all.length - 1);
}

/**
 * S0（経験資格）に応じて出題する科目リストを切り替える。
 * 受験経験がなければ空（科目3問はそもそも出題しない）。
 */
export function subjectPool(ops) {
  if (!hasExamExperience(ops)) return [];
  let pool = [];
  (ops.S0 || []).forEach((g) => {
    if (D.profile.subjectGroups[g]) pool = pool.concat(D.profile.subjectGroups[g]);
  });
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

/**
 * 引き分け（s=0）をどちらの極に倒すか。
 *
 * 引き分けは 1 軸あたり 13.6% 起きる。これを常に左極へ倒していたため、
 * 4 軸ぶん積み重なって特定のアーキタイプに偏っていた（一様回答で
 * ハリネズミ 10.4% 対 ネコ 3.5%、約 3 倍）。引き分けはどちらの極を
 * 選ぶ根拠も無いので、その軸の回答の並びから決まる値で振り分ける。
 * 同じ回答なら必ず同じ結果になる（乱数は使わない）。
 *
 * 下位ビットは回答の偶奇に縛られる（引き分けの条件から合計が偶数になる）ため、
 * 最後に撹拌してから使う。
 */
function tieBreaksLeft(axisIndex, vals) {
  let h = 2166136261 ^ Math.imul(axisIndex + 1, 0x9e3779b1);
  for (const v of vals) h = Math.imul(h ^ (v + 3), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) & 1) === 0;
}

/**
 * Work Style: 軸ごと 4 問を極方向に合計 s(−8..+8) → pct = round(50 + 50|s|/8)。s>0 で左極。
 *
 * 引き分け（s=0）は二択（styleTie）の答えで決める。答えがあれば s=±1 として扱うので
 * pct は 56 になり、極は本人が選んだものになる（resolved:"answer"）。
 * 二択に答えていない引き分けは根拠が無いので、極だけ内部で決めて resolved:"fallback"
 * とし、そこから出る行動傾向は断定しない（habitLines を参照）。
 */
function scoreWorkStyle(ans, items) {
  return D.styleAxes.map((ax, ai) => {
    let s = 0;
    const vals = [];
    items.forEach((q, i) => {
      if (q.sec !== "B" || q.ax !== ai) return;
      const v = ans[i];
      vals.push(isMissing(v) ? 9 : v);   // 未回答も並びの一部として扱う
      if (!isMissing(v)) s += q.p === ax.L ? v : -v;
    });

    let left, resolved = null;
    const pick = ans[TIE_KEY(ai)];
    if (s !== 0) {
      left = s > 0;
    } else if (pick === "L" || pick === "R") {
      left = pick === "L";
      s = left ? 1 : -1;
      resolved = "answer";
    } else {
      left = tieBreaksLeft(ai, vals);
      resolved = "fallback";
    }
    const pct = Math.round(50 + (50 * Math.abs(s)) / 8);
    return { ax, letter: left ? ax.L : ax.R, pct, s, resolved };
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
  const pick = (id) => (ops[id] || []).filter((l) => l !== NONE);
  const experienced = pick("P1");
  const liked = pick("P2");
  const wanted = pick("P3");

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

/**
 * レイヤーごとに「答え終わったか」。
 * 中身の有無では判定できない。「とくになし」と答えた人は結果が空になるが、
 * それは未回答ではないので、続きを促してはいけない。
 */
function answeredLayers(ans, ops) {
  const out = {};
  activePages(ops, ans).forEach((p) => {
    if (p.core) return;
    out[p.layer] = (out[p.layer] ?? true) && isPageDone(p, ans, ops);
  });
  return out;
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
    answered: answeredLayers(ans, ops),
    examExperience: hasExamExperience(ops),
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
export function missingLayers(result, ops = {}) {
  if (!result || !result.fromAnswers) return [];
  // 「答え終わったか」で判定する。中身の有無で見ると、「とくになし」と答えた人に
  // 永久に続きを促してしまう。answered が無い古い結果は中身から推定する。
  const done = result.answered || {};
  const doneOr = (key, fallback) => (key in done ? done[key] : fallback);
  const opCount = (kind) => D.profile.ops.filter((o) => kind.includes(o.kind)).length;

  const all = [
    { key: "personality", name: "Personality", jp: "性格",
      n: D.bigfive.length - D.profile.dropBF.length,
      filled: doneOr("personality", !!result.bf && D.traitOrder.some((tr) => result.bf[tr] != null)) },
    { key: "study", name: "Study Behavior", jp: "勉強のしかた", n: D.study.length,
      filled: doneOr("study", studyGroups(result).length > 0) },
    { key: "subject", name: "Subject DNA", jp: "好きな科目",
      // 受験していない人には科目3問を出さないので、残りは S0 の1問だけ
      n: hasExamExperience(ops) ? opCount(["subject", "groups"]) : opCount(["groups"]),
      filled: doneOr("subject", !!result.subjectTop && result.subjectTop.length > 0) },
    { key: "practice", name: "Practice DNA", jp: "興味のある実務", n: opCount(["practice"]),
      filled: doneOr("practice", !!result.practiceTop && result.practiceTop.length > 0) },
  ];
  return all.filter((l) => !l.filled).map(({ filled, ...rest }) => rest);
}

// ---- タイプ同士の距離 ----
//
// 「相性」ではなく「軸がいくつ違うか」だけを出す。相性を言うと、当たっている／
// 外れているの話になり、型に決めつけないという方針から外れる。
// 違う軸の数と名前は事実なので、そこまでに留める。

/** 2つのコードで極が違う軸。返すのは軸そのもの（名前は呼び出し側で使う）。 */
export function axisDiff(a, b) {
  if (!a || !b) return [];
  return D.styleAxes.filter((_, i) => a[i] !== b[i]);
}

/**
 * その軸だけ極を裏返したコード。
 * 「ここが1つ違うと、どのタイプになるか」を出すために使う。
 */
export function flipAxis(code, ai) {
  const ax = D.styleAxes[ai];
  return code.split("").map((c, i) => (i === ai ? (c === ax.L ? ax.R : ax.L) : c)).join("");
}

/** 1軸だけ違う4タイプ。軸の並び順で返す。 */
export function neighbors(code) {
  if (!D.types[code]) return [];
  return D.styleAxes.map((ax, ai) => {
    const to = flipAxis(code, ai);
    const from = code[ai];
    return {
      code: to,
      ax,
      fromName: from === ax.L ? ax.lName : ax.rName,
      toName: from === ax.L ? ax.rName : ax.lName,
    };
  });
}

// 16タイプを平面に並べたときの位置。
//
// たてに 視座×推論、よこに 進め方×作業様式 を割り当てる。並び順を「隣り合う
// ものは1文字だけ変わる」順（P V → P X → B X → B V）にしてあるので、
// たて・よこに隣り合うタイプは必ず軸が1つだけ違う。左右の端どうし・上下の
// 端どうしも隣（4軸の組合せを平面に開いた形なので、輪になっている）。
//
// 線も距離も引かない。位置そのものが関係を表すので、近い遠いに優劣を与えずに済む。
const GRID_ROWS = [["P", "V"], ["P", "X"], ["B", "X"], ["B", "V"]];
const GRID_COLS = [["S", "D"], ["S", "C"], ["A", "C"], ["A", "D"]];

const poleName = (ai, letter) =>
  letter === D.styleAxes[ai].L ? D.styleAxes[ai].lName : D.styleAxes[ai].rName;

/** 4×4 の配置。rows/cols は見出し、cells[r][c] はアーキタイプのコード。 */
export function typeGrid() {
  return {
    rowAxes: [D.styleAxes[0], D.styleAxes[1]],
    colAxes: [D.styleAxes[2], D.styleAxes[3]],
    rows: GRID_ROWS.map((r) => [poleName(0, r[0]), poleName(1, r[1])]),
    cols: GRID_COLS.map((c) => [poleName(2, c[0]), poleName(3, c[1])]),
    cells: GRID_ROWS.map((r) => GRID_COLS.map((c) => r[0] + r[1] + c[0] + c[1])),
  };
}

/** 共有リンク（#p=CODE.pct.pct.pct.pct）からの復元。Work Style とアーキタイプのみ。 */
export function resultFromPcts(code, pcts) {
  const axes = D.styleAxes.map((ax, i) => {
    const pct = Math.max(50, Math.min(100, pcts[i]));
    return { ax, letter: code[i], pct };
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
  // 引き分けたまま二択にも答えていない軸は、極が本人の答えから決まっていない。
  // その軸から出る行動の行は落とす（根拠のないことを断定しないため）。
  const solid = (ai) => !result.axes || result.axes[ai].resolved !== "fallback";
  const lines = [
    { k: "仕事では", v: `${tp.tsuyomi}が自然に出やすい` },
    solid(0) ? { k: "調べ物は", v: D.habits[code[0]] } : null,
    solid(2) ? { k: "締切前は", v: D.habits[code[2]] } : null,
    { k: "チームでは", v: tp.kyodo },
    solid(1) ? { k: "意見が割れたら", v: D.habits[code[1]] } : null,
    solid(3) ? { k: "結論が出ないときは", v: D.habits[code[3]] } : null,
  ].filter(Boolean);
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
  // 同点解消の二択は「出題される総数」に含めないので、ここでも数えない
  const likert = Object.keys(ans).filter((k) => !TIE_KEY_RE.test(k)).length;
  const opsDone = D.profile.ops.filter((op) => (ops[op.id] || []).length > 0).length;
  return likert + opsDone;
}
