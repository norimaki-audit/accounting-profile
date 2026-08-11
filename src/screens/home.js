import { h, btn, scrollTop } from "../ui.js";
import * as D from "../data.js";
import {
  answeredCount, canResume as canResumeDraft, coreCount, answeredCore,
  firstIncompletePage, computeResult,
} from "../scoring.js";
import { state, setState, loadDraft, saveDraft, clearDraft } from "../state.js";

const coreAnswered = (ans) => answeredCore(ans || {}) === coreCount();

// カードの並びは出題順に合わせる。1つめが「まず答える16問」。
const FEATURES = [
  { kicker: "1 WORK STYLE", title: "仕事の進め方", body: "精密/俯瞰・検証/探索・構造/適応・深掘/協働の独自4軸。アーキタイプはここから決まります。" },
  { kicker: "2 PERSONALITY", title: "性格", body: "Big Five（公開心理尺度を参考にした独自項目）。良し悪しの判定はしません。" },
  { kicker: "3 STUDY BEHAVIOR", title: "勉強のしかた", body: "想起練習・エラー分析など、いま身についている行動をタグで。" },
  { kicker: "4 SUBJECT DNA", title: "好きな科目", body: "会計士系・税理士系・簿記から、受験経験に合わせて出題。受験していなければ飛ばします。" },
  { kicker: "5 PRACTICE DNA", title: "興味のある実務", body: "記帳・仕訳から M&A まで24領域。経験・好き・今後やりたいを区別します。" },
];

export function startQuiz() {
  setState({ screen: "quiz", ans: {}, ops: {}, page: 0, preview: false, result: null });
  saveDraft();
  scrollTop();
}

function resumeQuiz() {
  const draft = loadDraft();
  const ans = draft ? draft.ans : state.ans;
  const ops = draft ? draft.ops || {} : state.ops;
  // 保存済みの page 番号ではなく回答から復元する（出題順を変えても正しく戻る）
  setState({ screen: "quiz", ans, ops, page: firstIncompletePage(ans, ops), preview: false });
  scrollTop();
}

/**
 * 前回の結果をこの端末の下書きから作り直して表示する。
 * 結果はサーバーにもファイルにも保存しないため、閉じたあとに見返せる唯一の手段。
 */
function showLastResult(draft) {
  setState({
    screen: "result",
    ans: draft.ans,
    ops: draft.ops || {},
    result: computeResult(draft.ans, draft.ops || {}),
    preview: false,
    previewCode: null,
  });
  scrollTop();
}

export function renderHome() {
  const draft = loadDraft();
  const saved = draft ? answeredCount(draft.ans, draft.ops || {}) : 0;
  // 判定は scoring.js に置いてある（出題される総数は人によって変わるため）
  const canResume = !!draft && canResumeDraft(draft.ans, draft.ops || {});
  // コアまで答えていれば結果を再表示できる（16問そろえばアーキタイプは確定する）
  const canReplay = !!draft && coreAnswered(draft.ans);

  return h("div", { "data-screen-label": "トップ", class: "ap-home" },
    h("div.nm-mono.ap-kicker", { text: `16 ARCHETYPES · まず${coreCount()}問` }),
    h("h1.ap-hero-title", {}, "あなたの会計人としての", h("br"), "すべてを、一枚に。"),
    h("p.ap-lead", {},
      "公認会計士・税理士から、受験生・監査アシスタント・会計事務所職員・経理／経理補助まで。",
      h("strong", { text: "会計にかかわる人なら誰でも" }),
      "。資格の有無は問いません。性格・仕事の進め方・好きな科目・興味のある実務・勉強のしかたを",
      h("strong", { text: "5つの別レイヤー" }),
      "で可視化します。「何タイプか」だけでは終わらせません。"
    ),

    renderMarquee(),

    // 全体量を先に出すと重く見えるので、ここでは最初の16問だけを言う
    h("p.nm-supporting-text.ap-home-steps", {
      text: `まずは仕事の進め方の${coreCount()}問。答えるとあなたのアーキタイプ（動物）が出ます。そのあと性格などを足していくと、プロフィールが埋まっていきます。`,
    }),

    h("div.ap-home-actions", {},
      btn("button.nm-btn.nm-btn--primary.nm-btn--lg.ap-cta", { onClick: startQuiz, text: "プロフィールを作る" }),
      canResume &&
        btn("button.nm-btn.nm-btn--tertiary.ap-cta-secondary", {
          onClick: resumeQuiz,
          text: `つづきから再開（${saved}問回答済み）`,
        }),
      // コアが埋まっていれば、続きが残っていても結果は見せる。
      // 16問で終えるのが本線なので、ここを「つづき」と排他にすると、
      // 本線どおりに答えた人が翌日に自分の結果を open できなくなる
      // （「つづきから再開」は性格の1ページ目に着地し、結果へ戻る道が無い）。
      canReplay &&
        btn("button.nm-btn.nm-btn--tertiary.ap-cta-secondary", {
          onClick: () => showLastResult(draft),
          text: "前回の結果をもう一度見る",
        })
    ),

    h("div.ap-feature-grid", {},
      FEATURES.map((f, i) =>
        h("div.nm-surface.ap-feature", { class: i === FEATURES.length - 1 ? "ap-feature--wide" : null },
          h("div.nm-mono.ap-feature-kicker", { text: f.kicker }),
          h("div.ap-serif.ap-feature-title", { text: f.title }),
          h("p.nm-supporting-text", { text: f.body })
        )
      )
    ),

    renderPrivacyPanel(saved > 0),
    h("div.nm-alert.ap-disclaimer", { text: D.DISCLAIMER_HOME })
  );
}

