// 会計人プロフィール — 設問・軸・アーキタイプの全データ。
// 出典: CPA TYPE 設計書 §7（設問全文）/ §9（16アーキタイプ）/ 移行計画書 §4-5・§8-9。
// すべてオリジナル項目。将来 JSON 差し替え可能な形で保持する。

export const choices = [
  { v: 2, label: "とても当てはまる" },
  { v: 1, label: "やや当てはまる" },
  { v: 0, label: "どちらともいえない" },
  { v: -1, label: "あまり当てはまらない" },
  { v: -2, label: "まったく当てはまらない" },
];

// Personality（Big Five）30問。t=設問, tr=特性, d=方向(+1/-1)
// profile.dropBF の 5 問を除外して 25 問（各特性 5 問）で運用する。
export const bigfive = [
  { t: "初対面の人が多い場では、自分から話しかけるほうだ", tr: "E", d: 1 },
  { t: "会話では、聞き役より話し役になっていることが多い", tr: "E", d: 1 },
  { t: "大人数の集まりのあとは、どっと疲れを感じる", tr: "E", d: -1 },
  { t: "雑談の輪に自分から入っていくことは少ない", tr: "E", d: -1 },
  { t: "何かを考えるとき、誰かと話しながらのほうが進む", tr: "E", d: 1 },
  { t: "一日誰とも話さなくても、あまり苦にならない", tr: "E", d: -1 },
  { t: "相手の主張に反対のときも、まず相手の意図を汲もうとする", tr: "A", d: 1 },
  { t: "困っている同僚がいると、自分の作業を中断して手を貸すことが多い", tr: "A", d: 1 },
  { t: "議論では、関係の維持より正しさを優先しがちだ", tr: "A", d: -1 },
  { t: "人の失敗を見ると、背景事情より先に原因の指摘をしてしまう", tr: "A", d: -1 },
  { t: "頼まれごとを断るのが苦手だ", tr: "A", d: 1 },
  { t: "意見の対立があっても、あまり気をつかわず率直に言うほうだ", tr: "A", d: -1 },
  { t: "締切がまだ先でも、作業をいくつかの区切りに分けて進めることが多い", tr: "C", d: 1 },
  { t: "提出前に、一度確認した数値でも改めて確認することが多い", tr: "C", d: 1 },
  { t: "やるべきことを、その日の気分で後回しにすることがある", tr: "C", d: -1 },
  { t: "机の上やPCのフォルダの整理は、後回しになりがちだ", tr: "C", d: -1 },
  { t: "決めた手順やルールは、多少面倒でも守るほうだ", tr: "C", d: 1 },
  { t: "作業時間の見積もりが甘く、直前に慌てることがある", tr: "C", d: -1 },
  { t: "想定外の指摘を受けても、わりとすぐ気持ちを切り替えられる", tr: "S", d: 1 },
  { t: "忙しい時期でも、睡眠や食事のリズムは大きく崩れないほうだ", tr: "S", d: 1 },
  { t: "小さなミスを、あとまで引きずってしまうことがある", tr: "S", d: -1 },
  { t: "期限が近づくと、必要以上に不安になることがある", tr: "S", d: -1 },
  { t: "気分の浮き沈みは少ないほうだ", tr: "S", d: 1 },
  { t: "忙しさが重なると、些細なことでいらいらしやすい", tr: "S", d: -1 },
  { t: "新しい基準や制度改正の話を聞くと、まず「面白そう」と感じる", tr: "O", d: 1 },
  { t: "自分のやり方を、定期的に新しい方法に置き換えてみたくなる", tr: "O", d: 1 },
  { t: "慣れたやり方があるなら、わざわざ変えたいとは思わない", tr: "O", d: -1 },
  { t: "専門外の分野の本や記事もよく読む", tr: "O", d: 1 },
  { t: "抽象的な議論より、具体的な手順の話のほうが好きだ", tr: "O", d: -1 },
  { t: "「もしこうだったら」という仮定の話を考えるのが好きだ", tr: "O", d: 1 },
];

