# 公式ポケモン情報の収集仕様

TASK009では、ニュース・大会・イベント・キャンペーン・ゲーム更新情報のうち、公開条件と取得方法を明確に確認できた公式ソースだけを対象にします。本文・画像は保存せず、独自の短い案内、公開日、元ページへのテキストリンクだけを保持する設計です。

## ソース調査

| Source | Domain | Method | robots | Terms | Automation | Implemented |
| --- | --- | --- | --- | --- | --- | --- |
| Pokémon GO公式 | `pokemongo.com` | 公開RSS `/feed` | `/_api/`のみ禁止。`/feed`は禁止されていない | Scopely利用規約がServices / Contentのextract・scrape・indexを禁止 | 保留（通信無効） | Parser / safety fixture only |
| Pokémon Champions Latest News | `champions.pokemon.com` | HTML一覧 | `robots.txt`は404 | リンク先`pokemon.com`の規約をWAFにより確認できず、明示的な自動取得許可を確認できない | 保留 | No |
| ポケットモンスターオフィシャルサイト NEWS | `www.pokemon.co.jp` | HTML一覧 | `/info/`は禁止されていない | 「ご利用について」が文章等のコピー・複製・電送・公衆ネットワーク利用を禁止 | 不可 | No |
| Pokémon Championsサポート | `app-pcs.pokemon-support.com` | Zendesk JSON API | 未確定（規約で不可と判断したため追加通信せず） | サイト外でのコンテンツ利用とデータ複製を規約で禁止 | 不可 | No |
| ポケモンセンター公式サイト | `shop.pokemon.co.jp` | HTML一覧 | 未確定 | 自動収集を許可する公開条件を確認できていない | 保留 | No |
| 株式会社ポケモン PR TIMESフィード | `prtimes.jp` | 会社別RDF/RSS | `Allow: /` | 公開RSSはあるが、基本規約がソフトウェアまたはデータの複製・二次利用を禁止 | 保留 | No |

### 規約監査レコード

以下は2026年7月20日に実際に確認したURLと判断記録です。規約本文は転載せず、判断に必要な結果だけを要約します。同じ内容は`scripts/content-collectors/sourceRegistry.ts`の`CONTENT_SOURCE_AUDIT`にも保持します。

```text
sourceName: Pokémon GO公式
domain: pokemongo.com
officialPageUrl: https://pokemongo.com/
feedOrListUrl: https://pokemongo.com/feed
robotsUrl: https://pokemongo.com/robots.txt
termsUrl: https://explore.scopely.com/terms
checkedAt: 2026-07-20
robotsResult: /_api/のDisallowを確認。/feedは禁止対象外
termsResult: Services / Contentのextract・scrape・index禁止条項を確認
automationDecision: disabled-by-policy
decisionReason: RSS公開だけで自動index・再公開許可までは確認できない
implemented: fixture-only
```

```text
sourceName: Pokémon Champions Latest News
domain: champions.pokemon.com
officialPageUrl: https://champions.pokemon.com/en-us/
feedOrListUrl: https://champions.pokemon.com/en-us/news/
robotsUrl: https://champions.pokemon.com/robots.txt
termsUrl: https://www.pokemon.com/us/legal/terms-of-use/
checkedAt: 2026-07-20
robotsResult: 404のため明示ルールを確認できない
termsResult: WAFにより規約本文を確認不能
automationDecision: pending-review
decisionReason: robotsと利用条件の根拠が不足
implemented: no
```

```text
sourceName: ポケットモンスターオフィシャルサイト NEWS
domain: www.pokemon.co.jp
officialPageUrl: https://www.pokemon.co.jp/
feedOrListUrl: https://www.pokemon.co.jp/info/
robotsUrl: https://www.pokemon.co.jp/robots.txt
termsUrl: https://www.pokemon.co.jp/rules/
checkedAt: 2026-07-20
robotsResult: /info/はDisallow対象外
termsResult: 文章等の複製・電送・公衆ネットワーク利用の制限を確認
automationDecision: disabled-by-policy
decisionReason: 自動収集・再公開に適用可能な許可を確認できない
implemented: no
```

