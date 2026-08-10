// アーキタイプ別の静的ページ（/t/{CODE}/index.html）を 16 枚生成する。
//
// なぜ必要か:
//   結果は URL のハッシュ（#p=…）に入れている。ハッシュは HTTP リクエストに含まれず、
//   X のクローラーは JavaScript も実行しないため、1 枚の index.html では結果ごとに
//   og:image を変えられない。GitHub Pages はクエリ文字列でも配信を切り替えられない。
//   変えられるのはパスだけなので、アーキタイプ単位でページを事前生成する。
//
//   各ページは og:image にそのアーキタイプのキャラクター画像を持ち、本体は同じ
//   src/app.js を読み込む。app.js は /t/{CODE}/ のパスを見てそのアーキタイプを表示し、
//   #p=… が付いていれば共有された Work Style を復元する。
//
// 実行:
//   node scripts/build-archetype-pages.mjs
//   （data.js のアーキタイプや画像を変えたら再実行してコミットする）

import { mkdir, writeFile, rm, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { types, typeOrder, animals } from "../src/data.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// GitHub Pages の公開 URL。og:image / og:url は絶対 URL である必要がある。
// 独自ドメインに移す場合はここだけ変える。
const SITE = "https://norimaki-audit.github.io/accounting-profile";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const exists = (p) => access(p).then(() => true, () => false);

function page(code, hasImage) {
  const tp = types[code];
  const animal = animals[code];
  const title = `${tp.name}（${animal}） — 会計人プロフィール`;
  const desc = `「${tp.copy}」${tp.tokucho} — 性格・仕事の進め方・好きな科目・興味のある実務・勉強のしかたを5つの別レイヤーで可視化するプロフィールメーカー。`;
  const url = `${SITE}/t/${code}/`;
  // 720×720 の正方形。twitter:card=summary は正方形サムネイルで表示されるため、
  // 中央を切られずにキャラクターが出る（summary_large_image は 1.91:1 に切り抜かれる）。
  // 画像が未用意のアーキタイプでは og:image を出さない（404 を指すと壊れたカードになる）。
  const image = `${SITE}/assets/archetypes/${code}.jpg`;
  const imageTags = hasImage
    ? `    <meta property="og:image" content="${image}">
    <meta property="og:image:width" content="720">
    <meta property="og:image:height" content="720">
    <meta property="og:image:alt" content="${esc(`${tp.name}のキャラクター（${animal}）`)}">
    <meta name="twitter:image" content="${image}">
`
    : "";

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <meta name="color-scheme" content="light">
    <link rel="canonical" href="${url}">

    <link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="../../assets/apple-touch-icon.png">

    <meta property="og:type" content="website">
    <meta property="og:site_name" content="会計人プロフィール">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(`「${tp.copy}」${tp.tokucho}`)}">
${imageTags}    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(`「${tp.copy}」${tp.tokucho}`)}">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../../design-system/norimaki.css">
    <link rel="stylesheet" href="../../styles/app.css">
  </head>
  <body>
    <div id="app"></div>
    <noscript>
      <div style="max-width:640px;margin:0 auto;padding:2rem 1rem">
        <h1>${esc(tp.name)}（${esc(animal)}）</h1>
        <p>「${esc(tp.copy)}」</p>
        <p>${esc(tp.tokucho)}</p>
        <p>この診断はブラウザ内だけで採点するため、JavaScript が必要です。有効にしてから再読み込みしてください。</p>
      </div>
    </noscript>
    <script type="module" src="../../src/app.js"></script>
  </body>
</html>
`;
}

const outDir = join(ROOT, "t");
await rm(outDir, { recursive: true, force: true });
const withoutImage = [];
for (const code of typeOrder) {
  const hasImage = await exists(join(ROOT, "assets", "archetypes", `${code}.jpg`));
  if (!hasImage) withoutImage.push(code);
  const dir = join(outDir, code);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), page(code, hasImage), "utf8");
}
console.log(`generated ${typeOrder.length} pages under t/`);
if (withoutImage.length) {
  console.warn(
    `warning: og:image なしで生成したアーキタイプ: ${withoutImage.join(", ")}\n` +
    `  assets/archetypes/{CODE}.jpg（720x720）を置いてから再実行するとカードに絵が出ます。`
  );
}
