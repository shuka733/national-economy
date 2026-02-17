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

/** 給料日状態 */
export interface PaydayState {
    currentPlayerIndex: number;
    wagePerWorker: number;
    totalWage: number;
    selectedBuildingIndices: number[]; // 売却選択中の建物インデックス
}

/** 精算状態 */
export interface CleanupState {
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
}

export interface GameState {
    players: { [key: string]: PlayerState };
    publicWorkplaces: Workplace[];
    household: number;
    round: number;
    phase: 'work' | 'discard' | 'build' | 'payday' | 'cleanup' | 'gameEnd' | 'designOffice' | 'dualConstruction';
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
