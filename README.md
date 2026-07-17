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

`scripts/seedSeason1.ts` を使うと、`pokemon.json` にある slug を `season1.json` に流し込めます。

```bash
npm run data:seed-season1
```

## season1 の使用可能ポケモン編集方法

使用可能ポケモンは [data/regulations/season1.json](/Users/drawcia0122/Codex/Pokémon/data/regulations/season1.json) の `allowedPokemonSlugs` で管理します。

- `pokemon.json` に存在する slug を追記するだけで候補対象を増やせます
- ポケモン候補ランキングは、選択中シーズンで allowed なポケモンだけを対象にします
- 「全ポケモン表示（開発用）」ではシーズン制限を無視して一覧化します

## season2 追加方法

新シーズン追加時は [data/regulations/season2.json](/Users/drawcia0122/Codex/Pokémon/data/regulations/season2.json) のようなファイルを追加し、[data/appMeta.json](/Users/drawcia0122/Codex/Pokémon/data/appMeta.json) の `seasonIds` に登録するだけでよい構成です。

- 新しい `data/regulations/seasonX.json` を追加する
- `appMeta.json` の `seasonIds` に `seasonX` を追加する
- 必要なら `lib/regulations.ts` に import を足す

## アプリの使い方

1. 上部のシーズン切替で `シーズン1` か `全件対応版（全ポケモン）` を選びます
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
