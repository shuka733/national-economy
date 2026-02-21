// ============================================================
// bots.ts  –  CPU AI ロジック (v3: 戦略ガイド完全準拠)
// ============================================================
// 主な改善点:
//   1. 自転車操業（Build→Sell）パイプライン
//   2. ワーカー残数による配置タイミング戦略
//   3. 家計監視の高度化（空打ち防止 + タイミング認識）
//   4. 売却 vs 建設の統合判断（公共化リスク考慮）
//   5. スタートプレイヤー争奪（次R認識）
//   6. 終盤VP最大化（ボーナス期待値シミュレーション）
//   7. Payday損益分岐の厳密化
//   8. Discard精度向上（既建設・消費財計画保持）
// ============================================================
import type { GameState, PlayerState, Workplace, Card } from './types';
import { getCardDef, CONSUMABLE_DEF_ID, CARD_DEFS } from './cards';
import { getConstructionCost, canBuildModernism } from './game';

// ============================================================
// 型定義
// ============================================================
export type AIDifficulty = 'random' | 'heuristic';

export interface CPUAction {
    moveName: string;
    args: any[];
}

// ============================================================
// ユーティリティ
// ============================================================
function isConsumable(c: Card): boolean {
    return c.defId === CONSUMABLE_DEF_ID;
}

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getWagePerWorker(round: number): number {
    if (round <= 2) return 2;
    if (round <= 5) return 3;
    if (round <= 7) return 4;
    return 5;
}

/** 破産防止: 増員しても次ラウンドの賃金を払えるか判定 */
function canAffordHire(G: GameState, pid: string): boolean {
    const p = G.players[pid];
    if (G.round <= 1) return true; // R1は攻める
    const nextRoundWage = getWagePerWorker(G.round + 1);
    const futureTotalWage = nextRoundWage * (p.workers + 1);
    const sellableValue = p.buildings
        .filter(b => !getCardDef(b.card.defId).unsellable)
        .reduce((sum, b) => sum + getCardDef(b.card.defId).vp, 0);
    const totalAssets = p.money + sellableValue;
    return totalAssets >= futureTotalWage * 1.2;
}

// ============================================================
// game.ts バリデーション関数の再実装（AI判断用）
// ============================================================
function canBuildAnything(p: PlayerState, costReduction: number): boolean {
    for (const card of p.hand) {
        if (isConsumable(card)) continue;
        const cost = getConstructionCost(p, card.defId, costReduction);
        if (p.hand.length - 1 >= cost) return true;
    }
    return false;
}

function canBuildFarmFree(p: PlayerState): boolean {
    return p.hand.some(c => !isConsumable(c) && getCardDef(c.defId).tags.includes('farm'));
}

function canDualConstruct(p: PlayerState): boolean {
    const costGroups: Record<number, number> = {};
    const buildingCards = p.hand.filter(c => !isConsumable(c));
    for (const c of buildingCards) {
        const def = getCardDef(c.defId);
        costGroups[def.cost] = (costGroups[def.cost] || 0) + 1;
    }
    for (const [costStr, count] of Object.entries(costGroups)) {
        if (count >= 2) {
            const cost = parseInt(costStr);
            if (p.hand.length - 2 >= cost) return true;
        }
    }
    return false;
}

function canPlaceOnBuildingWP(G: GameState, p: PlayerState, defId: string): boolean {
    switch (defId) {
        case 'factory': return p.hand.length >= 2;
        case 'auto_factory': return p.hand.length >= 3;
        case 'restaurant': return p.hand.length >= 1 && G.household >= 15;
        case 'coffee_shop': return G.household >= 5;
        case 'construction_co': return canBuildAnything(p, 1);
        case 'pioneer': return canBuildFarmFree(p);
        case 'general_contractor': return canBuildAnything(p, 0);
        case 'dual_construction': return canDualConstruct(p);

        // Glory matching game.ts
        case 'gl_steam_factory': return p.hand.length >= 2;
        case 'gl_locomotive_factory': return p.hand.length >= 3;
        case 'gl_theater': return p.hand.length >= 2;
        case 'gl_colonist': return canBuildAnything(p, 0);
        case 'gl_skyscraper': return canBuildAnything(p, 0);
        case 'gl_modernism_construction':
            return canBuildModernism(p);

        case 'gl_teleporter': return canBuildAnything(p, 99);

        default: return true;
    }
}

function parseSellEffect(se: string): { count: number; amount: number } | null {
    const m = se.match(/^sell_(\d+)_(\d+)$/);
    if (!m) return null;
    return { count: parseInt(m[1]), amount: parseInt(m[2]) };
}

// ============================================================
// フェーズ判定ヘルパー
// ============================================================
type GamePhaseCategory = 'early' | 'mid' | 'late';

function getPhase(round: number): GamePhaseCategory {
    if (round <= 3) return 'early';
    if (round <= 6) return 'mid';
    return 'late';
}

// ============================================================
// 戦略ガイド§4-B: 公共化リスク（売却で相手を利する度合い）
// 高い = 売りたくない（公共職場として強すぎる）
// ============================================================
const SELL_DANGER: Record<string, number> = {
    // 禁止級: 公共化すると全員が超有利
    restaurant: 12,       // $15を全員が取れる → 壊滅的
    construction_co: 10,  // 建設コスト-1 → 他社建設加速
    general_contractor: 10, // 建設+ドロー → 最強級
    dual_construction: 9, // 2軒同時 → ゲーム崩壊レベル
    pioneer: 8,           // 無料農園建設 → 高い
    // 注意: 公共化するとやや有利
    coffee_shop: 5,       // $5は比較的軽い
    steel_mill: 4,        // ドロー系は一長一短
    chemical_plant: 4,
    auto_factory: 4,
    // 低リスク: 公共化しても影響小
    factory: 2,
    design_office: 2,
    large_farm: 2,
    orchard: 2,
    farm: 1,
    slash_burn: 0,        // 使い捨てなので関係なし
};

// ============================================================
// 戦略ガイド: 建物のカテゴリ分類（売却判断用）
// ============================================================
type CardCategory = 'draw' | 'production' | 'income' | 'construction' | 'bonus' | 'utility' | 'pure_vp';

function getCardCategory(defId: string): CardCategory {
    switch (defId) {
        case 'factory': case 'auto_factory': case 'steel_mill':
        case 'chemical_plant': case 'design_office':
        // Glory Draw
        case 'gl_steam_factory': case 'gl_locomotive_factory': case 'gl_poultry_farm':
        case 'gl_cotton_farm': case 'gl_coal_mine': case 'gl_refinery':
        case 'gl_greenhouse': case 'gl_studio': // Studio draws + VP
            return 'draw';
        case 'farm': case 'slash_burn': case 'orchard':
        case 'large_farm':
        // Glory Production
        case 'gl_village': // Draws cons
            return 'production';
        case 'coffee_shop': case 'restaurant':
        // Glory Income
        case 'gl_game_cafe': case 'gl_museum': case 'gl_theater':
            return 'income';
        case 'construction_co': case 'general_contractor':
        case 'pioneer': case 'dual_construction':
        // Glory Construction
        case 'gl_colonist': case 'gl_skyscraper': case 'gl_modernism_construction':
        case 'gl_teleporter':
            return 'construction';
        case 'real_estate': case 'agri_coop': case 'labor_union':
        case 'headquarters': case 'railroad':
        // Glory Bonus
        case 'gl_consumers_coop': case 'gl_guild_hall': case 'gl_ivory_tower':
        case 'gl_revolution_square': case 'gl_harvest_festival': case 'gl_tech_exhibition':
        case 'gl_temple_of_purification':
            return 'bonus';
        case 'warehouse': case 'company_housing': case 'law_office':
        // Glory Utility
        case 'gl_automaton': // Robot worker!
        case 'gl_relic': // VP tokens
            return 'utility';
        case 'mansion':
            return 'pure_vp';
        default:
            return 'draw';
    }
}