```text
sourceName: Pokémon Championsサポート
domain: app-pcs.pokemon-support.com
officialPageUrl: https://app-pcs.pokemon-support.com/hc/ja
feedOrListUrl: https://app-pcs.pokemon-support.com/api/v2/help_center/ja/articles.json
robotsUrl: https://app-pcs.pokemon-support.com/robots.txt
termsUrl: https://app-pcs.pokemon-support.com/hc/ja/articles/58579212269721
checkedAt: 2026-07-20
robotsResult: 規約確認後に追加取得を中止したため未確認
termsResult: サイト外でのコンテンツ利用とデータ複製の制限を確認
automationDecision: disabled-by-policy
decisionReason: 公開JSON APIの存在だけで再利用許可とは判断できない
implemented: no
```

```text
sourceName: ポケモンセンター公式サイト
domain: shop.pokemon.co.jp
officialPageUrl: https://shop.pokemon.co.jp/ja/shop/
feedOrListUrl: https://shop.pokemon.co.jp/ja/shop/common/events/
robotsUrl: https://shop.pokemon.co.jp/robots.txt
termsUrl: https://shop.pokemon.co.jp/ja/shop/guide/
checkedAt: 2026-07-20
robotsResult: 自動取得可否を判断できる明示ルールを確認できない
termsResult: 自動取得・再公開許可の公開条件を確認できない
automationDecision: pending-review
decisionReason: 許可条件を特定できるまで実装しない
implemented: no
```

```text
sourceName: 株式会社ポケモン PR TIMESフィード
domain: prtimes.jp
officialPageUrl: https://prtimes.jp/main/html/searchrlp/company_id/26665
feedOrListUrl: https://prtimes.jp/companyrdf.php?company_id=26665
robotsUrl: https://prtimes.jp/robots.txt
termsUrl: https://prtimes.jp/main/html/kiyaku
checkedAt: 2026-07-20
robotsResult: Allow: /を確認
termsResult: ソフトウェア・データの複製・改変・二次利用の制限を確認
automationDecision: pending-review
decisionReason: RSS購読と本サイトでの自動再公開を同じ許可と判断できない
implemented: no
```

2026年7月20日時点で、自動取得とメタデータの再公開を安全に許可されていると断定できるソースはありません。そのため、ライブcollectorの全ソースを`disabled-by-policy`とし、自動生成データは0件のままにしています。

Pokémon GOのRSS parserと分類・ポケモン名解決は、リポジトリ内fixtureに対する自動テストだけで使用します。`npm run collect:content:dry-run`は保留状態を出力し、外部通信やJSON更新を行いません。

## データ分離

- `data/pokemonContent.manual.json`: 人が確認した既存7件。自動処理は変更しません。
- `data/pokemonContent.generated.json`: 許可済みソースから生成するメタデータ。現在は0件です。
- `data/pokemonContentCollectionStatus.json`: feedと記事のfingerprint。実行日時だけでは更新しません。
- 表示時はmanualを先に統合し、同じIDまたは正規化URLがある場合はmanualを優先します。

## 安全制御

- HTTPSと明示allowlistを必須とします。現在は許可済みソースがないため、ライブallowlistは空です。
- localhost、IPアドレス、private / link-local / documentation IPを拒否します。
- DNS解決先にprivate IPが含まれる場合は拒否します。
- リダイレクトは最大3回で、各遷移先をallowlistとDNSで再検証します。
- タイムアウト15秒、リトライ最大2回、リクエスト間隔1秒以上です。
- 通常上限20件、backfill上限50件です。
- ソース失敗、空feed、不正feedでは既存generatedを維持します。
- RSSの掲載枠から外れた既存情報も自動削除しません。
- feedの空白や実行日時だけでは状態fingerprintを変更しません。
- JSONは全件検証後に一時ファイルから置換します。
- `Pokesol`、`Game8`、`GameWith`、検索結果、X、YouTube、任意URLへ通信しません。

## コマンド

```bash
npm run collect:content:dry-run
npm run collect:content
npm run collect:content:backfill
npm run collect:content:pokemon-go
npm run test:content-collection
```

`collect:content:pokemon-go`を含む現在のライブコマンドは、規約保留により`disabled-by-policy`で安全に終了します。fixtureテストは外部通信を使いません。

## GitHub Actions

`.github/workflows/refresh-pokemon-content.yml`は`workflow_dispatch`の検証用として追加しています。自動取得可能なソースが0件のため、定期scheduleは有効化しません。規約上の許可が確認できた後に、ソース負荷に合わせて頻度を決めます。生成JSONと状態JSONに意味のある差分がある場合だけコミットする設計ですが、TASK009承認前にリモート実行はしません。
