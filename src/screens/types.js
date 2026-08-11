import { h, btn, scrollTop } from "../ui.js";
import * as D from "../data.js";
import { axisDiff } from "../scoring.js";
import { state, setState } from "../state.js";
import { startQuiz } from "./home.js";

export function renderTypes() {
  // 自分の結果があるときだけ、各タイプとの違いを出す。
  // 共有リンクから復元した結果は他人のものなので使わない（fromAnswers で判定）。
  const mine = state.result && state.result.fromAnswers ? state.result.code : null;

  return h("div.ap-types", { "data-screen-label": "アーキタイプ図鑑" },
    h("h2.nm-page-title.ap-types-title", { text: "アーキタイプ図鑑" }),
    h("p.ap-types-lead", {},
      "Work Styleから生成されるSNS向けラベルの一覧です（心理学的タイプではありません）。あなたのプロフィールは",
      btn("button.ap-inline-link", { onClick: startQuiz, text: "診断" }),
      "で作れます。"
    ),
    mine
      ? h("p.nm-supporting-text.ap-types-mine", {
          text: `あなたは「${D.types[mine].name}」。各タイプに、4軸のうちどこが違うかを出しています。`,
        })
      : null,
    h("div.ap-types-grid", {},
      D.typeOrder.map((code) => {
        const tp = D.types[code];

        // 画像が無いアーキタイプはグラデーションのチップのままにする
        const chip = h("span.ap-type-chip", {
          style: `background:linear-gradient(120deg,${tp.c[0]},${tp.c[1]})`,
        });
        const img = h("img.ap-type-img", {
          alt: "",
          decoding: "async",
          onError: (e) => e.currentTarget.remove(),
        });
        img.src = D.characterThumb(code);
        chip.append(img);

        return btn("button.nm-surface.ap-type-card", {
          onClick: () => {
            setState({ screen: "result", preview: true, previewCode: code, previewFromPath: false });
            scrollTop();
          },
        },
          chip,
          h("span.ap-type-body", {},
            h("span.ap-serif.ap-type-name", { text: tp.name }),
            h("span.nm-badge.ap-type-animal", { text: D.animals[code] }),
            h("span.ap-type-copy", { text: tp.copy }),
            renderDiff(mine, code)
          )
        );
      })
    )
  );
}

/**
 * 自分のタイプとの違い。
 *
 * 出すのは「4軸のうちどれが違うか」だけ。近い＝相性が良い、ではないので
 * 良し悪しの言葉は使わない。同じ軸は数えられるので、違う軸だけ名前で挙げる。
 */
function renderDiff(mine, code) {
  if (!mine) return null;
  const diff = axisDiff(mine, code);
  if (!diff.length) return h("span.ap-type-diff.ap-type-diff--self", { text: "あなたのタイプ" });
  return h("span.ap-type-diff", {},
    h("span.nm-mono.ap-type-diff-n", { text: `${diff.length}軸違い` }),
    h("span", { text: diff.map((ax) => ax.name).join("・") })
  );
}
