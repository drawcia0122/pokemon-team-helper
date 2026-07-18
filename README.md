# ポケモン タイプ相性補完ツール

Next.js + TypeScript で作った、Pokémon Champions 向けのタイプ相性補完ツールです。  
2〜6体のチームを入力すると、チーム全体の弱点や耐性を可視化し、次に入れると補完になりやすいタイプ候補とポケモン候補を表示します。

## セットアップ方法

```bash
npm install
```

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
