// アプリ状態と「中断した回答の一時保存」。
//
// プライバシー設計:
//   通常利用では回答・結果を外部へ送信しない。計算はすべてブラウザ内で行う。
//   localStorage には「回答途中の下書き」だけを置く。これは中断したユーザーが
//   最初から回答し直さずに済むようにするための一時保存であり、結果の保管庫ではない。
//   共有リンクのハッシュ（#p=…）はフラグメントなので、その URL を直接開いても
//   サーバーへは送られない。ただし共有操作をしたときは、そのリンク（アーキタイプと
//   Work Style の4軸を含む）や画像が共有先のアプリへ渡る。

const DRAFT_KEY = "kprofile.v1";

const listeners = new Set();

export const state = {
  screen: "home",     // "home" | "quiz" | "result" | "types"
  page: 0,            // 0..19（0-12 Likert 13ページ / 13-19 DNA操作 7ページ）
  ans: {},            // { [likertIndex]: -2|-1|0|1|2|"NA" }
  ops: {},            // { S0|S1|S2|S3|P1|P2|P3: string[] } 選択順を保持（P3 は順位）
  result: null,
  preview: false,     // 図鑑からのプレビュー表示か
  previewCode: null,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 状態を更新して再描画を要求する。render:false なら購読者に通知しない。 */
export function setState(patch, { render = true } = {}) {
  Object.assign(state, patch);
  if (render) listeners.forEach((fn) => fn());
}

// ---- 一時保存（下書き）----

export function saveDraft() {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ans: state.ans, ops: state.ops, page: state.page })
    );
  } catch {
    // プライベートモード等で保存できない場合も動作は継続する
  }
}

export function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (saved && saved.ans) return saved;
  } catch {
    /* 壊れた下書きは無視する */
  }
  return null;
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* noop */
  }
}

export function hasDraft() {
  return !!loadDraft();
}
