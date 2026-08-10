import { h, btn, prefersReducedMotion, scrollTop } from "../ui.js";
import * as D from "../data.js";
import {
  evidence, studyGroups, studyOn, studyLabel, habitLines,
  missingLayers, archetypeModifier, firstIncompletePage, corePageCount,
} from "../scoring.js";
import { state, setState, clearDraft } from "../state.js";
import { buildSquareShareFile, downloadSheet, downloadSquareCard } from "../export.js";

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
    : D.styleAxes.map((ax, i) => ({ ax, letter: code[i], pct: null }));

  // 象徴ビジュアルはヘッダー直後に置く。回答直後に最初に見たいのはキャラクターであって、
  // 注意書きやダウンロードの案内ではないため、それらより前に出す。
  const visual = renderVisual(tp, code);

  const sections = [];
  const push = (node) => { if (node) sections.push(node); };

  push(renderWorkStyle(axes));
  push(renderPersonality(personal));
  push(renderSubject(personal));
  push(renderPractice(personal));
  push(renderStudy(personal));
  push(renderHabits(personal, code));
  push(renderMap(axes, personal, code, tp));
  push(renderDescription(tp));

  // ビジュアルを先頭にした順で、以降のセクションを順に立ち上げる
  [visual, ...sections].forEach((node, i) => {
    const style = anim("tmUp", 250 * (i + 1));
    if (style) node.setAttribute("style", `${node.getAttribute("style") || ""};${style}`);
  });

  const missing = missingLayers(personal, state.ops);

  return h("div.ap-result", { "data-screen-label": "結果画面" },
    renderHeader(tp, res, code, archetypeModifier(personal)),
    visual,
    personal ? renderContinuePanel(missing) : null,
    personal ? renderDownloadPanel(personal, code, missing) : null,
    sections,
    personal ? renderContinuePanel(missing) : null,
    personal ? renderDownloadReminder(personal, code) : null,
    h("div.nm-alert.ap-disclaimer", { text: D.DISCLAIMER_RESULT })
  );
}

/**
 * Work Style 16 問だけで結果を見た人に、残りのレイヤーへの導線を出す。
 * 「途中で止めた」ではなく「ここから先は任意」と読めるようにする。
 *
 * 誘い文句は「次に足せるもの」で決める。修飾語（まわりを立てる 等）は Personality
 * からしか出ないので、性格が未回答のときはそれ自体が続ける理由になる。
 * 全体の残り問数を前面に出すと重く見えるため、出すのは次の 1 ステップの数だけ。
 */
function renderContinuePanel(missing) {
  if (!missing.length) return null;
  const next = missing[0];
  const leadsWithPersonality = next.key === "personality";

  return h("div.nm-surface.ap-continue", {},
    h("div.nm-mono.ap-continue-kicker", { text: "OPTIONAL" }),
    h("div.ap-serif.ap-continue-title", {
      text: leadsWithPersonality
        ? "性格を足すと、名前に一言つきます"
        : `${next.jp}を足すと、プロフィールが埋まります`,
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
      text: `${next.jp}を足す（${next.n}問）`,
      onClick: () => {
        setState({
          screen: "quiz",
          page: firstIncompletePage(state.ans, state.ops, corePageCount()),
          preview: false,
          previewCode: null,
        });
        scrollTop();
      },
    })
  );
}

// ---------------------------------------------------------------- ヘッダー

