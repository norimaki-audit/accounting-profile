// 結果の持ち出し（ダウンロード）。
//
// 本アプリは結果をサーバーに保存しないため、結果を手元に残す手段は
// 「結果画面を開いている間に PNG プロフィールシートを保存する」ことだけ。
// 画像生成もファイル書き出しもすべてブラウザ内で完結する（外部送信なし）。
//
// 以前は JSON でも書き出していたが、保存したい人にとって画像で足りるため廃止した。
// 「回答の続きから再開する」用途は localStorage の下書き（state.js）が担っている。

import * as D from "./data.js";
import { archetypeModifier, habitLines, missingLayers, studyGroups, studyLabel } from "./scoring.js";

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

// DNA タグの配色（画面側の nm-badge / nm-badge--brand / nm-badge--warning に対応）
const DNA_TAG_STYLE = {
  "面白い": [C.brand50, C.brand300, C.brand800],
  "コア": [C.brand50, C.brand300, C.brand800],
  "フロンティア": [C.amberBg, C.amberBd, C.amber],
};
const DNA_TAG_PLAIN = [C.muted, C.border, C.secondary];

/** Subject / Practice DNA の 1 行（科目・領域名 + 理由タグ）。 */
function drawDnaRow(ctx, d, x, y) {
  drawText(ctx, d.label, x, y + 4, { font: gothic(16), color: C.text });
  let tx = x + 240;
  d.tags.forEach((label) => {
    const [bg, bd, fg] = DNA_TAG_STYLE[label] || DNA_TAG_PLAIN;
    ctx.font = gothic(13, 600);
    const bw = ctx.measureText(label).width + 20;
    ctx.fillStyle = bg;
    roundRect(ctx, tx, y - 11, bw, 24, 12);
    ctx.fill();
    ctx.strokeStyle = bd;
    ctx.lineWidth = 1;
    ctx.stroke();
    drawText(ctx, label, tx + 10, y + 5, { font: gothic(13, 600), color: fg });
    tx += bw + 7;
  });
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

  // 修飾語があるぶんだけ、ヒーローの各行を下へずらす
  const mod = archetypeModifier(result);
  drawText(ctx, "YOUR ARCHETYPE", PAD, y + (mod ? 88 : 96), {
    font: mono(13), color: "rgba(255,255,255,.78)",
  });
  if (mod) {
    drawText(ctx, mod, PAD, y + 124, { font: mincho(24, 400), color: "rgba(255,255,255,.9)" });
  }
  drawText(ctx, tp.name, PAD, y + (mod ? 178 : 156), { font: mincho(52), color: "#ffffff" });
  const animal = D.animals[code];
  if (animal) {
    drawText(ctx, animal, PAD, y + (mod ? 210 : 190), {
      font: gothic(15, 600), color: "rgba(255,255,255,.82)",
    });
  }
  drawParagraph(ctx, `「${tp.copy}」`, PAD, y + (mod ? 246 : 226), heroTextWidth, {
    font: mincho(22, 400), color: "rgba(255,255,255,.94)", lineHeight: 34,
  });
  drawParagraph(
    ctx,
    "Work Style（仕事の進め方）から作るラベルです。心理タイプの判定ではありません。",
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
    cy = sectionTitle(ctx, "Work Style", "— 仕事の進め方（優劣ではありません）", x, cy);
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
      // 僅差の軸は持ち味として小さなタグで（画面側 .ap-axis-soft と対応）
      if (a.soft) {
        const label = "どっちもいける";
        ctx.font = gothic(12, 600);
        const bw = ctx.measureText(label).width + 18;
        ctx.fillStyle = C.brand50;
        roundRect(ctx, x, cy + 36, bw, 22, 11);
        ctx.fill();
        ctx.strokeStyle = C.brand300;
        ctx.lineWidth = 1;
        ctx.stroke();
        drawText(ctx, label, x + 9, cy + 51, { font: gothic(12, 600), color: C.brand800 });
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

  // --- Subject DNA（1項目1行。数値は出さず、選ばれた理由をタグで並べる）
  if (result.subjectTop && result.subjectTop.length) {
    const cardH = 104 + result.subjectTop.length * 42;
    const { x } = drawCard(ctx, y, cardH);
    let cy = y + 46;
    cy = sectionTitle(ctx, "Subject DNA", "— 好きな科目（性格スコアには影響しません）", x, cy);
    drawText(ctx, "点数ではなく、その科目を選んだ理由をそのまま並べています。", x, cy, {
      font: gothic(13), color: C.faint,
    });
    cy += 30;
    result.subjectTop.forEach((d) => {
      drawDnaRow(ctx, d, x, cy);
      cy += 42;
    });
    y += cardH + 20;
  }

  // --- Practice DNA
  if (result.practiceTop && result.practiceTop.length) {
    const cardH = 104 + result.practiceTop.length * 42;
    const { x } = drawCard(ctx, y, cardH);
    let cy = y + 46;
    cy = sectionTitle(ctx, "Practice DNA", "— 興味のある実務領域", x, cy);
    drawText(ctx, "経験がない領域は「これから」なだけです。コア=好き×やりたい、フロンティア=未経験×やりたい。", x, cy, {
      font: gothic(13), color: C.faint,
    });
    cy += 30;
    result.practiceTop.forEach((d) => {
      drawDnaRow(ctx, d, x, cy);
      cy += 42;
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
    // コアだけで保存した場合、何が載っていないシートなのかを画像自体に残す
    const missing = missingLayers(result);
    const footerH = missing.length ? 178 : 152;
    const { x, w } = drawCard(ctx, y, footerH);
    let cy = y + 40;
    if (missing.length) {
      drawText(ctx, `未回答のレイヤー: ${missing.map((m) => m.name).join(" / ")}（続きを答えると5レイヤーそろいます）`, x, cy, {
        font: gothic(13, 600), color: C.amber,
      });
      cy += 26;
    }
    drawText(ctx, "この画像はお使いのブラウザ内で生成しました。回答も結果もサーバーには保存されていません。", x, cy, {
      font: gothic(14, 600), color: C.brand800,
    });
    cy += 26;
    drawParagraph(ctx, D.DISCLAIMER_RESULT, x, cy, w, {
      font: gothic(13), color: C.secondary, lineHeight: 22,
    });
    drawText(ctx, `作成 ${formatDate(new Date())}  ·  #会計人プロフィール`, x, y + footerH - 24, {
      font: mono(12), color: C.faint,
    });
    y += footerH + PAD;
  }

  // --- 実寸で切り出す
  const out = document.createElement("canvas");
  out.width = SHEET_WIDTH * SCALE;
  out.height = Math.round(y * SCALE);
  const octx = out.getContext("2d");
  octx.drawImage(src, 0, 0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// ---------------------------------------------------------------- SNS 共有カード

// タイムラインで最大に出る 16:9。縦長のプロフィールシートとは別物で、
// 縮小されても読める 5 要素（動物・修飾語・名前・キャッチコピー・4軸）だけを載せる。
const CARD_W = 1200;
const CARD_H = 675;
const CARD_PAD = 56;
const CARD_ART = 340;          // 動物画像の一辺
const CARD_COL = CARD_PAD + CARD_ART + 44;   // 右カラムの左端
const SITE_LABEL = () => D.siteRoot().replace(/^https?:\/\//, "").replace(/\/$/, "");

/** カードの背景（アーキタイプの2色 + 暗い膜 + 装飾）。横長・正方形で共通。 */
function drawCardBackground(ctx, tp, w, h) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, tp.c[0]);
  grad.addColorStop(1, tp.c[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // 明るい配色のアーキタイプでも白文字が沈まないよう、一枚暗い膜をかける
  ctx.fillStyle = "rgba(0,0,0,.16)";
  ctx.fillRect(0, 0, w, h);
  [[210, 0.66, -0.08, 0.16, 12], [150, 0.86, 0.55, 0.13, -8], [110, 0.03, 0.72, 0.12, 24]]
    .forEach(([size, px, py, opacity, rot]) => {
      ctx.save();
      ctx.translate(w * px, h * py);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.strokeStyle = `rgba(255,255,255,${opacity})`;
      ctx.lineWidth = 3;
      roundRect(ctx, -size / 2, -size / 2, size, size, 4);
      ctx.stroke();
      ctx.restore();
    });
}

/** 性格の一言をピルで横に並べる。描いた右端を返す。 */
function drawPersonalityPills(ctx, labels, x, baseline) {
  let tx = x;
  labels.forEach((label) => {
    ctx.font = gothic(16, 600);
    const bw = ctx.measureText(label).width + 24;
    ctx.fillStyle = "rgba(255,255,255,.16)";
    roundRect(ctx, tx, baseline - 20, bw, 30, 15);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
    drawText(ctx, label, tx + 12, baseline, { font: gothic(16, 600), color: "#ffffff" });
    tx += bw + 8;
  });
  return tx - 8;
}

/**
 * 共有カードに載せる性格の一言。
 * 50 から十分離れた特性だけを、離れている順に 2 つまで。
 * 数値は載せない（カードの上で点数の顔をさせないため）。
 */
const PERSONALITY_TAG_MIN_GAP = 15;

function personalityTags(result) {
  if (!result || !result.bf) return [];
  return D.traitOrder
    .map((tr) => ({ tr, v: result.bf[tr] }))
    .filter((t) => t.v != null && Math.abs(t.v - 50) >= PERSONALITY_TAG_MIN_GAP)
    .sort((a, b) => Math.abs(b.v - 50) - Math.abs(a.v - 50))
    .slice(0, 2)
    .map((t) => `${D.traits[t.tr].jp} ${t.v >= 50 ? "高め" : "低め"}`);
}

/** 収まるまで字を詰める。長いアーキタイプ名（チームコーディネーター等）向け。 */
function fitFont(ctx, text, maxWidth, size, makeFont, min = 34) {
  let px = size;
  while (px > min) {
    ctx.font = makeFont(px);
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 2;
  }
  return makeFont(px);
}

/** 中心から勝ち極へ伸びる白いバー（カード用・数値は出さない）。 */
function drawCardAxisBar(ctx, x, y, w, h, pct, winLeft) {
  // 溝は暗くする。明るい配色のアーキタイプ（茶〜ベージュ系）だと
  // 白い溝では塗りとの差が出ず、どちらへ寄っているか読めなくなるため。
  ctx.fillStyle = "rgba(0,0,0,.28)";
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const center = x + w / 2;
  const span = (w / 2) * ((pct - 50) / 50);
  ctx.save();
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  if (winLeft) ctx.fillRect(center - span, y, span, h);
  else ctx.fillRect(center, y, span, h);
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(center, y - 4);
  ctx.lineTo(center, y + h + 4);
  ctx.stroke();
}

/**
 * X に添付する 1 枚。アーキタイプの 2 色を背景に、動物・名前・キャッチコピー・4軸を置く。
 * 4軸は数値を出さずバーだけにする（縮小時に読めないうえ、点数の顔をしてしまうため）。
 */
export async function renderShareCard(result, code, opts = {}) {
  // siteLabel は静的カードを書き出すとき用の上書き。開発サーバーで生成すると
  // localhost が焼き込まれてしまうため、本番のドメインを渡せるようにしている。
  const siteLabel = opts.siteLabel || SITE_LABEL();
  const tp = D.types[code];
  const animal = D.animals[code];
  const mod = archetypeModifier(result);
  const character = await loadImage(D.characterImage(code));

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * SCALE;
  canvas.height = CARD_H * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  drawCardBackground(ctx, tp, CARD_W, CARD_H);

  drawText(ctx, "A C C O U N T I N G   P R O F I L E", CARD_PAD, 66, {
    font: mono(14), color: "rgba(255,255,255,.72)",
  });
  drawText(ctx, "会計人16タイプ", CARD_W - CARD_PAD, 66, {
    font: gothic(16, 600), color: "rgba(255,255,255,.72)", align: "right",
  });

  // 動物。画像が未用意のアーキタイプでは枠を描かず、文字を全幅で組む
  // （空の額縁を置くと、絵の読み込みに失敗したように見えるため）。
  if (character) {
    ctx.save();
    roundRect(ctx, CARD_PAD, 112, CARD_ART, CARD_ART, 4);
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(character, CARD_PAD, 112, CARD_ART, CARD_ART);
    ctx.restore();
  }

  // 本文カラム
  const colX = character ? CARD_COL : CARD_PAD;
  const colW = CARD_W - CARD_PAD - colX;
  if (mod) {
    drawText(ctx, mod, colX, 196, { font: mincho(30, 400), color: "rgba(255,255,255,.92)" });
  }
  drawText(ctx, tp.name, colX, mod ? 274 : 252, {
    font: fitFont(ctx, tp.name, colW, 66, (px) => mincho(px), 40), color: "#ffffff",
  });
  if (animal) {
    drawText(ctx, animal, colX, mod ? 314 : 292, {
      font: gothic(20, 600), color: "rgba(255,255,255,.85)",
    });
  }
  // キャッチコピーは 1 行に収まるまで詰める。折り返すと「。」だけが次行に落ちる
  const copy = `「${tp.copy}」`;
  drawText(ctx, copy, colX, mod ? 374 : 352, {
    font: fitFont(ctx, copy, colW, 27, (px) => mincho(px, 400), 20),
    color: "rgba(255,255,255,.95)",
  });

  // 性格の傾向。際立った特性だけを 2 つまで、高め/低めの一言で添える
  // （数値は出さない。カード上で点数の顔をさせないため）
  drawPersonalityPills(ctx, personalityTags(result), colX, mod ? 424 : 402);

  ctx.strokeStyle = "rgba(255,255,255,.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CARD_PAD, 508);
  ctx.lineTo(CARD_W - CARD_PAD, 508);
  ctx.stroke();

  // 個人の結果が無いとき（アーキタイプ別ページの og:image 用）は
  // 4軸の代わりにタイプの説明と誘い文句を置く
  if (!result || !result.axes) {
    drawParagraph(ctx, tp.tokucho, CARD_PAD, 556, CARD_W - CARD_PAD * 2, {
      font: gothic(22), color: "rgba(255,255,255,.92)", lineHeight: 34,
    });
    drawText(ctx, "16問であなたのタイプが出ます", CARD_PAD, 606, {
      font: gothic(18, 600), color: "rgba(255,255,255,.7)",
    });
    drawText(ctx, "#会計人プロフィール", CARD_PAD, 644, {
      font: gothic(16, 600), color: "rgba(255,255,255,.8)",
    });
    drawText(ctx, siteLabel, CARD_W - CARD_PAD, 644, {
      font: mono(13), color: "rgba(255,255,255,.62)", align: "right",
    });
    return canvas;
  }

  // 4 軸 — 横 4 列。数値は出さない
  const cells = result.axes.length;
  const gutter = 30;
  const cellW = (CARD_W - CARD_PAD * 2 - gutter * (cells - 1)) / cells;
  result.axes.forEach((a, i) => {
    const x = CARD_PAD + i * (cellW + gutter);
    const winLeft = a.letter === a.ax.L;
    // 軸のあいだに仕切りを入れる。入れないと隣り合う極名（俯瞰 と 検証）が
    // ひと組の対に見えて、どのバーの見出しか分からなくなる。
    if (i > 0) {
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - gutter / 2, 544);
      ctx.lineTo(x - gutter / 2, 600);
      ctx.stroke();
    }
    drawText(ctx, a.ax.lName, x, 566, {
      font: gothic(18, winLeft ? 700 : 400),
      color: winLeft ? "#ffffff" : "rgba(255,255,255,.55)",
    });
    drawText(ctx, a.ax.rName, x + cellW, 566, {
      font: gothic(18, !winLeft ? 700 : 400),
      color: !winLeft ? "#ffffff" : "rgba(255,255,255,.55)",
      align: "right",
    });
    drawCardAxisBar(ctx, x, 582, cellW, 12, a.pct ?? 50, winLeft);
  });

  drawText(ctx, "#会計人プロフィール", CARD_PAD, 644, {
    font: gothic(16, 600), color: "rgba(255,255,255,.8)",
  });
  drawText(ctx, siteLabel, CARD_W - CARD_PAD, 644, {
    font: mono(13), color: "rgba(255,255,255,.62)", align: "right",
  });

  return canvas;
}

// ---------------------------------------------------------------- 正方形カード

// Instagram 用。IG はリンクカードを持たず、キャプションのリンクも押せないので、
// URL は画像の中に文字として入れておく（見た人が手で開くしかない）。
const SQ = 1080;
const SQ_PAD = 60;
const SQ_ART = 380;

/**
 * Instagram に貼るための 1:1 カード。
 * 横長カードと同じ要素を縦に積む。IG では画像しか手がかりが無いため、
 * 誘い文句と URL を必ず入れる。
 */
export async function renderSquareCard(result, code, opts = {}) {
  const tp = D.types[code];
  const animal = D.animals[code];
  const mod = archetypeModifier(result);
  const siteLabel = opts.siteLabel || SITE_LABEL();
  const character = await loadImage(D.characterImage(code));

  const canvas = document.createElement("canvas");
  canvas.width = SQ * SCALE;
  canvas.height = SQ * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  drawCardBackground(ctx, tp, SQ, SQ);

  const mid = SQ / 2;
  const inner = SQ - SQ_PAD * 2;

  drawText(ctx, "A C C O U N T I N G   P R O F I L E", SQ_PAD, 64, {
    font: mono(13), color: "rgba(255,255,255,.72)",
  });
  drawText(ctx, "会計人16タイプ", SQ - SQ_PAD, 64, {
    font: gothic(15, 600), color: "rgba(255,255,255,.72)", align: "right",
  });

  // 動物。未用意なら枠を描かず、その下の文字だけで見せる
  let y = 96;
  if (character) {
    ctx.save();
    roundRect(ctx, mid - SQ_ART / 2, y, SQ_ART, SQ_ART, 4);
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(character, mid - SQ_ART / 2, y, SQ_ART, SQ_ART);
    ctx.restore();
    y += SQ_ART;
  } else {
    y += 40;
  }

  y += mod ? 58 : 66;
  if (mod) {
    drawText(ctx, mod, mid, y, { font: mincho(28, 400), color: "rgba(255,255,255,.92)", align: "center" });
    y += 62;
  }
  drawText(ctx, tp.name, mid, y, {
    font: fitFont(ctx, tp.name, inner, 56, (px) => mincho(px), 36), color: "#ffffff", align: "center",
  });
  y += 38;
  if (animal) {
    drawText(ctx, animal, mid, y, { font: gothic(19, 600), color: "rgba(255,255,255,.85)", align: "center" });
    y += 44;
  }
  const copy = `「${tp.copy}」`;
  drawText(ctx, copy, mid, y, {
    font: fitFont(ctx, copy, inner, 25, (px) => mincho(px, 400), 18),
    color: "rgba(255,255,255,.95)", align: "center",
  });
  y += 16;

  // 性格の一言は中央寄せにしたいので、幅を測ってから左端を決める
  const tags = personalityTags(result);
  if (tags.length) {
    y += 40;
    ctx.font = gothic(16, 600);
    const w = tags.reduce((n, t) => n + ctx.measureText(t).width + 24, 0) + (tags.length - 1) * 8;
    drawPersonalityPills(ctx, tags, mid - w / 2, y);
  }

  // 4 軸は縦に 4 行。横長カードのような 4 列だと正方形では窮屈になる
  const axes = result && result.axes;
  const footTop = axes ? SQ - SQ_PAD - 246 : SQ - SQ_PAD - 150;
  ctx.strokeStyle = "rgba(255,255,255,.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(SQ_PAD, footTop);
  ctx.lineTo(SQ - SQ_PAD, footTop);
  ctx.stroke();

  if (axes) {
    axes.forEach((a, i) => {
      const ry = footTop + 32 + i * 36;
      const winLeft = a.letter === a.ax.L;
      drawText(ctx, a.ax.lName, SQ_PAD, ry, {
        font: gothic(16, winLeft ? 700 : 400),
        color: winLeft ? "#ffffff" : "rgba(255,255,255,.55)",
      });
      drawText(ctx, a.ax.rName, SQ - SQ_PAD, ry, {
        font: gothic(16, !winLeft ? 700 : 400),
        color: !winLeft ? "#ffffff" : "rgba(255,255,255,.55)", align: "right",
      });
      drawCardAxisBar(ctx, SQ_PAD + 78, ry - 13, inner - 156, 11, a.pct ?? 50, winLeft);
    });
  } else {
    drawParagraph(ctx, tp.tokucho, SQ_PAD, footTop + 40, inner, {
      font: gothic(19), color: "rgba(255,255,255,.92)", lineHeight: 30,
    });
  }

  drawText(ctx, "16問であなたのタイプが出ます", SQ_PAD, SQ - SQ_PAD - 38, {
    font: gothic(17, 600), color: "rgba(255,255,255,.72)",
  });
  drawText(ctx, "#会計人プロフィール", SQ_PAD, SQ - SQ_PAD, {
    font: gothic(16, 600), color: "rgba(255,255,255,.85)",
  });
  drawText(ctx, siteLabel, SQ - SQ_PAD, SQ - SQ_PAD, {
    font: mono(13), color: "rgba(255,255,255,.62)", align: "right",
  });

  return canvas;
}

/** 正方形カードを保存する（Instagram など、画像しか貼れない場所向け）。 */
export async function downloadSquareCard(result, code) {
  const canvas = await renderSquareCard(result, code);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("画像を生成できませんでした");
  downloadBlob(blob, `会計人プロフィール_${safeName(D.types[code].name)}_SNS.jpg`);
}

/**
 * 共有カードを File にする。Web Share API に渡せなければ null。
 * 写真主体のカードなので JPEG にする（PNG だと 3.5MB 程度になり、
 * スマホの共有シートに渡すには重い）。
 */
export async function buildShareFile(result, code) {
  if (typeof File !== "function" || !navigator.canShare) return null;
  const canvas = await renderShareCard(result, code);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) return null;
  const file = new File([blob], `accounting-profile-${code}.jpg`, { type: "image/jpeg" });
  return navigator.canShare({ files: [file] }) ? file : null;
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
