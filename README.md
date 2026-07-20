# ポケモン タイプ相性補完ツール

Next.js + TypeScript で作った、Pokémon Champions 向けのタイプ相性補完ツールです。  
2〜6体のチームを入力すると、チーム全体の弱点や耐性を可視化し、次に入れると補完になりやすいタイプ候補とポケモン候補を表示します。

## セットアップ方法

このプロジェクトは Node.js 22.23.1 を使用します。`nvm` を利用する場合は、
プロジェクトルートの `.nvmrc` から同じバージョンへ切り替えてください。

```bash
nvm install
nvm use
```

GitHub Actionsも `.nvmrc` を参照し、ローカルと同じNode.js 22系で
依存関係のインストール、記事収集、検証、ビルドを実行します。

```bash
npm ci
```

### PostCSSのセキュリティ固定

`package.json` のscoped overrideは、Next.js配下の脆弱なPostCSSを安全な
`8.5.10` へ固定するためのものです。アプリがPostCSSを直接利用するための設定では
ありません。Next.jsを更新する際はoverrideが引き続き必要か再評価し、Next.js側の
依存だけで安全なバージョンになる場合は削除してください。

もっと簡単に起動したい場合は、依存関係を自動確認してから開発サーバを起動する次のコマンドも使えます。

```bash
npm run app
```

Mac では [start-app.command](/Users/drawcia0122/Codex/Pokémon/start-app.command) をダブルクリックでも起動できます。
起動後は `http://localhost:3000` を自動で開くようにしています。

## 開発サーバ起動方法

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開いてください。

## GitHub Pages向け静的build

通常のローカルbuildはNext.jsのproduction server向けに生成し、basePathを付けません。
開発サーバとproduction serverは従来どおり `/`、`/builds`、`/news` で利用できます。

```bash
# basePathなしの通常production build
npm run build
npm start

# /pokemon-team-helperをbasePathにしてout/へ静的export
npm run build:pages

# Pages用export、内部リンク、CSP、workflowを検証
npm run test:pages
```

`build:pages`は `GITHUB_PAGES=true` を設定してNext.jsをbuildします。この値が
厳密に文字列 `true` の場合だけ `output=export`、`basePath=/pokemon-team-helper`、
`trailingSlash=true` を適用します。通常buildではこれらを設定せず、`npm start`で
production serverを起動できます。
サブパス公開にはNext.jsの `basePath` が内部リンクと `_next` 資産へ自動適用されるため、
CDN向けの `assetPrefix` は設定していません。`trailingSlash: true` により、
`out/builds/index.html` と `out/news/index.html` を生成します。`out/`はGit管理対象外です。

従来Next.jsのHTTPレスポンスヘッダーで設定していた画像CSPは、静的HTMLの
`Content-Security-Policy` metaへ移しています。許可するのは同一origin、data URL、
および構築記事サムネイル検証で許可済みの外部ホストだけです。GitHub Pagesでは
HTTPレスポンスヘッダーをリポジトリから設定できないため、metaより前に読み込まれる
resourceには適用できない制約があります。画像URLのhost・path検証も引き続き主防御として
維持します。

`.github/workflows/deploy-pages.yml` はmainへのpushまたは手動実行で検証と静的buildを行い、
成功した `out/` だけを `github-pages` environmentへ渡します。実行前にリポジトリの
Settings → Pages → Build and deployment → Sourceで `GitHub Actions` を選択してください。
Pages設定を変更するまではworkflowを実行しないでください。

## データ生成スクリプト実行方法

このアプリ本体はローカル JSON を読むだけです。  
PokeAPI を使うのは `scripts/fetchPokemonData.ts` のみです。

```bash
npm run data:fetch
```

レギュレーションM-Aの使用可能ポケモンは、確認済みの日本語リストから再生成できます。

```bash
npm run data:seed-season1
```

コマンド名は既存環境との互換用です。全ポケモンを無条件に使用可能にはしません。

## 使用可能ポケモンの管理方法

使用可能ポケモンはシーズンごとに複製せず、ルール定義で管理します。

