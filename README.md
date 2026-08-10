# accounting-profile — 画像の原本（`sources` ブランチ）

**このブランチはウェブサイトではありません。** 原本を失わないための保管庫です。

GitHub Pages はこのリポジトリの `main` だけを配信しているため、
ここに置いたファイルが公開サイトから配信されることはありません。
（設定: Pages source = `main` / `/`）

## 中身

```
originals/    16アーキタイプの原画（PNG 1254×1254・各 約2.1〜2.6MB・合計約36MB）
              manifest.md にコード / アーキタイプ名 / 動物 / ファイル名の対応表
```

出所は `accounting-profile-archetypes-complete.zip`（2026-08-09 受領）。
zip を展開したもので、内容は同一です。

## `main` に入っているもの（派生物）

`main` には縮小した JPEG だけを置いています。原本を入れていないのは、
16枚で36MBあり、GitHub Pages がそのまま配信してしまうためです。

| | サイズ | 目安 | 用途 |
|---|---|---|---|
| `assets/archetypes/{CODE}.jpg` | 720×720 | 112〜147KB | 結果画面・PNGシート・共有カード |
| `assets/archetypes/thumb/{CODE}.jpg` | 320×320 | 25〜32KB | 図鑑カード・トップの帯 |

書き出し設定はすべて共通です。ベースライン JPEG / 4:2:0 /
メタデータなし（JFIF のみ、ICC は付けない）。

## 原本を差し替え・追加したときの手順

```bash
# 1. このブランチに原本を追加してコミット
git switch sources
cp 新しい原画.png originals/{CODE}_....png
git add -A && git commit -m "…" && git push

# 2. main 側で 720px / 320px に変換して配置
git switch main
magick originals/{CODE}_....png -resize 720x720^ -gravity center -extent 720x720 \
  -strip -sampling-factor 4:2:0 -interlace none -quality 82 \
  assets/archetypes/{CODE}.jpg
magick originals/{CODE}_....png -resize 320x320^ -gravity center -extent 320x320 \
  -strip -sampling-factor 4:2:0 -interlace none -quality 82 \
  assets/archetypes/thumb/{CODE}.jpg

# 3. アーキタイプ別ページの og:image を更新
node scripts/build-archetype-pages.mjs
```

ImageMagick が無い環境では、ブラウザの canvas でも同じ結果が出せます
（1254→720→320 の段階縮小、JPEG 品質 0.88）。その場合 canvas が ICC
プロファイルを付けるので、JFIF 以外の APPn セグメントを落としてください。

## 絵柄の共通仕様

擬人化した動物1体が主役。正面〜3/4、上半身または机に向かって着席。
クラシックな職業服（ベスト、シャツ、襟章）。会計の小道具で埋めた濃密な環境
（帳簿、伝票、グラフ、ランプ、書棚）。デスクランプ等の実光源による暖かい
リムライト。濃緑＋真鍮/琥珀を基調に、アーキタイプの2色（`src/data.js` の `c`）へ寄せる。
正方形いっぱいの構図、被写体は中央、**文字は入れない**。絵画的なデジタルイラスト。
