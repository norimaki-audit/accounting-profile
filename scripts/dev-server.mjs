// 開発用の静的サーバー（依存パッケージなし）。
// ES モジュールを使うため file:// では動かない。ローカル確認はこれを使う。
//
//   node scripts/dev-server.mjs
//   → http://localhost:4173
//
// 本番は GitHub Pages がそのまま配信する。ビルド手順はない。

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 4173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (pathname.endsWith("/")) pathname += "index.html";

    const filePath = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
    if (!filePath.startsWith(ROOT)) throw new Error("outside root");

    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, "index.html") : filePath;
    const body = await readFile(target);

    res.writeHead(200, {
      "content-type": TYPES[extname(target).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`404 Not Found: ${req.url}`);
  }
}).listen(PORT, () => {
  console.log(`会計人プロフィール — http://localhost:${PORT}`);
});