// ============================================================
// 終盤VP期待値計算（戦略ガイド§3、§2-終盤-1）
// ============================================================
function estimateBonusVP(G: GameState, pid: string): Record<string, number> {
    const p = G.players[pid];
    const result: Record<string, number> = {};
    const has = (id: string) => p.buildings.some(b => b.card.defId === id);

    if (has('real_estate')) {
        // +3VP per building（自分含む）
        result['real_estate'] = p.buildings.length * 3;
    }
    if (has('agri_coop')) {
        // +3VP per consumable in hand at end
        const consumables = p.hand.filter(c => isConsumable(c)).length;
        result['agri_coop'] = consumables * 3;
    }
    if (has('labor_union')) {
        // +6VP per worker
        result['labor_union'] = p.workers * 6;
    }
    if (has('headquarters')) {
        // +6VP per unsellable building
        result['headquarters'] = p.buildings.filter(b => getCardDef(b.card.defId).unsellable).length * 6;
    }
    if (has('railroad')) {
        // +8VP per factory-tagged building
        result['railroad'] = p.buildings.filter(b => getCardDef(b.card.defId).tags.includes('factory')).length * 8;
    }

    // Glory: Specific card bonuses
    if (has('gl_consumers_coop')) {
        const agriValue = p.buildings
            .filter(b => getCardDef(b.card.defId).tags.includes('farm'))
            .reduce((sum, b) => sum + getCardDef(b.card.defId).vp, 0);
        if (agriValue >= 20) result['gl_consumers_coop'] = 18;
    }
    if (has('gl_guild_hall')) {
        const hasFarm = p.buildings.some(b => getCardDef(b.card.defId).tags.includes('farm'));
        const hasFactory = p.buildings.some(b => getCardDef(b.card.defId).tags.includes('factory'));
        if (hasFarm && hasFactory) result['gl_guild_hall'] = 20;
    }
    if (has('gl_ivory_tower')) {
        if (p.vpTokens >= 7) result['gl_ivory_tower'] = 22;
    }
    if (has('gl_revolution_square')) {
        const humanWorkers = p.workers - p.robotWorkers;
        if (humanWorkers >= 5) result['gl_revolution_square'] = 18;
    }
    if (has('gl_harvest_festival')) {
        const consumables = p.hand.filter(c => isConsumable(c)).length;
        if (consumables >= 4) result['gl_harvest_festival'] = 26;
    }
    if (has('gl_tech_exhibition')) {
        const factoryValue = p.buildings
            .filter(b => getCardDef(b.card.defId).tags.includes('factory'))
            .reduce((sum, b) => sum + getCardDef(b.card.defId).vp, 0);
        if (factoryValue >= 30) result['gl_tech_exhibition'] = 24;
    }
    if (has('gl_temple_of_purification')) {
        const unsellables = p.buildings.filter(b => getCardDef(b.card.defId).unsellable);
        if (unsellables.length === 1 && unsellables[0].card.defId === 'gl_temple_of_purification') {
            result['gl_temple_of_purification'] = 30;
        }
    }

    return result;
}

/** あるカードを建設した場合のボーナスVP増分を計算 */
function estimateBonusGainIfBuilt(G: GameState, pid: string, defId: string): number {
    const p = G.players[pid];
    const has = (id: string) => p.buildings.some(b => b.card.defId === id);
    const def = getCardDef(defId);
    let gain = 0;

    // このカードを建てると不動産屋のボーナスが+3
    if (has('real_estate')) gain += 3;

    // このカードが売却不可なら本社ビルのボーナスが+6
    if (has('headquarters') && def.unsellable) gain += 6;

    // このカードが工場タグなら鉄道のボーナスが+8
    if (has('railroad') && def.tags.includes('factory')) gain += 8;

    // このカード自体がボーナス建物の場合、現在の構成に基づく即時ボーナス
    if (defId === 'real_estate') {
        gain += (p.buildings.length + 1) * 3; // 自分を含む全建物
    }
    if (defId === 'headquarters') {
        gain += p.buildings.filter(b => getCardDef(b.card.defId).unsellable).length * 6;
        if (def.unsellable) gain += 6; // 自身も売却不可
    }
    if (defId === 'railroad') {
        gain += p.buildings.filter(b => getCardDef(b.card.defId).tags.includes('factory')).length * 8;
        if (def.tags.includes('factory')) gain += 8;
    }
    if (defId === 'labor_union') {
        gain += p.workers * 6;
    }
    if (defId === 'agri_coop') {
        const consumables = p.hand.filter(c => isConsumable(c)).length;
        gain += consumables * 3;
    }

    // Glory Bonuses
    if (defId === 'gl_consumers_coop') {
        const agriValue = p.buildings
            .filter(b => getCardDef(b.card.defId).tags.includes('farm'))
            .reduce((sum, b) => sum + getCardDef(b.card.defId).vp, 0);
        if (agriValue + def.vp >= 20) gain += 18;
    }
    if (defId === 'gl_guild_hall') {
        const hasFarm = p.buildings.some(b => getCardDef(b.card.defId).tags.includes('farm')) || def.tags.includes('farm');
        const hasFactory = p.buildings.some(b => getCardDef(b.card.defId).tags.includes('factory')) || def.tags.includes('factory');
        if (hasFarm && hasFactory) gain += 20;
    }
    if (defId === 'gl_ivory_tower' && p.vpTokens >= 7) gain += 22;
    if (defId === 'gl_revolution_square' && (p.workers - p.robotWorkers) >= 5) gain += 18;
    if (defId === 'gl_harvest_festival' && p.hand.filter(c => isConsumable(c)).length >= 4) gain += 26;
    if (defId === 'gl_tech_exhibition') {
        const factoryValue = p.buildings
            .filter(b => getCardDef(b.card.defId).tags.includes('factory'))
            .reduce((sum, b) => sum + getCardDef(b.card.defId).vp, 0);
        if (factoryValue + def.vp >= 30) gain += 24;
    }

    // Synergy with existing bonuses
    if (has('gl_consumers_coop') && def.tags.includes('farm')) {
        const agriValueBefore = p.buildings
            .filter(b => getCardDef(b.card.defId).tags.includes('farm'))
            .reduce((sum, b) => sum + getCardDef(b.card.defId).vp, 0);
        if (agriValueBefore < 20 && agriValueBefore + def.vp >= 20) gain += 18;
    }
    if (has('gl_tech_exhibition') && def.tags.includes('factory')) {
        const factValueBefore = p.buildings
            .filter(b => getCardDef(b.card.defId).tags.includes('factory'))
            .reduce((sum, b) => sum + getCardDef(b.card.defId).vp, 0);
        if (factValueBefore < 30 && factValueBefore + def.vp >= 30) gain += 24;
    }

    return gain;
}

// ============================================================
// 自転車操業判定: 「建てて即売却」が有効なラウンドか
// 戦略ガイド§1: 序盤の基本戦略
// ============================================================
function shouldBicycleOperate(G: GameState, pid: string): boolean {
    const p = G.players[pid];
    const phase = getPhase(G.round);
    const wage = getWagePerWorker(G.round);
    const totalWage = wage * p.workers;

    // 常に賃金の2倍未満なら自転車操業モード
    if (p.money < totalWage * 2) return true;
    // 序盤は特に積極的に
    if (phase === 'early' && p.money < totalWage * 3) return true;
    return false;
}

// ============================================================
// 建物の「使用価値」推定: 建てた後に何回使えるか × 効果の価値
// 戦略: 建てて使って最終的にPaydayで売る = VP + 使用効果
// ============================================================
function estimateUsageValue(G: GameState, pid: string, defId: string): number {
    const p = G.players[pid];
    const remainingRounds = 9 - G.round;
    // 建設ラウンドでは使えないので-1（ただし即使用建物は別）
    const usableRounds = Math.max(0, remainingRounds - 1);
    // 何回使えるかは、使えるラウンド数とワーカー数に依存
    // 現実的には毎ラウンド1回使えるとして、usableRoundsが上限
    const timesUsable = Math.min(usableRounds, 3); // 最大3回で十分

    // 売却手段があるか（消費財→現金変換のパイプライン）
    const bestSellAmount = G.publicWorkplaces.reduce((best, wp) => {
        const si = parseSellEffect(wp.specialEffect);
        if (si && G.household >= si.amount) return Math.max(best, si.amount);
        return best;
    }, 0);

    switch (defId) {
        // 生産系: 消費財を生産 → 売却で現金化
        case 'farm':
            // 消費財2枚 → 最低でも露店$6、市場$12で売れる
            return timesUsable * (bestSellAmount > 0 ? 8 : 2);
        case 'large_farm':
            return timesUsable * (bestSellAmount > 0 ? 12 : 3);
        case 'orchard':
            return timesUsable * (bestSellAmount > 0 ? 10 : 3);
        case 'slash_burn':
            // 使い捨てだが消費財5枚 = 万博$30相当
            return bestSellAmount > 0 ? 20 : 5;

        // ドロー系: 手札を増やす → 建設・売却の燃料
        case 'steel_mill':
            return timesUsable * 15; // 3ドロー = 極めて強力
        case 'chemical_plant':
            return timesUsable * 12;
        case 'factory':
            return timesUsable * 10; // 実質+2ドロー
        case 'auto_factory':
            return timesUsable * 18; // 実質+4ドロー
        case 'design_office':
            return timesUsable * 5;

        // 金策系: 直接現金を生む
        case 'coffee_shop':
            return timesUsable * 5; // $5/回
        case 'restaurant':
            return timesUsable * 15; // $15/回（最強）

        // 建設系: 他の建物を建てる効率UP
        case 'construction_co':
            return timesUsable * 8;
        case 'general_contractor':
            return timesUsable * 7;
        case 'dual_construction':
            return timesUsable * 12;
        case 'pioneer':
            return timesUsable * 6;

        // ユーティリティ: 間接的な価値
        case 'warehouse':
            return timesUsable * 3;
        case 'company_housing':
            return usableRounds > 2 ? 10 : 2;
        case 'law_office':
            return p.unpaidDebts > 0 ? p.unpaidDebts * 3 : 5;

        // 純VP/ボーナス: 使用価値はないが保持価値はVPそのもの
        // Glory
        case 'gl_steam_factory': return timesUsable * 12; // discard 2 -> draw 4
        case 'gl_locomotive_factory': return timesUsable * 16; // discard 3 -> draw 7
        case 'gl_poultry_farm': return timesUsable * 8; // draw 2 or 3
        case 'gl_cotton_farm': return timesUsable * 14; // draw 5 cons (strong)
        case 'gl_coal_mine': return timesUsable * 18; // draw 5 cards (strong)
        case 'gl_refinery': return timesUsable * 12; // draw 3
        case 'gl_greenhouse': return timesUsable * 10; // draw 4 cons

        case 'gl_village': return timesUsable * 5; // draw 2 cons
        case 'gl_game_cafe': return timesUsable * 7; // $5 or $10
        case 'gl_museum': return timesUsable * 10; // $7 or $14
        case 'gl_theater': return timesUsable * 20; // $20 (discard 2)

        case 'gl_studio': return timesUsable * 8; // draw 1 + VP token (worth 3.3) -> ~7-8
        case 'gl_colonist': return timesUsable * 7; // build + draw cons
        case 'gl_skyscraper': return timesUsable * 7; // build (+ draw)
        case 'gl_modernism_construction': return timesUsable * 10; // build cheap
        case 'gl_teleporter': return timesUsable * 15; // build free (very strong)

        case 'gl_automaton': return 50; // Extra worker = Huge value

        default:
            return 0;
    }
}

