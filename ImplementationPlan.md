# 実装計画

## 1. 指示の解釈

今回の目的は、PC とスマホの両方で「相手が建てた建物が見える状態」に相手エリアを再設計することです。  
単なる倍率調整ではなく、`LOG` の置き場、相手手札の置き場、相手建物の置き場をまとめて組み替える方針で進めます。

解釈した要件は以下です。

- `LOG` は今の左側インライン表示をやめ、公共エリア上部右端の灰色ボタンから開く方式へ移す
- `HOUSEHOLD` は少し横幅を縮め、その右に `📒LOG` 相当のボタンを置く
- 相手手札は相手カードの中央付近ではなく、名前直下に作る「仮想手札エリア」に表示する
- 相手手札エリアは、相手カード横幅の左 30% を使う
- 相手手札は今の約 70% に縮小し、枚数が増えたらその中で重ねて収める
- 空いた右側領域に相手建物を表示する
- 相手建物は、自分の手札や自分の建物と同系のサイズに寄せる
- 建物は左から積み、見切れたら横スクロールで見る

## 2. 現状のコード解析

### 2-1. `LOG` が相手エリアの高さを食っている

相手エリア全体は [Board.tsx](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx) の `area-opponents` で描画されており、構造は

- `turn-bar`
- `opponents-container`
- `inline-log`

