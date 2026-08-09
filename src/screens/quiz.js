import { h, btn, clear, scrollTop } from "../ui.js";
import * as D from "../data.js";
import {
  likertItems, likertPageCount, pageCount, totalCount,
  answeredCount, subjectPool, computeResult, PER_PAGE, NA,
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
    "aria-valuemax": String(totalCount()),
  }, progressFill);

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

  els = { body, progressBar, progressFill, pageLabel, countLabel, hint, prev, next };

  const root = h("div.ap-quiz", { "data-screen-label": "質問画面" },
    h("div.ap-quiz-head", {}, pageLabel, countLabel),
    progressBar,
    hint,
    body,
    h("div.ap-quiz-nav", {}, prev, next),
    h("label.ap-auto-advance", { for: "ap-auto-advance" },
      autoToggle,
      h("span", { text: "4問そろったら自動で次へ進む" })
    ),
    h("p.nm-supporting-text.ap-quiz-note", {
      text: "回答はサーバーに送信されません。中断してもこの端末に下書きが残るので、あとから続けられます。",
    })
  );

  renderPage();
  return root;
}

function renderPage() {
  const items = likertItems();
  const likertPages = likertPageCount();
  const isOpsPage = state.page >= likertPages;

  els.pageLabel.textContent = `PAGE ${state.page + 1} / ${pageCount()}`;
  els.body.className = `ap-quiz-body ap-quiz-body--${state.page % 2 === 0 ? "a" : "b"}`;
  clear(els.body);

  if (isOpsPage) {
    const op = D.profile.ops[state.page - likertPages];
    els.hint.textContent = op.kind === "practice"
      ? "Practice DNA — 実務領域の興味です。性格スコアには影響しません。"
      : "Subject DNA — 科目の興味です。性格スコアには影響しません。";
    els.body.append(renderOpCard(op));
  } else {
    const start = state.page * PER_PAGE;
    const slice = items.slice(start, start + PER_PAGE);
    els.hint.textContent = SECTION_HINT[slice[0] ? slice[0].sec : "A"];
    slice.forEach((q, k) => els.body.append(renderLikertCard(q, start + k, slice, start)));
  }

  syncProgress();
  syncNav();
}

// ---------------------------------------------------------------- Likert

function renderLikertCard(q, idx, slice, start) {
  const optionButtons = D.choices.map((c, ci) =>
    btn("button.ap-likert-dot", {
      title: c.label,
      "aria-label": c.label,
      "aria-pressed": "false",
      "data-value": String(c.v),
      style: `width:${LIKERT_SIZES[ci]}px;height:${LIKERT_SIZES[ci]}px`,
      class: c.v > 0 ? "ap-likert-dot--pos" : c.v < 0 ? "ap-likert-dot--neg" : "ap-likert-dot--mid",
      onClick: () => pickLikert(idx, c.v, slice, start),
    })
  );

  const naButton = q.na
    ? btn("button.ap-na", {
        "aria-pressed": "false",
        onClick: () => toggleNa(idx),
        text: "経験がなく判断できない",
      })
    : null;

  const card = h("div.nm-surface.ap-q", {},
    h("div.ap-q-meta", {},
      h("span.nm-mono.ap-q-num", { text: `Q${String(idx + 1).padStart(2, "0")}` }),
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
      b.textContent = on ? "✓" : "";
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

function pickLikert(idx, value, slice, start) {
  setState({ ans: { ...state.ans, [idx]: value } }, { render: false });
  saveDraft();
  syncCard(idx);
  syncProgress();
  syncNav();

  const pageComplete = slice.every((_, j) => state.ans[start + j] != null);
  if (pageComplete && autoAdvanceEnabled() && state.page < pageCount() - 1) {
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

// ---------------------------------------------------------------- DNA 操作

function renderOpCard(op) {
  let pool = op.kind === "groups"
    ? D.profile.groupOptions
    : op.kind === "subject"
      ? subjectPool(state.ops)
      : D.profile.practiceDomains.slice();
  if (op.none) pool = pool.concat(["とくになし"]);

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
  } else {
    if (label === "とくになし") {
      current.length = 0;
    } else {
      const noneAt = current.indexOf("とくになし");
      if (noneAt >= 0) current.splice(noneAt, 1);
    }
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
  const done = answeredCount(state.ans, state.ops);
  const total = totalCount();
  els.countLabel.textContent = `${done} / ${total}`;
  els.progressBar.setAttribute("aria-valuenow", String(done));
  els.progressFill.style.width = `${Math.round((100 * done) / total)}%`;
}

function isPageComplete() {
  const likertPages = likertPageCount();
  if (state.page >= likertPages) {
    const op = D.profile.ops[state.page - likertPages];
    return (state.ops[op.id] || []).length > 0;
  }
  const start = state.page * PER_PAGE;
  return likertItems()
    .slice(start, start + PER_PAGE)
    .every((_, j) => state.ans[start + j] != null);
}

function syncNav() {
  const isLast = state.page === pageCount() - 1;
  els.prev.disabled = state.page === 0;
  els.next.disabled = !isPageComplete();
  els.next.textContent = isLast ? "プロフィールを見る" : "つぎへ";
}

function goPrev() {
  clearTimeout(advanceTimer);
  if (state.page === 0) return;
  setState({ page: state.page - 1 }, { render: false });
  saveDraft();
  renderPage();
  scrollTop();
}

function goNext() {
  clearTimeout(advanceTimer);
  if (!isPageComplete()) return;

  if (state.page === pageCount() - 1) {
    setState({
      screen: "result",
      result: computeResult(state.ans, state.ops),
      preview: false,
      previewCode: null,
    });
    scrollTop();
    return;
  }

  setState({ page: state.page + 1 }, { render: false });
  saveDraft();
  renderPage();
  scrollTop();
}
