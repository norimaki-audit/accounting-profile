import { h, btn, scrollTop } from "../ui.js";
import * as D from "../data.js";
import { setState } from "../state.js";
import { startQuiz } from "./home.js";

export function renderTypes() {
  return h("div.ap-types", { "data-screen-label": "アーキタイプ図鑑" },
    h("h2.nm-page-title.ap-types-title", { text: "アーキタイプ図鑑" }),
    h("p.ap-types-lead", {},
      "Work Styleから生成されるSNS向けラベルの一覧です（心理学的タイプではありません）。あなたのプロフィールは",
      btn("button.ap-inline-link", { onClick: startQuiz, text: "診断" }),
      "で作れます。"
    ),
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
            setState({ screen: "result", preview: true, previewCode: code });
            scrollTop();
          },
        },
          chip,
          h("span.ap-type-body", {},
            h("span.ap-serif.ap-type-name", { text: tp.name }),
            h("span.nm-badge.ap-type-animal", { text: D.animals[code] }),
            h("span.ap-type-copy", { text: tp.copy })
          )
        );
      })
    )
  );
}