// ============================================================
// メインエントリ
// ============================================================
export function decideCPUMove(
    G: GameState,
    playerID: string,
    difficulty: AIDifficulty
): CPUAction | null {
    switch (G.phase) {
        case 'work':
            return decideWorkPhase(G, playerID, difficulty);
        case 'build':
            return decideBuildPhase(G, playerID, difficulty);
        case 'discard':
            return decideDiscardPhase(G, playerID, difficulty);
        case 'payday':
            return decidePaydayPhase(G, playerID);
        case 'cleanup':
            return decideCleanupPhase(G, playerID);
        case 'designOffice':
            return decideDesignOfficePhase(G, playerID, difficulty);
        case 'dualConstruction':
            return decideDualConstructionPhase(G, playerID, difficulty);
        case 'choice_village':
            return decideVillageChoicePhase(G, playerID);
        case 'choice_automaton':
            return decideAutomatonChoicePhase(G, playerID);
        case 'choice_modernism':
            return decideModernismChoicePhase(G, playerID, difficulty);
        case 'choice_teleporter':
            return decideTeleporterChoicePhase(G, playerID, difficulty);
        case 'choice_skyscraper':
            return decideSkyscraperChoicePhase(G, playerID, difficulty);
        default:
            return null;
    }
}

// ============================================================
// Work Phase: ワーカー配置
// 改善②: 残りワーカー数で評価を動的変化
// ============================================================
function decideWorkPhase(
    G: GameState,
    pid: string,
    difficulty: AIDifficulty
): CPUAction | null {
    const p = G.players[pid];
    if (p.availableWorkers <= 0) return null;

    const validPublic = getValidPublicWorkplaces(G, pid);
    const validBuildings = getValidBuildingPlacements(G, pid);

    const allMoves: { action: CPUAction; priority: number }[] = [];

    for (const wp of validPublic) {
        const priority = difficulty === 'heuristic'
            ? evaluatePublicWorkplace(G, pid, wp)
            : Math.random() * 10;
        allMoves.push({
            action: { moveName: 'placeWorker', args: [wp.id] },
            priority,
        });
    }

    for (const b of validBuildings) {
        const def = getCardDef(b.card.defId);
        const priority = difficulty === 'heuristic'
            ? evaluateBuildingWorkplace(G, pid, def.id)
            : Math.random() * 10;
        allMoves.push({
            action: { moveName: 'placeWorkerOnBuilding', args: [b.card.uid] },
            priority,
        });
    }

    if (allMoves.length === 0) return null;

    if (difficulty === 'random') {
        return pickRandom(allMoves).action;
    }

    allMoves.sort((a, b) => b.priority - a.priority);
    return allMoves[0].action;
}

/** 配置可能な公共職場を返す */
function getValidPublicWorkplaces(G: GameState, pid: string): Workplace[] {
    const p = G.players[pid];
    return G.publicWorkplaces.filter(wp => {
        if (!wp.multipleAllowed && wp.workers.length > 0) return false;
        if (wp.specialEffect === 'hire_worker' && p.workers >= p.maxWorkers) return false;
        if (wp.specialEffect === 'expand4' && p.workers >= 4) return false;
        if (wp.specialEffect === 'expand5' && p.workers >= 5) return false;
        if (wp.specialEffect === 'hire_immediate' && p.workers >= p.maxWorkers) return false;
        if (wp.specialEffect === 'build' && !canBuildAnything(p, 0)) return false;

        const sellInfo = parseSellEffect(wp.specialEffect);
        if (sellInfo) {
            if (p.hand.length < sellInfo.count) return false;
            if (G.household < sellInfo.amount) return false;
        }

        if (wp.fromBuildingDefId && !canPlaceOnBuildingWP(G, p, wp.fromBuildingDefId)) return false;

        let workerCost = 1;
        if (wp.fromBuildingDefId) {
            const def = getCardDef(wp.fromBuildingDefId);
            if (def.workerReq) workerCost = def.workerReq;
        }
        if (p.availableWorkers < workerCost) return false;

        return true;
    });
}

/** 配置可能な個人建物を返す */
function getValidBuildingPlacements(G: GameState, pid: string) {
    const p = G.players[pid];
    return p.buildings.filter(b => {
        if (b.workerPlaced) return false;
        const def = getCardDef(b.card.defId);

        // Check worker requirements (Glory cards might need 2)
        const req = def.workerReq || 1;
        if (p.availableWorkers < req) return false;

        if (def.unsellable && b.card.defId !== 'slash_burn') return false;
        if (!canPlaceOnBuildingWP(G, p, b.card.defId)) return false;
        return true;
    });
}

// ============================================================
// 破産防止: 増員安全チェック
// 全増員系アクション共通で使用
// ============================================================
function isSafeToHire(G: GameState, pid: string): boolean {
    const p = G.players[pid];
    if (G.round <= 1) return true; // R1は攻めるのでチェックしない

    const nextRoundWage = getWagePerWorker(G.round + 1);
    const futureTotalWage = nextRoundWage * (p.workers + 1);

    // 現在の資産（現金 + 売却可能建物のVP総額）
    const sellableValue = p.buildings
        .filter(b => !getCardDef(b.card.defId).unsellable)
        .reduce((sum, b) => sum + getCardDef(b.card.defId).vp, 0);

    // 消費財の潜在的な売却価値（最低でも露店$6/1枚として計算）
    const consumableCount = p.hand.filter(c => isConsumable(c)).length;
    const consumableValue = Math.min(consumableCount, 2) * 6; // 最大2枚分まで

    const totalAssets = p.money + sellableValue + consumableValue;

    // ラウンドに応じた安全マージン（序盤=緩、中盤=厳、終盤=最厳）
    let safetyMultiplier: number;
    if (G.round <= 3) safetyMultiplier = 1.5;
    else if (G.round <= 6) safetyMultiplier = 2.0;
    else safetyMultiplier = 3.0; // R7+は非常に高い余裕が必要
    return totalAssets >= futureTotalWage * safetyMultiplier;
}