export const traits = {
  E: { name: "Extraversion", jp: "外向性", lo: "少人数・集中型", hi: "対話・発信型" },
  A: { name: "Agreeableness", jp: "協調性", lo: "率直・課題優先型", hi: "調和・関係優先型" },
  C: { name: "Conscientiousness", jp: "誠実性", lo: "柔軟・即応型", hi: "計画・秩序型" },
  S: { name: "Emotional Stability", jp: "情動安定性", lo: "感受・慎重型", hi: "平静・回復型" },
  O: { name: "Openness", jp: "開放性", lo: "実際・安定型", hi: "探究・変化型" },
};
export const traitOrder = ["E", "A", "C", "S", "O"];

// Work Style（独自4軸・16問）ax=軸index, p=「当てはまる」が指す極, na=「経験なし」選択肢あり
export const style = [
  { t: "資料を見るとき、まず個々の数値が正確かどうかが気になる", ax: 0, p: "P" },
  { t: "明細の細部より、全体の構造や増減の傾向から見るほうだ", ax: 0, p: "B" },
  { t: "小さな金額のズレでも、原因が分かるまで落ち着かない", ax: 0, p: "P" },
  { t: "細かい突合作業より、ビジネス全体の話をしているときのほうが楽しい", ax: 0, p: "B", na: true },
  { t: "結論より先に、その根拠となる資料がそろっているかを確認したくなる", ax: 1, p: "V" },
  { t: "数字を見ると「もしかしてこうでは」という仮説が先に浮かぶ", ax: 1, p: "X" },
  { t: "前例や基準に当てはめて説明できると安心する", ax: 1, p: "V" },
  { t: "決まった答えのない論点を考えるのが好きだ", ax: 1, p: "X" },
  { t: "仕事や勉強は、最初に段取りを決めてから着手したい", ax: 2, p: "S" },
  { t: "予定変更や割り込み対応は、むしろ得意なほうだ", ax: 2, p: "A" },
  { t: "チェックリストやフォーマットを自分で作りがちだ", ax: 2, p: "S" },
  { t: "計画づくりに時間をかけるより、走りながら調整したい", ax: 2, p: "A" },
  { t: "難しい論点は、まず一人でじっくり調べて考えたい", ax: 3, p: "D" },
  { t: "考えを整理するときは、人と話しながらのほうが進む", ax: 3, p: "C" },
  { t: "チームで分担するより、一人で完結する作業のほうが集中できる", ax: 3, p: "D" },
  { t: "自分の結論は、固まる前に人にぶつけて反応を見たい", ax: 3, p: "C" },
];

export const styleAxes = [
  { name: "視座", L: "P", R: "B", lName: "精密", rName: "俯瞰", lDesc: "ディテール・数値の正確性志向", rDesc: "全体構造・ビジネス文脈志向", lNode: "精密レンズ", rNode: "俯瞰レンズ" },
  { name: "推論", L: "V", R: "X", lName: "検証", rName: "探索", lDesc: "根拠・基準への当てはめ重視", rDesc: "仮説形成・未知の論点重視", lNode: "検証コンパス", rNode: "探索コンパス" },
  { name: "進め方", L: "S", R: "A", lName: "構造", rName: "適応", lDesc: "計画・標準化・段取り重視", rDesc: "即応・走りながらの調整重視", lNode: "構造エンジン", rNode: "適応エンジン" },
  { name: "作業様式", L: "D", R: "C", lName: "深掘", rName: "協働", lDesc: "独立・単独深掘り", rDesc: "対話・共同作業", lNode: "深掘モード", rNode: "協働モード" },
];

