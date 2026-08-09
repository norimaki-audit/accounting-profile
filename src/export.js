// 結果の持ち出し（ダウンロード）。
//
// 本アプリは結果をサーバーに保存しない。したがってユーザーが結果を手元に残す手段は
// 「結果画面を開いている間にダウンロードする」ことだけになる。ここではその 2 形式を作る。
//   1. PNG プロフィールシート — 5 レイヤーすべてを 1 枚にした画像
//   2. JSON データ — 回答の生データとスコア。読み込めば結果を再表示できる
// 画像生成もファイル書き出しもすべてブラウザ内で完結する（外部送信なし）。

import * as D from "./data.js";
import { habitLines, studyGroups, studyLabel } from "./scoring.js";

const SHEET_WIDTH = 1080;
const SCALE = 2;
const PAD = 56;

// 本アプリの上書きトークン（design-system の値ではなくアプリ固有の紙色・深緑）
const C = {
  page: "#faf8f4",
  card: "#ffffff",
  muted: "#f3f0e9",
  border: "#dcd8ce",
  borderStrong: "#c4bfb2",
  text: "#1a1a17",
  secondary: "#57574f",
  faint: "#8c8c82",
  brand50: "#e8f1ef",
  brand300: "#8fbcb5",
  brand400: "#4f948b",
  brand500: "#0f6b62",
  brand700: "#0a4c46",
  brand800: "#083d38",
  amber: "#704a0d",
  amberBg: "#fbf2e2",
  amberBd: "#e8d5ae",
};

// Study Behavior の 3 段タグ（画面側 .ap-study-tag と対応させる）
const TAG_STYLE = {
  on: { bg: C.brand50, border: C.brand300, fg: C.brand800, title: C.brand800, weight: 600 },
  mid: { bg: C.muted, border: C.border, fg: C.secondary, title: C.secondary, weight: 400 },
  off: { bg: C.card, border: C.border, fg: C.faint, title: C.secondary, weight: 400, dash: true },
};

const mincho = (px, w = 600) =>
  `${w} ${px}px "Hiragino Mincho ProN","Yu Mincho",YuMincho,"Shippori Mincho",serif`;
const gothic = (px, w = 400) =>
  `${w} ${px}px "Hiragino Kaku Gothic ProN","Yu Gothic Medium","Yu Gothic",Meiryo,system-ui,sans-serif`;
