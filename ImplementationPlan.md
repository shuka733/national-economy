# P2P 改善実装計画

## 対象
- P2P 対戦における給料日処理と手札クリーンアップの統合
- P2P 対戦における相手プレイヤー待機中の全画面ポップアップ廃止
- P2P 対戦における相手のワーカー配置アニメーション未発火の修正
- PC / スマホ共通での操作性改善

## 調査結果

### 1. 給料日とクリーンアップは現在完全に別フェーズ
- `game.ts` では `startPayday -> finishPayday -> startCleanup -> finishCleanup` の直列構成になっている。
- `paydayState` と `cleanupState` も別構造で、全員が給料日を終えるまで `cleanup` に進めない。
- P2P ではどちらも `setActivePlayers({ all: Stage.NULL })` で「各自 Move 可」にはなっているが、フェーズ自体が分断されているため、先に給料日を終えたプレイヤーもクリーンアップへ進めない。

### 2. 相手待機時の全画面ポップアップは `Board.tsx` の早期 return
- `Board.tsx` に `isOnline && isModalPhase && !isMyTurn` のとき、盤面全体を捨てて待機オーバーレイだけ返す分岐がある。
- このため、相手が `discard / build / designOffice / dualConstruction / payday / cleanup` をしている間、こちらは盤面もカード詳細も見られない。
- 既に相手の active 表示自体は `opponent-card-active` などで存在しているため、全画面オーバーレイなしでも「誰が操作中か」は示せる。

### 3. 相手のワーカー配置アニメーションが出ない主因
- 相手の配置アニメーションは `rawG.lastPlacementEvent` を監視して発火している。
- ただし、相手配置直後に `discard` や `build` などのモーダル系フェーズへ遷移すると、上記の全画面待機オーバーレイ分岐が先に走る。
- その結果:
  - 盤面 DOM が消える
  - `AnimationOverlay` もその return 経路では描画されない
  - `snapshotAnimationRects()` が待機画面の DOM だけを見て空のキャッシュを書き戻す
- この状態で `playWorkerPlacementAnimation()` が走っても始点/終点矩形を取れず、特に `placeWorkerOnBuilding` 系で不発になりやすい。

### 4. 「工場」などの手札選択系で操作不能になる理由
- 原因は 2 と同じで、相手が `discard` や `build` に入った時点で待機オーバーレイへ切り替わるため。
- これはアニメーション不発の原因とも共通しているので、待機 UI の設計を変えることで同時に改善できる。

## 推奨実装方針

### A. 給料日とクリーンアップを単一の「清算フェーズ」に統合する
- 推奨は「新しい大フェーズを増やす」より、現在の `payday` を清算全体の外側フェーズとして残し、その中にプレイヤー別の `step` を持たせる方法。
- 具体的には `PaydayPlayerState` を拡張し、各プレイヤーごとに以下を持つ:
  - `step: 'payday' | 'cleanup' | 'done'`
  - `totalWage`
  - `needsSelling`
  - `selectedBuildingIndices`
  - `excessCount`
  - `selectedIndices`
- `cleanupState` と `phase === 'cleanup'` は実行経路から外し、清算中は `phase === 'payday'` のまま各プレイヤーだけが段階遷移する。

### B. 清算の進行はプレイヤー単位でシームレスにする
- `startPayday()` で全員分の賃金計算を初期化する。
- 各プレイヤーは:
  - 建物売却が必要なら `step = 'payday'`
  - 不要なら即時賃金支払い後、手札超過を計算
  - 超過があれば `step = 'cleanup'`
  - 超過がなければ `step = 'done'`
- `confirmPaydaySell()` / `confirmPayday()` 実行後に、そのプレイヤーだけ即座に cleanup 判定へ進める。
- `confirmDiscard()` 実行後、そのプレイヤーは `done` にする。
- 全員が `done` になった時点でのみラウンド終了処理へ進む。

### C. P2P の待機 UI は全画面ポップアップを廃止する
- `Board.tsx` の `if (isOnline && isModalPhase && !isMyTurn) return ...` を廃止する。
- 盤面は常に表示したままにし、相手ヘッダー付近へ小さな状態表示を出す。
- 表示ルール:
  - 清算統合フェーズ中で、そのプレイヤーの `step !== 'done'` の場合: `清算中...`
  - `discard / build / designOffice / dualConstruction / choice_*` など、相手の選択待ち中: `選択中...`
- 既存の「現在手番プレイヤーの発光」はそのまま利用し、追加の全面モーダルは出さない。

### D. ワーカー配置アニメーションは盤面維持前提に修正する
- 待機オーバーレイをやめて盤面 DOM と `AnimationOverlay` を維持する。
- これにより、相手が配置後すぐ選択フェーズへ入っても:
  - 配置先 DOM が残る
  - 相手パネル DOM が残る
  - アニメーション描画レイヤーも残る
- 追加で安全策として、`snapshotAnimationRects()` はプレイヤー DOM が 0 件のときに既存キャッシュを空で上書きしないようにする。
- さらに `playWorkerPlacementAnimation()` 側で矩形取得に失敗した場合、1 フレーム程度の再試行を入れると安定度が上がる。

## 実装タスク

### 1. 型定義整理
- `types.ts`
  - `PaydayPlayerState` に cleanup 用フィールドと `step` を追加
  - `CleanupState` を廃止または未使用化
  - `GameState.phase` の cleanup 依存を整理

### 2. ゲームロジック統合
- `game.ts`
  - `startPayday()`, `continuePayday()`, `finishPayday()`, `startCleanup()`, `continueCleanup()`, `finishCleanup()` を再構成
  - 清算完了判定を「全員 step=done」に変更
  - `toggleDiscard()` / `confirmDiscard()` を清算統合後の player step に対応させる
  - ログ文言を「給料日」「清算」「手札整理」で整理

### 3. Board の自分操作 UI 切り替え
- `Board.tsx`
  - `isPaydayPhase`, `isCleanupPhase`, `paydayPlayerState`, `cleanupPlayerState` の導出を統合状態ベースへ変更
  - 自分の建物売却バー、自分の手札クリーンアップバーを、プレイヤー別 `step` に応じて切り替える
  - 旧 `PaydayUI` / `CleanupUI` は未使用なら削除候補

### 4. 待機 UI の差し替え
- `Board.tsx`
  - 相手待機用の全画面 early return を削除
  - opponent header に状態ラベルを追加
  - 状態ラベル導出ヘルパーを追加:
    - `getPlayerInlineStatus(pid)`
    - `清算中...`
    - `選択中...`

### 5. アニメーション修正
- `Board.tsx`
  - `snapshotAnimationRects()` の空上書き防止
  - `playWorkerPlacementAnimation()` の再試行 or fallback 改善
  - `lastPlacementEvent` 監視時に、相手選択フェーズ遷移と競合してもアニメーションが処理されることを確認

## 影響ファイル
- `src/types.ts`
- `src/game.ts`
- `src/Board.tsx`
- 必要なら `src/index.css`

## 検証観点
- P2P で、プレイヤー A が給料日売却後すぐ手札整理へ入れること
- その間、プレイヤー B は盤面操作不能にならず、カード詳細も見られること
- 相手プレイヤー欄に `清算中...` が出ること
- 相手が「工場」などの選択系建物を処理している間、相手名の横に `選択中...` が出ること
- 相手の `placeWorker` と `placeWorkerOnBuilding` の両方でワーカー配置アニメーションが出ること
- 最終配置直後に選択フェーズへ入るケースでもアニメーションが消えないこと
- ローカル対戦と CPU 戦の既存挙動が壊れていないこと