// ============================================================
// ヒューリスティック: 公共職場の評価
// v3: 全改善点を統合
// ============================================================
function evaluatePublicWorkplace(G: GameState, pid: string, wp: Workplace): number {
    const p = G.players[pid];
    const round = G.round;
    const phase = getPhase(round);
    const consumableCount = p.hand.filter(c => isConsumable(c)).length;
    const buildingCards = p.hand.filter(c => !isConsumable(c));
    const wage = getWagePerWorker(round);
    const totalWage = wage * p.workers;
    const moneyShortfall = totalWage - p.money; // 正なら賃金不足
    const isLastWorker = p.availableWorkers === 1;
    const isFirstWorker = p.availableWorkers === p.workers; // ラウンド最初の配置

    // ──────────────────────────────────────
    // 改善③: 家計残高比率による売却効率の補正
    // 家計が少ない = 売却してもお金が入らない or 非効率
    // ──────────────────────────────────────
    const sellInfo = parseSellEffect(wp.specialEffect);
    if (sellInfo) {
        if (G.household < sellInfo.amount) return 0;
        if (p.hand.length < sellInfo.count) return 0;

        const canPayWithConsumables = consumableCount >= sellInfo.count;
        // ★核心: 1ワーカーあたりの獲得金額で評価
        // 露店$6 / 市場$12 / スーパー$18 / 百貨店$24 / 万博$30
        // アクション効率ボーナス: 売却額が大きいほど高スコア
        const actionEfficiency = sellInfo.amount / 6; // 露店=1, 市場=2, スーパー=3...
        const efficiencyBonus = (actionEfficiency - 1) * 8; // 露店+0, 市場+8, スーパー+16, 百貨店+24

        // ★改善②: もっと高効率の売却場があるのに低効率で売るのを抑制
        // 消費財を温存して高額売却場に回すべきかどうか判定
        const betterSellAvailable = G.publicWorkplaces.some(otherWp => {
            if (otherWp.id === wp.id) return false;
            const otherSell = parseSellEffect(otherWp.specialEffect);
            if (!otherSell) return false;
            if (otherSell.amount <= sellInfo.amount) return false; // 自分以下は無視
            if (G.household < otherSell.amount) return false; // 家計が足りない
            if (!otherWp.multipleAllowed && otherWp.workers.length > 0) return false; // 既に埋まっている
            // 今の消費財で高額売却場を使える → そちらを優先すべき
            return consumableCount >= otherSell.count;
        });
        const scarcityPenalty = betterSellAvailable ? -20 : 0;

        const lastWorkerBonus = isLastWorker && moneyShortfall > 0 ? 5 : 0;

        // 給料が払えないなら最優先で金策
        // V6修正: 金策時のスコア上限を引き上げ（他アクションに負けないようにする）
        // ★改善②: 賃金不足でも高効率売却場を優先（scarcityPenaltyは半減で適用）
        if (moneyShortfall > 0) {
            const base = canPayWithConsumables ? 90 : 80;
            return Math.min(base + efficiencyBonus + lastWorkerBonus + Math.floor(scarcityPenalty / 2), 100);
        }

        // V6修正: 中盤以降、賃金の半分以下しか持っていない場合の金策ブースト
        if (phase !== 'early' && p.money < totalWage * 0.5 && canPayWithConsumables) {
            return Math.min(78 + efficiencyBonus + Math.floor(scarcityPenalty / 2), 95);
        }

        // 給料は払えるが売却は常に強い行動（$=VP）
        // ユーザーフィードバック: 金策の評価を全体的に下げる
        // 露店(ボーナス0)は40点、市場(ボーナス8)は48点程度に抑え、建設(60点~)を優先させる
        // ★改善②: 高効率売却場があるなら低効率売却を-20（フルペナルティ）
        if (canPayWithConsumables) {
            if (phase === 'late') return Math.min(85 + efficiencyBonus + scarcityPenalty, 98);
            return Math.min(40 + efficiencyBonus + scarcityPenalty, 70);
        }

        // 建物カードを犠牲にする売却
        if (p.hand.length > p.maxHandSize) return Math.min(45 + efficiencyBonus + scarcityPenalty, 75);
        if (phase === 'late') return Math.min(40 + efficiencyBonus + scarcityPenalty, 75);
        // 序盤・中盤の手札犠牲売却はさらに評価を下げる
        return Math.min(10 + efficiencyBonus + scarcityPenalty, 50);
    }

    // ──────────────────────────────────────
    // ワーカー増員系
    // 改善②: 最初のワーカーで増員を狙う
    // 戦略ガイド§2-序盤-1: 「学校」は未払い賃金が発生してでも実行
    // ──────────────────────────────────────
    switch (wp.specialEffect) {
        case 'hire_worker': {
            if (p.workers >= p.maxWorkers) return 0;
            // 最後のワーカーなら金策を優先すべき
            if (isLastWorker && moneyShortfall > 0) return 10;
            // お金が全くない状態で増員は危険（序盤以外）
            if (moneyShortfall > wage * 2 && phase !== 'early') return 5;

            // V5修正: 破産防止 (Safety Check) — 共通ヘルパー使用
            if (!isSafeToHire(G, pid)) return 0;

            // 中盤の精密チェック用に資産を計算
            const nextRoundWage = getWagePerWorker(round + 1);
            const futureTotalWage = nextRoundWage * (p.workers + 1);
            const sellableValue = p.buildings
                .filter(b => !getCardDef(b.card.defId).unsellable)
                .reduce((sum, b) => sum + getCardDef(b.card.defId).vp, 0);
            const totalAssets = p.money + sellableValue;

            if (phase === 'early') {
                // 戦略ガイド: R1初手で増員 = MAX (V4: さらに強化)
                // ユーザー要望: 序盤に人数を増やすべき
                if (isFirstWorker && p.workers <= 2) return 180; // ほぼ絶対
                if (p.workers <= 2) return 150;
                if (p.workers === 3) return 110;
                return 80;
            }
            if (phase === 'mid') {
                // 戦略ガイド§2-中盤-1: 4~5人推奨 だが資金確保が先
                if (p.workers <= 3) return 80;
                // 4人目以降は非常に慎重に（2.5倍の余裕が必要）
                if (p.workers === 4 && totalAssets >= futureTotalWage * 2.5) return 50;
                return 5;
            }
            // 終盤: 増やしても賃金消費のみ
            return 3;
        }

        case 'expand4': {
            if (p.workers >= 4) return 0;
            if (isLastWorker && moneyShortfall > 0) return 10;
            if (moneyShortfall > wage * 2 && phase !== 'early') return 12;

            // V5修正: 破産防止 (Safety Check)
            if (!isSafeToHire(G, pid)) return 0;

            if (phase === 'early') {
                if (p.workers <= 2) return 120;
                if (p.workers === 3) return 100;
            }
            if (phase === 'mid') {
                if (p.workers <= 3) return 88;
            }
            return 8;
        }

        case 'expand5': {
            if (p.workers >= 5) return 0;
            if (isLastWorker && moneyShortfall > 0) return 10;

            // V5修正: 破産防止 (Safety Check)
            if (!isSafeToHire(G, pid)) return 0;

            if (p.workers <= 3) return 86;
            if (p.workers === 4) {
                // 戦略ガイド: 4→5人は賃金との相談
                if (p.money >= totalWage + wage * 2) return 65;
                if (phase === 'mid') return 50;
                return 15;
            }
            return 10;
        }

        case 'hire_immediate': {
            if (p.workers >= p.maxWorkers) return 0;
            if (isLastWorker && moneyShortfall > 0) return 8;

            // V5修正: 破産防止 (Safety Check)
            if (!isSafeToHire(G, pid)) return 0;

            // 専門学校(R8)は即使用可 → 残りラウンドが少ないので慎重
            if (p.workers <= 4) return 60;
            return 20;
        }

        // ──────────────────────────────────────
        // 改善⑤: スタートプレイヤー争奪
        // 戦略ガイド§4-C: 次Rに重要アクション → 優先度UP
        // ──────────────────────────────────────
        case 'start_player_draw': {
            let score = 40;
            if (p.hand.length <= 1) score += 30; // 手札枯渇リカバリー
            else if (p.hand.length <= 2) score += 20;

            const nextRound = round + 1;
            // 次Rに増員系が登場 → スタP争奪がクリティカル
            if (nextRound === 4 && p.workers < 4) score += 25; // 高等学校
            else if (nextRound === 6 && p.workers < 5) score += 20; // 大学
            else if (nextRound === 8) score += 15; // 専門学校
            // 次Rに売却系が登場 → まぁまぁ
            else if ([2, 3, 5, 7, 9].includes(nextRound)) score += 8;

            // 改善⑤: 3~4人プレイでは手番の重みが増す
            if (G.numPlayers >= 3) score += 5;
            if (phase === 'early') score += 8;
            return score;
        }

        // ──────────────────────────────────────
        // カードドロー（鉱山）
        // ★最弱行動: 1ワーカーで1枚ドローは最も効率が悪い
        // 手札0の緊急リカバリ以外では使うべきではない
        // ──────────────────────────────────────
        case 'draw1': {
            // ユーザー要望: 鉱山は弱い
            if (p.hand.length === 0) return 60; // 手札0はリカバリだが他を優先
            if (p.hand.length <= 1 && phase === 'early') return 30;
            return 0; // 手札2枚以上で鉱山に行くのは最悪手
        }

        // Glory: 遺跡 (Ruins)
        // Consumable (6-12 val) + VP Token (3.3 val)
        case 'ruins': {
            let score = 30; // Base value
            if (moneyShortfall > 0) score += 20; // Need money -> consumable helps
            if (phase === 'late') score += 10; // VP token value increases relative to other actions?
            return score;
        }

        // ──────────────────────────────────────
        // 建設（大工）
        // 自転車操業モードなら建設価値UP
        // ──────────────────────────────────────
        case 'build': {
            if (!canBuildAnything(p, 0)) return 0;
            let score = evaluateBuildOpportunity(G, pid, 0, 0);
            // 自転車操業中は「建てて次R売る」ルート
            if (shouldBicycleOperate(G, pid)) score += 5;
            // 大工での建設は非常に強い行動（VPを直接稼ぐ + エンジン構築）
            // 良いカードがあるなら最優先級にするためベースアップ
            if (score > 60) score += 15;
            // 終盤は建設でVPを直接積む最後のチャンス
            if (phase === 'late' && score > 70) score += 10;
            // V6修正: 賃金不足時は建設より金策を優先
            if (moneyShortfall > 0 && !isFirstWorker) score = Math.min(score, 35);
            return score;
        }
    }

    // 建物由来の公共職場
    if (wp.fromBuildingDefId) {
        let bwScore = evaluateBuildingWorkplace(G, pid, wp.fromBuildingDefId);
        // V6修正: ラストワーカーで賃金不足なら、売却/金策以外は大幅減点
        if (isLastWorker && moneyShortfall > 0) {
            const bwCategory = getCardCategory(wp.fromBuildingDefId);
            if (bwCategory !== 'income' && bwCategory !== 'production') {
                bwScore = Math.min(bwScore, 15);
            }
        }
        return bwScore;
    }

    // 公共職場のデフォルト値
    // ユーザーフィードバック: 公共カード＜1コスト＜2コスト...となるべき
    // よって公共職場の基本点は極めて低く設定する
    // V6修正: ラストワーカーで賃金不足なら、未分類の公共職場も大幅減点
    if (isLastWorker && moneyShortfall > 0) return 2;
    return 5;
}

