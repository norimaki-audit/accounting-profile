import { h, btn, clear, scrollTop } from "../ui.js";
import * as D from "../data.js";
import {
  likertItems, pages, isPageDone, isLayerEnd,
  activePages, nextPageIndex, optionalCount, likertDisplayNo,
  answeredCore, answeredOptional, subjectPool, computeResult, NA, NONE, EXCLUSIVE_CHOICES,
  tiedAxes, answeredTie, coreTotal, TIE_KEY,
} from "../scoring.js";
import { state, setState, saveDraft } from "../state.js";

const AUTO_ADVANCE_KEY = "kprofile.autoAdvance";
const LIKERT_SIZES = [34, 30, 26, 30, 34];
const SECTION_LABEL = { A: "性格", B: "仕事の進め方", C: "勉強" };
const SECTION_HINT = {
  A: "ふだんのあなたに、どのくらい当てはまりますか？",
  B: "仕事や勉強の「進め方」についての質問です。",
  C: "勉強のしかたについての質問です。",
};

const autoAdvanceEnabled = () => localStorage.getItem(AUTO_ADVANCE_KEY) !== "off";

// ページ内で部分更新するための参照。ページを組み立て直すたびに差し替える。
let els = {};
let advanceTimer = null;

export function renderQuiz() {
  const body = h("div.ap-quiz-body");
  const progressFill = h("div.ap-progress-fill");
  const progressBar = h("div.ap-progress", {
    role: "progressbar",
    "aria-label": "回答の進捗",
    "aria-valuemin": "0",
  }, progressFill);

  const stageLabel = h("span.nm-badge.ap-quiz-stage");
  const pageLabel = h("span.nm-mono.ap-quiz-page");
  const countLabel = h("span.nm-mono.ap-quiz-count");
  const hint = h("p.nm-supporting-text.ap-quiz-hint");

  const prev = btn("button.nm-btn.nm-btn--secondary.nm-btn--lg.ap-nav-prev", {
    onClick: goPrev, text: "もどる",
  });
  const next = btn("button.nm-btn.nm-btn--primary.nm-btn--lg.ap-nav-next", { onClick: goNext });

  const autoToggle = h("input", {
    type: "checkbox",
    id: "ap-auto-advance",
    checked: autoAdvanceEnabled() ? "checked" : null,
    onChange: (e) => {
      localStorage.setItem(AUTO_ADVANCE_KEY, e.currentTarget.checked ? "on" : "off");
    },
  });

  els = { body, progressBar, progressFill, stageLabel, pageLabel, countLabel, hint, prev, next };

  const root = h("div.ap-quiz", { "data-screen-label": "質問画面" },
    h("div.ap-quiz-head", {}, stageLabel, pageLabel, countLabel),
    progressBar,
    hint,
    body,
    h("div.ap-quiz-nav", {}, prev, next),
    h("label.ap-auto-advance", { for: "ap-auto-advance" },
      autoToggle,
      h("span", { text: "4問そろったら自動で次へ進む" })
    ),
    h("p.nm-supporting-text.ap-quiz-note", {
      text: "通常利用では回答を外部へ送信しません。中断しても続きから再開できます。",
    })
  );

  renderPage();
  return root;
}

/** いま表示しているページがコア（Work Style + 同点の二択）か */
const onCore = () => pages()[state.page].core;

function renderPage() {
  const items = likertItems();
  const page = pages()[state.page];

  // 進捗はコア／任意で別々に数える。コア中に「16/56」と出すと未完了感が出るため。
  // ページ番号は出題するページだけで数える（受験なしで飛ばす科目3問は含めない）。
  const core = onCore();
  const active = activePages(state.ops, state.ans);
  els.stageLabel.textContent = core ? "STEP 1 — アーキタイプが出るまで" : "STEP 2 — プロフィールを埋める";
  els.stageLabel.classList.toggle("nm-badge--brand", core);
  // ページ番号は出題するページだけで数える（同点が無ければ二択ページは存在しない）
  const group = active.filter((p) => !!p.core === core);
  const pos = group.findIndex((p) => p === page) + 1;
  els.pageLabel.textContent = `PAGE ${pos} / ${group.length}`;
  els.body.className = `ap-quiz-body ap-quiz-body--${state.page % 2 === 0 ? "a" : "b"}`;
  clear(els.body);

  if (page.kind === "tie") {
    els.hint.textContent = "ふだんの自分に近いほうを選んでください。";
    tiedAxes(state.ans).forEach((ai) => els.body.append(renderTieCard(ai)));
  } else if (page.kind === "op") {
    els.hint.textContent = page.op.kind === "practice"
      ? "Practice DNA — 実務領域の興味です。性格スコアには影響しません。"
      : "Subject DNA — 科目の興味です。性格スコアには影響しません。";
    els.body.append(renderOpCard(page.op));
  } else {
    els.hint.textContent = SECTION_HINT[page.sec];
    page.indices.forEach((idx) => els.body.append(renderLikertCard(items[idx], idx, page)));
  }

  syncProgress();
  syncNav();
}