// Study Behavior（8問・各1問=参考値）
export const study = [
  { t: "勉強は、週単位や日単位の計画を立ててから始めることが多い", ind: "計画性" },
  { t: "同じ論点を、日を空けて何度かに分けて復習するほうだ", ind: "分散学習" },
  { t: "一度理解した論点でも、数日後に何も見ずに思い出してみることがある", ind: "想起練習" },
  { t: "テキストを完全に読み終える前から、問題を解き始めるほうだ", ind: "演習先行" },
  { t: "間違えた問題は、答えよりも「なぜ間違えたか」を確認する", ind: "エラー分析" },
  { t: "計算手順だけでなく、「なぜそう処理するのか」まで納得しないと先に進みにくい", ind: "概念理解" },
  { t: "人に説明できる状態になって、はじめて理解した気がする", ind: "説明学習" },
  { t: "忙しい時期でも、短時間でも毎日勉強にふれるようにしている", ind: "継続性" },
];

// アーキタイプ 16 種（key = 極の並び 軸1軸2軸3軸4）
export const types = {
  PVSD: { name: "精密検証官", copy: "1円のズレの向こうに、真実がある。", tokucho: "細部の正確性と根拠がそろってはじめて安心するタイプ。", tsuyomi: "高精度の検証・突合、誤りの早期発見", fuka: "曖昧な指示のまま走らされる状況", kankyo: "手順と品質基準が明確な現場", katsuyaku: "決算検証・残高確認・精査", chui: "完璧主義による時間超過", kyodo: "俯瞰型に前提の言語化を頼むと速い", prompt: "orderly grid of numbers, one figure illuminated by a beam of verification light, serene deep green and paper white, abstract minimal", c: ["#0a4c46", "#8fbcb5"] },
  PVSC: { name: "品質ガーディアン", copy: "チームの品質は、最後の砦が決める。", tokucho: "チェック体制の要として全体の品質を守るタイプ。", tsuyomi: "レビューでの検出力、基準の一貫適用", fuka: "品質軽視のスピード至上な進め方", kankyo: "レビュー文化が根づいた組織", katsuyaku: "レビュー・品質管理・統制運用", chui: "指摘が細かく受け取られること", kyodo: "指摘に重要度を添えると伝わる", prompt: "gate and shield watching over a flow of documents, calm green lantern light, abstract minimal", c: ["#083d38", "#4f948b"] },
  PVAD: { name: "数字の探偵", copy: "数字が合ったことより、なぜそうなったのかが気になる。", tokucho: "異常値・差異の原因究明に没頭するタイプ。", tsuyomi: "差異分析、原因の仮説と検証の往復", fuka: "原因不明のまま締めさせられる状況", kankyo: "調査の裁量がある現場", katsuyaku: "差異分析・原因調査・不正の予兆把握", chui: "深追いによる納期圧迫", kyodo: "調査範囲と時間の合意を先に", prompt: "a sea of numbers and tables where one anomalous figure glows, converging threads pointing to a single cause, noir green and amber, abstract minimal", c: ["#1a3a36", "#c9a25a"] },
  PVAC: { name: "決算オペレーター", copy: "動く現場で、正確に着地させる。", tokucho: "割り込みの多い実務でも精度を保って締め切るタイプ。", tsuyomi: "実行力、現場での即応と正確さの両立", fuka: "終わりのない抽象議論", kankyo: "明確な締切とチームワーク", katsuyaku: "決算・締め作業の実行と着地", chui: "目先対応に寄り改善が後回しに", kyodo: "構造型に段取り設計を任せる", prompt: "rotating gears and a calendar, a ledger landing precisely on its mark, warm workshop light, abstract minimal", c: ["#3d4a42", "#a8b8a0"] },
  PXSD: { name: "基準設計士", copy: "ルールの行間を、設計図に変える。", tokucho: "基準・制度の構造を読み解き文書に落とすタイプ。", tsuyomi: "会計方針の起草、論理の一貫性", fuka: "場当たり的な運用の追認", kankyo: "調査・起草の時間が確保される場", katsuyaku: "基準対応・会計方針・意見書", chui: "理論が現場実態より先行しがち", kyodo: "現場の実態情報を早めにもらう", prompt: "articles and standards assembling into an architectural blueprint on a drafting table, ink green lines, abstract minimal", c: ["#2e4050", "#9ab4c4"] },
  PXSC: { name: "仕組み化アーキテクト", copy: "二度目からは、仕組みにやらせる。", tokucho: "プロセスの標準化・自動化を設計するタイプ。", tsuyomi: "業務フロー構築、再発防止の仕組み化", fuka: "属人運用が放置される環境", kankyo: "改善提案が通る組織", katsuyaku: "統制設計・経理DX・標準化", chui: "仕組みづくり自体が目的化", kyodo: "運用者の声を設計に取り込む", prompt: "messy paper and spreadsheets transforming into a clean automated circuit of flows, teal and copper, abstract minimal", c: ["#144a44", "#b0885a"] },
  PXAD: { name: "独立深掘り職人", copy: "狭く、深く、誰よりも遠くまで。", tokucho: "一つの論点を徹底的に掘り下げる探究者。", tsuyomi: "難論点の突破、一次資料への執着", fuka: "頻繁な割込みと浅い並行作業", kankyo: "集中時間と裁量のある場", katsuyaku: "難論点調査・専門的検討", chui: "共有・報告が後回しになる", kyodo: "中間共有の締切を自分で設定", prompt: "a vertical shaft of layered ledgers descending into depth, a single beam of light going down, abstract minimal", c: ["#26323a", "#7a94a0"] },
  PXAC: { name: "業務改善エンジニア", copy: "現場の「困った」を、その場で直す。", tokucho: "対話しながら手を動かして改善するタイプ。", tsuyomi: "現場課題の発見と素早い改善", fuka: "改善権限のない定型作業の連続", kankyo: "現場との距離が近い組織", katsuyaku: "経理改善・ツール導入・効率化", chui: "やりかけの改善が散らかる", kyodo: "構造型と効果測定を組む", prompt: "tangled arrows untangling one by one into an automated circuit, workshop warmth, green and signal orange, abstract minimal", c: ["#3a4a34", "#c4a860"] },
  BVSD: { name: "ナレッジビルダー", copy: "調べたことは、資産に変える。", tokucho: "知識を体系化・文書化して組織に残すタイプ。", tsuyomi: "全体像の整理、マニュアル・研修設計", fuka: "暗黙知だらけで記録されない職場", kankyo: "ナレッジ共有が評価される場", katsuyaku: "標準文書・教育・引き継ぎ設計", chui: "網羅性にこだわり重くなる", kyodo: "利用者の使う場面から逆算する", prompt: "bookshelves connected like circuits, glowing index threads branching through a library, abstract minimal", c: ["#4a3e2e", "#c0aa80"] },
  BVSC: { name: "チームコーディネーター", copy: "全員の進捗が、私のダッシュボード。", tokucho: "全体を見ながら人と段取りを整えるタイプ。", tsuyomi: "進行管理、ボトルネックの察知", fuka: "役割が不明瞭な体制", kankyo: "調整・マネジメントが評価される場", katsuyaku: "決算統括・プロジェクト管理", chui: "自分の作業時間が消えていく", kyodo: "品質の砦は検証型に任せる", prompt: "multiple lanes of light quietly tuned at one control node, a calm control room, green and slate, abstract minimal", c: ["#2f4a4a", "#a0b8b0"] },
  BVAD: { name: "事業解像アナリスト", copy: "数字の裏の、事業を見る。", tokucho: "ビジネスの文脈から数字を読み解くタイプ。", tsuyomi: "増減分析の物語化、KPI設計", fuka: "文脈のない集計作業の連続", kankyo: "事業側との接点がある場", katsuyaku: "分析・FP&A・DDの基礎分析", chui: "細部の検証を飛ばしがち", kyodo: "精密型とペアで精度を担保", prompt: "financial statements turning translucent, a factory and street scene emerging behind the figures, abstract minimal", c: ["#3a4456", "#b0a890"] },
  BVAC: { name: "対話型コンサルタント", copy: "答えはいつも、相手との対話の中にある。", tokucho: "対話から課題を特定し翻訳するタイプ。", tsuyomi: "ヒアリング力、専門知識の平易な説明", fuka: "孤独な内部作業の連続", kankyo: "顧客・他部署との接点が多い場", katsuyaku: "顧問対応・アドバイザリー", chui: "その場の約束が先行しがち", kyodo: "実行部隊と早めに握る", prompt: "two chairs facing each other, numbers and words weaving a bridge between them, warm evening light, abstract minimal", c: ["#5a4a3a", "#d8bc8e"] },
  BXSD: { name: "論点ハンター", copy: "まだ誰も気づいていない論点を、先に見つける。", tokucho: "網羅的なリサーチから論点を発見するタイプ。", tsuyomi: "論点の先回り、リスクの早期提示", fuka: "与えられた論点を潰すだけの作業", kankyo: "調査時間が確保される場", katsuyaku: "税務・会計論点の発掘、初期検討", chui: "論点を広げすぎて収束しない", kyodo: "優先度付けは協働で行う", prompt: "a deep forest made of documents, standards and numbers, an unknown issue glowing far within, abstract minimal", c: ["#1e3a2e", "#88b098"] },
  BXSC: { name: "クロスドメイン型", copy: "専門の境界線に、一番おいしい仕事がある。", tokucho: "会計×税務×IT等、領域を横断して翻訳するタイプ。", tsuyomi: "横断案件の全体設計、専門家間の通訳", fuka: "単一領域への固定", kankyo: "部門横断プロジェクト", katsuyaku: "M&A・IPO等の総合案件", chui: "「どれも中途半端」と感じる時期がある", kyodo: "各領域の専門家を早くつなぐ", prompt: "maps of different colors overlapping, a new road appearing along the boundary lines, abstract minimal", c: ["#3a3a50", "#a89ec0"] },
  BXAD: { name: "仮説ドリブン探索者", copy: "まず仮説。検証はそれからだ。", tokucho: "大胆な仮説と高速な学習で未知に挑むタイプ。", tsuyomi: "初動の速さ、筋の良い当たりづけ", fuka: "仮説を許さない前例主義", kankyo: "試行錯誤が許容される場", katsuyaku: "新規業務・調査の立ち上げ", chui: "検証不足のまま確信しがち", kyodo: "検証型のレビューを必ず通す", prompt: "a nautical chart at night with several dotted routes drawn, one route beginning to glow, abstract minimal", c: ["#1c2c40", "#7ea0b8"] },
  BXAC: { name: "変革プロトタイパー", copy: "議論より、動くたたき台。", tokucho: "まず作って見せることで組織を動かすタイプ。", tsuyomi: "たたき台の速さ、巻き込み力", fuka: "承認プロセスだらけの環境", kankyo: "小さく試せる文化", katsuyaku: "DX・新サービス・体制変更の起点", chui: "完成度・引き継ぎへの無頓着", kyodo: "品質型・構造型に仕上げを託す", prompt: "an unfinished model radiating light in a workshop, people gathering around it, abstract minimal", c: ["#4a3040", "#c894a0"] },
};

