// ============================================================
// constants.ts — UI定数（ゲームロジックに影響しない純粋なUIパラメータ）
// ============================================================

/** アニメーション・タイマー関連のタイミング定数 */
export const TIMING = {
    /** 長押しプレビューの判定閾値 */
    LONG_PRESS_MS: 300,
    /** ラウンドカードフリップの継続時間 */
    FLIP_DURATION_MS: 800,
    /** ラウンドアナウンス表示タイミング */
    ANNOUNCE_SHOW_MS: 1500,
    /** ラウンドアニメーション全体の継続時間 */
    ROUND_ANIM_TOTAL_MS: 2000,
    /** カードドローアニメ: デッキから出る phase1 */
    DECK_OUT_MS: 300,
    /** カードドローアニメ: 複数カードのスタガー遅延 */
    STAGGER_DELAY_MS: 100,
    /** カードドローアニメ: 手札に入る phase2 */
    HAND_IN_MS: 400,
    /** カードドローアニメ: ドロー後の待機時間 */
    POST_DRAW_WAIT_MS: 500,
    /** CPU自動プレイ: スタック検出タイムアウト */
    CPU_STUCK_TIMEOUT_MS: 5000,
    /** CPU自動プレイ: 操作前の遅延 */
    CPU_MOVE_DELAY_MS: 600,
} as const;

/** プレビュー表示のインデックスオフセット（各エリアの識別子） */
export const PREVIEW_OFFSET = {
    /** 自分の建物 */
    MY_BUILDING: 1000,
    /** 初期職場1行目 */
    INITIAL_WP_ROW1: 2000,
    /** 初期職場2行目 */
    INITIAL_WP_ROW2: 2100,
    /** ラウンド追加職場 */
    ROUND_WP: 2200,
    /** 売却建物 */
    SOLD_WP: 2300,
} as const;

/** レイアウト関連の定数 */
export const LAYOUT = {
    /** 初期職場グリッドの列数 */
    INITIAL_WORKPLACE_COLS: 4,
    /** カードのアスペクト比 (幅/高さ) */
    CARD_ASPECT_RATIO: 63 / 88,
    /** 手札コンテナの左右パディング */
    HAND_CONTAINER_PADDING: 8,
    /** カードドラッグの成功閾値（px） */
    DRAG_THRESHOLD: 50,
} as const;