function renderHeader(tp, res, code, mod) {
  // 共有リンクからの復元は「自分の結果」ではないので、その旨と復元範囲を明示する
  const shared = !state.preview && res && !res.fromAnswers;
  const kicker = state.preview
    ? "ARCHETYPE PREVIEW"
    : shared
      ? "共有された会計人プロフィール"
      : "あなたの会計人プロフィール";

  const shareStatus = h("p.nm-supporting-text.ap-download-status.ap-share-status", { hidden: true });

  // Instagram は X と並ぶ共有先として独立させる。渡せるのは画像だけなので、
  // スマホは共有シート経由、デスクトップは保存して手で投稿してもらう。
  //
  // 文言は挙動に合わせる。押しても Instagram に直行はしない（Instagram には
  // X の intent にあたる URL が無く、Web から画像を渡す道は共有シートしかない）。
  // 隣の「Xでシェア」と同じ形にすると直行すると読めるため、実際に何が起きるかを
  // 書いた「画像を共有」にしている。
  // 図鑑プレビューには渡す結果が無いので、共有シートには回さず保存だけにする
  const willShare = canUseOsShare() && !state.preview && !!res;
  const igBtn = btn("button.nm-btn.nm-btn--secondary.nm-btn--lg.ap-share-ig", {
    text: willShare ? "画像を準備中…" : "Instagram用に保存",
    onClick: (e) => shareToInstagram(res, code, shareStatus, e.currentTarget),
  });
  // 画像ができるまで押せなくする。押すタイミングによって共有シートが出たり
  // 黙って保存になったりしていたので、押せる＝必ず共有シートが出る状態にする。
  if (willShare) {
    igBtn.disabled = true;
    prepareSquareFile(res, code).then((file) => {
      igBtn.disabled = false;
      igBtn.textContent = file ? "Instagram用の画像を共有" : "Instagram用に保存";
    });
  }

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
    // 修飾語はアーキタイプ名の一部ではなく「あなたにかかる形容」。名前より一段小さく
    // 別の行に置くことで、共有先で素の名前だけになっても別タイプに見えないようにする。
    mod ? h("div.ap-serif.ap-result-modifier", { style: anim("tmPop", 90), text: mod }) : null,
    h("h2.ap-result-name", { style: anim("tmPop", 130), text: tp.name }),
    h("p.ap-serif.ap-result-copy", { style: anim("tmPop", 260), text: `「${tp.copy}」` }),
    state.preview
      ? h("p.ap-preview-note", { text: "※ 図鑑のプレビュー表示です（あなたの結果ではありません）" })
      : null,
    shared
      ? h("p.ap-preview-note", {
          text: "※ 共有リンクからの表示です。含まれるのは Work Style とアーキタイプだけです。",
        })
      : null,
    h("div.ap-result-actions", {},
      // ボタンではなく本物のリンクにする。JS で開くとポップアップ扱いになり
      // ブロックされることがあるが、リンクなら通常のタブ遷移として必ず開く。
      //
      // ここでクリックを横取りして navigator.share() に回してはいけない。
      // 共有シートが X の代わりに開いてしまい、「押しても X が開かない」ことになる。
      // 画像を添付したいときは Instagram ボタン（共有シート）を使う。
      // X ではリンクカードに /t/{CODE}/ の og:image が出るので、添付は要らない。
      h("a.nm-btn.nm-btn--primary.nm-btn--lg.ap-share-link", {
        href: intentUrl(res, code, tp),
        target: "_blank",
        rel: "noopener noreferrer",
        text: "Xでシェア",
      }),
      igBtn,
      copyBtn,
      btn("button.nm-btn.nm-btn--tertiary", {
        text: state.preview || shared ? "自分のプロフィールを作る" : "もう一度作る",
        onClick: retake,
      })
    ),
    shareStatus,
    // 名前の由来はここでしか説明できないので残す。ただし読む流れを止めないよう
    // ボタンのあと・キャラクターの手前に 1 行だけ置く。
    h("p.nm-supporting-text.ap-result-note", {
      text: "Work Style（仕事の進め方）から作るラベルです。心理タイプの判定ではありません。",
    })
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
 * 共有カードの File。結果を描いた時点で先に作っておく。
 *
 * navigator.share() はユーザー操作の直後にしか呼べない。クリックしてから
 * 画像を生成して await すると、その間に操作の権利が切れて弾かれることがあるので、
 * 押されたときには同期的に渡せる状態にしておく。
 */
let squareFile = null;
let squareKey = null;      // いま作っている／作り終えた内容の指紋
let squarePromise = null;  // その生成の Promise（ボタンの有効化に使う）

/** カードに描く内容の指紋。性格を足して修飾語が付いたら作り直す。 */
const shareKey = (result, code) =>
  [code, archetypeModifier(result) || "", result.axes.map((a) => a.pct).join(".")].join("|");

/** 正方形カードを作る。同じ内容なら作り直さず、同じ Promise を返す。 */
function prepareSquareFile(result, code) {
  // OS の共有シートを使わない端末では File を作らない（保存で足りる）
  if (!canUseOsShare()) return Promise.resolve(null);
  const key = shareKey(result, code);
  if (squareKey === key && squarePromise) return squarePromise;
  squareKey = key;
  squareFile = null;
  squarePromise = buildSquareShareFile(result, code)
    .catch(() => null)
    .then((file) => {
      if (squareKey !== key) return null;   // 別の結果に切り替わっていた
      squareFile = file;
      // 作れなかったときはキーを残さない（次の描画で作り直せるように）
      if (!file) { squareKey = null; squarePromise = null; }
      return file;
    });
  return squarePromise;
}

const shareText = (tp) => `会計人16タイプ、私は「${tp.name}」でした\n#会計人プロフィール`;

/** X の投稿画面の URL。共有ボタンの href にそのまま入れる。 */
function intentUrl(res, code, tp) {
  return (
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText(tp))}` +
    `&url=${encodeURIComponent(shareUrl(res, code))}`
  );
}

/**
 * OS の共有シートを使ってよい端末か。
 *
 * デスクトップの Chrome / Edge も navigator.share を持っているが、開くのは
 * Windows の共有シートで、そこに X はいない（近距離共有・Dropbox・メール等が並ぶ）。
 * 「Xで結果をシェア」を押した人が X へ行けないので、指で触る端末に限る。
 */
const canUseOsShare = () =>
  typeof navigator.canShare === "function" &&
  navigator.maxTouchPoints > 0 &&
  window.matchMedia("(pointer: coarse)").matches;

/**
 * Instagram へ。
 *
 * Instagram はリンクカードを持たず、キャプションのリンクも押せないので、
 * 渡せるのは画像だけ。スマホでは OS の共有シートに Instagram が出るのでそこへ
 * 正方形カードを渡す。デスクトップには共有先が無いので、画像を保存して
 * 手で投稿してもらう。
 *
 * 画像ができるまでボタンは押せないので、スマホでここに来たときは必ず共有シートが出る。
 */
function shareToInstagram(result, code, statusEl, button) {
  const file = squareFile;
  if (file && canUseOsShare() && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file] }).catch((err) => {
      if (err && err.name === "AbortError") return;
      runDownload(button, statusEl, "画像を保存しました。Instagram から投稿してください。", () =>
        downloadSquareCard(result, code)
      );
    });
    return;
  }
  runDownload(button, statusEl, "正方形カードを保存しました。Instagram から投稿してください。", () =>
    downloadSquareCard(result, code)
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
 * 結果はサーバーに保存しないため、手元に残す手段はこの画像保存だけ。
 * 「いま以外は取り出せない」ことは実害があるので残すが、1 行に収める。
 */
function renderDownloadPanel(result, code, missing) {
  const status = h("p.nm-supporting-text.ap-download-status", { hidden: true });

  return h("div.ap-download", {},
    h("div.ap-download-row", {},
      h("p.ap-download-lead", {},
        h("strong", { text: "この結果はサーバーに残りません。" }),
        "ほかの端末で見たいときや確実に残したいときは画像で保存してください。",
        missing.length ? `いまの画像には${5 - missing.length}レイヤーが入ります。` : null
      ),
      btn("button.nm-btn.nm-btn--primary", {
        text: "画像で保存",
        onClick: (e) => runDownload(e.currentTarget, status, "画像を保存しました。", () =>
          downloadSheet(result, code)
        ),
      })
    ),
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

/** 最後まで読んだ位置から上に戻らずに保存できるようにする（文言は繰り返さない）。 */
function renderDownloadReminder(result, code) {
  const status = h("p.nm-supporting-text.ap-download-status", { hidden: true });
  return h("div.ap-download.ap-download--foot", {},
    h("div.ap-download-row", {},
      h("p.ap-download-lead", { text: "この画面を離れる前に。" }),
      btn("button.nm-btn.nm-btn--primary.nm-btn--sm", {
        text: "画像で保存",
        onClick: (e) => runDownload(e.currentTarget, status, "画像を保存しました。", () =>
          downloadSheet(result, code)
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

  // 画像が未用意のアーキタイプ用。絵が出せなくても「自分は何の動物か」は必ず伝える
  // （ここを消すと、そのアーキタイプの人だけ動物のいないプロフィールになってしまう）。
  const fallbackName = animal
    ? h("div.ap-serif.ap-visual-fallback", {},
        h("span.ap-visual-fallback-animal", { text: animal }),
        h("span.nm-mono.ap-visual-fallback-note", { text: "ILLUSTRATION COMING SOON" })
      )
    : null;

  // ハンドラを先に付けてから src を与える（読み込み結果を取りこぼさないため）
  const character = h("img.ap-visual-char", {
    alt: `${tp.name}のキャラクター（${animal}）`,
    decoding: "async",
    style: prefersReducedMotion() ? null : "animation:tmPop var(--ap-anim-tmPop) 120ms both",
    onLoad: () => band.classList.add("is-loaded"),
    onError: (e) => {
      // 絵はグラデーションに戻すが、動物名バッジと帯の動物名は残す
      e.currentTarget.remove();
      band.classList.add("ap-visual--fallback");
    },
  });
  character.src = D.characterImage(code);
  band.append(character, fallbackName);

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
  return card("Work Style", "— 仕事の進め方（優劣ではありません）",
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
          h("div.ap-axis-bar", {}, fill, h("div.ap-axis-center"), marker)
        );
      })
    )
  );
}

function renderPersonality(res) {
  if (!res || !res.bf) return null;
  const keys = D.traitOrder.filter((tr) => res.bf[tr] != null);
  if (!keys.length) return null;

  return card("Personality", "— 高い・低いに良し悪しはありません",
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
  return card("Subject DNA", "— 好きな科目（点数ではなく、選んだ理由のタグです）",
    dnaList(res.subjectTop)
  );
}

function renderPractice(res) {
  if (!res || !res.practiceTop || !res.practiceTop.length) return null;
  // コア／フロンティアはタグを読むのに定義が要るので、この 1 行だけは残す
  return card("Practice DNA", "— コア=好き×やりたい、フロンティア=未経験×やりたい",
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
      label ? h("span.nm-badge.nm-badge--brand.ap-study-label", { text: label }) : null,
      h("span.nm-supporting-text.ap-card-note", { text: "— 各指標1問の回答です（学習タイプの判定ではありません）" })
    ),
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

/**
 * Profile Map は単体で 1300px 超あり、結果画面の3分の1を占める。
 * 畳んで開いてもらう形にするが、**あることが分からないと畳んだ意味がない**ので、
 * 見出し・中身の説明・開く合図を出したカードのまま置く。
 * 中身は初回に開いたときに組み立てる（開かない人には作らない。
 * 畳んだまま作ると立ち上がりのアニメーションも空振りする）。
 */
function renderMap(axes, res, code, tp) {
  const note = state.preview
    ? "このアーキタイプの人が通りやすい道すじ"
    : "あなたの回答から、アーキタイプにたどり着くまでの道すじ";

  const body = h("div.ap-map-body");
  const details = h("details.nm-surface.ap-card.ap-map-details", {},
    h("summary.ap-map-summary", {},
      h("span.ap-map-summary-text", {},
        h("span.nm-section-title.ap-card-title.ap-map-summary-title", { text: "Profile Map" }),
        h("span.nm-supporting-text.ap-map-summary-note", { text: note })
      ),
      h("span.nm-mono.ap-map-summary-cue", { text: "ひらく" })
    ),
    body
  );

  let built = false;
  details.addEventListener("toggle", () => {
    if (!details.open || built) return;
    built = true;
    body.append(buildMap(axes, res, code, tp));
  });
  return details;
}

function buildMap(axes, res, code, tp) {
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

  return h("div.ap-map", {},
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