export const typeOrder = [
  "PVSD", "PVSC", "PVAD", "PVAC", "PXSD", "PXSC", "PXAD", "PXAC",
  "BVSD", "BVSC", "BVAD", "BVAC", "BXSD", "BXSC", "BXAD", "BXAC",
];

// アーキタイプの象徴キャラクター（動物）。
// 画像は assets/archetypes/{CODE}.jpg（結果画面）と assets/archetypes/thumb/{CODE}.jpg
// （一覧・マーキー）に置く。画像が無いコードは自動でグラデーション表示にフォールバックし、
// ファイルを追加すればコード変更なしで表示される（availableCharacters() が実在を確認する）。
export const animals = {
  PVSD: "ハリネズミ", PVSC: "シェパード", PVAD: "フクロウ", PVAC: "ライオン",
  PXSD: "ツル", PXSC: "クモ", PXAD: "モグラ", PXAC: "ビーバー",
  BVSD: "リス", BVSC: "コーギー", BVAD: "タカ", BVAC: "オウム",
  BXSD: "キツネ", BXSC: "カメレオン", BXAD: "イルカ", BXAC: "ネコ",
};

export const characterImage = (code) => `./assets/archetypes/${code}.jpg`;
export const characterThumb = (code) => `./assets/archetypes/thumb/${code}.jpg`;