// ============================================================
// 自分の建物に配置する場合の評価
// 改善: 生産→売却パイプライン認識 + コストベースのアクション効率
// ============================================================
function evaluateBuildingWorkplace(G: GameState, pid: string, defId: string): number {
    const p = G.players[pid];
    const round = G.round;
    const phase = getPhase(round);
    const wage = getWagePerWorker(round);
    const totalWage = wage * p.workers;
    const moneyShortfall = totalWage - p.money;
    const consumableCount = p.hand.filter(c => isConsumable(c)).length;

    const def = getCardDef(defId);
    const category = getCardCategory(defId);

    // ★改善: 自社ビル優先ボーナス ★
    // 公共職場よりも自分の建物のアクションを優先させる (+25)
    // コストボーナスも強化 (4 -> 6)
    let baseScore = 25 + (def.cost * 6);

    // V6修正: 金策が急務なのにドロー/建設に行くのは危険
    if (moneyShortfall > wage && category !== 'income' && category !== 'production') {
        baseScore = Math.min(baseScore, 30);
    }

    // 改善①: 消費財生産→売却のパイプライン検出
    // 「消費財を生産する建物」の価値は、売却可能な公共職場があるかどうかで変わる
    const hasSellWorkplace = G.publicWorkplaces.some(wp => {
        const si = parseSellEffect(wp.specialEffect);
        return si !== null && G.household >= si.amount;
    });
    // 次の手番で売却できる消費財が足りるかどうか
    const canSellAfterProduce = (produceCount: number) => {
        const futureConsumables = consumableCount + produceCount;
        return G.publicWorkplaces.some(wp => {
            const si = parseSellEffect(wp.specialEffect);
            return si && futureConsumables >= si.count && G.household >= si.amount
                && (wp.multipleAllowed || wp.workers.length === 0);
        });
    };

    switch (defId) {
        // ─── 生産系（消費財 → 売却の燃料）───
        case 'farm': {
            // 消費財2枚: 改善①パイプライン
            let score = phase === 'early' ? 78 : phase === 'mid' ? 62 : 42;
            if (hasSellWorkplace && canSellAfterProduce(2)) score += 8;
            if (moneyShortfall > 0 && hasSellWorkplace) score += 10;
            return Math.max(score, baseScore + 40); // 最低保証アップ
        }

        case 'slash_burn': {
            // 消費財5枚（使い捨て）: 圧倒的な消費財量
            let score = 90;
            if (hasSellWorkplace) score += 5; // 売却可能ならさらに
            return Math.max(score, baseScore + 60);
        }

        case 'orchard': {
            // 手札4枚まで消費財: 手札少ないほど効果大
            const gain = Math.max(0, 4 - p.hand.length);
            if (gain >= 3) return 82 + baseScore;
            if (gain >= 2) return 68 + baseScore;
            if (gain >= 1) return 45 + baseScore;
            return 10; // 手札4枚以上なら不要
        }

        case 'large_farm': {
            // 消費財3枚: ファームの上位互換
            let score = 85;
            if (hasSellWorkplace && canSellAfterProduce(3)) score += 10;
            return Math.max(score, baseScore + 50);
        }

        // Glory Production
        case 'gl_village': { // Draw 2 Consumables (or special choice)
            let score = 75;
            if (hasSellWorkplace && canSellAfterProduce(2)) score += 8;
            return Math.max(score, baseScore + 40);
        }
        case 'gl_poultry_farm': return baseScore + 60; // Draw 2-3
        case 'gl_cotton_farm': return baseScore + 80; // Draw 5 Cons! Strong
        case 'gl_greenhouse': return baseScore + 70; // Draw 4 Cons

        // Glory Draw
        case 'gl_steam_factory': return baseScore + 65; // Draw 4 (Discard 2)
        case 'gl_locomotive_factory': return baseScore + 75; // Draw 7 (Discard 3)
        case 'gl_coal_mine': return baseScore + 85; // Draw 5 (Cost 2 workers?) - Wait, it's just powerful draw
        case 'gl_refinery': return baseScore + 70; // Draw 3

        // Glory Income
        case 'gl_game_cafe': return baseScore + 50;
        case 'gl_museum': return baseScore + 60;
        case 'gl_theater': return baseScore + 65;

        // Glory Special
        case 'gl_relic': return baseScore + 20; // 2 VP tokens (~6.6 VP)
        case 'gl_studio': return baseScore + 40; // Draw 1 + Token

        case 'gl_colonist': return baseScore + 60; // Build
        case 'gl_skyscraper': return baseScore + 60;
        case 'gl_modernism_construction': return baseScore + 70;
        case 'gl_teleporter': return baseScore + 90; // Free build!

        // ─── ドロー系 ───

        // ─── ドロー系（手札補充）───
        // ★これらは鉱山の完全上位互換。使えるなら必ず使う
        case 'steel_mill':
            // 3枚ドロー（純増）: S Rank → 鉱山3回分を1ワーカーで
            return 90 + baseScore;

        case 'chemical_plant':
            // 手札0枚→4枚ドロー: リカバリー最強
            if (p.hand.length === 0) return 98 + baseScore;
            return 78 + baseScore; // 手札あっても強い

        case 'factory':
            // 2枚捨て→4枚（実質+2）: 鉱山2回分
            if (p.hand.length >= 5) return 80 + baseScore;
            if (p.hand.length >= 4) return 72 + baseScore;
            if (p.hand.length >= 2) return 58 + baseScore;
            return 0;

        case 'auto_factory':
            // 3枚捨て→7枚（実質+4）: 最強ドロー、S Rank
            if (p.hand.length >= 6) return 95 + baseScore;
            if (p.hand.length >= 5) return 88 + baseScore;
            if (p.hand.length >= 3) return 75 + baseScore;
            return 0;

        case 'design_office':
            // 5枚めくって1枚: 鉱山よりマシ
            if (p.hand.length <= 1) return 60 + baseScore;
            return (phase === 'early' ? 50 : 40) + baseScore;

        // ─── 金策系 ───
        // ★直接現金を得る行動は非常にパワフル
        case 'coffee_shop': {
            if (G.household < 5) return 0;
            // ユーザー要望: 家計も弱い (残高に応じた評価)
            const householdMult = Math.min(1.0, G.household / 50);
            if (moneyShortfall > 0) return 92 * householdMult;
            if (phase === 'late') return 80 * householdMult;
            return 55 * householdMult;
        }

        case 'restaurant': {
            if (G.household < 15) return 0;
            if (p.hand.length < 1) return 0;
            const householdMult = Math.min(1.0, G.household / 100);
            if (moneyShortfall > 0) return 98 * householdMult;
            if (phase === 'late') return 92 * householdMult;
            return 75 * householdMult;
        }

        // ─── 建設系 ───
        case 'construction_co':
            return evaluateBuildOpportunity(G, pid, 1, 0) + 12;

        case 'pioneer':
            return canBuildFarmFree(p) ? 75 : 0;

        case 'general_contractor':
            return evaluateBuildOpportunity(G, pid, 0, 2) + 10;

        case 'dual_construction': {
            if (!canDualConstruct(p)) return 0;
            // 改善⑥: 終盤ラッシュ最強
            if (phase === 'late') return 95;
            if (phase === 'mid') return 82;
            return 68;
        }

        case 'mansion':
            return 3; // 効果なし

        default:
            return 25;
    }
}

// ============================================================
// 建設機会の総合評価
// 改善⑥: ボーナスVP期待値を加味
// ============================================================
function evaluateBuildOpportunity(G: GameState, pid: string, costReduction: number, drawAfter: number): number {
    const p = G.players[pid];
    let bestScore = 0;
    let bestUsageValue = 0;
    for (const card of p.hand) {
        if (isConsumable(card)) continue;
        const def = getCardDef(card.defId);
        const cost = Math.max(0, def.cost - costReduction);
        if (p.hand.length - 1 >= cost) {
            const score = evaluateCardForBuilding(G, pid, def);
            if (score > bestScore) {
                bestScore = score;
                bestUsageValue = estimateUsageValue(G, pid, def.id);
            }
        }
    }
    if (bestScore === 0) return 0;
    const buildBonus = p.buildings.length === 0 ? 30 : (p.buildings.length < 3 ? 15 : 5);
    const drawBonus = drawAfter > 0 ? 8 : 0;
    // 使用価値が高い建物の優先度をさらに上げる
    const usageBonus = Math.min(bestUsageValue / 2, 25);
    // ベストスコアの反映率も上げる (/3 -> /2.5)
    return Math.min(100, 55 + bestScore / 2.5 + buildBonus + drawBonus + usageBonus);
}