// ---------------------------------------------------------------- Likert

function renderLikertCard(q, idx, page) {
  // 丸は中の span で描く。ボタン自体は行を等分する透明なマスにして、
  // 見た目（26〜34px の丸）を変えずに指で押せる高さ・幅を確保する。
  const optionButtons = D.choices.map((c, ci) => {
    const dot = h("span.ap-likert-mark");
    const b = btn("button.ap-likert-dot", {
      title: c.label,
      "aria-label": c.label,
      "aria-pressed": "false",
      "data-value": String(c.v),
      style: `--ap-dot:${LIKERT_SIZES[ci]}px`,
      class: c.v > 0 ? "ap-likert-dot--pos" : c.v < 0 ? "ap-likert-dot--neg" : "ap-likert-dot--mid",
      onClick: () => pickLikert(idx, c.v, page),
    }, dot);
    b._mark = dot;
    return b;
  });

  const naButton = q.na
    ? btn("button.ap-na", {
        "aria-pressed": "false",
        onClick: () => toggleNa(idx),
        text: "経験がなく判断できない",
      })
    : null;

  const card = h("div.nm-surface.ap-q", {},
    h("div.ap-q-meta", {},
      h("span.nm-mono.ap-q-num", { text: `Q${String(likertDisplayNo(idx)).padStart(2, "0")}` }),
      h("span.nm-badge.ap-q-badge", { text: SECTION_LABEL[q.sec] })
    ),
    h("div.ap-serif.ap-q-text", { text: q.t }),
    h("div.ap-likert", {},
      h("span.ap-likert-label.ap-likert-label--pos", { text: "当てはまる" }),
      optionButtons,
      h("span.ap-likert-label.ap-likert-label--neg", { text: "当てはまらない" })
    ),
    naButton
  );

  card._sync = () => {
    const selected = state.ans[idx];
    optionButtons.forEach((b) => {
      const on = selected === Number(b.dataset.value);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("is-selected", on);
      b._mark.textContent = on ? "✓" : "";
    });
    if (naButton) {
      const on = selected === NA;
      naButton.setAttribute("aria-pressed", on ? "true" : "false");
      naButton.classList.toggle("is-selected", on);
    }
  };
  card._sync();
  card.dataset.qIndex = String(idx);
  return card;
}

function pickLikert(idx, value, page) {
  setState({ ans: { ...state.ans, [idx]: value } }, { render: false });
  saveDraft();
  syncCard(idx);
  syncProgress();
  syncNav();

  // レイヤーの切れ目では自動で進めない（結果画面へ飛ばしてしまうため）
  if (page.indices.every((i) => state.ans[i] != null) && autoAdvanceEnabled() && !isLayerEnd(state.page, state.ops, state.ans)) {
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => goNext(), 350);
  }
}

function toggleNa(idx) {
  const ans = { ...state.ans };
  if (ans[idx] === NA) delete ans[idx];
  else ans[idx] = NA;
  setState({ ans }, { render: false });
  saveDraft();
  syncCard(idx);
  syncProgress();
  syncNav();
}

// ---------------------------------------------------------------- 同点の二択

/**
 * 引き分けた軸の二択。
 *
 * 5段階では合計が 0 になることがあり、そこを内部で勝手に倒すと根拠のない極から
 * 行動傾向まで断定してしまう。同点の軸だけ本人に選んでもらう。
 * 「どちらでもない」は置かない（置くと同点が解けない）。
 */
function renderTieCard(ai) {
  const q = D.styleTie.find((t) => t.ax === ai);
  const key = TIE_KEY(ai);

  // 極の名前（検証／探索 など）は出さない。ラベルを見せると、いつもの自分ではなく
  // 「その言葉に当てはまるほう」を選ぶ判断になってしまう。
  const options = [
    { side: "L", label: q.l },
    { side: "R", label: q.r },
  ].map((o) =>
    btn("button.ap-tie-option", {
      "aria-pressed": "false",
      "data-side": o.side,
      onClick: () => pickTie(key, o.side),
    },
      h("span.ap-tie-label", { text: o.label })
    )
  );

  const card = h("div.nm-surface.ap-q.ap-tie", {},
    h("div.ap-q-meta", {},
      h("span.nm-badge.ap-q-badge", { text: SECTION_LABEL.B })
    ),
    h("div.ap-serif.ap-q-text", { text: q.t }),
    h("div.ap-tie-options", {}, options)
  );

  card._sync = () => {
    options.forEach((b) => {
      const on = state.ans[key] === b.dataset.side;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("is-selected", on);
    });
  };
  card._sync();
  card.dataset.qIndex = key;
  return card;
}

function pickTie(key, side) {
  setState({ ans: { ...state.ans, [key]: side } }, { render: false });
  saveDraft();
  syncCard(key);
  syncProgress();
  syncNav();
}

// ---------------------------------------------------------------- DNA 操作

