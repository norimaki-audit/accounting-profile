import { h, btn, scrollTop } from "../ui.js";
import * as D from "../data.js";
import {
  answeredCount, totalCount, coreCount, optionalCount, answeredCore, computeResult,
} from "../scoring.js";

const coreAnswered = (ans) => answeredCore(ans || {}) === coreCount();
import { state, setState, loadDraft, saveDraft, clearDraft } from "../state.js";

const FEATURES = [
  { kicker: "1 PERSONALITY", title: "性格", body: "Big Five（公開心理尺度を参考にした独自項目）。良し悪しの判定はしません。" },
  { kicker: "2 WORK STYLE", title: "仕事の進め方", body: "精密/俯瞰・検証/探索・構造/適応・深掘/協働の独自4軸。アーキタイプの源泉。" },
  { kicker: "3 SUBJECT DNA", title: "好きな科目", body: "会計士系・税理士系・簿記、あなたの経験に合わせた科目で聞きます。" },
  { kicker: "4 PRACTICE DNA", title: "興味のある実務", body: "経験・好き・今後やりたいを区別。未経験は「これから」なだけ。" },
  { kicker: "5 STUDY BEHAVIOR", title: "勉強のしかた", body: "想起練習・エラー分析など、いま身についている行動をタグで。" },
];

export function startQuiz() {
  setState({ screen: "quiz", ans: {}, ops: {}, page: 0, preview: false, result: null });
  saveDraft();
  scrollTop();
}

function resumeQuiz() {
  const draft = loadDraft();
  setState({
    screen: "quiz",
    ans: draft ? draft.ans : state.ans,
    ops: draft ? draft.ops || {} : state.ops,
    page: draft ? draft.page || 0 : state.page,
    preview: false,
  });
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
  const canResume = saved > 0 && saved < totalCount();
  // コアまで答えていれば結果を再表示できる（41問そろえばアーキタイプは確定する）
  const canReplay = !!draft && coreAnswered(draft.ans);

  return h("div", { "data-screen-label": "トップ", class: "ap-home" },
    h("div.nm-mono.ap-kicker", { text: "5 LAYERS · 1 PROFILE · まず41問" }),
    h("h1.ap-hero-title", {}, "あなたの会計人としての", h("br"), "すべてを、一枚に。"),
    h("p.ap-lead", {},
      "会計士・税理士・経理・受験生のためのプロフィールメーカー。性格・仕事の進め方・好きな科目・興味のある実務・勉強のしかたを",
      h("strong", { text: "5つの別レイヤー" }),
      "で可視化します。「何タイプか」だけでは終わらせません。"
    ),

    renderMarquee(),

    h("p.nm-supporting-text.ap-home-steps", {
      text: `まず${coreCount()}問（性格・仕事の進め方）に答えるとアーキタイプが出ます。残り${optionalCount()}問は任意で、答えると科目・実務・勉強のレイヤーが加わります。`,
    }),

    h("div.ap-home-actions", {},
      btn("button.nm-btn.nm-btn--primary.nm-btn--lg.ap-cta", { onClick: startQuiz, text: "プロフィールを作る" }),
      canResume &&
        btn("button.nm-btn.nm-btn--tertiary.ap-cta-secondary", {
          onClick: resumeQuiz,
          text: `つづきから再開（${saved}問回答済み）`,
        }),
      canReplay && !canResume &&
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
      h("strong", { text: "回答も結果もサーバーに送りません。" }),
      "採点はこのブラウザの中だけで行います。結果を残せるのは結果画面を開いている間だけなので、必要なら画像で保存してください。"
    ),
    h("details.ap-privacy-details", {},
      h("summary", { text: "この端末に何が残るか" }),
      h("ul.ap-privacy-list", {},
        h("li", { text: "回答内容（下書き）だけをこの端末に置きます。中断しても続きから再開でき、前回の結果も作り直して表示できます。" }),
        h("li", { text: "結果そのものは保管しません。画面を閉じると、保存した画像以外には残りません。" })
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