// ============================================================
// Build Phase: 建設するカードを選択
// 改善①⑥: 自転車操業 + ボーナスVP計算
// ============================================================
function decideBuildPhase(
    G: GameState,
    pid: string,
    difficulty: AIDifficulty
): CPUAction | null {
    const p = G.players[pid];
    const bs = G.buildState;
    if (!bs) return null;

    const costReduction = bs.costReduction;
    const buildableIndices: { index: number; score: number }[] = [];

    for (let i = 0; i < p.hand.length; i++) {
        const card = p.hand[i];
        if (isConsumable(card)) continue;
        const def = getCardDef(card.defId);
        const cost = getConstructionCost(p, card.defId, costReduction);

        // 建設可否の判定（モダニズム特例）
        let canBuild = false;
        if (bs.action === 'gl_modernism_construction') {
            let totalValue = 0;
            for (const h of p.hand) {
                if (h.uid === card.uid) continue;
                totalValue += isConsumable(h) ? 2 : 1;
            }
            canBuild = totalValue >= cost;
        } else {
            canBuild = (p.hand.length - 1 >= cost);
        }

        if (canBuild) {
            if (bs.action === 'pioneer' && !def.tags.includes('farm')) continue;

            const score = difficulty === 'heuristic'
                ? evaluateCardForBuilding(G, pid, def)
                : Math.random() * 100;
            buildableIndices.push({ index: i, score });
        }
    }

    if (buildableIndices.length === 0) {
        return { moveName: 'cancelAction', args: [] };
    }

    if (difficulty === 'random') {
        return { moveName: 'selectBuildCard', args: [pickRandom(buildableIndices).index] };
    }

    buildableIndices.sort((a, b) => b.score - a.score);
    return { moveName: 'selectBuildCard', args: [buildableIndices[0].index] };
}

/** 建設対象としてのカード評価（v3: 全改善統合） */
function evaluateCardForBuilding(G: GameState, pid: string, def: typeof CARD_DEFS[0]): number {
    const p = G.players[pid];
    const round = G.round;
    const phase = getPhase(round);
    const remainingRounds = 9 - round;
    let score = def.vp * 2; // ベース: VP×2

    // ──────────────────────────────────────
    // ★核心: 使用価値（建てて使って売るサイクル）
    // 建物のVPは売却時に$として回収できる
    // 加えて、使用効果の価値を加算
    // ──────────────────────────────────────
    const usageVal = estimateUsageValue(G, pid, def.id);
    score += usageVal;

    // ユーザー要望: ７＞６＞５＞４＞３＞２＞１＞公共施設の順番でカードパワーが高い
    // コストに応じた傾斜を強化
    score += def.cost * 15;

    // ユーザーフィードバック:
    // 序盤に純VPにしかならないものを立ててもスケールしない
    // → カテゴリがpure_vpなら序盤ペナルティ
    const category = getCardCategory(def.id);
    if ((phase === 'early' || phase === 'mid') && (category === 'pure_vp' || category === 'bonus')) {
        score -= 40; // 大幅ペナルティ
    }

    // ──────────────────────────────────────
    // フェーズ補正（戦略ガイド§2）
    // ──────────────────────────────────────

    if (phase === 'early') {
        // 序盤: 低コスト生産系を最優先
        if (def.cost <= 1) score += 18;
        else if (def.cost <= 2) score += 12;
        if (def.tags.includes('farm')) {
            score += 28;
            // 初農園は絶対取る
            if (!p.buildings.some(b => getCardDef(b.card.defId).tags.includes('farm'))) {
                score += 25;
            }
        }
        // 自転車操業用の安い建物は高評価
        if (shouldBicycleOperate(G, pid) && def.cost <= 2) {
            score += 10;
        }
        // 高コスト効果なしは序盤に不要
        if (def.id === 'mansion') score -= 35;
        if (['headquarters', 'railroad'].includes(def.id)) score -= 20;
        if (def.id === 'real_estate') score -= 10;
    }

    if (phase === 'mid') {
        // 中盤: ドローエンジン確立
        if (def.tags.includes('factory')) score += 15;
        if (def.tags.includes('farm')) score += 8;
        // 金策系は中盤に建設しておくと終盤に活きる
        if (['restaurant', 'coffee_shop'].includes(def.id)) score += 15;
    }

    if (phase === 'late') {
        // 終盤: VP最大化
        // 低コスト低VPでも使用価値が高いなら建てる
        if (def.cost <= 1 && def.vp <= 8 && usageVal < 10) score -= 25;
        // ボーナス建物は実際のボーナスVP見込みに基づいて加点
        if (['real_estate', 'agri_coop', 'labor_union', 'headquarters', 'railroad'].includes(def.id)) {
            const dynamicBonus = estimateBonusGainIfBuilt(G, pid, def.id);
            score += Math.max(25, dynamicBonus);
        }
        // 邸宅(28VP)は終盤なら最強の純VP
        if (def.id === 'mansion') score += 20;
        // 終盤は高VP建物を最優先（VP直接稼ぎ）
        if (def.vp >= 15) score += 15;
        if (def.vp >= 20) score += 10;
        // 残りラウンドで使えるかどうか
        if (remainingRounds <= 1 && getCardCategory(def.id) === 'draw') {
            score -= 10;
        }
    }

    // ──────────────────────────────────────
    // 個別カードボーナス（戦略ガイド§3）
    // ──────────────────────────────────────

    // Sランク
    if (def.id === 'dual_construction') score += 22;
    if (def.id === 'auto_factory') score += 20;
    if (def.id === 'chemical_plant') score += 14;
    if (def.id === 'steel_mill') score += 16;

    // Aランク
    if (def.id === 'restaurant') score += 12;
    if (def.id === 'construction_co') score += 10;
    if (def.id === 'general_contractor') score += 10;
    if (def.id === 'factory') score += 6;
    if (def.id === 'large_farm') score += 5;
    if (def.id === 'orchard') score += 4;

    // ユーティリティ系
    if (def.id === 'company_housing') {
        if (phase === 'early') score += 15;
        else if (phase === 'mid' && p.workers < 5) score += 8;
        else score -= 5;
    }
    if (def.id === 'warehouse') score += 10;
    if (def.id === 'law_office') {
        score += 8;
        if (p.unpaidDebts > 0) score += p.unpaidDebts * 3;
        if (p.unpaidDebts >= 3) score += 10;
    }

    // ──────────────────────────────────────
    // ボーナスVP期待値（精密計算）
    // ──────────────────────────────────────
    const bonusGain = estimateBonusGainIfBuilt(G, pid, def.id);
    score += bonusGain;

    // V4: コンボシナジー
    // 二胡市建設を持っている場合、同コストのカードの価値を上げる
    const hasDual = p.hand.some(c => c.defId === 'dual_construction');
    if (hasDual && !isConsumable({ defId: def.id } as Card)) {
        // 同じコストのカードが手札に他に何枚あるか
        const sameCostCount = p.hand.filter(c => !isConsumable(c) && getCardDef(c.defId).cost === def.cost && c.defId !== def.id).length;
        if (sameCostCount >= 1) score += 15;
    }
    // 鉄道を持っている場合、工場タグの価値を上げる
    if (p.buildings.some(b => b.card.defId === 'railroad') && def.tags.includes('factory')) {
        score += 10;
    }

    if (def.id === 'real_estate' && p.buildings.length >= 4) {
        score += (p.buildings.length - 3) * 5;
    }
    if (def.id === 'railroad') {
        const fc = p.buildings.filter(b => getCardDef(b.card.defId).tags.includes('factory')).length;
        if (fc >= 2) score += fc * 6;
    }
    if (def.id === 'headquarters') {
        const uc = p.buildings.filter(b => getCardDef(b.card.defId).unsellable).length;
        if (uc >= 2) score += uc * 4;
    }
    if (def.id === 'labor_union') {
        score += p.workers * 4;
    }
    if (def.id === 'agri_coop') {
        const cc = p.hand.filter(c => isConsumable(c)).length;
        score += cc * 3;
        const farmCount = p.buildings.filter(b => getCardDef(b.card.defId).tags.includes('farm')).length;
        score += farmCount * 5;
    }

    // 既に同じカードを建設済みならペナルティ大
    const existingCount = p.buildings.filter(b => b.card.defId === def.id).length;
    if (existingCount > 0) score -= 12 * existingCount;

    return score;
}

