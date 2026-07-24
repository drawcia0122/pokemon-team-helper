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
`8.5.22` へ固定するためのものです。アプリがPostCSSを直接利用するための設定では
ありません。Next.jsを更新する際はoverrideが引き続き必要か再評価し、Next.js側の
依存だけで安全なバージョンになる場合は削除してください。

### Sharp / libvipsのnpm audit例外

2026-07-22時点で、Next.js 15.5.20のoptional dependencyである
Sharp 0.34.5が継承するlibvipsの脆弱性により、`npm audit`はhigh 2件を
報告します。修正済みのSharp 0.35系はNext.js 15.5.20の要求範囲
`^0.34.3`の外であり、`npm audit fix --force`はNext.js 14系への破壊的な
変更を提案するため適用しません。これはアプリコード起因ではなく、
安全な互換修正がない依存ライブラリ由来の例外として記録します。
Next.js更新時にSharpの依存範囲と例外の必要性を再評価してください。

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

### ポケモン小型スプライト（試験導入）

ポケモン表示には、`data/pokemon.json` に保存済みの明示的なPokéAPI数値IDを使い、
[PokeAPI/sprites](https://github.com/PokeAPI/sprites) の通常・正面・静止PNGを
`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/<ID>.png`
から外部参照します。画像本体はリポジトリへ保存せず、ブラウザからPokéAPI APIへ
問い合わせません。未対応ID、URL不正、404、読込失敗、CSP拒否時は従来の文字表示へ
戻るため、利用停止や取得元の差し替えが可能です。

本サイトは非公式です。Pokémonおよび関連する名称・画像の権利は各権利者に帰属します。
spritesリポジトリは画像内容を株式会社ポケモンの著作物と明記しており、PokeAPIによる
配布が第三者権利の処理や本サイトでの利用許諾を保証するものではありません。試験導入の
継続可否は、表示品質・通信量とあわせて別途確認します。

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

## Pokemon Showdown環境データ

Pokemon Showdownの対戦をSmogonが集計した月次`chaos` JSONを、format・cutoffごとの
静的snapshotへ正規化する基盤があります。この統計は公式Pokémon HOMEまたは
Pokémon Championsの使用率ではありません。`/environment`で使用率TOP50と、
技、持ち物、特性、能力配分、味方、苦手な相手の軽量表示を確認できます。
定期更新はまだ実装していません。
技・持ち物・特性・性格は固定版のPokéAPI日本語データから生成した
`data/environment/localization/ja.json`を使い、Showdown内部IDを画面へ出しません。
構築補助の要警戒診断では、最新のシングル・cutoff 1760 snapshotから
使用率、採用率20%以上の攻撃技、主な特性、味方、Checks and Countersだけを
軽量JSONへ書き出します。候補は各フォーム自身の使用率が0.1%以上のものに限定し、
使用率が不明なフォームや0.1%未満のフォームはスコア計算前に除外します。
通常フォームの使用率をメガフォームへ継承しません。20MB級の元snapshotはブラウザへ送りません。

### チームアドバイザー

構築補助のチームアドバイザーは、使いたい1匹を選んだ時点から6匹完成まで、
現在の登録数に応じて次の採用候補を案内します。登録数から構築段階を純関数で判定し、
人数が変わるたびに評価目的と推薦を更新します。

| 登録数 | phase | 評価目的 |
| --- | --- | --- |
| 0体 | `empty` | ランキングを出さず、使いたい最初の1匹の選択を案内 |
| 1体 | `partner` | 軸との防御・攻撃・役割の相互補完が良い相棒を提案 |
| 2体 | `coreCompletion` | 2匹に共通する課題を補い、構築の核を完成させる3匹目を提案 |
| 3〜5体 | `situationalCoverage` | 未解決の脅威や不足役割へ回答し、残り枠で大きな穴を埋める候補を提案 |
| 6体 | `completeOptimization` | 完成済みパーティをTASK037の入れ替えシミュレーションで改善 |

1〜5体では、既存メンバーを失わない「次の空き枠への追加」だけを順位付けします。
6体になった時点で追加提案を終了し、抜くポケモンの役割損失も評価する入れ替え改善案へ
切り替えます。追加と入れ替えは前提となる損失が異なるため、同じランキングへ混在させません。
同一species、使用不可フォーム、メガ枠上限などにより追加できない候補は、理由を示して無効化します。

M-Bの正式な採用上限はメガシンカポケモン2体のままです。そのうえで段階型Advisorは、
構築の核となる1〜3体目ではメガ候補を最大1体に絞り、最初に選んだメガを軸に通常ポケモンとの
補完を組みやすくします。4〜6体目では、追加後の実登録数とメガ数を基準に合計2体まで候補へ
含めます。禁止対象はスコア計算後に隠すのではなく、候補と操作対象の組み合わせを作る段階で
除外し、総合・防御・攻撃・役割・タイプ別・通常構築・トリックルームで同じ判定を共有します。

6体完成後は、入れ替え後のメガ数が2体以内の案だけを評価します。通常枠を3体目のメガへ
入れ替える案は除外し、メガ同士の入れ替えは合計2体以内なら許可します。同一species内の
フォーム変更は人数を増やさず、変更後のメガ数と現在の構築段階の上限で判定します。
localStorageや構築記事から読み込んだ既存の複数メガ構築は自動削除・通常化せず、そのまま保持し、
新しいメガ候補だけを除外します。

推薦はTASK037のEvidence基盤を再利用します。実採用技、タイプ相性、防御特性、
要警戒相手への回答分類、追加・交換前後の脅威、役割、構築プロファイル、環境妥当性、
新しく生じるリスクを一度だけ評価し、同じ事実を複数項目へ重複加点しません。
各phaseでは共通のEvidenceを目的に応じた比率で集約し、古いタイプ数中心の別スコアは使いません。
相棒phaseの正の素点上限80はリスク控除後に0〜100へ正規化し、他phaseも0〜100の段階内尺度で表示します。
環境使用率は最大5点、`teammates`は最大5点の補助評価に限定し、それだけで順位を決めません。
単タイプと複合タイプも、タイプ数ではなく現在の課題への回答力で比較します。

TASK040以降は、画面の要警戒ランキング、Advisor、Candidate Explorer、Team Detail、
入れ替えシミュレーションが同じThreat Snapshotを参照します。Snapshotは
`currentDisplayedTop5`、内部追跡用の`trackedThreats`、全順位、解析条件を保持し、
追加・交換後は別のSnapshotから`postActionTop5`を再計算します。
`trackedThreats`と交換前後の和集合は推薦順位の内部評価には利用しますが、
現在の主要理由や注意文の代わりにはしません。

推薦順位を決めるRecommendation Scoreと表示理由は分離しています。Evidenceには
選択中の脅威、現在TOP5、追加・交換後TOP5、内部追跡、phase固有、チーム全体の
scopeを付け、Explanation Builderがphaseと表示モードに応じて選択します。
候補カードは「おすすめ理由」「その他の改善」「注意点」を分離し、同じEvidenceを
複数区分へ重複表示しません。新しいTOP5警告は使用率0.1%以上で、追加・交換後の
実順位が5位以内になった場合だけ表示します。

攻撃面の判定は、環境で実際に採用されている技の威力・命中率・STABなどから求める
攻撃圧力の概算です。確定数を含む実ダメージ計算ではありません。Showdown環境データの
`teammates`も相棒としての併用実績を示す小さな補助Evidenceであり、データがない候補を減点しません。

既存の「要警戒ポケモン」と要警戒5体別の対策探索は、危険な相手と個別対策を見る機能として
段階型アドバイザーと共存します。同一species内のフォーム変更も、通常の空き枠追加候補や
入れ替え候補とは分離して表示します。6体時はTASK037の評価経路をそのまま使い、
交換前後TOP5の和集合、新規脅威、役割損失、メガ枠機会費用、フォーム変更案を維持します。

`npm run test:advisor-mega`は段階別メガ上限、全推薦モード、完成後の入れ替え、
フォーム変更、既存データ、Undo再計算をTASK039のGolden fixtureとして固定します。
`npm run test:advisor-progressive`は0〜6体のphase、追加専用ランキング、相互補完、
単タイプ公平性、通常／トリックルーム、追加・Undo互換、6体時のTASK037順位を
Golden fixtureとして固定します。`npm run test:advisor-explanation`は画面TOP5との一致、
Evidence scope、TOP5警告、使用率条件、phase別の理由選択、通常／トリックルーム、
TASK039のメガ段階制御をTASK040のGolden fixtureとして固定します。
推薦は構築候補を比較するための参考情報であり、
勝率、勝敗、安全な受けを確定的に予測するものではありません。持ち物を含む型の組み合わせ、
型クラスタ、テラスタイプまでの詳細評価は今後の拡張課題です。

```bash
# fixtureによる正規化・検証・安全な書き込みテスト
npm run test:environment

# 書き込まずに2026年6月M-Bシングル上位統計を確認
npm run environment:collect -- \
  --period 2026-06 \
  --format gen9championsbssregmb \
  --cutoff 1760 \
  --dry-run
```

Pokemon HOMEは公開APIと再利用許可を確認できないため、policyにより自動通信を禁止して
います。対象format、保存形式、alias、ライセンス、商用利用時の確認事項は
[docs/ENVIRONMENT_DATA.md](/Users/drawcia0122/Codex/Pokémon/docs/ENVIRONMENT_DATA.md)
を参照してください。

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
