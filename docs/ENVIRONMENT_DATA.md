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
content hash別の軽量JSONへ分割し、クリックされた1体分だけを取得します。
snapshot本体、`rawWeight`、TOP10以降の分布はブラウザへ送信しません。

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
