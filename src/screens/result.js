import { h, btn, prefersReducedMotion, scrollTop } from "../ui.js";
import * as D from "../data.js";
import {
  evidence, studyGroups, studyOn, studyLabel, habitLines,
  missingLayers, pages, corePageCount,
} from "../scoring.js";
import { state, setState, clearDraft } from "../state.js";
import { downloadSheet, downloadJson } from "../export.js";

const anim = (name, delay) =>
  prefersReducedMotion() ? null : `animation:${name} var(--ap-anim-${name}) ${delay}ms both`;

export function renderResult() {
  const res = state.result;
  const code = state.preview ? state.previewCode : res && res.code;
  const tp = D.types[code];
  if (!tp) return h("div");

  // 個人スコアを出せるのは「自分の回答から確定した結果」を表示しているときだけ。
  // 図鑑プレビューと共有リンク復元では Work Style とアーキタイプのみを見せる。
  const personal = !state.preview && res && res.fromAnswers ? res : null;
  const axes = !state.preview && res
    ? res.axes
    : D.styleAxes.map((ax, i) => ({ ax, letter: code[i], tie: false, pct: null }));

  const sections = [];
  const push = (node) => { if (node) sections.push(node); };

  push(renderVisual(tp, code));
  push(renderWorkStyle(axes));
  push(renderPersonality(personal));
  push(renderSubject(personal));
  push(renderPractice(personal));
  push(renderStudy(personal));
  push(renderHabits(personal, code));
  push(renderMap(axes, personal, code, tp));
  push(renderDescription(tp));

  sections.forEach((node, i) => {
    const style = anim("tmUp", 250 * (i + 1));
    if (style) node.setAttribute("style", `${node.getAttribute("style") || ""};${style}`);
  });

  const missing = missingLayers(personal);

  return h("div.ap-result", { "data-screen-label": "結果画面" },
    renderHeader(tp, res, code),
    personal ? renderContinuePanel(missing) : null,
    personal ? renderDownloadPanel(personal, code, missing) : null,
    sections,
    personal ? renderContinuePanel(missing) : null,
    personal ? renderDownloadReminder(personal, code) : null,
    h("div.nm-alert.ap-disclaimer", { text: D.DISCLAIMER_RESULT })
  );
}

/**
 * コアの 41 問だけで結果を見た人に、残りのレイヤーへの導線を出す。
 * 「途中で止めた」ではなく「ここから先は任意」と読めるようにする。
 */
function renderContinuePanel(missing) {
  if (!missing.length) return null;
  const remaining = missing.reduce((n, m) => n + m.n, 0);

  return h("div.nm-surface.ap-continue", {},
    h("div.nm-mono.ap-continue-kicker", { text: "OPTIONAL" }),
    h("div.ap-serif.ap-continue-title", { text: `あと${remaining}問で、残り${missing.length}レイヤー` }),
    h("p.nm-supporting-text", {
      text: "アーキタイプはここまでで確定しています。続けると次のレイヤーが結果に加わります。回答済みの内容はそのまま残ります。",
    }),
    h("ul.ap-continue-list", {},
      missing.map((m) =>
        h("li", {},
          h("span.nm-mono.ap-continue-layer", { text: m.name }),
          h("span", { text: `${m.jp}（${m.n}問）` })
        )
      )
    ),
    btn("button.nm-btn.nm-btn--primary.nm-btn--lg", {
      text: `続きを答える（${remaining}問）`,
      onClick: () => {
        setState({ screen: "quiz", page: firstIncompleteOptionalPage(), preview: false, previewCode: null });
        scrollTop();
      },
    })
  );
}

/** 任意パートのうち、まだ埋まっていない最初のページ。途中まで答えた人を続きから戻す。 */
function firstIncompleteOptionalPage() {
  const all = pages();
  for (let i = corePageCount(); i < all.length; i++) {
    const p = all[i];
    const done = p.kind === "op"
      ? (state.ops[p.op.id] || []).length > 0
      : p.indices.every((j) => state.ans[j] != null);
    if (!done) return i;
  }
  return corePageCount();
}

