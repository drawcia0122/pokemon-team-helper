# Pokemon Showdown環境データ取得仕様

この基盤は、Pokemon Showdown上の対戦をSmogonが集計した月次統計を取得し、
静的snapshotへ正規化するものです。Pokémon HOMEまたはPokémon Champions公式の
使用率ではありません。

## 取得元とライセンス

- 公開元: `https://www.smogon.com/stats/`
- 対象: 各月の`chaos/*.json`
- 母集団: Pokemon Showdownの各formatで行われた対戦
- 更新: 月次。公開日は月初から遅れる場合があります
- ソフトウェア: Pokemon ShowdownサーバーはMIT Licenseです
- 統計データ: `www.smogon.com/stats/`配下の月次統計に、
  個別の明示的なデータライセンスは確認できていません
- 取得元URL、対象月、format、cutoff、取得日時、source hashをsnapshotへ保存します

Pokemon ShowdownサーバーコードのMIT Licenseを、統計データの再利用許諾とは
扱いません。snapshotには`datasetLicense: not-explicitly-stated`と
`softwareLicense: MIT`を分けて保存します。この基盤は攻略分析、記事本文、
推奨セットを取得しません。
商用利用、大量配布、取得頻度の拡大を行う場合は、SmogonおよびPokemon Showdownへ
利用条件を事前確認してください。

SmogonのUsage Statistics FAQとGen 9 Usage Statistics案内は、月次statsを公開し、
`chaos` JSONを利用者自身の分析へ使う方法を案内しています。このリポジトリでは
公開済み集計JSONだけを週1回・2 cutoff取得し、CAPTCHA回避、ログ取得、非公開API、
過剰な再試行を行いません。

