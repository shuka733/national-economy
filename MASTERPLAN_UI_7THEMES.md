# UI修正計画 — 7テーマ

## 概要
ゲームのUX改善として、モーダルポップアップを廃止しメインボード上でのインライン操作に移行するとともに、ビジュアル面の強化（捨て札ビジュアル・ラウンド演出・カード画像）を行う。

---

## ①手札クリーンアップを実際の手札から選ぶ

**現状**: `CleanupUI`（L1508-1572）が全画面モーダルとして表示され、ゲーム盤面が完全に隠れる。

**修正内容**:
- `CleanupUI` モーダルを**廃止**し、メインボード上でインライン操作に移行
- `G.phase === 'cleanup'` かつ自分の操作時、メインボードの手札カード（`.hand-card`）をクリック可能に
- 選択済みカードに赤枠ハイライトと「✓ 捨てる」バッジを表示
- **手札エリアの上**にインフォバー（「精算: N枚捨ててください」＋確定ボタン）を表示

#### [MODIFY] [Board.tsx](file:///c:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx)
- `CleanupUI` コンポーネントの全画面モーダル → メインボードからの呼び出しを削除
- `Board` コンポーネント内で `cleanup` フェーズ時の手札カードにクリックイベント（`moves.toggleDiscard`）を追加
- 確定ボタン＋インフォバーをヘッダー下部に表示

---

## ②建物売却を実際の建物から選ぶ

**現状**: `PaydayUI`（L1397-1506）が全画面モーダルで建物一覧を表示し、クリックで売却選択。

**修正内容**:
- `PaydayUI` モーダルを廃止し、メインボード上でインライン操作に
- `G.phase === 'payday'` で売却が必要な場合、「自分の建物」セクション（`.my-building-card`）をクリック可能に
- 売却選択中の建物に赤枠＋「売却」バッジ
- **建物エリアの上**に給料日インフォバー（賃金情報＋売却合計＋確定ボタン）を表示
- 売却不要（自動支払い）のプレイヤーは自動確認（現行通り）

#### [MODIFY] [Board.tsx](file:///c:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx)
- `PaydayUI` の全画面モーダル → 呼び出し削除
- Board内のmy-building-cardにpaydayクリックハンドラを追加
- 給料日インフォバー（build-action-bar風）を表示

---

## ③大工を実際の手札・捨て札から選ぶ

