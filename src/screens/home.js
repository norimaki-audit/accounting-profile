import { h, btn, scrollTop } from "../ui.js";
import * as D from "../data.js";
import { answeredCount, totalCount, computeResult } from "../scoring.js";
import { state, setState, loadDraft, saveDraft, clearDraft } from "../state.js";
import { parseSavedFile } from "../export.js";

const FEATURES = [
  { kicker: "1 PERSONALITY", title: "性格", body: "Big Five（公開心理尺度を参考にした独自項目）。良し悪しの判定はしません。" },
  { kicker: "2 WORK STYLE", title: "仕事の進め方", body: "精密/俯瞰・検証/探索・構造/適応・深掘/協働の独自4軸。アーキタイプの源泉。" },
  { kicker: "3 SUBJECT DNA", title: "好きな科目", body: "会計士系・税理士系・簿記、あなたの経験に合わせた科目で聞きます。" },
  { kicker: "4 PRACTICE DNA", title: "興味のある実務", body: "経験・好き・今後やりたいを区別。未経験は「これから」なだけ。" },
  { kicker: "5 STUDY BEHAVIOR", title: "勉強のしかた", body: "想起練習・エラー分析など実際の行動を連続スコアで。" },
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

export function renderHome() {
  const draft = loadDraft();
  const saved = draft ? answeredCount(draft.ans, draft.ops || {}) : 0;
  const canResume = saved > 0 && saved < totalCount();

  return h("div", { "data-screen-label": "トップ", class: "ap-home" },
    h("div.nm-mono.ap-kicker", { text: "5 LAYERS · 1 PROFILE · 約5〜8分" }),
    h("h1.ap-hero-title", {}, "あなたの会計人としての", h("br"), "すべてを、一枚に。"),
    h("p.ap-lead", {},
      "会計士・税理士・経理・受験生のためのプロフィールメーカー。性格・仕事の進め方・好きな科目・興味のある実務・勉強のしかたを",
      h("strong", { text: "5つの別レイヤー" }),
      "で可視化します。「何タイプか」だけでは終わらせません。"
    ),

    h("div.ap-home-actions", {},
      btn("button.nm-btn.nm-btn--primary.nm-btn--lg.ap-cta", { onClick: startQuiz, text: "プロフィールを作る" }),
      canResume &&
        btn("button.nm-btn.nm-btn--tertiary.ap-cta-secondary", {
          onClick: resumeQuiz,
          text: `つづきから再開（${saved}問回答済み）`,
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

    renderPrivacyPanel(canResume),
    h("div.nm-alert.ap-disclaimer", { text: D.DISCLAIMER_HOME })
  );
}

/**
 * 「結果はサーバーに保存されない」ことと、その帰結（結果を残すにはその場での
 * ダウンロードが必要なこと）を、回答を始める前に明示する。
 */
function renderPrivacyPanel(canResume) {
  const fileInput = h("input", {
    type: "file",
    accept: "application/json,.json",
    class: "nm-sr-only",
    id: "ap-restore-file",
    onChange: onRestoreFile,
  });
  const message = h("p.nm-supporting-text.ap-restore-msg", { hidden: true });
  fileInput._message = message;

  return h("div.nm-surface.ap-privacy", {},
    h("div.nm-mono.ap-privacy-kicker", { text: "PRIVACY" }),
    h("div.ap-serif.ap-privacy-title", { text: "回答と結果は、サーバーに保存されません" }),
    h("ul.ap-privacy-list", {},
      h("li", { text: "採点も結果表示も、すべてお使いのブラウザの中だけで行います。回答内容が送信されることはありません。" }),
      h("li", { text: "保存するのは「回答途中の下書き」だけです。中断しても最初から答え直さずに済むよう、この端末内にのみ一時的に置いています。" }),
      h("li", {},
        h("strong", { text: "結果を手元に残せるのは、回答を終えた直後の結果画面を開いている間だけです。" }),
        "画面を閉じると同じ結果は取り出せません。結果画面のダウンロードから、画像またはデータとして保存してください。"
      )
    ),
    h("div.ap-privacy-actions", {},
      h("label.nm-btn.nm-btn--secondary.nm-btn--sm", { for: "ap-restore-file", text: "保存したデータを読み込む" }),
      fileInput,
      canResume &&
        btn("button.nm-btn.nm-btn--tertiary.nm-btn--sm", {
          onClick: () => {
            clearDraft();
            setState({ ans: {}, ops: {}, page: 0 });
          },
          text: "この端末の下書きを削除",
        })
    ),
    message
  );
}

function onRestoreFile(event) {
  const input = event.currentTarget;
  const file = input.files && input.files[0];
  if (!file) return;
  const message = input._message;

  const fail = (text) => {
    message.textContent = text;
    message.classList.add("ap-restore-msg--error");
    message.hidden = false;
    input.value = "";
  };

  const reader = new FileReader();
  reader.onerror = () => fail("ファイルを読み込めませんでした。");
  reader.onload = () => {
    try {
      const { answers, operations } = parseSavedFile(String(reader.result));
      const result = computeResult(answers, operations);
      setState({
        ans: answers,
        ops: operations,
        result,
        screen: "result",
        preview: false,
        previewCode: null,
      });
      history.replaceState(null, "", location.pathname + location.search);
      scrollTop();
    } catch (err) {
      fail(err instanceof Error ? err.message : "ファイルを読み込めませんでした。");
    }
  };
  reader.readAsText(file);
}