- [Smogon Weighted Stats FAQ](https://www.smogon.com/forums/threads/weighted-stats-faq.3478570/)
- [Gen 9 Usage Statistics Discussion](https://www.smogon.com/forums/threads/gen-9-smogon-university-usage-statistics-discussion-thread.3711767/)

## 対象format

| sourceFormatId | ルール | 形式 | 能力配分 |
| --- | --- | --- | --- |
| `gen9championsbssregma` | M-A | シングル | Stat Points |
| `gen9championsbssregmb` | M-B | シングル | Stat Points |
| `gen9championsvgc2026regma` | M-A | ダブル | Stat Points |
| `gen9championsvgc2026regmb` | M-B | ダブル | Stat Points |

cutoffは`0`と`1760`だけを許可します。format、cutoff、対象月の異なるデータは
別snapshotとして保存し、結合または平均しません。

## 保存データ

`data/environment/snapshots/pokemon-showdown/<YYYY-MM>/`にsnapshotを保存し、
`data/environment/index.json`に一覧とformat/cutoffごとの最新snapshotを記録します。

indexの各Dataset Metadataは次を保持します。

- `datasetId`
- `source`、`sourceUrl`
- `fetchedAt`、`publishedAt`
- `regulation`、`season`、`cutoff`
- `minimumUsageRate`
- `schemaVersion`
- `checksum`
- `pokemonCount`

`fetchedAt`は取得日時、`publishedAt`はValidationとCompareを通過して公開した日時です。
画面の更新日は`fetchedAt`を表示し、公開日時とは混同しません。

TASK024からは`lib/environmentData.ts`の純粋関数を使い、formatとcutoffを
必ずペアで指定してsnapshot referenceを選択します。snapshot読み込みは
Next.jsのbuild時にサーバー側で行い、全20MB前後の統計をclient bundleへ
直接含めないでください。

`/environment`はServer Componentのbuild時に最新snapshotを読み、ランキング
TOP50だけをClient Componentへ渡します。詳細は`environment:export`が
content hashと日本語辞書hash別の軽量JSONへ分割し、クリックされた1体分だけを取得します。
snapshotまたは辞書が変わるとURLも変わり、古い表示名のcacheを再利用しません。
snapshot本体、`rawWeight`、TOP10以降の分布はブラウザへ送信しません。

構築補助の要警戒診断には`environment-data/_threats.json`を使用します。
ルールごとに最新のシングル・cutoff 1760を優先し、存在しない場合だけcutoff 0へ
フォールバックします。各ポケモンは使用率、能力配分から集約した物理／特殊型の比率、
上位8技、主な特性1件、味方3件、
Checks and Counters 3件だけを保持します。元snapshotの`rawWeight`は含めません。
採用技のタイプと物理・特殊・変化分類は、固定版PokéAPIから生成した
`data/environment/moveMetadata.json`を完全一致で参照します。

要警戒スコアはタイプ相性と種族値を最大72点、環境補正を最大28点として扱います。
環境補正は使用率最大20点、実採用攻撃技最大6点、主流の物理・特殊型2点です。
使用率0.1%は0点、20%以上は20点とし、中間は低使用率帯を強く抑える単調増加の補間テーブルで評価します。
使用率だけで順位が決まらないよう上限を設け、teammatesとChecks and Countersは
表示だけに使用してスコアへ加えません。
STEP 4のチームアドバイザーは要警戒一覧とは別の重みプロファイルを使いますが、
技・特性を含む相性判定は`lib/battleEffectiveness.ts`の同じ純関数を利用します。

実採用技は攻撃技だけを対象とし、採用率20%以上を主要技、10%以上20%未満を
補助警戒技として評価します。10%未満、変化技、日本語名を解決できない技は
スコアと主要理由へ使用しません。実採用攻撃技が存在する場合は、候補のタイプから
一致技を推測せず、保存済みの技タイプ・物理／特殊分類・採用率を優先します。
実採用攻撃技がない場合だけ、従来のタイプ一致範囲へフォールバックします。

相性判定は技ごとに、防御側の特性採用率と攻撃側の特性採用率を組み合わせた
期待倍率を計算します。無効特性は`ふゆう`、`もらいび`、`ちょすい`、`よびみず`、
`かんそうはだ`、`ひらいしん`、`でんきエンジン`、`そうしょく`、条件なしで判定できる
耐性は`あついしぼう`、`たいねつ`、`すいほう`、`こおりのりんぷん`、
`ふしぎなまもり`に対応します。攻撃側の`かたやぶり`、`テラボルテージ`、
`ターボブレイズ`はこれらの防御特性を無視します。特性採用率が不明な場合は、
speciesの理論特性を推測して確定扱いしません。

接触判定が必要な`もふもふ`、HP満タン条件の`マルチスケイル`と
`ファントムガード`は、現在の軽量snapshotに必要な条件がないため未評価です。
技の接触フラグや残HPを導入するまで、誤って常時耐性として扱いません。

要警戒候補の母集団は、同じ診断用snapshotに各フォーム自身の`usage.rate`があり、
その値が`0.001`（0.1%）以上のフォームだけです。この条件をスコア計算前に適用し、
条件を通過したフォームからspeciesごとの最高スコア1件を選びます。通常フォームの
使用率をメガフォームへ継承せず、使用率不明のフォームも候補へ含めません。

### 日本語表示辞書

技、持ち物、特性、性格はShowdownの内部IDを画面に直接表示せず、
`data/environment/localization/ja.json`の静的辞書をServer側で適用します。

- 生成元はPokéAPIリポジトリの固定commitにある日本語ゲーム名称CSVです。
- PokéAPIのidentifierをShowdownと同じ小文字・英数字IDにする処理は生成時だけ行います。
- 実行時は完全一致でのみ検索し、前方一致や推測変換は行いません。
- PokéAPI固定commitに未収録のChampions追加項目は
  `data/environment/localization/showdown-ja-overrides.json`で明示管理します。
- 辞書にないIDは「未対応」と表示し、`environment-localization` warningを1回出力します。
- 辞書内容はブラウザへ送らず、軽量detail JSONに日本語表示名だけを保存します。

辞書の更新は、取得元commitとoverrideをレビューした上で次を実行します。

```bash
npm run environment:localization:generate
npm run test:environment-localization
```

各snapshotは次を保持します。

- 出典、対象月、format、ルール、対戦形式、cutoff、対戦数
- 使用率と順位
- 技、持ち物、特性
- 性格と能力配分
- テラスタイプ
- teammates、checks and counters
- 正規化後の`share`、取得元の`rawWeight`、Showdownの表示名
- 解決できなかったポケモン名

`share`は0〜1、`usage.rate`も0〜1です。元データの重みは丸めず
`rawWeight`へ保持します。Champions形式の0〜32配分は`stat-points`、
従来形式の0〜252配分は`ev`として区別します。

Championsで利用できない対戦要素は、元データに`nothing`が含まれていても項目として
公開せず、`fieldAvailability: not-applicable`にします。

## ポケモン名解決

1. Showdown名を小文字kebab-caseへ変換し、`pokemon.json`のslugと完全一致を確認
2. 一致しない名称だけ`sourcePokemonAliases.json`の完全一致aliasを確認
3. 解決できなければ`unresolved`としてsnapshotへ記録

前方一致、部分一致、speciesの通常フォームへの吸収、曖昧なフォーム変換は行いません。
aliasの追加時は人がShowdown名と既存slugを確認します。`pokemon.json`は変更しません。

## 更新パイプライン

```bash
# 前月・registry既定format・cutoff 0/1760を本番更新せず確認
npm run environment:update -- --dry-run

# 月とformatを明示してdry-run
npm run environment:update -- \
  --period 2026-06 \
  --format gen9championsbssregmb \
  --dry-run

# 保存済みDatasetだけを再検証
npm run environment:validate
```

処理は次の順番を固定します。

1. Fetch: `www.smogon.com`のallowlist URLから生JSONを取得
2. Normalize: 既存alias、slug、canonical ID、species、formへ正規化
3. Validate: 構造、数値、件数、ID、環境条件を検証
4. Compare: 前回公開Datasetとの差分を品質閾値と比較
5. Publish: 全対象が成功した場合だけsnapshotとindexを一括置換

### FetchとRetry

- HTTPS、識別可能なUser-Agent、15秒timeout、20 MiB上限
- 最大3回、1秒・2秒のexponential backoff
- 429、timeout、一時的なHTTPエラーも3回を上限に失敗
- JSON以外、Errorページ、redirect、許可外host/pathを拒否
- 取得内容をOSの一時ディレクトリへ保存してからJSON解析

### Normalizeと使用率単位

- 既存`sourcePokemonAliases.json`と`pokemon.json`だけを使用
- slug、canonical ID、species、通常・メガ・地方・性別フォームを混同しない
- 取得値が`12.5%`、`12.5`、`0.125`のいずれでも`usage.rate`を`0.125`へ統一
- 正規化後の`usage.rate`と採用率は常に0〜1
- Advisorの警告境界とDataset Metadataの`minimumUsageRate`は`0.001`
- 空slotを表す空IDや`nothing`は表示用分布から除外

### Validation

- 必須項目、型、schemaVersion、metagame、cutoff、battleCount
- 負数、1超過、NaN、Infinity
- 10件以上、TOP10、TOP10の技・特性、使用率全0
- canonical slug、rank、form重複、species対応
- registryとregulation、season、cutoffの一致
- 日本語辞書で解決できない技・持ち物・特性・性格
- 明示allowlist以外の未知ポケモン・未知フォーム

現在の既知未対応フォームはregistryの
`allowedUnresolvedPokemonNames`へ明示し、新しい未知名はValidation Errorにします。
黙って新しい通常フォームへ吸収しません。

### Compare

閾値は`scripts/environment-data/pipeline.ts`の
`ENVIRONMENT_COMPARE_THRESHOLDS`で一元管理します。

- ポケモン・フォーム件数の減少: 25%超で停止
- TOP10の入れ替わり: 80%超で停止
- 技・特性件数の減少: 50%超または0件で停止
- 使用率合計の変化: 30%超で停止
- regulation変更、format/cutoff不一致、season巻き戻りで停止

### PublishとFallback

- cutoff 0/1760を両方準備し、全Validation・Compare成功後だけPublish
- snapshotを一時ファイルから置換し、最後にindexを置換
- 途中失敗時は変更前snapshotを復元し、indexは更新しない
- 新しい対象月でも過去snapshotは削除しない
- source hashとnormalizer versionが同じ場合はno change
- no changeではcommit、push、Deployを行わない
- dry-runはFetch・Normalize・Validate・Compareだけを行い、Publishしない

## GitHub Actions

`.github/workflows/refresh-environment-data.yml`を毎週火曜06:23 UTCに実行します。
取得元は月次更新のため、前月Datasetを低頻度で確認します。

- `schedule`と`workflow_dispatch`
- 手動実行は安全のため`dry_run: true`が初期値
- concurrencyにより同時更新を防止
- 正常な変更がある場合だけ全テスト・Pages buildを実行
- `chore: update environment dataset`で自動commit
- Actionsの`GITHUB_TOKEN`でpushし、同じ成果物をPagesへDeploy
- no change、dry-run、Validation失敗、Compare失敗ではcommit・Deployなし

公開APIキーは不要です。将来APIキーが必要な取得元を追加する場合はGitHub Secretsを
使用し、ログへ値を出力しないでください。

## Cache

- ランキング詳細JSONはDataset checksumを含むディレクトリへ生成
- Advisor用`_threats.json`は最新checksumをquery keyへ含めて取得
- Dataset更新時は通常buildとPages buildの両方でclient JSONを再生成
- localStorageのシーズン・チーム・Undoデータは変更または削除しない

## Pokemon HOME policy

Pokemon HOMEには一般開発者向け公開APIがなく、利用規約はサービスデータの複製、
第三者提供、未承認botやscript、リバースエンジニアリングを制限しています。
そのため次のpolicy gateを維持し、通信・アプリ解析・非公開API利用を行いません。

```json
{
  "source": "pokemon-home",
  "automationAllowed": false,
  "reason": "no-public-api-and-terms-restrict-reverse-engineering-and-redistribution"
}
```

公式APIまたは書面による許諾が確認できるまで変更しないでください。

## 検証

```bash
npm run test:environment
npm run test:environment-pipeline
npm run environment:validate
npm run data:validate
```

fixtureでは通常フォーム、メガ、alias、unresolved、技・持ち物・特性、
Stat Points、EV、checks and counters、不正JSON、同一hash、dry-run、
atomic write失敗に加え、正常取得、変更なし、取得失敗、0件、使用率異常、
未知フォーム、Schema変更、Compare異常、Fallback、Single Source of Truth、
TASK027の`0.001`境界を検証します。