// ============================================================
// Discard Phase: 捨てるカードを選択
// 改善⑧: 精度向上 — 既建設/消費財計画保持
// ============================================================
function decideDiscardPhase(
    G: GameState,
    pid: string,
    difficulty: AIDifficulty
): CPUAction | null {
    const ds = G.discardState;
    if (!ds) return null;

    const p = G.players[pid];
    const targetCount = ds.count;
    const isModernism = ds.reason.includes('モダニズム');

    // 選択可能なカードを集める（除外カードを除く）
    const selectableIndices: number[] = [];
    for (let i = 0; i < p.hand.length; i++) {
        if (ds.excludeCardUid && p.hand[i].uid === ds.excludeCardUid) continue;
        selectableIndices.push(i);
    }

    // 現在の選択済みカードのカウント合計を計算（モダニズムは消費財2、建物1）
    // dsはnull確認済みなのでそのまま利用可能だが、内部関数のスコープのためにキャプチャする
    const localDs = ds;
    function calcCurrentCount(): number {
        if (!isModernism) return localDs.selectedIndices.length;
        let total = 0;
        for (const i of localDs.selectedIndices) {
            if (i < p.hand.length && isConsumable(p.hand[i])) total += 2;
            else total += 1;
        }
        return total;
    }

    // モダニズムの場合、選択可能なカードの合計コスト値を確認
    // 手札が全部消費財でもtotalValue >= targetCountなら選択可能
    if (isModernism) {
        let maxPossible = 0;
        for (const i of selectableIndices) {
            maxPossible += isConsumable(p.hand[i]) ? 2 : 1;
        }
        if (maxPossible < targetCount) {
            // どうしても払えない場合はキャンセル（建設フェーズへのロールバック）
            return { moveName: 'confirmDiscard', args: [] };
        }
    } else {
        if (selectableIndices.length < targetCount) {
            // 手札不足（通常は発生しないが安全策）
            return { moveName: 'confirmDiscard', args: [] };
        }
    }

    const currentCount = calcCurrentCount();

    // ---- ここからは「理想の選択リスト」と現在の選択リストを同期させる1ステップ処理 ----

    // 理想の選択リストを最初から作り直す：捨てるカードをスコアが低い順に選ぶ
    function computeIdealSelection(): number[] {
        if (!isModernism) {
            // 通常の場合: 保持価値が低い順にtargetCount枚を選択
            const scored = selectableIndices.map(i => ({
                index: i,
                value: evaluateCardRetainValue(p.hand[i], G, pid),
            }));
            scored.sort((a, b) => a.value - b.value);
            return scored.slice(0, targetCount).map(s => s.index);
        } else {
            // モダニズムの場合: 消費財1枚=2カウント分として必要合計数に達する選択
            const scored = selectableIndices.map(i => ({
                index: i,
                value: evaluateCardRetainValue(p.hand[i], G, pid),
                worth: isConsumable(p.hand[i]) ? 2 : 1,
            }));
            scored.sort((a, b) => a.value - b.value);
            const selected: number[] = [];
            let total = 0;
            for (const s of scored) {
                if (total >= targetCount) break;
                selected.push(s.index);
                total += s.worth;
            }
            return selected;
        }
    }

    const idealSelection = computeIdealSelection();

    // 現在の選択と理想の選択を同期（1アクションずつ修正）
    // まず「外すべきカード」（現在選択中だが理想外）を外す
    const toDeselect = ds.selectedIndices.filter(i => !idealSelection.includes(i));
    if (toDeselect.length > 0) {
        return { moveName: 'toggleDiscard', args: [toDeselect[0]] };
    }

    // 次に「追加すべきカード」（理想に入っているが未選択）を追加
    const toSelect = idealSelection.filter(i => !ds.selectedIndices.includes(i));
    if (toSelect.length > 0) {
        return { moveName: 'toggleDiscard', args: [toSelect[0]] };
    }

    // 選択が理想と一致したら確定
    return { moveName: 'confirmDiscard', args: [] };
}

/** カードの保持価値を評価（低い=捨ててよい） - v3改善⑧ */
function evaluateCardRetainValue(card: Card, G: GameState, pid: string): number {
    if (isConsumable(card)) {
        // 改善⑧: 消費財は基本捨てやすいが、農協があるなら保持価値UP
        const p = G.players[pid];
        const hasAgriCoop = p.buildings.some(b => b.card.defId === 'agri_coop');
        if (hasAgriCoop) return 8; // 農協: 消費財1枚=3VP相当
        // 売却予定がある場合（次ターンで売れる消費財は保持）
        // ただし建設コスト用として必要な場合もあるので、やや上げる
        return 1;
    }

    const def = getCardDef(card.defId);
    const p = G.players[pid];
    const phase = getPhase(G.round);
    let value = def.vp;

    // Sランクカードは保持価値MAX
    if (['dual_construction', 'auto_factory'].includes(def.id)) value += 25;
    if (['steel_mill', 'chemical_plant'].includes(def.id)) value += 18;

    // ボーナス建物は保持（特に終盤）
    if (['real_estate', 'agri_coop', 'labor_union', 'headquarters', 'railroad'].includes(def.id)) {
        value += phase === 'late' ? 25 : 12;
    }

    // 金策系は捨てにくい（戦略ガイド§4-B: 売却禁止）
    if (['restaurant', 'coffee_shop'].includes(def.id)) value += 10;

    // 建設系も捨てにくい
    if (['construction_co', 'general_contractor', 'pioneer'].includes(def.id)) value += 8;

    // 改善⑧: 既に建設済みの同じカードは保持価値DOWN
    if (p.buildings.some(b => b.card.defId === def.id)) value -= 10;

    // 終盤に低コスト低VPは不要
    if (phase === 'late' && def.cost <= 1 && def.vp <= 8) value -= 8;

    // 建設可能（手札コストを払える）なら保持価値UP
    if (p.hand.length - 1 >= def.cost) value += 4;

    // 序盤に高コスト高VPカードは建設困難 → 保持価値DOWN
    if (phase === 'early' && def.cost >= 4 && p.hand.length < def.cost + 2) {
        value -= 5;
    }

    return value;
}

// ============================================================
// Payday Phase: 建物売却判断
// 改善④⑦: 売却優先度の精密化 + 損益分岐 + 残りラウンド考慮
// 戦略ガイド§4-B:
//   売却優先1: ドロー系・消費財生産系（公共化低リスク）
//   売却優先2: 低コスト建物（再建設容易）
//   売却禁止: 建設系・金策系（公共化で他人を有利にする）
// ============================================================
function decidePaydayPhase(G: GameState, activePid: string): CPUAction | null {
    const ps = G.paydayState;
    if (!ps) return null;

    // playerStatesから自分の状態を取得
    const pps = ps.playerStates[activePid];
    if (!pps || pps.confirmed) return null; // 既に確認済みならスキップ

    const pid = activePid;
    const p = G.players[pid];
    const remainingRounds = 9 - G.round;

    // 既にお金で払える場合（建物売却不要）
    if (p.money >= pps.totalWage) {
        // 売却選択なし＆お金で払える → confirmPayday でOK
        if (pps.selectedBuildingIndices.length === 0) {
            return { moveName: 'confirmPayday', args: [] };
        }
        // 既に建物を選択してしまっている場合は解除
        return { moveName: 'togglePaydaySell', args: [pps.selectedBuildingIndices[0]] };
    }

    // 選択済み売却額を計算
    const selectedVPs = pps.selectedBuildingIndices.map(bi => getCardDef(p.buildings[bi].card.defId).vp);
    const totalFunds = p.money + selectedVPs.reduce((sum, vp) => sum + vp, 0);

    if (totalFunds >= pps.totalWage) {
        // 過剰売却チェック（game.tsに合わせて全選択でも1つ除いて払えるなら過剰）
        if (selectedVPs.length > 0) {
            const minVP = Math.min(...selectedVPs);
            if ((totalFunds - minVP) >= pps.totalWage) {
                const minIdx = pps.selectedBuildingIndices.find(bi => getCardDef(p.buildings[bi].card.defId).vp === minVP);
                if (minIdx !== undefined) {
                    return { moveName: 'togglePaydaySell', args: [minIdx] };
                }
            }
        }
        // ★修正: 建物を選んでいる場合は confirmPaydaySell、
        // 選択が空（過剰チェックで全解除された）の場合はお金で払えるので confirmPayday
        if (pps.selectedBuildingIndices.length > 0) {
            return { moveName: 'confirmPaydaySell', args: [] };
        }
        return { moveName: 'confirmPayday', args: [] };
    }

    // 売却候補をスコアリング（低スコア = 売りやすい）
    const sellable = p.buildings
        .map((b, i) => {
            const def = getCardDef(b.card.defId);
            if (def.unsellable) return null;
            if (pps.selectedBuildingIndices.includes(i)) return null;

            const category = getCardCategory(def.id);
            const danger = SELL_DANGER[def.id] || 3;

            // カテゴリ別の売却ペナルティ
            let categoryPenalty = 0;
            switch (category) {
                case 'income': categoryPenalty = 30; break;
                case 'construction': categoryPenalty = 25; break;
                case 'bonus': categoryPenalty = 20; break;
                case 'utility': categoryPenalty = 15; break;
                case 'draw': categoryPenalty = 5; break;
                case 'production': categoryPenalty = 3; break;
                case 'pure_vp': categoryPenalty = 10; break;
            }

            // 残りラウンドの効果を考慮
            const usagePenalty = remainingRounds <= 1 ? 0 : categoryPenalty;

            // ★既に使った建物（workerPlaced）は売りやすい
            // 「建てて使って売る」サイクルの完結
            const alreadyUsedBonus = b.workerPlaced ? -8 : 0;

            // 売却コスト = VP + 公共化リスク + カテゴリペナルティ - 使用済みボーナス
            const sellCost = def.vp + danger * 2 + usagePenalty + alreadyUsedBonus;

            return { index: i, def, sellCost, vp: def.vp };
        })
        .filter(Boolean) as { index: number; def: typeof CARD_DEFS[0]; sellCost: number; vp: number }[];

    sellable.sort((a, b) => a.sellCost - b.sellCost);

    // 損益分岐の厳密化
    // ★ユーザー指摘: 資金不足時の売却は「任意」ではなく「強制」
    // つまり、払えないなら売れるものを売って払わなければならない
    // 選択肢があるのは「どれを売るか」だけ
    const deficit = pps.totalWage - totalFunds;

    if (deficit > 0) {
        // 資金不足: 強制的に売却候補（一番安いもの）を選択
        if (sellable.length > 0) {
            const cheapest = sellable[0];
            return { moveName: 'togglePaydaySell', args: [cheapest.index] };
        }

        // 売るものがない場合
        // 既に選択された売却候補があるなら、それを確定して少しでも負債を減らす
        if (pps.selectedBuildingIndices.length > 0) {
            return { moveName: 'confirmPaydaySell', args: [] };
        }

        // 売るものがなく、選択もしていないなら未払いを受け入れる
        return { moveName: 'confirmPayday', args: [] };
    }

    // V4: 借金戦略 (Aggressive Debt)
    // 資金は足りているが、あえて払わない戦略の検討（終盤のみ）
    // 未払いペナルティ(-3VP/枚) < 守る建物のVP ならば、あえて払わない
    if (remainingRounds <= 1 && totalFunds >= pps.totalWage) {
        // 現在選択されている売却対象の中に、高VPのものが含まれているか？
        // 含まれているなら、それを「売らない」ようにチェックを外す
        for (const bi of pps.selectedBuildingIndices) {
            const b = p.buildings[bi];
            const def = getCardDef(b.card.defId);
            // 損益分岐点: 建物VP > 3 (未払いペナルティ)
            // つまり4VP以上の建物は、売って賃金にするより、借金して手元に残したほうが得
            if (def.vp > 3) {
                // これを売るのは損。キャンセルする
                return { moveName: 'togglePaydaySell', args: [bi] };
            }
        }
    }

    // 資金は足りている場合
    // 基本的にはこれ以上売らないが、余剰分の売却ロジック（将来の投資用など）が必要ならここに記述
    // 現状は「払えるなら売らない」でOK
    return { moveName: 'confirmPaydaySell', args: [] };
}

