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

要警戒スコアはタイプ相性と種族値を最大80点、環境補正を最大20点として扱います。
環境補正は使用率最大8点、採用率20%以上の有効技最大10点、主流の物理・特殊型2点です。
使用率だけで順位が決まらないよう上限を設け、teammatesとChecks and Countersは
表示だけに使用してスコアへ加えません。

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

## collector

```bash
npm run environment:collect -- \
  --period 2026-06 \
  --format gen9championsbssregmb \
  --cutoff 1760 \
  --dry-run
```

- 接続先は`www.smogon.com`の固定パスだけです
- HTTPS、User-Agent、15秒timeout、20 MiB上限を使用します
- 取得内容をOSの一時ディレクトリへ保存してからJSON解析します
- metagame、cutoff、battleCountと各統計構造を検証します
- snapshot全体を検証してから同一ディレクトリの一時ファイルから置換します
- index更新に失敗した場合はsnapshotを復元または削除します
- dry-runはsnapshotとindexを変更しません
- source hashが同じ場合は取得時刻だけで差分を作りません
- 空の技・持ち物slotを表す空IDや`nothing`は表示用分布から除外します

定期実行とGitHub ActionsはTASK023の対象外です。

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
npm run data:validate
```

fixtureでは通常フォーム、メガ、alias、unresolved、技・持ち物・特性、
Stat Points、EV、checks and counters、不正JSON、同一hash、dry-run、
atomic write失敗を検証します。