の 3 段です。  
実装箇所は [Board.tsx](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx#L1843) 以降です。

CSS でも [index.css](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/index.css#L1322) で

```css
grid-template-rows: auto 1fr auto;
```

になっており、ログが常に 1 行ぶんの高さを確保しています。  
スマホでは [index.css](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/index.css#L2853) で `inline-log` の最大高さをさらに固定しているため、相手カードの高さをかなり圧迫しています。

### 2-2. 相手手札は「中央寄せの独立行」になっている

相手カードの中身は現在

- ヘッダー
- `opponent-hand-fan`
- `opponent-buildings-scroll`

の縦積みです。  
実装箇所は [Board.tsx](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx#L1884) から [Board.tsx](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx#L1973) です。

そのため、手札がカード中央付近に 1 行として置かれ、建物エリアはその下に押し込まれています。  
CSS でも [index.css](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/index.css#L1418) の `opponent-hand-fan` は固定高さの横並び行になっており、相手カード内に「手札専用行」が常に存在する作りです。

### 2-3. 相手建物サイズは公共カード基準で、自分の場のカードサイズとは別系統

相手建物のサイズは [index.css](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/index.css#L1461) で

- `width: var(--pub-card-w);`
- `height: var(--pub-card-h);`

になっています。

一方、自分の手札と自分の建物は別系統です。

- 自分の手札は `hand-card` 系
- 自分の建物は `building-card-in-field`
- スマホでは [Board.tsx](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx#L1616) で `--mobile-self-card-height` を流し込み
- [index.css](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/index.css#L3095) で自分の建物高さを合わせています

つまり今は、相手建物だけ公共カード基準で描いているため、サイズ感も配置思想も自分の場と揃っていません。

### 2-4. `LOG` ボタン用の既存資産はある

`showLog` state と `LogModal` はすでに存在しています。  
ログのモーダル開閉は [Board.tsx](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx#L523) と [Board.tsx](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx#L1835) にあります。

つまり、今回必要なのは新しいログ機能の追加ではなく、

- 左側の `inline-log` を外す
- 右上に `showLog` を開くボタンを置く

という UI 配置変更です。

## 3. 修正方針

### 方針A: `LOG` は左カラムから退避し、公共エリア上部右端ボタンに集約する

`inline-log` は相手エリアから外します。  
その代わり、公共エリア上部に `HOUSEHOLD` と横並びの `LOG` ボタンを作り、クリックで既存 `LogModal` を開くようにします。

このとき、

- `HOUSEHOLD` は横幅を少し縮める
- 右に固定幅の灰色ボタンを置く
- ボタン文言は `📒LOG` 相当
- 実装上は既存 `IconLog` + `LOG` テキストでも可

とします。

### 方針B: 相手カード内部を「左: 手札エリア / 右: 建物エリア」の 2 カラムへ組み替える

相手カードは、ヘッダー直下に新しい本文ラッパーを作り、

- 左 30%: 仮想手札エリア
- 右 70%: 建物表示エリア

の 2 カラムに再編します。

これにより、手札は「名前の下部」に寄り、建物は右側の空いた領域にまとまって見えるようになります。

### 方針C: 相手手札は専用エリア内で中央揃え・縮小表示する

相手手札は新しい `opponent-hand-area` の中に置き、その中で中央揃えにします。  
手札サイズは現状の約 70% を目標に縮めます。

現在の `--opponent-hand-card-w` と `--opponent-hand-fan-h` をそのまま使うのではなく、今回の手札エリア幅に収めやすいよう再計算します。  
枚数が増えたときは `getCardOverlapMargin` の相手手札用計算を利用しつつ、手札エリア幅に合わせてより強く重なるよう調整します。

### 方針D: 相手建物は「自分の場のカードサイズ」に寄せる

相手建物は一旦 `--pub-card-*` 基準をやめ、自分の場で使っているカードサイズ基準に寄せます。

具体的には、

- PC では自分の手札/自分の建物に近い高さを使う共通変数を新設する
- スマホでは既存の `--mobile-self-card-height` を再利用する

方向が自然です。

これにより、相手建物だけ妙に小さい状態を避けられます。

### 方針E: 相手建物は右領域で左詰め・横スクロールにする

相手建物は、今のように「手札の下の残り高さに押し込む」のではなく、右側専用領域に左詰めで並べます。  
見切れたら横スクロールで見える構造にします。

これは既存の `opponent-buildings-scroll` を活かせるので、DOM 全体を大きく増やさずに実現できます。

## 4. 実装ステップ

1. [Board.tsx](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx) の `area-opponents` から `inline-log` を外す
2. [Board.tsx](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx) の公共エリア上部に `HOUSEHOLD + LOGボタン` の新しい横並びラッパーを追加する
3. [index.css](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/index.css) で `household-box` を単独 full-width から可変幅へ変更し、右側ボタン用スペースを確保する
4. [Board.tsx](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx) の相手カード内部に `opponent-card-body`、`opponent-hand-area`、`opponent-buildings-area` を導入する
5. [index.css](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/index.css) で相手カード本文を `30% / 70%` の 2 カラムに再定義する
6. 相手手札を新しい `opponent-hand-area` 内で中央揃え表示に変え、サイズを現在の約 70% へ縮める
7. 相手建物サイズを `--pub-card-*` から切り離し、自分の場と同系のサイズ変数へ寄せる
8. 相手建物スクロール領域を右カラム専用の横スクロールに整える
9. PC とスマホそれぞれで、相手 1〜3 人表示時の見え方を確認する

## 5. 対象ファイル

- [Board.tsx](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx)
- [index.css](/C:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/index.css)

必要に応じて、`LOG` ボタンの見た目を既存部品化したくなった場合のみ、アイコン系ファイルを触る可能性がありますが、第一段階では不要です。

## 6. 確認観点

- PC で `LOG` が左カラムから消え、公共エリア右上のボタンから開けること
- スマホでも同様に `LOG` が右上導線へ移ること
- `HOUSEHOLD` が少し狭くなり、右端に `LOG` ボタンが自然に収まること
- 相手手札が「名前の下」へ移動していること
- 相手手札エリア幅が相手カードの左 30% 前後になっていること
- 相手手札が現在より明確に小さくなり、枚数が増えてもエリア内に収まること
- 相手建物が手札の右側に見えること
- 相手建物が左から並び、見切れたら横スクロールで見られること
- PC / スマホともに、相手建物のサイズ感が自分の手札・自分の建物と大きく乖離しないこと
- P2P、ローカル対戦、CPU戦のいずれでも相手欄の表示が崩れないこと