// ---------------------------------------------------------------- ヘッダー

function renderHeader(tp, res, code) {
  // 共有リンクからの復元は「自分の結果」ではないので、その旨と復元範囲を明示する
  const shared = !state.preview && res && !res.fromAnswers;
  const kicker = state.preview
    ? "ARCHETYPE PREVIEW"
    : shared
      ? "共有された会計人プロフィール"
      : "あなたの会計人プロフィール";

  const copyBtn = btn("button.nm-btn.nm-btn--secondary.nm-btn--lg", {
    text: "結果リンクをコピー",
    onClick: (e) => {
      const target = e.currentTarget;
      navigator.clipboard?.writeText(shareUrl(res, code)).catch(() => {});
      target.textContent = "コピーしました ✓";
      setTimeout(() => { target.textContent = "結果リンクをコピー"; }, 1600);
    },
  });

  return h("div.ap-result-head", {},
    h("div.nm-mono.ap-result-kicker", { style: anim("tmPop", 0), text: kicker }),
    h("h2.ap-result-name", { style: anim("tmPop", 130), text: tp.name }),
    h("p.ap-serif.ap-result-copy", { style: anim("tmPop", 260), text: `「${tp.copy}」` }),
    h("p.nm-supporting-text.ap-result-note", {
      text: "アーキタイプは仕事の進め方（Work Style）から生成するSNS向けのラベルです。心理学的なタイプ判定ではありません。",
    }),
    state.preview
      ? h("p.ap-preview-note", { text: "※ 図鑑のプレビュー表示です（あなたの結果ではありません）" })
      : null,
    shared
      ? h("p.ap-preview-note", {
          text: "※ 共有リンクからの表示です。リンクに含まれるのは Work Style とアーキタイプだけで、性格・科目・実務・勉強の各レイヤーは共有されません。",
        })
      : null,
    h("div.ap-result-actions", {},
      btn("button.nm-btn.nm-btn--primary.nm-btn--lg", {
        text: "Xで結果をシェア",
        onClick: () => shareToX(res, code, tp),
      }),
      copyBtn,
      btn("button.nm-btn.nm-btn--tertiary", {
        text: state.preview || shared ? "自分のプロフィールを作る" : "もう一度作る",
        onClick: retake,
      })
    )
  );
}

/**
 * 共有 URL はアーキタイプ別の静的ページ（/t/{CODE}/）を指す。
 * このパスにだけ そのアーキタイプの og:image があり、X のリンクカードに動物が出る。
 * Work Style の数値はこれまでどおりハッシュに載せる（サーバーへは送信されない）。
 */
function shareUrl(res, code) {
  const page = `${D.siteRoot()}t/${code}/`;
  return res && !state.preview && res.fromAnswers
    ? `${page}#p=${res.code}.${res.axes.map((a) => a.pct).join(".")}`
    : page;
}

/**
 * 共有本文はスマホのタイムラインで折りたたまれない長さに収める。
 * 全レイヤーを並べると 9 行を超えて画面の半分を占めてしまうため、
 * アーキタイプ名・動物・キャッチコピーだけに絞る（本文3行 + タグ + URL）。
 * 残りのレイヤーはリンク先の結果画面で見てもらう。
 */
