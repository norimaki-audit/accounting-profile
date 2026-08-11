import { h, btn, scrollTop } from "../ui.js";
import * as D from "../data.js";
import { axisDiff, typeGrid } from "../scoring.js";
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
    renderGrid(mine),
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
 * 16タイプの位置関係。
 *
 * たてに 視座×推論、よこに 進め方×作業様式。並びを工夫してあるので、
 * たて・よこに隣り合うタイプは軸が1つだけ違う（端どうしもつながっている）。
 *
 * 線も矢印も距離の数値も引かない。位置に置くだけで関係が読めるので、
 * 近い遠いに良し悪しを与えずに済む。
 */
const axisLine = (dir, axes) =>
  `${dir}：${axes.map((a) => `${a.name}（${a.lName}／${a.rName}）`).join(" × ")}`;

function renderGrid(mine) {
  const g = typeGrid();
  const cells = [];

  // 列見出し（進め方×作業様式）。行見出しは各行の上に置く。
  // 左に見出し列を作ると絵が 70px まで痩せて、暗い絵の動物が判別できなくなる。
  g.cols.forEach((c) =>
    cells.push(h("div.nm-mono.ap-grid-head", {},
      h("span", { text: c[0] }), h("span", { text: c[1] })))
  );

  g.cells.forEach((row, r) => {
    cells.push(h("div.nm-mono.ap-grid-row-label", { text: g.rows[r].join("・") }));
    row.forEach((code) => {
      const tp = D.types[code];
      const isMine = mine === code;
      const img = h("img.ap-grid-img", {
        alt: "", decoding: "async", onError: (e) => e.currentTarget.remove(),
      });
      img.src = D.characterThumb(code);
      cells.push(btn("button.ap-grid-cell", {
        class: isMine ? "is-mine" : null,
        "aria-label": `${tp.name}（${D.animals[code]}）`,
        title: tp.name,
        onClick: () => {
          setState({ screen: "result", preview: true, previewCode: code, previewFromPath: false });
          scrollTop();
        },
      },
        h("span.ap-grid-art", {
          style: `background:linear-gradient(120deg,${tp.c[0]},${tp.c[1]})`,
        }, img),
        h("span.ap-grid-animal", { text: D.animals[code] }),
        isMine ? h("span.ap-grid-you", { text: "あなた" }) : null
      ));
    });
  });

  return h("section.ap-grid-wrap", {},
    h("h3.ap-serif.ap-grid-title", { text: "16タイプの位置関係" }),
    // 見出しの「精密・検証」がどの軸の極なのかは、ここで対応を書かないと伝わらない
    h("p.nm-supporting-text.ap-grid-lead", { text: axisLine("たて", g.rowAxes) }),
    h("p.nm-supporting-text.ap-grid-lead", { text: axisLine("よこ", g.colAxes) }),
    h("p.nm-supporting-text.ap-grid-lead", {
      text: "たて・よこに隣り合うタイプは、軸が1つだけ違います（左右・上下の端どうしも隣です）。",
    }),
    h("div.ap-grid", {}, cells)
  );
}

/**
 * 自分のタイプとの違い。
 *
 * 出すのは「4軸のうちどれが違うか」だけ。近い＝相性が良い、ではないので
 * 良し悪しの言葉は使わない。
 *
 * 数は出さない。「1軸違い」「4軸違い」と数えると 1→4 の段階に見え、
 * 近いほうが良いという順位として読まれる。違う軸の名前を挙げれば
 * 同じ軸は言わなくても分かるので、事実としてはこれで足りる。
 */
function renderDiff(mine, code) {
  if (!mine) return null;
  const diff = axisDiff(mine, code);
  if (!diff.length) return h("span.ap-type-diff.ap-type-diff--self", { text: "あなたのタイプ" });
  const text = diff.length === D.styleAxes.length
    ? "すべて違う"
    : `${diff.map((ax) => ax.name).join("・")}が違う`;
  return h("span.ap-type-diff", { text });
}
