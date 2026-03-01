// ============================================================
// types.ts  –  ナショナルエコノミー 型定義 (v3)
// ============================================================

export type CardTag = 'farm' | 'factory';

export interface CardDef {
    id: string;
    name: string;
    cost: number;
    vp: number;
    copies: number;
    tags: CardTag[];
    unsellable: boolean;
    consumeOnUse: boolean;
    effectText: string;
    image?: string; // カード画像パス（public/cards/以下）
    // Glory Expansion
    workerReq?: number; // 複数ワーカー配置 (default: 1)
    variableCostType?: 'vp_token' | 'hand_odd' | 'hand_zero';
    variableCostParam?: number; // 閾値など
}

export interface Card {
    uid: string;
    defId: string;
}

/** 建設済み建物スロット */
export interface BuildingSlot {
    card: Card;
    workerPlaced: boolean; // このラウンドでワーカーが配置されたか
}

/** 公共職場スロット */
export interface Workplace {
    id: string;
    name: string;
    effectText: string;
    multipleAllowed: boolean;
    workers: number[];
    specialEffect: string;
    addedAtRound: number;
    fromBuilding: boolean;
    fromBuildingDefId?: string;
}

/** カード捨て選択状態 */
export interface DiscardState {
    count: number;
    reason: string;
    selectedIndices: number[];
    callbackAction: string;
    callbackData: Record<string, number | string>;
    excludeCardUid?: string; // 建設対象カード等、選択不可のカードUID
}

/** 建設選択状態 */
export interface BuildSelectState {
    costReduction: number;
    drawAfterBuild: number;
    action: string; // 'build','construction_co','pioneer','general_contractor','dual_construction'
}

/** 給料日 個別プレイヤー状態 */
export interface PaydayPlayerState {
    totalWage: number;
    needsSelling: boolean;       // 売却操作が必要か
    selectedBuildingIndices: number[]; // 売却選択中の建物インデックス
    confirmed: boolean;          // 操作完了したか
}

/** 給料日状態（全プレイヤー同時処理） */
export interface PaydayState {
    wagePerWorker: number;
    playerStates: { [pid: string]: PaydayPlayerState };
    // 後方互換用: 現在操作表示用に残すが、同時処理では複数プレイヤーが操作中
    currentPlayerIndex: number;
    totalWage: number;
    selectedBuildingIndices: number[];
}

/** 精算 個別プレイヤー状態 */
export interface CleanupPlayerState {
    excessCount: number;
    selectedIndices: number[];
    confirmed: boolean;          // 操作完了したか
}

/** 精算状態（全プレイヤー同時処理） */
export interface CleanupState {
    playerStates: { [pid: string]: CleanupPlayerState };
    // 後方互換用
    currentPlayerIndex: number;
    excessCount: number;
    selectedIndices: number[];
}

/** 設計事務所 選択状態 */
export interface DesignOfficeState {
    revealedCards: Card[];
}

/** 二胡市建設 選択状態 */
export interface DualConstructionState {
    selectedCardIndices: number[]; // 選択した手札のインデックス (最大2枚)
}

/** スコア: 個別建物VP */
export interface BuildingVPDetail {
    name: string;
    baseVP: number;
    bonusVP: number;
}

export interface PlayerState {
    hand: Card[];
    money: number;
    workers: number;
    availableWorkers: number;
    buildings: BuildingSlot[];
    unpaidDebts: number;
    maxHandSize: number;
    maxWorkers: number;
    // Glory Expansion
    vpTokens: number;
    robotWorkers: number;
}

export type GameVersion = 'base' | 'glory';

export interface GameState {
    version: GameVersion;
    players: { [key: string]: PlayerState };
    publicWorkplaces: Workplace[];
    household: number;
    round: number;
    phase: 'work' | 'discard' | 'build' | 'payday' | 'cleanup' | 'gameEnd' | 'designOffice' | 'dualConstruction' | 'choice_village' | 'choice_automaton' | 'choice_modernism' | 'choice_teleporter' | 'choice_skyscraper';
    startPlayer: number;
    deck: Card[];
    discard: Card[];
    consumableCounter: number;
    numPlayers: number;

    discardState: DiscardState | null;
    buildState: BuildSelectState | null;
    paydayState: PaydayState | null;
    cleanupState: CleanupState | null;
    designOfficeState: DesignOfficeState | null;
    dualConstructionState: DualConstructionState | null;

    activePlayer: number; // 現在操作中のプレイヤー (payday/cleanup用)

    log: { text: string; round: number }[]; // ゲームログ

    finalScores: { playerIndex: number; score: number; breakdown: ScoreBreakdown }[] | null;

    /** P2P（オンライン）モードかどうか */
    isOnline: boolean;

    /** 統計データ（グラフ描画用） */
    stats?: GameStats;
}

export interface PlayerRoundStat {
    round: number;
    money: number;
    workers: number;
    buildingCount: number;
    unpaidDebts: number;
    vpTokens: number;
    currentVP: number;
}

export interface GameStats {
    players: Record<string, PlayerRoundStat[]>;
}

export interface ScoreBreakdown {
    buildingVP: number;
    moneyVP: number;
    debtVP: number;
    bonusVP: number;
    total: number;
    buildingDetails: BuildingVPDetail[];
    // 負債内訳
    rawDebts: number;        // 元の未払い賃金枚数
    exemptedDebts: number;   // 法律事務所による免除枚数
    hasLawOffice: boolean;   // 法律事務所を所持しているか
}

// ============================================================
// boardgame.io moves の型定義（Board.tsx サブコンポーネント用）
// ============================================================
export interface GameMoves {
    placeWorker: (workplaceId: string) => void;
    placeWorkerOnBuilding: (cardUid: string) => void;
    selectBuildCard: (cardIndex: number) => void;
    toggleDiscard: (cardIndex: number) => void;
    confirmDiscard: () => void;
    cancelAction: () => void;
    selectDesignOfficeCard: (cardIndex: number) => void;
    toggleDualCard: (cardIndex: number) => void;
    confirmDualConstruction: () => void;
    togglePaydaySell: (buildingIndex: number) => void;
    confirmPaydaySell: () => void;
    confirmPayday: () => void;
    selectVillageOption: (option: 'draw_consumable' | 'draw_building') => void;
    debug_setState: (payload: any) => void;
}
