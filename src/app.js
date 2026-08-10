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
// アーキタイプ別の静的ページ /t/{CODE}/ — X のリンクカードに動物を出すために存在する
const ARCHETYPE_PATH = /\/t\/([PB][VX][SA][DC])\/?$/;

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

/**
 * 制作者の表示。
 *
 * 共有されて流れていった先から本人へ戻る道がこれしかないので、全画面の末尾に置く。
 * 読み終わりの位置なので邪魔にならず、結果画面でも共有ボタンのあとに必ず目に入る。
 */
function renderFooter() {
  return h("footer.ap-foot", {},
    h("p.ap-foot-credit", {},
      "企画・制作：",
      h("a.ap-foot-link", {
        href: D.AUTHOR.url,
        target: "_blank",
        rel: "noopener noreferrer",
        text: `${D.AUTHOR.name}｜${D.AUTHOR.title}　${D.AUTHOR.handle}`,
      })
    )
  );
}

/**
 * 結果画面を離れたら URL をサイトのルートへ戻す。
 * /t/{CODE}/ や #p=… を残したまま別画面へ移ると、再読み込みで結果に戻ってしまうため。
 */
function normalizeUrl() {
  if (state.screen === "result") return;
  const root = D.siteRoot();
  if (location.href !== root) history.replaceState(null, "", root);
}

function render() {
  clear(screenEl);
  normalizeUrl();
  const showResult = state.screen === "result" && (state.preview ? state.previewCode : state.result);

  if (state.screen === "quiz") screenEl.append(renderQuiz());
  else if (showResult) screenEl.append(renderResult());
  else if (state.screen === "types") screenEl.append(renderTypes());
  else screenEl.append(renderHome());

  // 結果表示のときはアーキタイプ名をタイトルに出す（/t/{CODE}/ の静的タイトルとも揃う）
  const code = state.preview ? state.previewCode : state.result && state.result.code;
  const labels = { home: "トップ", quiz: "質問", result: "結果", types: "アーキタイプ図鑑" };
  const head = showResult && D.types[code] ? D.types[code].name : labels[state.screen] || "トップ";
  document.title = `${head} — 会計人プロフィール`;
}

function boot() {
  appEl.append(renderAppbar(), h("main.ap-main", {}, screenEl), renderFooter());

  // 共有リンクからの復元。Work Style とアーキタイプのみを表示する。
  const match = (location.hash || "").match(SHARE_HASH);
  const onPath = (location.pathname || "").replace(/index\.html$/, "").match(ARCHETYPE_PATH);
  if (match && D.types[match[1]]) {
    setState({
      screen: "result",
      result: resultFromPcts(match[1], [+match[2], +match[3], +match[4], +match[5]]),
    }, { render: false });
  } else if (onPath && D.types[onPath[1]]) {
    // ハッシュのない /t/{CODE}/ は、そのアーキタイプの紹介（図鑑プレビュー）として開く
    setState({ screen: "result", preview: true, previewCode: onPath[1] }, { render: false });
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