let availablePromise = null;

/** 実在するキャラクター画像のコード一覧。1度だけ判定し、以降はキャッシュを返す。 */
export function availableCharacters() {
  if (!availablePromise) {
    availablePromise = Promise.all(
      typeOrder.map((code) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(code);
        img.onerror = () => resolve(null);
        img.src = characterThumb(code);
      }))
    ).then((codes) => codes.filter(Boolean));
  }
  return availablePromise;
}

// 極ごとの傾向文（断定を避け「〜しやすい」の表現に留める）
export const habits = {
  V: "意見が割れたら、まず根拠と基準に立ち返る",
  X: "意見が割れたら、第三の選択肢を出したくなる",
  D: "結論が出ないときは、一度持ち帰ってひとりで整理する",
  C: "結論が出ないときは、まず全員の意見を聞いて回る",
  S: "締切前は、前倒しでほぼ着地している",
  A: "締切前は、直前の集中力で一気に追い込む",
  P: "調べ物は、一次資料・原典まで潜って確かめる",
  B: "調べ物は、まず全体像と結論から掴みにいく",
};

export const profile = {
  // Personality 25問化: 重複・社会的望ましさの強い 5 問を除外（設計書 §20）
  dropBF: [4, 10, 16, 22, 28],
  subjectGroups: {
    "公認会計士系": ["財務会計論", "管理会計論", "監査論", "租税法", "企業法", "経営学"],
    "税理士系": ["簿記論", "財務諸表論", "法人税法", "所得税法", "消費税法", "相続税法", "その他税法"],
    "簿記・その他": ["商業簿記", "工業簿記", "原価計算", "会計学"],
  },
  groupOptions: ["公認会計士系", "税理士系", "簿記・その他", "受験経験なし"],
  practiceDomains: [
    "経理・決算", "連結", "開示", "監査", "J-SOX・内部統制", "IPO", "税務", "財務DD",
    "バリュエーション", "M&A", "管理会計", "FP&A", "業務改善", "IT・データ分析",
    "AI活用", "顧客折衝", "マネジメント", "会計基準・論点調査",
  ],
  ops: [
    { id: "S0", t: "経験した（している）試験・資格は？", kind: "groups", max: 4, hint: "科目リストの表示切替に使います（スコア外・複数可）" },
    { id: "S1", t: "勉強していて、一番苦にならなかった科目は？", kind: "subject", max: 2, w: 2, hint: "最大2つ" },
    { id: "S2", t: "理解できたとき、一番面白かった科目は？", kind: "subject", max: 1, w: 3, hint: "1つ" },
    { id: "S3", t: "今でも調べたくなる・人に説明したくなる科目は？", kind: "subject", max: 2, w: 2, hint: "最大2つ" },
    { id: "P1", t: "経験がある実務領域は？", kind: "practice", max: 99, w: 0, hint: "なければ「とくになし」でOK。スコアには影響しません（経験の有無を適性とは扱いません）", none: true },
    { id: "P2", t: "好きだ・面白いと感じる領域は？", kind: "practice", max: 3, w: 2, hint: "未経験でも興味でOK。最大3つ" },
    { id: "P3", t: "今後やりたい領域は？", kind: "practice", max: 3, w: [3, 2, 1], ranked: true, hint: "選んだ順に1位→3位（最大3つ）" },
  ],
};

export const DISCLAIMER_HOME =
  "本サービスは心理学研究（IPIP等の公開心理尺度）を参考にした独自の自己理解コンテンツです。心理検査・能力検査・採用・人事評価を目的としたものではありません。求人推薦・適職判定も行いません。会計人同士の会話とSNSでの見せ合いをお楽しみください。";

export const DISCLAIMER_RESULT =
  "本サービスは心理学研究を参考にした独自の自己理解コンテンツです。心理検査・能力検査・採用・人事評価を目的としたものではありません。結果は行動傾向・好みの表現であり、職業適性の判定ではありません。";