const mono = (px, w = 500) =>
  `${w} ${px}px "IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;

// ---------------------------------------------------------------- 描画ヘルパー

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 日本語は単語境界がないため 1 文字ずつ測って折り返す。 */
function wrap(ctx, str, maxWidth) {
  const lines = [];
  let line = "";
  for (const ch of String(str)) {
    if (ch === "\n") { lines.push(line); line = ""; continue; }
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(ctx, str, x, y, { font, color, align = "left" }) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(str, x, y);
}

/** 折り返し描画。次の行頭 y を返す。 */
function drawParagraph(ctx, str, x, y, maxWidth, { font, color, lineHeight, align = "left" }) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  let cursor = y;
  for (const line of wrap(ctx, str, maxWidth)) {
    ctx.fillText(line, x, cursor);
    cursor += lineHeight;
  }
  return cursor;
}

/** 左詰めのバー（Personality / DNA / Study 用） */
function drawBar(ctx, x, y, w, h, pct, fill = C.brand400) {
  ctx.fillStyle = C.muted;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  const filled = Math.max(0, Math.min(100, pct)) / 100;
  if (filled > 0) {
    ctx.save();
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.clip();
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, Math.max(h, w * filled), h, h / 2);
    ctx.fill();
    ctx.restore();
  }
}

/** 中心から勝ち極方向へ伸びるバー（Work Style 用） */
function drawAxisBar(ctx, x, y, w, h, pct, winLeft) {
  ctx.fillStyle = C.muted;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  const center = x + w / 2;
  const span = (w / 2) * ((pct - 50) / 50);
  ctx.save();
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.clip();
  ctx.fillStyle = C.brand500;
  if (winLeft) ctx.fillRect(center - span, y, span, h);
  else ctx.fillRect(center, y, span, h);
  ctx.restore();

  ctx.strokeStyle = C.borderStrong;
  ctx.beginPath();
  ctx.moveTo(center, y - 3);
  ctx.lineTo(center, y + h + 3);
  ctx.stroke();

  const markerX = winLeft ? center - span : center + span;
  ctx.beginPath();
  ctx.arc(markerX, y + h / 2, 8, 0, Math.PI * 2);
  ctx.fillStyle = C.brand500;
  ctx.fill();
  ctx.strokeStyle = C.card;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

/** カード枠を描き、内容の描画領域の左上を返す。 */
function drawCard(ctx, y, height) {
  ctx.fillStyle = C.card;
  roundRect(ctx, PAD, y, SHEET_WIDTH - PAD * 2, height, 3);
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  return { x: PAD + 32, w: SHEET_WIDTH - PAD * 2 - 64 };
}

function sectionTitle(ctx, title, note, x, y) {
  drawText(ctx, title, x, y, { font: gothic(21, 700), color: C.text });
  if (note) {
    const width = ctx.measureText(title).width;
    drawText(ctx, note, x + width + 12, y, { font: gothic(14), color: C.faint });
  }
  return y + 30;
}

// ---------------------------------------------------------------- PNG シート

/** 同一オリジンの画像を読み込む。用意されていなければ null を返す（描画は続行する）。 */
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * 5 レイヤーすべてを 1 枚にした縦長のプロフィールシートを描く。
 * 高さは内容によって変わるため、十分に高いキャンバスへ描いてから実寸で切り出す。
 */
export async function renderProfileSheet(result, code) {
  const tp = D.types[code];
  const character = await loadImage(D.characterImage(code));
  const MAX_H = 4200;

  const src = document.createElement("canvas");
  src.width = SHEET_WIDTH * SCALE;
  src.height = MAX_H * SCALE;
  const ctx = src.getContext("2d");
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = C.page;
  ctx.fillRect(0, 0, SHEET_WIDTH, MAX_H);

  let y = 0;

  // --- ヘッダー
  ctx.fillStyle = C.card;
  ctx.fillRect(0, 0, SHEET_WIDTH, 84);
  ctx.fillStyle = C.border;
  ctx.fillRect(0, 83, SHEET_WIDTH, 1);
  ctx.fillStyle = C.brand500;
  roundRect(ctx, PAD, 36, 14, 14, 2);
  ctx.fill();
  const brandTitle = "会計人プロフィール";
  drawText(ctx, brandTitle, PAD + 26, 50, { font: mincho(24), color: C.text });
  const brandWidth = ctx.measureText(brandTitle).width;
  drawText(ctx, "A C C O U N T I N G   P R O F I L E", PAD + 26 + brandWidth + 20, 49, {
    font: mono(12), color: C.faint,
  });
  y = 84;

  // --- アーキタイプ（象徴ビジュアル）
  const heroH = 340;
  const grad = ctx.createLinearGradient(0, y, SHEET_WIDTH, y + heroH);
  grad.addColorStop(0, tp.c[0]);
  grad.addColorStop(1, tp.c[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, y, SHEET_WIDTH, heroH);

  // 装飾: 回転した正方形 3 つ（アプリの象徴ビジュアルと同じ配置）
  const k = SHEET_WIDTH / 640;
  [
    [84 * k, 0.64, 0.16, 0.7, 12],
    [130 * k, 0.10, 0.36, 0.35, -6],
    [52 * k, 0.44, 0.60, 0.5, 30],
  ].forEach(([size, px, py, opacity, rot]) => {
    ctx.save();
    ctx.translate(SHEET_WIDTH * px + size / 2, y + heroH * py + size / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.strokeStyle = `rgba(255,255,255,${opacity})`;
    ctx.lineWidth = 2.5;
    roundRect(ctx, -size / 2, -size / 2, size, size, 3);
    ctx.stroke();
    ctx.restore();
  });

  // キャラクター（未用意のアーキタイプでは省略し、文字だけのヒーローになる）
  const charSize = 232;
  const charX = SHEET_WIDTH - PAD - charSize;
  const charY = y + (heroH - charSize) / 2;
  if (character) {
    ctx.save();
    roundRect(ctx, charX, charY, charSize, charSize, 4);
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(character, charX, charY, charSize, charSize);
    ctx.restore();
  }
  const heroTextWidth = (character ? charX - 28 : SHEET_WIDTH - PAD) - PAD;

  drawText(ctx, "YOUR ARCHETYPE", PAD, y + 96, {
    font: mono(13), color: "rgba(255,255,255,.78)",
  });
  drawText(ctx, tp.name, PAD, y + 156, { font: mincho(52), color: "#ffffff" });
  const animal = D.animals[code];
  if (animal) {
    drawText(ctx, animal, PAD, y + 190, { font: gothic(15, 600), color: "rgba(255,255,255,.82)" });
  }
  drawParagraph(ctx, `「${tp.copy}」`, PAD, y + 226, heroTextWidth, {
    font: mincho(22, 400), color: "rgba(255,255,255,.94)", lineHeight: 34,
  });
  drawParagraph(
    ctx,
    "アーキタイプは Work Style から生成する SNS 向けのラベルです。心理学的なタイプ判定ではありません。",
    PAD, y + heroH - 22, heroTextWidth,
    { font: gothic(13), color: "rgba(255,255,255,.78)", lineHeight: 20 }
  );
  y += heroH + 28;

  // --- Work Style
  {
    const rows = result.axes.length;
    const cardH = 78 + rows * 66;
    const { x, w } = drawCard(ctx, y, cardH);
    let cy = y + 46;
    cy = sectionTitle(ctx, "Work Style", "— 会計実務の進め方（独自4軸・優劣ではありません）", x, cy);
    cy += 8;
    result.axes.forEach((a) => {
      const winLeft = a.letter === a.ax.L;
      const lTag = a.ax.lName + (winLeft && a.pct != null ? ` ${a.pct}` : "");
      const rTag = (!winLeft && a.pct != null ? `${a.pct} ` : "") + a.ax.rName;
      drawText(ctx, lTag, x, cy, {
        font: mono(16, winLeft ? 700 : 500), color: winLeft ? C.brand800 : C.faint,
      });
      drawText(ctx, a.ax.name, x + w / 2, cy, { font: mono(12), color: C.faint, align: "center" });
      drawText(ctx, rTag, x + w, cy, {
        font: mono(16, !winLeft ? 700 : 500), color: !winLeft ? C.brand800 : C.faint, align: "right",
      });
      drawAxisBar(ctx, x, cy + 12, w, 14, a.pct ?? 50, winLeft);
      if (a.tie) {
        drawText(ctx, "この軸はほぼ中間（両極型）です。", x, cy + 48, {
          font: gothic(13), color: C.faint,
        });
      }
      cy += 66;
    });
    y += cardH + 20;
  }

  // --- Personality
  const bfKeys = result.bf ? D.traitOrder.filter((tr) => result.bf[tr] != null) : [];
  if (bfKeys.length) {
    const cardH = 104 + bfKeys.length * 72;
    const { x, w } = drawCard(ctx, y, cardH);
    let cy = y + 46;
    cy = sectionTitle(ctx, "Personality", "— 心理学研究を参考にした独自プロフィール", x, cy);
    drawText(ctx, "高い・低いに良し悪しはありません。どちらの側にも持ち味があります。", x, cy, {
      font: gothic(13), color: C.faint,
    });
    cy += 30;
    bfKeys.forEach((tr) => {
      const t = D.traits[tr];
      drawText(ctx, t.jp, x, cy, { font: gothic(16), color: C.text });
      const jpW = ctx.measureText(t.jp).width;
      drawText(ctx, t.name, x + jpW + 10, cy, { font: mono(12), color: C.faint });
      drawText(ctx, String(result.bf[tr]), x + w, cy, {
        font: mono(18, 700), color: C.brand800, align: "right",
      });
      drawBar(ctx, x, cy + 12, w, 11, result.bf[tr]);
      drawText(ctx, t.lo, x, cy + 42, { font: gothic(12), color: C.faint });
      drawText(ctx, t.hi, x + w, cy + 42, { font: gothic(12), color: C.faint, align: "right" });
      cy += 72;
    });
    y += cardH + 20;
  }

  // --- Subject DNA
  if (result.subjectTop && result.subjectTop.length) {
    const cardH = 78 + result.subjectTop.length * 44;
    const { x, w } = drawCard(ctx, y, cardH);
    let cy = y + 46;
    cy = sectionTitle(ctx, "Subject DNA", "— 好きな科目（性格スコアには影響しません）", x, cy);
    cy += 12;
    result.subjectTop.forEach((d) => {
      drawText(ctx, d.label, x, cy + 4, { font: gothic(16), color: C.text });
      drawBar(ctx, x + 200, cy - 6, w - 260, 11, d.score);
      drawText(ctx, String(d.score), x + w, cy + 4, {
        font: mono(16, 700), color: C.brand800, align: "right",
      });
      cy += 44;
    });
    y += cardH + 20;
  }

  // --- Practice DNA
  if (result.practiceTop && result.practiceTop.length) {
    const cardH = 106 + result.practiceTop.length * 48;
    const { x, w } = drawCard(ctx, y, cardH);
    let cy = y + 46;
    cy = sectionTitle(ctx, "Practice DNA", "— 興味のある実務領域", x, cy);
    drawText(ctx, "経験がない領域は「これから」なだけです。コア=好き×やりたい、フロンティア=未経験×やりたい。", x, cy, {
      font: gothic(13), color: C.faint,
    });
    cy += 32;
    result.practiceTop.forEach((d) => {
      drawText(ctx, d.label, x, cy + 4, { font: gothic(16), color: C.text });
      drawBar(ctx, x + 230, cy - 6, w - 470, 11, d.score);
      drawText(ctx, String(d.score), x + w - 160, cy + 4, {
        font: mono(16, 700), color: C.brand800, align: "right",
      });
      // バッジ
      let bx = x + w - 148;
      const badges = [];
      if (d.core) badges.push(["コア", C.brand50, C.brand300, C.brand800]);
      if (d.frontier) badges.push(["フロンティア", C.amberBg, C.amberBd, C.amber]);
      if (d.exp) badges.push(["経験あり", C.muted, C.border, C.secondary]);
      badges.forEach(([label, bg, bd, fg]) => {
        ctx.font = gothic(12, 600);
        const bw = ctx.measureText(label).width + 18;
        ctx.fillStyle = bg;
        roundRect(ctx, bx, cy - 11, bw, 22, 11);
        ctx.fill();
        ctx.strokeStyle = bd;
        ctx.lineWidth = 1;
        ctx.stroke();
        drawText(ctx, label, bx + 9, cy + 4, { font: gothic(12, 600), color: fg });
        bx += bw + 6;
      });
      cy += 48;
    });
    y += cardH + 20;
  }

  // --- Study Behavior（各指標1問なのでバーではなく3段のタグで見せる。画面表示と揃える）
  const groups = studyGroups(result);
  if (groups.length) {
    const contentW = SHEET_WIDTH - PAD * 2 - 64;
    // タグは幅で折り返すため、カード高さを決める前に行数を測っておく
    const laid = groups.map((g) => {
      const style = TAG_STYLE[g.key];
      ctx.font = gothic(14, style.weight);
      const rows = [[]];
      let used = 0;
      g.names.forEach((name) => {
        const tw = ctx.measureText(name).width + 22;
        if (used && used + tw > contentW) { rows.push([]); used = 0; }
        rows[rows.length - 1].push({ name, tw });
        used += tw + 8;
      });
      return { g, style, rows };
    });
    const cardH = 100 + laid.reduce((sum, l) => sum + 24 + l.rows.length * 36, 0);
    const { x } = drawCard(ctx, y, cardH);
    let cy = y + 46;
    const label = studyLabel(result);
    cy = sectionTitle(ctx, "Study Behavior", label ? `— ${label}` : "", x, cy);
    drawText(ctx, "各指標1問の回答をそのまま並べたものです。点数でも学習タイプの判定でもありません。", x, cy, {
      font: gothic(13), color: C.faint,
    });
    cy += 34;
    laid.forEach(({ g, style, rows }) => {
      drawText(ctx, g.title, x, cy, { font: mono(13, 700), color: style.title });
      const titleW = ctx.measureText(g.title).width;
      drawText(ctx, g.note, x + titleW + 12, cy, { font: gothic(12), color: C.faint });
      cy += 12;
      rows.forEach((row) => {
        let tx = x;
        row.forEach(({ name, tw }) => {
          ctx.fillStyle = style.bg;
          roundRect(ctx, tx, cy, tw, 28, 14);
          ctx.fill();
          ctx.strokeStyle = style.border;
          ctx.lineWidth = 1;
          if (style.dash) ctx.setLineDash([4, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
          drawText(ctx, name, tx + 11, cy + 19, {
            font: gothic(14, style.weight), color: style.fg,
          });
          tx += tw + 8;
        });
        cy += 36;
      });
      cy += 12;
    });
    y += cardH + 20;
  }

  // --- 日々の傾向
  {
    const lines = habitLines(result, code);
    const cardH = 74 + lines.length * 34;
    const { x, w } = drawCard(ctx, y, cardH);
    let cy = y + 46;
    cy = sectionTitle(ctx, "日々の傾向", "", x, cy);
    cy += 10;
    lines.forEach((line) => {
      drawText(ctx, line.k, x, cy, { font: mono(12), color: C.faint });
      drawParagraph(ctx, line.v, x + 130, cy, w - 130, {
        font: gothic(15), color: C.text, lineHeight: 24,
      });
      cy += 34;
    });
    y += cardH + 20;
  }

  // --- フッター
  {
    const { x, w } = drawCard(ctx, y, 152);
    let cy = y + 40;
    drawText(ctx, "この画像はお使いのブラウザ内で生成しました。回答も結果もサーバーには保存されていません。", x, cy, {
      font: gothic(14, 600), color: C.brand800,
    });
    cy += 26;
    cy = drawParagraph(ctx, D.DISCLAIMER_RESULT, x, cy, w, {
      font: gothic(13), color: C.secondary, lineHeight: 22,
    });
    drawText(ctx, `作成 ${formatDate(new Date())}  ·  #会計人プロフィール`, x, y + 128, {
      font: mono(12), color: C.faint,
    });
    y += 152 + PAD;
  }

  // --- 実寸で切り出す
  const out = document.createElement("canvas");
  out.width = SHEET_WIDTH * SCALE;
  out.height = Math.round(y * SCALE);
  const octx = out.getContext("2d");
  octx.drawImage(src, 0, 0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// ---------------------------------------------------------------- 書き出し

function formatDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function safeName(str) {
  return String(str).replace(/[\\/:*?"<>|]/g, "_");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** PNG プロフィールシートを保存する。 */
export async function downloadSheet(result, code) {
  const canvas = await renderProfileSheet(result, code);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("画像を生成できませんでした");
  downloadBlob(
    blob,
    `会計人プロフィール_${safeName(D.types[code].name)}_${formatDate(new Date())}.png`
  );
}

/** 回答の生データ + スコアを JSON で保存する（読み込めば結果を再表示できる）。 */
export function downloadJson(result, code, ans, ops) {
  const payload = {
    app: "accounting-profile",
    schema: 1,
    exportedAt: new Date().toISOString(),
    note: "このファイルはお使いのブラウザ内で生成されました。サーバーには送信・保存されていません。会計人プロフィールのトップ画面から読み込むと結果を再表示できます。",
    archetype: { code, name: D.types[code].name, copy: D.types[code].copy },
    scores: {
      workStyle: result.axes.map((a) => ({
        axis: a.ax.name,
        pole: a.letter === a.ax.L ? a.ax.lName : a.ax.rName,
        score: a.pct,
        bipolar: a.tie,
      })),
      personality: result.bf,
      subjectDna: result.subjectTop,
      practiceDna: result.practiceTop,
      studyBehavior: result.study,
      studyGroups: studyGroups(result).map((g) => ({ tier: g.key, label: g.title, items: g.names })),
      studyLabel: studyLabel(result) || null,
    },
    // 生データ。将来の設問改訂に備え項目単位で保持する（設計書 §12）。
    raw: { answers: ans, operations: ops },
    disclaimer: D.DISCLAIMER_RESULT,
  };
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `会計人プロフィール_${safeName(D.types[code].name)}_${formatDate(new Date())}.json`
  );
}

/** 保存した JSON を読み込んで回答データを取り出す。 */
export function parseSavedFile(text) {
  const data = JSON.parse(text);
  if (data.app !== "accounting-profile" || !data.raw || !data.raw.answers) {
    throw new Error("会計人プロフィールの保存ファイルではないようです。");
  }
  const answers = {};
  for (const [key, value] of Object.entries(data.raw.answers)) {
    const idx = Number(key);
    if (!Number.isInteger(idx)) continue;
    if (value === "NA" || (typeof value === "number" && value >= -2 && value <= 2)) {
      answers[idx] = value;
    }
  }
  const operations = {};
  for (const [key, value] of Object.entries(data.raw.operations || {})) {
    if (Array.isArray(value)) operations[key] = value.filter((v) => typeof v === "string");
  }
  if (!Object.keys(answers).length) throw new Error("回答データが読み取れませんでした。");
  return { answers, operations };
}