**現状**: 大工（建設フェーズ `G.phase === 'build'`）では、ヘッダー下に[build-action-bar](file:///c:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx#L684-L692)が表示され、手札をクリックして建設カードを選択。コスト支払い時は`DiscardUI`モーダルが表示される。

**修正内容**:
- **build-action-bar の縮小化**: 現在の大きな枠を廃止し、ヘッダーの既存バッジ行にインラインで「🔨建設中 ✕キャンセル」を表示
- **DiscardUI（捨て札選択）のインライン化**: コスト支払い時の手札選択もメインボード上の手札カードから直接行う
  - 選択済みカードに赤枠ハイライト
  - 建設対象カードはゴールド枠で「建設対象」表示
  - インフォバーに「N枚捨ててください」＋確定/キャンセルボタン

#### [MODIFY] [Board.tsx](file:///c:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx)
- `DiscardUI` モーダルの呼び出しを削除（`discard`フェーズ時もメインボードを表示）
- discard フェーズ時、手札カードにtoggleDiscardイベントを追加
- build-action-barの表示を小型化
- excludeCardUid（建設対象）の視覚的区別

> [!IMPORTANT]
> ①②③の共通変更: 現在 `Board` 関数の冒頭（L574-587）でモーダルフェーズを早期returnしている箇所を、`cleanup`・`payday`・`discard`・`build` ではメインボードを表示するように変更。

---

## ④捨て札にカードを置くビジュアル

**現状**: 捨て札デッキは枚数のみ表示。捨て札にカードが追加される時のビジュアルフィードバックなし。

**修正内容**:
- 捨て札デッキの上に、最近捨てられたカード（**最上位8枚**）を「散らばった」見た目で表示
- 位置と回転角にランダム性を付与（`Math.random() * 6 - 3` deg 程度、位置もXY各±3px程度）
- CSSアニメーションで「ふわっと置かれる」エフェクト

#### [MODIFY] [Board.tsx](file:///c:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx)
- 捨て札デッキ領域（L844-851）の上に最近のカードを重ねて表示

#### [MODIFY] [index.css](file:///c:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/index.css)
- 捨て札カードの散らばりスタイルとアニメーション

---

## ⑤ラウンドカードめくり＋裏返しモーション

**現状**: ラウンドカード（L812-817）は静的な「R{round}」表示。ラウンド追加職場は突然グリッドに出現。

**修正内容**:
- ラウンド開始時にカードめくりアニメーション（3D flip CSS）
- 表面: ラウンド番号、裏面: ラウンド追加建物カードの情報
- 追加職場が出現するタイミングでフリップ → 追加職場の名前を見せる → 職場グリッドに出現

#### [MODIFY] [Board.tsx](file:///c:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx)
- ラウンド開始検知（roundの変化）でフリップアニメーション発火
- ラウンドカード表裏のJSX

#### [MODIFY] [index.css](file:///c:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/index.css)
- 3D flip CSS（`perspective`, `rotateY`, `backface-visibility`）

---

## ⑥ラウンド表示フェーディング

**現状**: ラウンド変更時の視覚フィードバックなし。

**修正内容**:
- ラウンド開始時に画面中央に大きく「Round N」のフェードイン→フェードアウト表示（1.5秒程度）
- 半透明オーバーレイで目立たせる

#### [MODIFY] [Board.tsx](file:///c:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx)
- `useEffect` でG.roundの変化を検知 → `roundAnnounce` state → オーバーレイ表示

#### [MODIFY] [index.css](file:///c:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/index.css)
- フェードイン/アウトキーフレームアニメーション

---

## ⑦カード画像の適用

**現状**: カードはテキストのみで背景画像なし。`public/cards/` に63枚の画像あり。

**修正内容**:
- `CardDef` 型に `image?: string` フィールドを追加
- `base_cards.ts` / `glory_cards.ts` に画像パス（`/cards/progress/prog_farm.png` 等）を設定
- カード描画時に背景画像を `position: absolute; z-index: 0; opacity: 0.5` で表示
- テキスト要素は `z-index: 1; position: relative` で前面に維持
- 手札カード(`hand-card`)、自分の建物(`my-building-card`)、相手の建物(`opponent-building-card`)、各UIのカード表示に適用

#### [MODIFY] [types.ts](file:///c:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/types.ts)
- `CardDef` に `image?: string` 追加

#### [MODIFY] [base_cards.ts](file:///c:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/base_cards.ts)
- 各カード定義に `image` パスを追加

#### [MODIFY] [glory_cards.ts](file:///c:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/glory_cards.ts)
- 各カード定義に `image` パスを追加

#### [MODIFY] [Board.tsx](file:///c:/Users/k2000/.gemini/antigravity/scratch/national-economy/src/Board.tsx)
- カード描画箇所に背景画像表示を追加（共通ヘルパーコンポーネント `CardBgImage`）

---

## 実装順序と優先度

| 順番 | テーマ | 難易度 | 理由 |
|------|--------|--------|------|
| 1 | ⑦カード画像 | ★★☆ | 他テーマと独立。視覚改善効果大 |
| 2 | ⑥ラウンドフェーディング | ★☆☆ | 独立・シンプル |
| 3 | ④捨て札ビジュアル | ★★☆ | 独立 |
| 4 | ①②③ポップアップ廃止 | ★★★ | 最も影響範囲が広い。3テーマまとめて実装 |
| 5 | ⑤ラウンドカードめくり | ★★★ | ⑥と組み合わせ |

---

## 検証計画

### 自動テスト
- `npx tsc --noEmit` — TypeScriptビルドエラーなし

### ブラウザ手動テスト（各テーマ実装後）
1. **⑦カード画像**: ゲーム開始 → 手札・建物カードに背景画像が半透明で表示されるか確認
2. **⑥ラウンドフェーディング**: 鉱山等を使いラウンド進行 → 「Round N」表示がフェードイン/アウトするか確認
3. **④捨て札**: 工場使用等で捨て札発生 → 捨て札デッキ上にカードがランダム配置されるか確認
4. **①②③**: 精算フェーズ/給料日/建設フェーズで、モーダルでなくメインボード上で操作できるか確認
5. **⑤ラウンドカード**: ラウンド進行時にカードめくりアニメーションが再生されるか確認