/**
 * アーキタイプのキャラクターが右から左へ流れる帯。
 *
 * ここは「自分のはどれだろう」と思ってもらうための帯なので、押して中身が読めては
 * 面白くない。タップ導線もアーキタイプ名も出さず、画像を流すだけの装飾にしている
 * （中身を見たい人向けには、ヘッダーの「アーキタイプ図鑑」がある）。
 * 実在する画像だけを並べるため、描画は availableCharacters() の解決後に行う。
 */
function renderMarquee() {
  const track = h("div.ap-marquee-track");
  const section = h("section.ap-marquee", { "aria-hidden": "true", hidden: true },
    h("div.nm-mono.ap-marquee-kicker", { text: "16 ARCHETYPES" }),
    h("div.ap-marquee-viewport", {}, track)
  );

  D.availableCharacters().then((codes) => {
    if (!codes.length) return;
    // 同じ並びを2周ぶん敷き、-50% まで動かして途切れないループにする
    track.append(...buildTiles(codes), ...buildTiles(codes));
    track.style.setProperty("--ap-marquee-count", String(codes.length));
    section.hidden = false;
  });

  return section;
}

function buildTiles(codes) {
  return codes.map((code) => {
    const img = h("img.ap-marquee-img", { alt: "", decoding: "async" });
    img.src = D.characterThumb(code);
    return h("div.ap-marquee-tile", {}, img);
  });
}

/**
 * プライバシーの説明。
 *
 * 「サーバーに保存しない」「結果を残せるのはその場だけ」は、知らないと実害が出る
 * （結果を失う）ので必ず見える位置に 1 行で出す。仕組みの詳細は読まなくても
 * 困らないので <details> に畳み、読みたい人だけ開けるようにする。
 */
function renderPrivacyPanel(hasData) {
  return h("div.nm-surface.ap-privacy", {},
    h("div.nm-mono.ap-privacy-kicker", { text: "PRIVACY" }),
    h("p.ap-privacy-lead", {},
      h("strong", { text: "通常利用では回答・結果を外部へ送信しません。" }),
      "共有操作を行った場合に限り、アーキタイプとWork Styleの結果が共有先へ渡ります。採点はこのブラウザの中だけで行います。回答が残るのはこの端末の中だけなので、ほかの端末で見たいときや確実に残したいときは画像で保存してください。"
    ),
    h("details.ap-privacy-details", {},
      h("summary", { text: "何が端末に残り、何が共有先へ渡るか" }),
      h("ul.ap-privacy-list", {},
        h("li", { text: "回答内容（下書き）だけをこの端末に置きます。中断しても続きから再開でき、前回の結果も作り直して表示できます。" }),
        h("li", { text: "結果そのものは保管しません。画面を閉じると、保存した画像以外には残りません。" }),
        h("li", { text: "共有ボタンを押したときだけ、アーキタイプとWork Styleの4軸を含むリンク（または画像）が共有先のアプリへ渡ります。性格・科目・実務・勉強の回答は渡しません。" })
      ),
      hasData &&
        btn("button.nm-btn.nm-btn--tertiary.nm-btn--sm.ap-privacy-clear", {
          onClick: () => {
            clearDraft();
            setState({ ans: {}, ops: {}, page: 0 });
          },
          text: "この端末の回答を削除",
        })
    )
  );
}