- M-A: [data/regulations/regulation-m-a.json](/Users/drawcia0122/Codex/Pokémon/data/regulations/regulation-m-a.json)
- M-B: [data/regulations/regulation-m-b.json](/Users/drawcia0122/Codex/Pokémon/data/regulations/regulation-m-b.json)
- シーズンとルールの対応: [data/appMeta.json](/Users/drawcia0122/Codex/Pokémon/data/appMeta.json)

M-1とM-2はM-A、M-3とM-4はM-Bを参照します。ポケモン候補ランキングと使用不可警告は、選択中シーズンに対応するルールの `allowedPokemonSlugs` を基準にします。

### 使用可能ポケモンデータの確認元と件数

使用可能ポケモンは、Pokémon Champions公式の Eligible Pokémon 一覧を確認元としています。

- M-A: [シーズンM-1公式案内](https://champions-news.pokemon-home.com/en/page/746.html) / [公式Eligible Pokémon一覧](https://web-view.app.pokemonchampions.jp/battle/pages/events/rs177501629259kmzbny/en/pokemon.html)
- M-B: [シーズンM-4公式案内](https://champions-news.pokemon-home.com/en/page/795.html) / [公式Eligible Pokémon一覧](https://web-view.app.pokemonchampions.jp/battle/pages/events/rs178289804983hadfbv/en/pokemon.html)

公式一覧の名称を [data/pokemon.json](/Users/drawcia0122/Codex/Pokémon/data/pokemon.json) の slug へ対応付け、重複を除いた結果がM-Aの213件、M-Bの235件です。M-Bの公式対象にはM-Aより22件多いフォルム別エントリーが含まれます。これらはリージョンフォームや性別・姿違いなどを個別slugとして数えたアプリ内の使用可能エントリー数であり、全国図鑑上のポケモンの種類数ではありません。

データ検証では、slugが `pokemon.json` に存在すること、重複がないこと、M-Aが213件、M-Bが235件の共有プールとして参照されることを確認します。

## 新シーズン追加方法

同じルールを使うシーズンは、[data/appMeta.json](/Users/drawcia0122/Codex/Pokémon/data/appMeta.json) の `seasons` へ定義を追加します。新しいルールを使う場合だけ `data/regulations` へルール定義を追加し、[lib/regulations.ts](/Users/drawcia0122/Codex/Pokémon/lib/regulations.ts) へ登録します。

初期シーズンは、開催中、開始日が新しい、`displayOrder` が大きい、定義配列の先頭、の順で決定します。保存済みの有効なシーズンは初期値より優先して復元します。

## アプリの使い方

1. 上部のシーズン選択から対象シーズンを選びます。ルールはシーズンから自動決定されます
2. チーム入力で 2〜6 体のメンバーを入力します
3. ポケモン指定か、単タイプ / 複合タイプ指定を切り替えます
4. チーム全体の相性表で一貫弱点や厚い耐性を確認します
5. 下部の候補タイプ / 候補ポケモンを選ぶと、追加前後の比較が見られます
6. 候補カードの `チームに追加` を押すと、空き枠へそのまま反映できます

## 構築記事の自動収集

構築記事は、手動データを優先しながら、自動収集データを分離して読み込みます。
自動収集記事は、6体を正確に確認できた `complete` と、記事メタデータだけを掲載する
`metadata-only` の2段階です。後者はポケモン名検索とパーティ取り込みの対象外です。
記事カバー画像は許可済みの外部URLだけを保持し、画像本体は保存しません。画像がない場合や
読み込みに失敗した場合は、CSSで作成した構築記事用表示へ切り替わります。依存パッケージの
追加はありません。

```bash
# 書き込まずに候補・抽出結果を確認
npm run collect:builds:dry-run

# 許可された出典を収集して生成JSONを更新
npm run collect:builds

# noteだけを収集
npm run collect:builds:note

# はてなブログだけを通常フィード（最新30件）から収集
npm run collect:builds:hatena

# はてなブログをJSONへ書き込まず確認
npm run collect:builds:hatena:dry-run

# 初回・明示実行時だけ過去100件フィードを確認
npm run collect:builds:hatena:backfill

# 手動確認済みシードと既存記事リンクからブログ候補を検証・登録
npm run discover:build-blogs
npm run discover:build-blogs:dry-run

# parserVersion更新後に既知候補を再評価
npm run collect:builds:reevaluate
npm run collect:builds:reevaluate:dry-run

# 公開数、完全性、判定・除外理由を集計
npm run report:build-extraction

# Pokesolは現行利用規約により通信せず disabled-by-policy になる
npm run collect:builds:pokesol

# fixtureによる収集・除外・安全制御テスト
npm run test:build-collection
npm run test:build-hatena
npm run test:build-discovery

# サムネイル表示とフォールバックのテスト
npm run test:build-ui
```

掲載条件、通信制限、出典ごとの利用方針は
[docs/BUILD_ARTICLE_POLICY.md](/Users/drawcia0122/Codex/Pokémon/docs/BUILD_ARTICLE_POLICY.md)
を参照してください。GitHub Actionsでは毎時17分と47分に実行し、全検証を通過した場合
のみ `data/buildArticles.generated.json` と実行状態を更新します。候補URLと巡回位置は
`data/buildArticleCollectionStatus.json` に保存し、新規・未確認候補を優先しながら
1回30記事の上限をまたいで巡回します。はてなブログは本文を含まないAtom/RSSを先に確認し、
候補になった記事だけを取得します。手動実行の `backfill: true` だけがブログごとの
過去100件フィードを使い、1ブログ30記事・全体150記事を上限にします。定期実行は
軽量な最新30件フィードのままです。確認済み候補の再確認は30分単位で開始位置を
分散し、単なる実行日時や確認日時の変化だけでは自動コミットしません。
ブログ探索と既知候補の一括再評価は定期実行へ含めず、GitHub Actionsの
`discover_blogs` / `reevaluate_articles` を指定した手動実行時だけ行います。

## 公式ニュース・イベント情報の収集

既存の手動7件は`data/pokemonContent.manual.json`で保護し、自動生成データを`data/pokemonContent.generated.json`へ分離する基盤を用意しています。現在は自動取得の許可を安全に確認できたソースがないため、全ソースを規約保留とし、generatedは0件です。本文・画像は保存しません。

```bash
npm run collect:content:dry-run
npm run collect:content
npm run test:content-collection
```

現在の収集コマンドは保留状態を表示し、外部通信やデータ更新を行いません。RSS parserと安全制御はfixtureで検証します。

ソース調査、通信制限、Actionsの運用方針は
[docs/POKEMON_CONTENT_COLLECTION.md](/Users/drawcia0122/Codex/Pokémon/docs/POKEMON_CONTENT_COLLECTION.md)
に記載しています。

## 追加した改善点

- ポケモン選択欄に検索入力を追加
- 候補タイプ / 候補ポケモンからそのままチームへ追加可能
- シーズン選択とチーム内容をローカル保存して再読込後も復元
- `npm run app` と `start-app.command` で起動を簡単化し、ブラウザも自動で開く

## 構成メモ

- [lib/typeChart.ts](/Users/drawcia0122/Codex/Pokémon/lib/typeChart.ts)
  タイプ相性の pure function とチーム集計
- [lib/scoring.ts](/Users/drawcia0122/Codex/Pokémon/lib/scoring.ts)
  補完候補のスコアリング
- [lib/regulations.ts](/Users/drawcia0122/Codex/Pokémon/lib/regulations.ts)
  レギュレーション切替と allowed ポケモン計算
- [lib/pokemonSearch.ts](/Users/drawcia0122/Codex/Pokémon/lib/pokemonSearch.ts)
  日本語名 / 英語名 / slug 検索
- [types/pokemon.ts](/Users/drawcia0122/Codex/Pokémon/types/pokemon.ts)
  型定義

## 今後の拡張案

- 特性やふゆう、もらいびのような無効化を考慮する
- 技範囲や役割を加味して、受けだけでなく攻撃補完も評価する
- Champions の実レギュレーション詳細や使用率データを反映する