function shareToX(res, code, tp) {
  const animal = D.animals[code];
  const text = [
    "ACCOUNTING PROFILE",
    animal ? `${tp.name}（${animal}）` : tp.name,
    `「${tp.copy}」`,
    "#会計人プロフィール",
  ].join("\n");

  window.open(
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl(res, code))}`,
    "_blank",
    "noopener"
  );
}

function retake() {
  clearDraft();
  // URL のリセットは app.js の normalizeUrl が画面遷移時に行う
  setState({ screen: "quiz", ans: {}, ops: {}, page: 0, result: null, preview: false, previewCode: null });
  scrollTop();
}

// ---------------------------------------------------------------- ダウンロード

/**
 * 結果はサーバーに保存しないため、手元に残す唯一の手段がこのダウンロードになる。
 * その事実と、いま以外は取り出せないことを明記する。
 */
function renderDownloadPanel(result, code, missing) {
  const status = h("p.nm-supporting-text.ap-download-status", { hidden: true });
  const layers = 5 - missing.length;

  return h("div.nm-alert.nm-alert--warning.ap-download", {},
    h("strong.nm-alert__title", { text: "この結果はサーバーに保存されません" }),
    h("p", {},
      "結果を手元に残せるのは、",
      h("strong", { text: "回答直後のいま、この結果画面と詳細を開いている間だけ" }),
      "です。画面を閉じる・再読み込みする・「もう一度作る」を押すと、同じ結果は取り出せなくなります。必要な方はこの場でダウンロードしてください。"
    ),
    h("div.ap-download-actions", {},
      btn("button.nm-btn.nm-btn--primary", {
        text: "画像で保存（PNG）",
        onClick: (e) => runDownload(e.currentTarget, status, "画像を保存しました。", () =>
          downloadSheet(result, code)
        ),
      }),
      btn("button.nm-btn.nm-btn--secondary", {
        text: "データで保存（JSON）",
        onClick: (e) => runDownload(e.currentTarget, status, "データを保存しました。トップ画面から読み込むと再表示できます。", async () =>
          downloadJson(result, code, state.ans, state.ops)
        ),
      })
    ),
    h("p.nm-supporting-text.ap-download-hint", {
      text: missing.length
        ? `画像はいま表示している${layers}レイヤーぶんのプロフィールシートです（残り${missing.length}レイヤーは未回答として記載されます）。続きを答えてから保存すると5レイヤーそろいます。データ（JSON）は回答の生データを含み、トップ画面から読み込むと同じ結果を再表示できます。どちらもお使いのブラウザ内で生成し、送信は行いません。`
        : "画像は5レイヤーすべてを1枚にまとめたプロフィールシートです。データ（JSON）は回答の生データを含み、トップ画面から読み込むと同じ結果を再表示できます。どちらもお使いのブラウザ内で生成し、送信は行いません。",
    }),
    status
  );
}

async function runDownload(button, status, successText, task) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "作成中…";
  status.hidden = true;
  status.classList.remove("ap-download-status--error");
  try {
    await task();
    status.textContent = successText;
    status.hidden = false;
  } catch (err) {
    status.textContent = `保存できませんでした: ${err instanceof Error ? err.message : String(err)}`;
    status.classList.add("ap-download-status--error");
    status.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

/** 詳細を読み終えた位置でもう一度ダウンロードに触れられるようにする。 */
function renderDownloadReminder(result, code) {
  const status = h("p.nm-supporting-text.ap-download-status", { hidden: true });
  return h("div.nm-surface.ap-download-reminder", {},
    h("div.ap-serif.ap-download-reminder-title", { text: "結果を残す場合は、この画面を離れる前に" }),
    h("p.nm-supporting-text", {
      text: "サーバーには保存していないため、このページを閉じると同じ結果は再取得できません。",
    }),
    h("div.ap-download-actions", {},
      btn("button.nm-btn.nm-btn--primary.nm-btn--sm", {
        text: "画像で保存（PNG）",
        onClick: (e) => runDownload(e.currentTarget, status, "画像を保存しました。", () =>
          downloadSheet(result, code)
        ),
      }),
      btn("button.nm-btn.nm-btn--secondary.nm-btn--sm", {
        text: "データで保存（JSON）",
        onClick: (e) => runDownload(e.currentTarget, status, "データを保存しました。", async () =>
          downloadJson(result, code, state.ans, state.ops)
        ),
      })
    ),
    status
  );
}

// ---------------------------------------------------------------- 各レイヤー

/**
 * 象徴ビジュアル。アーキタイプごとのキャラクター画像を主役に置き、
 * 画像が用意されていないコードではグラデーションのみの表示に自動で戻す。
 */
function renderVisual(tp, code) {
  const shape = (size, x, y, opacity, rot) =>
    h("div.ap-visual-shape", {
      style: `width:${size}px;height:${size}px;left:${x}%;top:${y}%;border-color:rgba(255,255,255,${opacity});transform:rotate(${rot}deg)`,
    });

  const animal = D.animals[code];
  const band = h("div.ap-visual", {
    style: `background:linear-gradient(135deg,${tp.c[0]},${tp.c[1]})`,
  },
    shape(84, 64, 16, 0.7, 12),
    shape(130, 10, 36, 0.35, -6),
    shape(52, 44, 60, 0.5, 30)
  );

  const animalBadge = animal
    ? h("span.nm-badge.nm-badge--brand.ap-visual-animal", { text: animal })
    : null;

  const caption = h("div.ap-visual-caption", {},
    h("div", {},
      h("div.nm-mono.ap-visual-brand", { text: "Accounting Profile" }),
      h("div.ap-serif.ap-visual-name", { text: tp.name })
    ),
    animalBadge
  );

  // ハンドラを先に付けてから src を与える（読み込み結果を取りこぼさないため）
  const character = h("img.ap-visual-char", {
    alt: `${tp.name}のキャラクター（${animal}）`,
    decoding: "async",
    style: prefersReducedMotion() ? null : "animation:tmPop var(--ap-anim-tmPop) 120ms both",
    onLoad: () => band.classList.add("is-loaded"),
    onError: (e) => {
      // 画像が未用意のアーキタイプはグラデーションのみで表示する
      e.currentTarget.remove();
      band.classList.add("ap-visual--fallback");
      animalBadge?.remove();
    },
  });
  character.src = D.characterImage(code);
  band.append(character);

  return h("div.nm-surface.ap-visual-card", {}, band, caption);
}

function card(title, note, ...children) {
  return h("div.nm-surface.ap-card", {},
    h("div.nm-section-title.ap-card-title", {},
      title,
      note ? h("span.nm-supporting-text.ap-card-note", { text: note }) : null
    ),
    ...children
  );
}

function renderWorkStyle(axes) {
  return card("Work Style", "— 会計実務の進め方（独自4軸・優劣ではありません）",
    h("div.ap-axis-list", {},
      axes.map((a) => {
        const winLeft = a.letter === a.ax.L;
        const pct = a.pct;
        const fill = pct == null
          ? null
          : h("div.ap-axis-fill", {
              style: winLeft
                ? `right:50%;left:${100 - pct}%`
                : `left:50%;right:${100 - pct}%`,
            });
        const marker = pct == null
          ? null
          : h("div.ap-axis-marker", { style: `left:${winLeft ? 100 - pct : pct}%` });

        return h("div.ap-axis", {},
          h("div.ap-axis-head", {},
            h("span.nm-mono", {
              class: winLeft ? "ap-axis-win" : "ap-axis-lose",
              text: a.ax.lName + (winLeft && pct != null ? ` ${pct}` : ""),
            }),
            h("span.nm-mono.ap-axis-name", { text: a.ax.name }),
            h("span.nm-mono", {
              class: !winLeft ? "ap-axis-win" : "ap-axis-lose",
              text: (!winLeft && pct != null ? `${pct} ` : "") + a.ax.rName,
            })
          ),
          h("div.ap-axis-bar", {}, fill, h("div.ap-axis-center"), marker),
          a.tie ? h("p.nm-supporting-text.ap-axis-tie", { text: "この軸はほぼ中間（両極型）です。" }) : null
        );
      })
    )
  );
}

function renderPersonality(res) {
  if (!res || !res.bf) return null;
  const keys = D.traitOrder.filter((tr) => res.bf[tr] != null);
  if (!keys.length) return null;

  return card("Personality", "— 心理学研究を参考にした独自プロフィール",
    h("p.nm-supporting-text.ap-card-lead", {
      text: "高い・低いに良し悪しはありません。どちらの側にも持ち味があります。",
    }),
    h("div.ap-trait-list", {},
      keys.map((tr) => {
        const t = D.traits[tr];
        return h("div.ap-trait", {},
          h("div.ap-trait-head", {},
            h("span", {}, t.jp, " ", h("span.nm-mono.ap-trait-en", { text: t.name })),
            h("span.nm-number.ap-trait-score", { text: String(res.bf[tr]) })
          ),
          h("div.ap-bar.ap-bar--md", {}, h("div.ap-bar-fill", { style: `width:${res.bf[tr]}%` })),
          h("div.ap-trait-poles", {},
            h("span", { text: t.lo }),
            h("span", { text: t.hi })
          )
        );
      })
    )
  );
}

// DNA 2 レイヤーは選択操作の集計なので数値では出さず、「なぜ挙がったか」をタグで見せる。
// 強い理由（面白い / コア / フロンティア）だけ色をつけ、残りは無地のタグにする。
const TAG_CLASS = {
  "面白い": "nm-badge--brand",
  "コア": "nm-badge--brand",
  "フロンティア": "nm-badge--warning",
};

function dnaList(rows) {
  return h("div.ap-dna-list", {},
    rows.map((d) =>
      h("div.ap-dna-item", {},
        h("span.ap-dna-name", { text: d.label }),
        h("span.ap-dna-tags", {},
          d.tags.map((t) =>
            h("span.nm-badge.ap-dna-tag", { class: TAG_CLASS[t] || null, text: t })
          )
        )
      )
    )
  );
}

function renderSubject(res) {
  if (!res || !res.subjectTop || !res.subjectTop.length) return null;
  return card("Subject DNA", "— 好きな科目（性格スコアには影響しません）",
    h("p.nm-supporting-text.ap-card-lead", {
      text: "点数ではなく、その科目を選んだ理由をそのまま並べています。",
    }),
    dnaList(res.subjectTop)
  );
}

function renderPractice(res) {
  if (!res || !res.practiceTop || !res.practiceTop.length) return null;
  return card("Practice DNA", "— 興味のある実務領域",
    h("p.nm-supporting-text.ap-card-lead", {
      text: "経験がない領域は「これから」なだけです。コア=好き×やりたい、フロンティア=未経験×やりたい。",
    }),
    dnaList(res.practiceTop)
  );
}

/**
 * Study Behavior は各指標 1 問しかない。0–100 のバーで出すと「当てはまらない」と
 * 答えただけの指標が空バーとして並び、測れていないように見えてしまう。
 * 1 問ぶんの情報量に見合うタグ表示にし、「当てはまらない」側も欠落ではなく
 * 「これから試せる」として置く。
 */
function renderStudy(res) {
  if (!res || !res.study) return null;
  const groups = studyGroups(res);
  if (!groups.length) return null;
  const label = studyLabel(res);

  return h("div.nm-surface.ap-card", {},
    h("div.nm-section-title.ap-card-title", {},
      "Study Behavior",
      label ? h("span.nm-badge.nm-badge--brand.ap-study-label", { text: label }) : null
    ),
    h("p.nm-supporting-text.ap-card-lead", {
      text: "各指標1問の回答をそのまま並べたものです。点数でも、固定的な「学習タイプ」の判定でもありません。",
    }),
    h("div.ap-study-groups", {},
      groups.map((g) =>
        h("div.ap-study-group", { "data-tier": g.key },
          h("div.ap-study-group-head", {},
            h("span.nm-mono.ap-study-group-title", { text: g.title }),
            h("span.nm-supporting-text.ap-study-group-note", { text: g.note })
          ),
          h("div.ap-study-tags", {},
            g.names.map((name) => h("span.ap-study-tag", { text: name }))
          )
        )
      )
    )
  );
}

function renderHabits(res, code) {
  const lines = habitLines(res || { study: null, practiceTop: null }, code);
  if (!lines.length) return null;
  return card("日々の傾向", "",
    h("div.ap-habits", {},
      lines.map((line) =>
        h("div.ap-habit", {},
          h("span.nm-mono.ap-habit-key", { text: line.k }),
          h("span", { text: line.v })
        )
      )
    )
  );
}

function renderMap(axes, res, code, tp) {
  const ev = res ? evidence(res, state.ans) : axes.map(() => []);
  const reduce = prefersReducedMotion();
  const line = (i) => h("div.ap-map-line", {
    style: reduce ? null : `animation:tmGrow var(--ap-anim-tmGrow) ${200 + i * 250}ms both`,
  });

  const satellites = [];
  if (res?.subjectTop?.length) {
    satellites.push({ k: "SUBJECT DNA", v: res.subjectTop.map((d) => d.label).join(" / ") });
  }
  if (res?.practiceTop?.length) {
    satellites.push({ k: "PRACTICE DNA", v: res.practiceTop.slice(0, 3).map((d) => d.label).join(" / ") });
  }
  const on = studyOn(res);
  if (on.length) satellites.push({ k: "STUDY", v: on.join(" / ") });

  return card(
    "Profile Map",
    state.preview
      ? "— このアーキタイプの人が通りやすい道すじです"
      : "— 回答 → 特徴的な行動 → Work Style → アーキタイプ + プロフィール全体",
    h("div.ap-map", {},
      axes.map((a, i) => {
        const winLeft = a.letter === a.ax.L;
        const cards = ev[i] || [];
        return h("div.ap-map-block", {
          style: reduce ? null : `animation:tmUp var(--ap-anim-tmUp) ${100 + i * 250}ms both`,
        },
          cards.length
            ? [
                h("div.ap-map-cards", {},
                  cards.map((c) =>
                    h("div.ap-map-card", {},
                      h("div.ap-map-quote", { text: `「${c.q}」` }),
                      h("div.nm-mono.ap-map-answer", { text: `→ ${c.ans}` })
                    )
                  )
                ),
                line(i),
              ]
            : null,
          h("div.ap-map-node", {},
            h("div.ap-serif.ap-map-pole", { text: winLeft ? a.ax.lName : a.ax.rName }),
            h("div.ap-map-node-body", {},
              h("div.ap-map-node-name", { text: winLeft ? a.ax.lNode : a.ax.rNode }),
              h("div.ap-map-node-desc", { text: winLeft ? a.ax.lDesc : a.ax.rDesc })
            ),
            h("div.nm-mono.ap-map-pct", { text: a.pct != null ? `${a.pct}%` : "" })
          ),
          line(i)
        );
      }),

      h("div.ap-map-type", {
        style: reduce ? null : `animation:tmUp var(--ap-anim-tmUp) ${200 + axes.length * 250}ms both`,
      },
        h("div.nm-mono.ap-map-type-kicker", { text: "Your Archetype" }),
        h("div.ap-serif.ap-map-type-name", { text: tp.name }),
        h("div.ap-map-type-copy", { text: tp.copy })
      ),

      satellites.length
        ? [
            h("div.ap-map-line"),
            h("div.ap-map-satellites", {},
              satellites.map((s) =>
                h("div.ap-map-satellite", {},
                  h("div.nm-mono.ap-map-satellite-key", { text: s.k }),
                  h("div.ap-map-satellite-value", { text: s.v })
                )
              )
            ),
          ]
        : null
    )
  );
}

function renderDescription(tp) {
  const items = [
    ["このアーキタイプの特徴", tp.tokucho],
    ["仕事で自然に取りやすい行動", tp.tsuyomi],
    ["負荷になりやすい状況", tp.fuka],
    ["好みやすい仕事環境", tp.kankyo],
    ["自然に力が出やすい場面", tp.katsuyaku],
    ["注意点", tp.chui],
    ["他のアーキタイプとの協働", tp.kyodo],
  ];
  return h("div.nm-surface.ap-card.ap-description", {},
    items.map(([title, body]) =>
      h("div", {},
        h("div.nm-subsection-title.ap-description-title", { text: title }),
        h("p.ap-description-body", { text: body })
      )
    )
  );
}
