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
function renderGrid(mine) {
  const g = typeGrid();
  const cells = [];

  // 左上の角（2行ぶん）＝ たての軸名。その右の帯 ＝ よこの軸名。
  // 軸名を表の中に入れておかないと、見出しの「精密・検証」が何の値なのか分からない。
  // 「たて」「よこ」を付けないと、角のラベルが行の軸名だと伝わらない
  cells.push(h("div.ap-grid-corner", {},
    h("span.ap-grid-dir", { text: "たて" }),
    g.rowAxes.map((a, i) => [
      i ? h("span.ap-grid-x", { text: "×" }) : null,
      h("span", { text: a.name }),
    ])
  ));
  cells.push(h("div.ap-grid-banner", {},
    h("span.ap-grid-dir", { text: "よこ" }),
    h("span", { text: g.colAxes.map((a) => a.name).join(" × ") })
  ));

  // 列見出し（極の組）。セルと同じ列に、同じ幅で並べる。
  // 2語の間に × を挟む。並べるだけだと1つの複合語に見える。
  g.cols.forEach((c) =>
    cells.push(h("div.ap-grid-head", {},
      h("span", { text: c[0] }), h("span.ap-grid-x", { text: "×" }), h("span", { text: c[1] })))
  );

  g.cells.forEach((row, r) => {
    // 行見出し（極の組）。行の左に置き、罫線で表の見出しとして見せる
    cells.push(h("div.ap-grid-head.ap-grid-head--row", {},
      h("span", { text: g.rows[r][0] }),
      h("span.ap-grid-x", { text: "×" }),
      h("span", { text: g.rows[r][1] })));

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
        title: `${tp.name}（${D.animals[code]}）`,
        onClick: () => {
          setState({ screen: "result", preview: true, previewCode: code, previewFromPath: false });
          scrollTop();
        },
      },
        h("span.ap-grid-art", {
          style: `background:linear-gradient(120deg,${tp.c[0]},${tp.c[1]})`,
        }, img),
        // 絵だけだと暗い絵の動物が判別できない。名前を添えて、絵は雰囲気に回す
        h("span.ap-grid-name", { text: tp.name }),
        isMine ? h("span.ap-grid-you", { text: "あなた" }) : null
      ));
    });
  });

  return h("section.ap-grid-wrap", {},
    h("h3.ap-serif.ap-grid-title", { text: "16タイプの位置関係" }),
    h("div.ap-grid", {}, cells),
    // 表の下に置く。上に置くと4行目が画面から溢れる
    h("p.nm-supporting-text.ap-grid-note", {
      text: "たて・よこに隣り合うタイプは、軸が1つだけ違います（左右・上下の端どうしも隣です）。",
    })
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
