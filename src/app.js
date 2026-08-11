// 会計人プロフィール — エントリポイント。
// 4 画面（トップ / 質問 / 結果 / アーキタイプ図鑑）を状態で切り替える単一ページ。
// サーバーを持たないため、すべての処理はこのブラウザ内で完結する。

import { h, btn, clear, scrollTop } from "./ui.js";
import * as D from "./data.js";
import { resultFromPcts, pages, pageApplies, firstIncompletePage } from "./scoring.js";
import { state, setState, subscribe, loadDraft, setNavigationHook } from "./state.js";
import { renderHome } from "./screens/home.js";
import { renderQuiz, cancelAutoAdvance } from "./screens/quiz.js";
import { renderResult } from "./screens/result.js";
import { renderTypes } from "./screens/types.js";

// 共有された結果。ハッシュに載せるのは、直接開いてもサーバーへ送られないため。
// 読むときだけは ?p= も受ける（アプリによってはフラグメントを落とすことがあるため）。
// こちらから ?p= を作ることはしない。
const SHARE_DATA = /[#?&]p=([PB][VX][SA][DC])\.(\d+)\.(\d+)\.(\d+)\.(\d+)/;
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
  // history.state は残す。消すと戻ったときに画面を復元できなくなる
  if (location.href !== root) history.replaceState(history.state, "", root);
}

// ---------------------------------------------------------------- 戻る操作
//
// 画面を state で切り替える作りなので、そのままでは履歴が1つも積まれない。
// スワイプバックや端末の戻るを押すと、前の画面ではなくサイトごと離れてしまう。
// 図鑑で動物を開いて一覧へ戻る、質問を1ページ戻る、といった当たり前の操作が
// できないので、画面が変わるたびにエントリを積む。
//
// pushState に URL は渡さない（第3引数なし＝URL 据え置き）。渡すと #p=… が
// 消えて、共有リンクから開いた人が戻ったときに4軸の数値を失う。積むのは状態だけ。

const NAV_KEYS = ["screen", "page", "preview", "previewCode", "previewFromPath"];
const navKey = () => JSON.stringify(NAV_KEYS.map((k) => state[k]));

let currentNav = null;
let restoring = false;   // 戻る操作での復元中は積み直さない

// 画面ごとのスクロール位置。history.state にも書くが、そちらは「進むとき」しか
// 更新できない（戻る操作で離れたエントリには、離れたあとでは書けない）。
// そのままだと戻ってから進んだときに先頭へ飛ぶので、離れる瞬間の位置をここに控える。
// scroll イベントは使わない（描画していないタブでは飛ばず、replaceState の
// 連打はブラウザに弾かれる）。画面を離れる瞬間だけ記録すれば足りる。
const scrollByNav = new Map();

/** 画面を離れる瞬間の位置を控える。popstate の時点ではまだ前の画面の位置。 */
function keepScroll() {
  if (currentNav) scrollByNav.set(currentNav, window.scrollY);
}

function pushHistory() {
  const key = navKey();
  if (key === currentNav) return;
  if (restoring) { currentNav = key; return; }
  // 離れる画面のスクロール位置を、いま居るエントリに残してから積む
  keepScroll();
  history.replaceState({ nav: currentNav, scroll: window.scrollY }, "");
  history.pushState({ nav: key, scroll: 0 }, "");
  currentNav = key;
}

/**
 * 履歴に積んだ画面が、いまの回答でもまだ成立するか。
 *
 * 積んだあとに回答を変えると、そのページが出題対象でなくなることがある。
 * 同点を解消したあとの二択ページ、「受験経験なし」に変えたあとの科目ページ、
 * 「もう一度作る」で回答を消したあとの結果画面がそれにあたる。
 * 回答を変えても navKey は動かないので、進む側のエントリはそのまま残っている。
 * 素通しすると設問ゼロの空ページや、回答ゼロの結果が出てしまう。
 */
function reachable({ screen, page, preview }) {
  if (screen === "quiz") return pageApplies(pages()[page], state.ops, state.ans);
  // 図鑑プレビューはコードだけで成立する。自分の結果は要らない
  if (screen === "result") return preview || !!state.result;
  return true;
}

function onPopState(e) {
  const saved = e.state && e.state.nav;
  if (!saved) return;   // 自分が積んだエントリでなければ触らない
  // 4問そろえた直後に戻ると、350ms 後の自動送りが戻った先で発火する
  cancelAutoAdvance();
  // 描き替える前に、離れる画面の位置を控える
  keepScroll();
  const [screen, page, preview, previewCode, previewFromPath] = JSON.parse(saved);
  restoring = true;
  // 戻すのは画面の位置だけ。回答（ans / ops）と結果はそのまま持ち越す
  if (reachable({ screen, page, preview })) {
    setState({ screen, page, preview, previewCode, previewFromPath });
  } else if (screen === "quiz") {
    // 出題対象でなくなったページは、いまの回答で行くべきページへ寄せる
    setState({ screen, page: firstIncompletePage(state.ans, state.ops), preview: false, previewCode: null });
  } else {
    // 見せる結果が無くなっていた（回答を消したあと）。トップへ返す
    setState({ screen: "home", preview: false, previewCode: null });
  }
  restoring = false;
  currentNav = navKey();

  // スクロール位置を戻す。setState の時点で DOM は組み直されているので同期で戻せる。
  // requestAnimationFrame は使わない（タブが表に出ていないと発火せず、戻したはずの
  // 位置が先頭のままになる）。画像の読み込みで高さが伸びる場合に備えて一度だけ追う。
  // この場で控えた位置を優先する。history.state 側は「進むとき」しか更新
  // できないので、戻ってから進んだ画面では 0 のまま残っている。
  const y = scrollByNav.has(saved) ? scrollByNav.get(saved) : (e.state.scroll || 0);
  const back = () => { if (window.scrollY !== y) window.scrollTo(0, y); };
  back();
  setTimeout(back, 0);
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
  const match = `${location.hash || ""}${location.search || ""}`.match(SHARE_DATA);
  const onPath = (location.pathname || "").replace(/index\.html$/, "").match(ARCHETYPE_PATH);
  if (match && D.types[match[1]]) {
    setState({
      screen: "result",
      result: resultFromPcts(match[1], [+match[2], +match[3], +match[4], +match[5]]),
    }, { render: false });
  } else if (onPath && D.types[onPath[1]]) {
    // 数値の付いていない /t/{CODE}/ は、そのアーキタイプの紹介ページとして開く。
    // 図鑑から開いたプレビューと同じ画面だが、ここへ来た人は共有リンクをたどって
    // いる可能性がある。数値が無いのを「そういう結果」と読まれないよう、
    // 紹介ページであることを別の文で伝える。
    setState({
      screen: "result", preview: true, previewCode: onPath[1], previewFromPath: true,
    }, { render: false });
  } else {
    // 回答途中の下書きがあれば読み込む（結果ではなく下書きのみ）
    const draft = loadDraft();
    if (draft) {
      setState({ ans: draft.ans, ops: draft.ops || {}, page: draft.page || 0 }, { render: false });
    }
  }

  // 履歴はここから積みはじめる（上の初期化ぶんは積まない）
  history.scrollRestoration = "manual";
  currentNav = navKey();
  history.replaceState({ nav: currentNav, scroll: 0 }, "");
  setNavigationHook(pushHistory);
  window.addEventListener("popstate", onPopState);

  subscribe(render);
  render();
}

boot();