function renderOpCard(op) {
  let pool = op.kind === "groups"
    ? D.profile.groupOptions
    : op.kind === "subject"
      ? subjectPool(state.ops)
      : D.profile.practiceDomains.slice();
  if (op.none) pool = pool.concat([NONE]);

  const chips = pool.map((label) =>
    btn("button.ap-chip", {
      "aria-pressed": "false",
      onClick: () => toggleChip(op, label),
    }, label)
  );

  const card = h("div.nm-surface.ap-q", {},
    h("div.ap-q-meta", {},
      h("span.nm-mono.ap-q-num", { text: op.id }),
      h("span.nm-badge.ap-q-badge", { text: op.kind === "practice" ? "実務DNA" : "科目DNA" })
    ),
    h("div.ap-serif.ap-q-text", { text: op.t }),
    h("p.nm-supporting-text.ap-chip-hint", { text: op.hint }),
    h("div.ap-chips", {}, chips)
  );

  card._sync = () => {
    const selected = state.ops[op.id] || [];
    chips.forEach((chip, i) => {
      const pos = selected.indexOf(pool[i]);
      const on = pos >= 0;
      chip.setAttribute("aria-pressed", on ? "true" : "false");
      chip.classList.toggle("is-selected", on);
      chip.textContent = (on && op.ranked ? `${pos + 1}位 ` : "") + pool[i];
    });
  };
  card._sync();
  card._op = op;
  return card;
}

function toggleChip(op, label) {
  const current = (state.ops[op.id] || []).slice();
  const pos = current.indexOf(label);

  if (pos >= 0) {
    current.splice(pos, 1);
  } else if (EXCLUSIVE_CHOICES.includes(label)) {
    // 「とくになし」「受験経験なし」は単独でしか意味を持たないので、他を消す
    current.length = 0;
    current.push(label);
  } else {
    // 逆に、ふつうの選択肢を選んだら排他の選択肢を外す
    EXCLUSIVE_CHOICES.forEach((ex) => {
      const at = current.indexOf(ex);
      if (at >= 0) current.splice(at, 1);
    });
    if (current.length < op.max) current.push(label);
  }

  setState({ ops: { ...state.ops, [op.id]: current } }, { render: false });
  saveDraft();

  // S0（経験資格）を変えると出題する科目リストが変わるので、後続の科目選択を整理する
  if (op.id === "S0") pruneSubjectSelections();

  els.body.querySelectorAll(".ap-q").forEach((card) => card._sync && card._sync());
  syncProgress();
  syncNav();
}

/** S0 変更後、出題対象でなくなった科目の選択を落とす。 */
function pruneSubjectSelections() {
  const pool = subjectPool(state.ops);
  const ops = { ...state.ops };
  let changed = false;
  ["S1", "S2", "S3"].forEach((id) => {
    if (!ops[id]) return;
    const kept = ops[id].filter((label) => pool.includes(label));
    if (kept.length !== ops[id].length) { ops[id] = kept; changed = true; }
  });
  if (changed) { setState({ ops }, { render: false }); saveDraft(); }
}

// ---------------------------------------------------------------- 同期・遷移

function syncCard(idx) {
  const card = els.body.querySelector(`.ap-q[data-q-index="${idx}"]`);
  if (card && card._sync) card._sync();
}

function syncProgress() {
  const core = onCore();
  const done = core
    ? answeredCore(state.ans) + answeredTie(state.ans)
    : answeredOptional(state.ans, state.ops);
  const total = core ? coreTotal(state.ans) : optionalCount(state.ops, state.ans);
  els.countLabel.textContent = `${done} / ${total}`;
  els.progressBar.setAttribute("aria-valuemax", String(total));
  els.progressBar.setAttribute("aria-valuenow", String(done));
  els.progressFill.style.width = `${Math.round((100 * done) / Math.max(1, total))}%`;
}

function isPageComplete() {
  return isPageDone(pages()[state.page], state.ans, state.ops);
}

function syncNav() {
  // レイヤーを1つ終えるたびに結果画面へ抜ける
  els.prev.disabled = nextPageIndex(state.page, state.ops, -1, state.ans) === -1;
  els.next.disabled = !isPageComplete();
  els.next.textContent = isLayerEnd(state.page, state.ops, state.ans) ? "結果を見る" : "つぎへ";
}

function goPrev() {
  clearTimeout(advanceTimer);
  const prev = nextPageIndex(state.page, state.ops, -1, state.ans);
  if (prev === -1) return;
  setState({ page: prev }, { render: false });
  saveDraft();
  renderPage();
  scrollTop();
}

function goNext() {
  clearTimeout(advanceTimer);
  if (!isPageComplete()) return;
  const next = nextPageIndex(state.page, state.ops, 1, state.ans);

  // レイヤーを1つ終えるたびに結果を見せる。続きは結果画面の導線から。
  if (isLayerEnd(state.page, state.ops, state.ans)) {
    setState({
      screen: "result",
      page: next === -1 ? state.page : next,
      result: computeResult(state.ans, state.ops),
      preview: false,
      previewCode: null,
    });
    saveDraft();
    scrollTop();
    return;
  }

  setState({ page: next }, { render: false });
  saveDraft();
  renderPage();
  scrollTop();
}
