// 会計人プロフィール — エントリポイント。
// 4 画面（トップ / 質問 / 結果 / アーキタイプ図鑑）を状態で切り替える単一ページ。
// サーバーを持たないため、すべての処理はこのブラウザ内で完結する。

import { h, btn, clear, scrollTop } from "./ui.js";
import * as D from "./data.js";
import { resultFromPcts } from "./scoring.js";
import { state, setState, subscribe, loadDraft } from "./state.js";
import { renderHome } from "./screens/home.js";
import { renderQuiz } from "./screens/quiz.js";
import { renderResult } from "./screens/result.js";
import { renderTypes } from "./screens/types.js";

const SHARE_HASH = /#p=([PB][VX][SA][DC])\.(\d+)\.(\d+)\.(\d+)\.(\d+)/;

const appEl = document.getElementById("app");
const screenEl = h("div.ap-screen");

function renderAppbar() {
  return h("header.nm-appbar.ap-appbar", {},
    btn("button.nm-appbar__brand.ap-serif.ap-brand", {
      onClick: () => { setState({ screen: "home", preview: false }); scrollTop(); },
    },
      h("span.ap-brand-mark"),
      "会計人プロフィール"
    ),
    h("span.nm-mono.ap-brand-kicker", { text: "Accounting Profile" }),
    h("div.nm-appbar__actions", {},
      btn("button.nm-btn.nm-btn--sm.nm-btn--secondary", {
        text: "アーキタイプ図鑑",
        onClick: () => { setState({ screen: "types" }); scrollTop(); },
      })
    )
  );
}

function render() {
  clear(screenEl);
  const showResult = state.screen === "result" && (state.preview ? state.previewCode : state.result);

  if (state.screen === "quiz") screenEl.append(renderQuiz());
  else if (showResult) screenEl.append(renderResult());
  else if (state.screen === "types") screenEl.append(renderTypes());
  else screenEl.append(renderHome());

  const labels = { home: "トップ", quiz: "質問", result: "結果", types: "アーキタイプ図鑑" };
  document.title = `${labels[state.screen] || "トップ"} — 会計人プロフィール`;
}

function boot() {
  appEl.append(renderAppbar(), h("main.ap-main", {}, screenEl));

  // 共有リンクからの復元。Work Style とアーキタイプのみを表示する。
  const match = (location.hash || "").match(SHARE_HASH);
  if (match && D.types[match[1]]) {
    setState({
      screen: "result",
      result: resultFromPcts(match[1], [+match[2], +match[3], +match[4], +match[5]]),
    }, { render: false });
  } else {
    // 回答途中の下書きがあれば読み込む（結果ではなく下書きのみ）
    const draft = loadDraft();
    if (draft) {
      setState({ ans: draft.ans, ops: draft.ops || {}, page: draft.page || 0 }, { render: false });
    }
  }

  subscribe(render);
  render();
}

boot();