// ============================================================
// Cleanup Phase: 精算（手札超過分を捨てる）
// ============================================================
function decideCleanupPhase(G: GameState, activePid: string): CPUAction | null {
    const cs = G.cleanupState;
    if (!cs) return null;

    // playerStatesから自分の状態を取得
    const cps = cs.playerStates[activePid];
    if (!cps || cps.confirmed) return null; // 既に確認済みならスキップ

    const pid = activePid;
    const p = G.players[pid];

    if (cps.selectedIndices.length < cps.excessCount) {
        const scored = p.hand
            .map((card, i) => ({ index: i, value: evaluateCardRetainValue(card, G, pid) }))
            .filter(x => !cps.selectedIndices.includes(x.index))
            .sort((a, b) => a.value - b.value);

        if (scored.length > 0) {
            return { moveName: 'toggleDiscard', args: [scored[0].index] };
        }
    }

    if (cps.selectedIndices.length === cps.excessCount) {
        return { moveName: 'confirmDiscard', args: [] };
    }

    return null;
}

// ============================================================
// Design Office Phase: 5枚から1枚選択
// 改善⑥: ボーナスVP期待値を含むカード評価
// ============================================================
function decideDesignOfficePhase(
    G: GameState,
    pid: string,
    difficulty: AIDifficulty
): CPUAction | null {
    const dos = G.designOfficeState;
    if (!dos) return null;

    if (difficulty === 'random') {
        const idx = Math.floor(Math.random() * dos.revealedCards.length);
        return { moveName: 'selectDesignOfficeCard', args: [idx] };
    }

    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < dos.revealedCards.length; i++) {
        const card = dos.revealedCards[i];
        let score: number;
        if (isConsumable(card)) {
            // 改善⑧: 農協があるなら消費財も価値がある
            const p = G.players[pid];
            const hasAgriCoop = p.buildings.some(b => b.card.defId === 'agri_coop');
            score = hasAgriCoop ? 15 : 3;
        } else {
            const def = getCardDef(card.defId);
            score = evaluateCardForBuilding(G, pid, def);
        }
        if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
        }
    }

    return { moveName: 'selectDesignOfficeCard', args: [bestIdx] };
}

// ============================================================
// Dual Construction Phase: 同コスト2枚を同時建設
// 改善⑥: VP合計+ボーナスシナジー
// ============================================================
function decideDualConstructionPhase(
    G: GameState,
    pid: string,
    difficulty: AIDifficulty
): CPUAction | null {
    const dcs = G.dualConstructionState;
    if (!dcs) return null;

    const p = G.players[pid];

    const buildingCards = p.hand
        .map((c, i) => ({ card: c, index: i }))
        .filter(x => !isConsumable(x.card));

    const costGroups: Record<number, typeof buildingCards> = {};
    for (const bc of buildingCards) {
        const def = getCardDef(bc.card.defId);
        if (!costGroups[def.cost]) costGroups[def.cost] = [];
        costGroups[def.cost].push(bc);
    }

    type Pair = { indices: [number, number]; score: number };
    const validPairs: Pair[] = [];

    for (const [costStr, cards] of Object.entries(costGroups)) {
        const cost = parseInt(costStr);
        if (cards.length < 2) continue;
        if (p.hand.length - 2 < cost) continue;

        for (let i = 0; i < cards.length; i++) {
            for (let j = i + 1; j < cards.length; j++) {
                const def1 = getCardDef(cards[i].card.defId);
                const def2 = getCardDef(cards[j].card.defId);
                let score: number;
                if (difficulty === 'heuristic') {
                    const s1 = evaluateCardForBuilding(G, pid, def1);
                    const s2 = evaluateCardForBuilding(G, pid, def2);
                    // 改善⑥: 両方のボーナスシナジーを加算
                    // 例: 工場×2 + 鉄道 → 鉄道ボーナス×2
                    score = s1 + s2;
                    // 同じカード2枚の場合はペナルティ
                    if (def1.id === def2.id) score -= 10;
                } else {
                    score = Math.random() * 100;
                }
                validPairs.push({ indices: [cards[i].index, cards[j].index], score });
            }
        }
    }

    if (validPairs.length === 0) {
        return { moveName: 'cancelAction', args: [] };
    }

    validPairs.sort((a, b) => b.score - a.score);
    const bestPair = validPairs[0];

    const alreadySelected = dcs.selectedCardIndices;
    for (const idx of bestPair.indices) {
        if (!alreadySelected.includes(idx)) {
            return { moveName: 'toggleDualCard', args: [idx] };
        }
    }

    if (alreadySelected.length === 2) {
        return { moveName: 'confirmDualConstruction', args: [] };
    }

    return { moveName: 'cancelAction', args: [] };
}

// ============================================================
// Glory: 農村の選択フェーズ
// ============================================================
function decideVillageChoicePhase(G: GameState, pid: string): CPUAction | null {
    const p = G.players[pid];
    const consumables = p.hand.filter(c => isConsumable(c));

    // 基本的にはドロー（draw_consumable）を選択
    // ただし、手札に消費財が2枚以上あり、かつ建物カードが少ない場合は draw_building
    if (consumables.length >= 2 && p.hand.length - consumables.length <= 1) {
        return { moveName: 'selectVillageOption', args: ['draw_building'] };
    }
    return { moveName: 'selectVillageOption', args: ['draw_consumable'] };
}

// ============================================================
// Glory: 機械人形の選択フェーズ
// ============================================================
function decideAutomatonChoicePhase(G: GameState, pid: string): CPUAction | null {
    // 常に「ロボット労働者を得る」を選択（現状それしか選択肢がないはず）
    return { moveName: 'selectAutomatonOption', args: ['get_robot'] };
}

// ============================================================
// Glory: モダニズム建設のフェーズ
// ============================================================
function decideModernismChoicePhase(G: GameState, pid: string, difficulty: AIDifficulty): CPUAction | null {
    // 建設フェーズと同じロジックを流用できるはずだが、現状は単純に建設可能なら建設
    return decideBuildPhase(G, pid, difficulty);
}

// ============================================================
// Glory: 転送装置のフェーズ
// ============================================================
function decideTeleporterChoicePhase(G: GameState, pid: string, difficulty: AIDifficulty): CPUAction | null {
    // 建設フェーズと同じ
    return decideBuildPhase(G, pid, difficulty);
}

// ============================================================
// Glory: 摩天建設のフェーズ
// ============================================================
function decideSkyscraperChoicePhase(G: GameState, pid: string, difficulty: AIDifficulty): CPUAction | null {
    // 建設フェーズと同じ
    return decideBuildPhase(G, pid, difficulty);
}
