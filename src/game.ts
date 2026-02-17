// ============================================================
// game.ts  –  ナショナルエコノミー ゲームロジック (v5)
// ============================================================
import type { Game, Ctx } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import type { GameState, PlayerState, Workplace, Card, BuildingVPDetail, ScoreBreakdown } from './types';
import { CARD_DEFS, getCardDef, CONSUMABLE_DEF_ID } from './cards';

// ============================================================
// ユーティリティ
// ============================================================
let _uidCounter = 0;
function uid(): string { return `c${_uidCounter++}`; }
function isConsumable(c: Card): boolean { return c.defId === CONSUMABLE_DEF_ID; }

/** ログ追加ヘルパー */
function pushLog(G: GameState, text: string) {
    G.log.push({ text, round: G.round });
}

/** デッキ構築 */
function buildDeck(): Card[] {
    const cards: Card[] = [];
    for (const def of CARD_DEFS) {
        for (let i = 0; i < def.copies; i++) cards.push({ uid: uid(), defId: def.id });
    }
    // シャッフル (Fisher-Yates)
    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
}

/** カードを山札から引く（枯渇時リシャッフル） */
function drawCards(G: GameState, count: number): Card[] {
    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
        if (G.deck.length === 0) {
            if (G.discard.length === 0) break;
            G.deck = [...G.discard];
            G.discard = [];
            for (let j = G.deck.length - 1; j > 0; j--) {
                const k = Math.floor(Math.random() * (j + 1));
                [G.deck[j], G.deck[k]] = [G.deck[k], G.deck[j]];
            }
        }
        if (G.deck.length > 0) drawn.push(G.deck.pop()!);
    }
    return drawn;
}

/** 消費財を引く */
function drawConsumables(G: GameState, pid: string, count: number) {
    const p = G.players[pid];
    for (let i = 0; i < count; i++) {
        p.hand.push({ uid: uid(), defId: CONSUMABLE_DEF_ID });
        G.consumableCounter++;
    }
}

/** カードを捨て札に */
function discardCard(G: GameState, card: Card) {
    if (!isConsumable(card)) G.discard.push(card);
}

/** 消費財を手にする（消費財カウンター扱い） */
function makeConsumable(): Card {
    return { uid: uid(), defId: CONSUMABLE_DEF_ID };
}

/** 賃金テーブル */
function getWagePerWorker(round: number): number {
    if (round <= 2) return 2;
    if (round <= 5) return 3;
    if (round <= 7) return 4;
    return 5;
}

/** 全プレイヤーの残りワーカー合計 */
function totalAvailableWorkers(G: GameState): number {
    return Object.values(G.players).reduce((sum, p) => sum + p.availableWorkers, 0);
}

/** 次の手番プレイヤー検索 */
function findNextPlayer(G: GameState, ctx: Ctx): string | null {
    const n = ctx.numPlayers;
    for (let off = 1; off <= n; off++) {
        const idx = (parseInt(ctx.currentPlayer) + off) % n;
        if (G.players[String(idx)].availableWorkers > 0) return String(idx);
    }
    return null;
}

/** 建設可能か（コスト削減込み） */
function canBuildAnything(p: PlayerState, costReduction: number): boolean {
    for (const card of p.hand) {
        if (isConsumable(card)) continue;
        const def = getCardDef(card.defId);
        const cost = Math.max(0, def.cost - costReduction);
        if (p.hand.length - 1 >= cost) return true;
    }
    return false;
}

/** 農園無料建設可能か */
function canBuildFarmFree(p: PlayerState): boolean {
    return p.hand.some(c => !isConsumable(c) && getCardDef(c.defId).tags.includes('farm'));
}

/** 二胡市建設可能か */
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
            const remaining = p.hand.length - 2;
            if (remaining >= cost) return true;
        }
    }
    return false;
}

/** 建物由来の職場に配置可能かチェック */
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
        default: return true;
    }
}

// ============================================================
// 初期 & ラウンド職場
// ============================================================
function createInitialWorkplaces(numPlayers: number): Workplace[] {
    const wps: Workplace[] = [
        { id: 'quarry', name: '採石場', effectText: 'カード1枚引く＋スタートプレイヤー', multipleAllowed: false, workers: [], specialEffect: 'start_player_draw', addedAtRound: 0, fromBuilding: false },
        { id: 'mine', name: '鉱山', effectText: 'カード1枚引く（複数配置可）', multipleAllowed: true, workers: [], specialEffect: 'draw1', addedAtRound: 0, fromBuilding: false },
        { id: 'school', name: '学校', effectText: '労働者+1（次ラウンドから）', multipleAllowed: false, workers: [], specialEffect: 'hire_worker', addedAtRound: 0, fromBuilding: false },
        { id: 'carpenter', name: '大工', effectText: '建物を1つ建設', multipleAllowed: false, workers: [], specialEffect: 'build', addedAtRound: 0, fromBuilding: false },
    ];
    const carpCount = numPlayers <= 2 ? 1 : numPlayers <= 3 ? 2 : 3;
    for (let i = 1; i < carpCount; i++) {
        wps.push({ ...wps[3], id: `carpenter_${i + 1}`, workers: [] });
    }
    return wps;
}

function getRoundWorkplace(round: number, numPlayers: number): Workplace | null {
    const map: Record<number, { id: string; name: string; et: string; se: string; ma3p: boolean }> = {
        2: { id: 'stall', name: '露店', et: '手札1枚捨て→家計$6', se: 'sell_1_6', ma3p: true },
        3: { id: 'market', name: '市場', et: '手札2枚捨て→家計$12', se: 'sell_2_12', ma3p: true },
        4: { id: 'high_school', name: '高等学校', et: '労働者を4人に', se: 'expand4', ma3p: false },
        5: { id: 'supermarket', name: 'スーパーマーケット', et: '手札3枚捨て→家計$18', se: 'sell_3_18', ma3p: true },
        6: { id: 'university', name: '大学', et: '労働者を5人に', se: 'expand5', ma3p: false },
        7: { id: 'dept_store', name: '百貨店', et: '手札4枚捨て→家計$24', se: 'sell_4_24', ma3p: true },
        8: { id: 'vocational', name: '専門学校', et: '労働者+1（即使用可）', se: 'hire_immediate', ma3p: false },
        9: { id: 'expo', name: '万博', et: '手札5枚捨て→家計$30', se: 'sell_5_30', ma3p: true },
    };
    const d = map[round];
    if (!d) return null;
    const ma = numPlayers <= 2 ? false : d.ma3p;
    return { id: d.id, name: d.name, effectText: d.et, multipleAllowed: ma, workers: [], specialEffect: d.se, addedAtRound: round, fromBuilding: false };
}

function parseSellEffect(se: string): { count: number; amount: number } | null {
    const m = se.match(/^sell_(\d+)_(\d+)$/);
    if (!m) return null;
    return { count: parseInt(m[1]), amount: parseInt(m[2]) };
}

// ============================================================
// VP計算
// ============================================================
function calculateScores(G: GameState): { playerIndex: number; score: number; breakdown: ScoreBreakdown }[] {
    const results: { playerIndex: number; score: number; breakdown: ScoreBreakdown }[] = [];
    for (const pid of Object.keys(G.players)) {
        const p = G.players[pid];
        let buildingVP = 0, bonusVP = 0;
        const buildingDetails: BuildingVPDetail[] = [];

        for (const b of p.buildings) {
            const def = getCardDef(b.card.defId);
            buildingVP += def.vp;
        }

        const has = (id: string) => p.buildings.some(b => b.card.defId === id);

        const bonusMap: Record<string, number> = {};
        if (has('real_estate')) {
            const bonus = p.buildings.length * 3;
            bonusVP += bonus;
            bonusMap['real_estate'] = bonus;
        }
        if (has('agri_coop')) {
            const bonus = p.hand.filter(c => isConsumable(c)).length * 3;
            bonusVP += bonus;
            bonusMap['agri_coop'] = bonus;
        }
        if (has('labor_union')) {
            const bonus = p.workers * 6;
            bonusVP += bonus;
            bonusMap['labor_union'] = bonus;
        }
        if (has('headquarters')) {
            const bonus = p.buildings.filter(b => getCardDef(b.card.defId).unsellable).length * 6;
            bonusVP += bonus;
            bonusMap['headquarters'] = bonus;
        }
        if (has('railroad')) {
            const bonus = p.buildings.filter(b => getCardDef(b.card.defId).tags.includes('factory')).length * 8;
            bonusVP += bonus;
            bonusMap['railroad'] = bonus;
        }

        for (const b of p.buildings) {
            const def = getCardDef(b.card.defId);
            const bBonus = bonusMap[def.id] || 0;
            buildingDetails.push({ name: def.name, baseVP: def.vp, bonusVP: bBonus });
        }

        const moneyVP = p.money;
        const rawDebts = p.unpaidDebts;
        const hasLawOffice = has('law_office');
        const exemptedDebts = hasLawOffice ? Math.min(rawDebts, 5) : 0;
        const effectiveDebts = rawDebts - exemptedDebts;
        const debtVP = effectiveDebts * -3;
        const total = buildingVP + moneyVP + debtVP + bonusVP;
        results.push({ playerIndex: parseInt(pid), score: total, breakdown: { buildingVP, moneyVP, debtVP, bonusVP, total, buildingDetails, rawDebts, exemptedDebts, hasLawOffice } });
    }
    return results.sort((a, b) => b.score - a.score);
}

// ============================================================
// フェーズ遷移
// ============================================================
function advanceTurnOrPhase(G: GameState, ctx: Ctx, events: any) {
    if (totalAvailableWorkers(G) === 0) {
        startPayday(G, ctx, events);
    } else {
        const next = findNextPlayer(G, ctx);
        if (next !== null) events.endTurn({ next });
    }
}

function startPayday(G: GameState, _ctx: Ctx, _events: any) {
    G.phase = 'payday';
    const wage = getWagePerWorker(G.round);
    pushLog(G, `--- 💰 給料日（賃金$${wage}/人） ---`);
    for (let i = 0; i < Object.keys(G.players).length; i++) {
        const p = G.players[String(i)];
        const total = wage * p.workers;
        if (p.money >= total) {
            p.money -= total;
            G.household += total;
            pushLog(G, `P${i + 1}: 賃金$${total}を支払い（残金$${p.money}）`);
        } else {
            const hasSellable = p.buildings.some(b => !getCardDef(b.card.defId).unsellable);
            if (hasSellable && p.money < total) {
                G.paydayState = { currentPlayerIndex: i, wagePerWorker: wage, totalWage: total, selectedBuildingIndices: [] };
                G.activePlayer = i;
                return;
            }
            const paid = p.money;
            G.household += paid;
            p.money = 0;
            const debt = total - paid;
            p.unpaidDebts += debt;
            pushLog(G, `P${i + 1}: 賃金$${total}不足、$${debt}が未払い（負債合計${p.unpaidDebts}枚）`);
        }
    }
    finishPayday(G, _ctx, _events);
}

function continuePayday(G: GameState, ctx: Ctx, events: any) {
    const wage = getWagePerWorker(G.round);
    const startIdx = G.paydayState!.currentPlayerIndex;
    const cp = G.players[String(startIdx)];
    const total = wage * cp.workers;
    if (cp.money >= total) {
        cp.money -= total;
        G.household += total;
        pushLog(G, `P${startIdx + 1}: 賃金$${total}を支払い（残金$${cp.money}）`);
    } else {
        const paid = cp.money;
        G.household += paid;
        cp.money = 0;
        const debt = total - paid;
        cp.unpaidDebts += debt;
        pushLog(G, `P${startIdx + 1}: 賃金$${total}不足、$${debt}が未払い（負債合計${cp.unpaidDebts}枚）`);
    }
    for (let i = startIdx + 1; i < Object.keys(G.players).length; i++) {
        const p = G.players[String(i)];
        const t = wage * p.workers;
        if (p.money >= t) {
            p.money -= t;
            G.household += t;
            pushLog(G, `P${i + 1}: 賃金$${t}を支払い（残金$${p.money}）`);
        } else {
            const hasSellable = p.buildings.some(b => !getCardDef(b.card.defId).unsellable);
            if (hasSellable && p.money < t) {
                G.paydayState = { currentPlayerIndex: i, wagePerWorker: wage, totalWage: t, selectedBuildingIndices: [] };
                G.activePlayer = i;
                return;
            }
            const paid = p.money;
            G.household += paid;
            p.money = 0;
            const debt = t - paid;
            p.unpaidDebts += debt;
            pushLog(G, `P${i + 1}: 賃金$${t}不足、$${debt}が未払い（負債合計${p.unpaidDebts}枚）`);
        }
    }
    G.paydayState = null;
    finishPayday(G, ctx, events);
}

function finishPayday(G: GameState, ctx: Ctx, events: any) {
    G.paydayState = null;
    startCleanup(G, ctx, events);
}

function startCleanup(G: GameState, _ctx: Ctx, events: any) {
    G.phase = 'cleanup';
    for (let i = 0; i < Object.keys(G.players).length; i++) {
        const p = G.players[String(i)];
        if (p.hand.length > p.maxHandSize) {
            const excess = p.hand.length - p.maxHandSize;
            G.cleanupState = { currentPlayerIndex: i, excessCount: excess, selectedIndices: [] };
            G.activePlayer = i;
            return;
        }
    }
    finishCleanup(G, _ctx, events);
}

function continueCleanup(G: GameState, ctx: Ctx, events: any) {
    const startIdx = G.cleanupState!.currentPlayerIndex;
    for (let i = startIdx + 1; i < Object.keys(G.players).length; i++) {
        const p = G.players[String(i)];
        if (p.hand.length > p.maxHandSize) {
            const excess = p.hand.length - p.maxHandSize;
            G.cleanupState = { currentPlayerIndex: i, excessCount: excess, selectedIndices: [] };
            G.activePlayer = i;
            return;
        }
    }
    G.cleanupState = null;
    finishCleanup(G, ctx, events);
}

function finishCleanup(G: GameState, _ctx: Ctx, _events: any) {
    G.cleanupState = null;
    if (G.round >= 9) {
        G.phase = 'gameEnd';
        G.finalScores = calculateScores(G);
        pushLog(G, '=== 🏆 ゲーム終了！ ===');
        return;
    }
    advanceRound(G, _events);
}

function advanceRound(G: GameState, events: any) {
    G.round++;
    pushLog(G, `=== ラウンド ${G.round} 開始 ===`);
    const newWP = getRoundWorkplace(G.round, G.numPlayers);
    if (newWP) {
        G.publicWorkplaces.push(newWP);
        pushLog(G, `新しい職場 [${newWP.name}] が追加されました`);
    }

    // v5: 焼畑は消滅ではなく捨て札へ
    // 公共職場の焼畑ワーカー回収 & 捨て札化
    const burnPublicIds: string[] = [];
    for (const wp of G.publicWorkplaces) {
        if (wp.fromBuildingDefId === 'slash_burn' && wp.workers.length > 0) {
            burnPublicIds.push(wp.id);
        }
        wp.workers = [];
    }
    // 公共職場から焼畑を除去して捨て札に
    for (const bpId of burnPublicIds) {
        const wpIdx = G.publicWorkplaces.findIndex(w => w.id === bpId);
        if (wpIdx >= 0) {
            // 公共職場由来の焼畑カードを捨て札に追加
            const wp = G.publicWorkplaces[wpIdx];
            const cardUidMatch = wp.id.match(/^sold_(.+)$/);
            if (cardUidMatch) {
                G.discard.push({ uid: cardUidMatch[1], defId: 'slash_burn' });
            }
            G.publicWorkplaces.splice(wpIdx, 1);
            pushLog(G, `[焼畑]（公共）が使用され捨て札になりました`);
        }
    }

    // ワーカーリセット & 建物ワーカー回収
    for (const pid of Object.keys(G.players)) {
        const p = G.players[pid];
        p.availableWorkers = p.workers;
        const burnCards: Card[] = [];
        for (const b of p.buildings) {
            if (b.card.defId === 'slash_burn' && b.workerPlaced) {
                burnCards.push(b.card);
            }
            b.workerPlaced = false;
        }
        // v5: 焼畑を建物から除去し、捨て札に追加
        if (burnCards.length > 0) {
            p.buildings = p.buildings.filter(b => !burnCards.some(bc => bc.uid === b.card.uid));
            for (const bc of burnCards) {
                G.discard.push(bc);
                pushLog(G, `P${parseInt(pid) + 1}の[焼畑]が使用され捨て札になりました`);
            }
        }
    }

    G.phase = 'work';
    events.endTurn({ next: String(G.startPlayer) });
}

// ============================================================
// 建物職場効果の即座適用（捨て不要なもの）
// ============================================================
function applySimpleBuildingEffect(G: GameState, pid: string, defId: string) {
    const p = G.players[pid];
    switch (defId) {
        case 'farm': drawConsumables(G, pid, 2); break;
        case 'slash_burn': drawConsumables(G, pid, 5); break;
        case 'coffee_shop': G.household -= 5; p.money += 5; break;
        case 'orchard': {
            const need = Math.max(0, 4 - p.hand.length);
            drawConsumables(G, pid, need);
            break;
        }
        case 'large_farm': drawConsumables(G, pid, 3); break;
        case 'steel_mill': p.hand.push(...drawCards(G, 3)); break;
        case 'chemical_plant': {
            const n = p.hand.length === 0 ? 4 : 2;
            p.hand.push(...drawCards(G, n));
            break;
        }
        case 'mansion': break;
    }
}

// ============================================================
// BoardGame.io ゲーム定義
// ============================================================
export const NationalEconomy: Game<GameState> = {
    name: 'national-economy',

    // ラウンド1の初手をstartPlayerから開始するためのターン設定
    turn: {
        order: {
            first: ({ G }: { G: any }) => G.startPlayer,
            next: ({ ctx }: { ctx: any }) => (ctx.playOrderPos + 1) % ctx.numPlayers,
        },
    },

    setup: ({ ctx }): GameState => {
        _uidCounter = 0;
        const deck = buildDeck();
        // スタートプレイヤーをランダムに決定
        const startPlayer = Math.floor(Math.random() * ctx.numPlayers);
        const players: { [k: string]: PlayerState } = {};
        for (let i = 0; i < ctx.numPlayers; i++) {
            // スタート順に基づく初期所持金（1番手=$5, 2番手=$6, ...）
            const order = (i - startPlayer + ctx.numPlayers) % ctx.numPlayers;
            players[String(i)] = {
                hand: deck.splice(0, 3),
                money: 5 + order,
                workers: 2,
                availableWorkers: 2,
                buildings: [],
                unpaidDebts: 0,
                maxHandSize: 5,
                maxWorkers: 5,
            };
        }
        const initialLog: GameState['log'] = [{ text: `=== ラウンド 1 開始（${ctx.numPlayers}人プレイ, P${startPlayer + 1}からスタート） ===`, round: 1 }];
        return {
            players,
            publicWorkplaces: createInitialWorkplaces(ctx.numPlayers),
            household: 0, round: 1, phase: 'work', startPlayer,
            deck, discard: [], consumableCounter: 0,
            numPlayers: ctx.numPlayers,
            discardState: null, buildState: null, paydayState: null, cleanupState: null,
            designOfficeState: null, dualConstructionState: null,
            activePlayer: startPlayer,
            log: initialLog,
            finalScores: null,
        };
    },

    moves: {
        // ============ ワーカー配置（公共職場） ============
        placeWorker: ({ G, ctx, events }, workplaceId: string) => {
            if (G.phase !== 'work') return INVALID_MOVE;
            const pid = ctx.currentPlayer;
            const p = G.players[pid];
            if (p.availableWorkers <= 0) return INVALID_MOVE;

            const wp = G.publicWorkplaces.find(w => w.id === workplaceId);
            if (!wp) return INVALID_MOVE;
            if (!wp.multipleAllowed && wp.workers.length > 0) return INVALID_MOVE;

            if (wp.specialEffect === 'hire_worker' && p.workers >= p.maxWorkers) return INVALID_MOVE;
            if (wp.specialEffect === 'expand4' && p.workers >= 4) return INVALID_MOVE;
            if (wp.specialEffect === 'expand5' && p.workers >= 5) return INVALID_MOVE;
            if (wp.specialEffect === 'hire_immediate' && p.workers >= p.maxWorkers) return INVALID_MOVE;

            if (wp.specialEffect === 'build') {
                if (!canBuildAnything(p, 0)) return INVALID_MOVE;
            }
            const sellInfo = parseSellEffect(wp.specialEffect);
            if (sellInfo) {
                if (p.hand.length < sellInfo.count) return INVALID_MOVE;
                if (G.household < sellInfo.amount) return INVALID_MOVE;
            }
            if (wp.fromBuildingDefId && !canPlaceOnBuildingWP(G, p, wp.fromBuildingDefId)) return INVALID_MOVE;

            wp.workers.push(parseInt(pid));
            p.availableWorkers--;

            pushLog(G, `P${parseInt(pid) + 1}が[${wp.name}]にワーカーを配置`);
            return applyPublicWPEffect(G, ctx, events, wp, pid);
        },

        // ============ ワーカー配置（個人建物） ============
        placeWorkerOnBuilding: ({ G, ctx, events }, cardUid: string) => {
            if (G.phase !== 'work') return INVALID_MOVE;
            const pid = ctx.currentPlayer;
            const p = G.players[pid];
            if (p.availableWorkers <= 0) return INVALID_MOVE;

            const slot = p.buildings.find(b => b.card.uid === cardUid);
            if (!slot || slot.workerPlaced) return INVALID_MOVE;

            const defId = slot.card.defId;
            const def = getCardDef(defId);

            if (def.unsellable && defId !== 'slash_burn') return INVALID_MOVE;
            if (!canPlaceOnBuildingWP(G, p, defId)) return INVALID_MOVE;

            slot.workerPlaced = true;
            p.availableWorkers--;

            pushLog(G, `P${parseInt(pid) + 1}が自分の[${def.name}]にワーカーを配置`);
            return applyBuildingEffect(G, ctx, events, pid, defId);
        },

        // ============ カード捨て選択トグル ============
        toggleDiscard: ({ G }, cardIndex: number) => {
            if (!G.discardState && !G.cleanupState) return INVALID_MOVE;
            const state = G.discardState || G.cleanupState!;
            const idx = state.selectedIndices.indexOf(cardIndex);
            if (idx >= 0) state.selectedIndices.splice(idx, 1);
            else state.selectedIndices.push(cardIndex);
        },

        // ============ カード捨て確定 ============
        confirmDiscard: ({ G, ctx, events }) => {
            if (G.phase === 'cleanup' && G.cleanupState) {
                const cs = G.cleanupState;
                if (cs.selectedIndices.length !== cs.excessCount) return INVALID_MOVE;
                const p = G.players[String(cs.currentPlayerIndex)];
                const sorted = [...cs.selectedIndices].sort((a, b) => b - a);
                for (const i of sorted) { discardCard(G, p.hand[i]); p.hand.splice(i, 1); }
                pushLog(G, `P${cs.currentPlayerIndex + 1}が精算で${cs.excessCount}枚を捨てた`);
                continueCleanup(G, ctx, events);
                return;
            }
            if (!G.discardState) return INVALID_MOVE;
            const ds = G.discardState;
            if (ds.selectedIndices.length !== ds.count) return INVALID_MOVE;
            const pid = ctx.currentPlayer;
            const p = G.players[pid];

            if (ds.excludeCardUid) {
                const exIdx = p.hand.findIndex(c => c.uid === ds.excludeCardUid);
                if (ds.selectedIndices.includes(exIdx)) return INVALID_MOVE;
            }

            const sorted = [...ds.selectedIndices].sort((a, b) => b - a);
            for (const i of sorted) { discardCard(G, p.hand[i]); p.hand.splice(i, 1); }

            const action = ds.callbackAction;
            const data = ds.callbackData;
            G.discardState = null;

            switch (action) {
                case 'sell': {
                    const amount = data.amount as number;
                    G.household -= amount;
                    p.money += amount;
                    pushLog(G, `P${parseInt(pid) + 1}が${ds.count}枚を捨てて$${amount}を獲得`);
                    G.phase = 'work';
                    advanceTurnOrPhase(G, ctx, events);
                    break;
                }
                case 'draw': {
                    const count = data.count as number;
                    p.hand.push(...drawCards(G, count));
                    pushLog(G, `P${parseInt(pid) + 1}が${ds.count}枚を捨てて${count}枚をドロー`);
                    G.phase = 'work';
                    advanceTurnOrPhase(G, ctx, events);
                    break;
                }
                case 'restaurant': {
                    G.household -= 15;
                    p.money += 15;
                    pushLog(G, `P${parseInt(pid) + 1}が[レストラン]で1枚捨てて$15を獲得`);
                    G.phase = 'work';
                    advanceTurnOrPhase(G, ctx, events);
                    break;
                }
                case 'build_cost': {
                    const buildUid = data.buildCardUid as string;
                    const bi = p.hand.findIndex(c => c.uid === buildUid);
                    if (bi >= 0) {
                        const card = p.hand.splice(bi, 1)[0];
                        p.buildings.push({ card, workerPlaced: false });
                        applyBuildPassiveEffect(p, card.defId);
                        pushLog(G, `P${parseInt(pid) + 1}が[${getCardDef(card.defId).name}]を建設`);
                    }
                    const drawAfter = data.drawAfterBuild as number;
                    if (drawAfter > 0) p.hand.push(...drawCards(G, drawAfter));
                    G.buildState = null;
                    G.phase = 'work';
                    advanceTurnOrPhase(G, ctx, events);
                    break;
                }
                case 'dual_build_cost': {
                    const uid1 = data.buildCardUid1 as string;
                    const uid2 = data.buildCardUid2 as string;
                    const i1 = p.hand.findIndex(c => c.uid === uid1);
                    const i2 = p.hand.findIndex(c => c.uid === uid2);
                    const indices = [i1, i2].filter(x => x >= 0).sort((a, b) => b - a);
                    const names: string[] = [];
                    for (const idx of indices) {
                        const card = p.hand.splice(idx, 1)[0];
                        p.buildings.push({ card, workerPlaced: false });
                        applyBuildPassiveEffect(p, card.defId);
                        names.push(getCardDef(card.defId).name);
                    }
                    pushLog(G, `P${parseInt(pid) + 1}が[二胡市建設]で[${names.join(']と[')}]を建設`);
                    G.dualConstructionState = null;
                    G.buildState = null;
                    G.phase = 'work';
                    advanceTurnOrPhase(G, ctx, events);
                    break;
                }
            }
        },

        // ============ 建設カード選択 ============
        selectBuildCard: ({ G, ctx, events }, cardIndex: number) => {
            if (G.phase !== 'build' || !G.buildState) return INVALID_MOVE;
            const pid = ctx.currentPlayer;
            const p = G.players[pid];
            if (cardIndex < 0 || cardIndex >= p.hand.length) return INVALID_MOVE;

            const card = p.hand[cardIndex];
            if (isConsumable(card)) return INVALID_MOVE;

            const def = getCardDef(card.defId);
            const bs = G.buildState;

            if (bs.action === 'pioneer' && !def.tags.includes('farm')) return INVALID_MOVE;

            const actualCost = Math.max(0, def.cost - bs.costReduction);
            if (bs.action === 'pioneer') {
                p.hand.splice(cardIndex, 1);
                p.buildings.push({ card, workerPlaced: false });
                applyBuildPassiveEffect(p, card.defId);
                pushLog(G, `P${parseInt(pid) + 1}が[開拓民]で[${def.name}]を無料建設`);
                G.buildState = null;
                G.phase = 'work';
                advanceTurnOrPhase(G, ctx, events);
                return;
            }

            if (p.hand.length - 1 < actualCost) return INVALID_MOVE;

            if (actualCost === 0) {
                p.hand.splice(cardIndex, 1);
                p.buildings.push({ card, workerPlaced: false });
                applyBuildPassiveEffect(p, card.defId);
                if (bs.drawAfterBuild > 0) p.hand.push(...drawCards(G, bs.drawAfterBuild));
                pushLog(G, `P${parseInt(pid) + 1}が[${def.name}]を建設（コスト0）`);
                G.buildState = null;
                G.phase = 'work';
                advanceTurnOrPhase(G, ctx, events);
                return;
            }

            G.phase = 'discard';
            G.discardState = {
                count: actualCost,
                reason: `${def.name}の建設コスト（${actualCost}枚）`,
                selectedIndices: [],
                callbackAction: 'build_cost',
                callbackData: { buildCardUid: card.uid, drawAfterBuild: bs.drawAfterBuild },
                excludeCardUid: card.uid,
            };
        },

        // ============ アクションキャンセル ============
        cancelAction: ({ G, ctx, events }) => {
            const pid = ctx.currentPlayer;
            const p = G.players[pid];

            if (G.phase === 'build' && G.buildState) {
                const action = G.buildState.action;
                const buildingDefIds = ['construction_co', 'pioneer', 'general_contractor'];
                if (buildingDefIds.includes(action)) {
                    const slot = p.buildings.find(b => b.card.defId === action && b.workerPlaced);
                    if (slot) { slot.workerPlaced = false; p.availableWorkers++; }
                } else {
                    for (const wp of G.publicWorkplaces) {
                        if (wp.specialEffect === 'build' && wp.workers.includes(parseInt(pid))) {
                            wp.workers = wp.workers.filter(w => w !== parseInt(pid));
                            p.availableWorkers++;
                            break;
                        }
                    }
                }
                G.buildState = null;
                G.phase = 'work';
                pushLog(G, `P${parseInt(pid) + 1}が建設をキャンセル`);
                return;
            }

            if (G.phase === 'discard' && G.discardState) {
                const ds = G.discardState;
                if (ds.callbackAction === 'sell') {
                    for (const wp of G.publicWorkplaces) {
                        const sellInfo = wp.specialEffect.match(/^sell_(\d+)_(\d+)$/);
                        if (sellInfo && wp.workers.includes(parseInt(pid))) {
                            wp.workers = wp.workers.filter(w => w !== parseInt(pid));
                            p.availableWorkers++;
                            break;
                        }
                    }
                } else if (ds.callbackAction === 'draw') {
                    const factoryDefIds = ['factory', 'auto_factory'];
                    let found = false;
                    for (const defId of factoryDefIds) {
                        const slot = p.buildings.find(b => b.card.defId === defId && b.workerPlaced);
                        if (slot) { slot.workerPlaced = false; p.availableWorkers++; found = true; break; }
                    }
                    if (!found) {
                        for (const wp of G.publicWorkplaces) {
                            if (wp.fromBuildingDefId && factoryDefIds.includes(wp.fromBuildingDefId) && wp.workers.includes(parseInt(pid))) {
                                wp.workers = wp.workers.filter(w => w !== parseInt(pid));
                                p.availableWorkers++;
                                break;
                            }
                        }
                    }
                } else if (ds.callbackAction === 'restaurant') {
                    const slot = p.buildings.find(b => b.card.defId === 'restaurant' && b.workerPlaced);
                    if (slot) { slot.workerPlaced = false; p.availableWorkers++; }
                    else {
                        for (const wp of G.publicWorkplaces) {
                            if (wp.fromBuildingDefId === 'restaurant' && wp.workers.includes(parseInt(pid))) {
                                wp.workers = wp.workers.filter(w => w !== parseInt(pid));
                                p.availableWorkers++;
                                break;
                            }
                        }
                    }
                } else if (ds.callbackAction === 'build_cost') {
                    G.buildState = null;
                    for (const wp of G.publicWorkplaces) {
                        if (wp.specialEffect === 'build' && wp.workers.includes(parseInt(pid))) {
                            wp.workers = wp.workers.filter(w => w !== parseInt(pid));
                            p.availableWorkers++;
                            break;
                        }
                    }
                    for (const defId of ['construction_co', 'general_contractor']) {
                        const slot = p.buildings.find(b => b.card.defId === defId && b.workerPlaced);
                        if (slot) { slot.workerPlaced = false; p.availableWorkers++; break; }
                    }
                } else if (ds.callbackAction === 'dual_build_cost') {
                    G.dualConstructionState = null;
                    G.buildState = null;
                    const slot = p.buildings.find(b => b.card.defId === 'dual_construction' && b.workerPlaced);
                    if (slot) { slot.workerPlaced = false; p.availableWorkers++; }
                    else {
                        for (const wp of G.publicWorkplaces) {
                            if (wp.fromBuildingDefId === 'dual_construction' && wp.workers.includes(parseInt(pid))) {
                                wp.workers = wp.workers.filter(w => w !== parseInt(pid));
                                p.availableWorkers++;
                                break;
                            }
                        }
                    }
                }
                G.discardState = null;
                G.phase = 'work';
                pushLog(G, `P${parseInt(pid) + 1}がアクションをキャンセル`);
                return;
            }

            if (G.phase === 'designOffice' && G.designOfficeState) {
                for (const c of G.designOfficeState.revealedCards) G.deck.push(c);
                G.designOfficeState = null;
                const slot = p.buildings.find(b => b.card.defId === 'design_office' && b.workerPlaced);
                if (slot) { slot.workerPlaced = false; p.availableWorkers++; }
                else {
                    for (const wp of G.publicWorkplaces) {
                        if (wp.fromBuildingDefId === 'design_office' && wp.workers.includes(parseInt(pid))) {
                            wp.workers = wp.workers.filter(w => w !== parseInt(pid));
                            p.availableWorkers++;
                            break;
                        }
                    }
                }
                G.phase = 'work';
                pushLog(G, `P${parseInt(pid) + 1}が[設計事務所]をキャンセル`);
                return;
            }

            if (G.phase === 'dualConstruction' && G.dualConstructionState) {
                G.dualConstructionState = null;
                const slot = p.buildings.find(b => b.card.defId === 'dual_construction' && b.workerPlaced);
                if (slot) { slot.workerPlaced = false; p.availableWorkers++; }
                else {
                    for (const wp of G.publicWorkplaces) {
                        if (wp.fromBuildingDefId === 'dual_construction' && wp.workers.includes(parseInt(pid))) {
                            wp.workers = wp.workers.filter(w => w !== parseInt(pid));
                            p.availableWorkers++;
                            break;
                        }
                    }
                }
                G.phase = 'work';
                pushLog(G, `P${parseInt(pid) + 1}が[二胡市建設]をキャンセル`);
                return;
            }
        },

        // ============ 設計事務所: カード選択 ============
        selectDesignOfficeCard: ({ G, ctx, events }, cardIndex: number) => {
            if (G.phase !== 'designOffice' || !G.designOfficeState) return INVALID_MOVE;
            const dos = G.designOfficeState;
            if (cardIndex < 0 || cardIndex >= dos.revealedCards.length) return INVALID_MOVE;

            const pid = ctx.currentPlayer;
            const p = G.players[pid];

            const chosen = dos.revealedCards[cardIndex];
            p.hand.push(chosen);
            for (let i = 0; i < dos.revealedCards.length; i++) {
                if (i !== cardIndex) G.discard.push(dos.revealedCards[i]);
            }

            pushLog(G, `P${parseInt(pid) + 1}が[設計事務所]で[${isConsumable(chosen) ? '消費財' : getCardDef(chosen.defId).name}]を選択`);
            G.designOfficeState = null;
            G.phase = 'work';
            advanceTurnOrPhase(G, ctx, events);
        },

        // ============ 二胡市建設: カード選択トグル ============
        toggleDualCard: ({ G, ctx }, cardIndex: number) => {
            if (G.phase !== 'dualConstruction' || !G.dualConstructionState) return INVALID_MOVE;
            const pid = ctx.currentPlayer;
            const p = G.players[pid];
            if (cardIndex < 0 || cardIndex >= p.hand.length) return INVALID_MOVE;

            const card = p.hand[cardIndex];
            if (isConsumable(card)) return INVALID_MOVE;

            const ds = G.dualConstructionState;
            const idx = ds.selectedCardIndices.indexOf(cardIndex);
            if (idx >= 0) {
                ds.selectedCardIndices.splice(idx, 1);
                return;
            }

            if (ds.selectedCardIndices.length >= 2) return INVALID_MOVE;

            if (ds.selectedCardIndices.length === 1) {
                const firstCard = p.hand[ds.selectedCardIndices[0]];
                const firstDef = getCardDef(firstCard.defId);
                const thisDef = getCardDef(card.defId);
                if (firstDef.cost !== thisDef.cost) return INVALID_MOVE;
            }

            ds.selectedCardIndices.push(cardIndex);
        },

        // ============ 二胡市建設: 確定 ============
        confirmDualConstruction: ({ G, ctx, events }) => {
            if (G.phase !== 'dualConstruction' || !G.dualConstructionState) return INVALID_MOVE;
            const pid = ctx.currentPlayer;
            const p = G.players[pid];
            const ds = G.dualConstructionState;
            if (ds.selectedCardIndices.length !== 2) return INVALID_MOVE;

            const card1 = p.hand[ds.selectedCardIndices[0]];
            const card2 = p.hand[ds.selectedCardIndices[1]];
            const def1 = getCardDef(card1.defId);
            const def2 = getCardDef(card2.defId);

            if (def1.cost !== def2.cost) return INVALID_MOVE;

            const cost = Math.min(def1.cost, def2.cost);
            const remaining = p.hand.length - 2;
            if (remaining < cost) return INVALID_MOVE;

            if (cost === 0) {
                const sorted = [...ds.selectedCardIndices].sort((a, b) => b - a);
                const names: string[] = [];
                for (const ci of sorted) {
                    const c = p.hand.splice(ci, 1)[0];
                    p.buildings.push({ card: c, workerPlaced: false });
                    applyBuildPassiveEffect(p, c.defId);
                    names.push(getCardDef(c.defId).name);
                }
                pushLog(G, `P${parseInt(pid) + 1}が[二胡市建設]で[${names.join(']と[')}]を建設（コスト0）`);
                G.dualConstructionState = null;
                G.phase = 'work';
                advanceTurnOrPhase(G, ctx, events);
                return;
            }

            G.phase = 'discard';
            G.discardState = {
                count: cost,
                reason: `二胡市建設コスト（${cost}枚）`,
                selectedIndices: [],
                callbackAction: 'dual_build_cost',
                callbackData: { buildCardUid1: card1.uid, buildCardUid2: card2.uid },
                excludeCardUid: card1.uid,
            };
        },

        // ============ 給料日: 建物売却トグル ============
        togglePaydaySell: ({ G }, buildingIndex: number) => {
            if (G.phase !== 'payday' || !G.paydayState) return INVALID_MOVE;
            const ps = G.paydayState;
            const p = G.players[String(ps.currentPlayerIndex)];
            if (buildingIndex < 0 || buildingIndex >= p.buildings.length) return INVALID_MOVE;

            const def = getCardDef(p.buildings[buildingIndex].card.defId);
            if (def.unsellable) return INVALID_MOVE;

            const idx = ps.selectedBuildingIndices.indexOf(buildingIndex);
            if (idx >= 0) {
                ps.selectedBuildingIndices.splice(idx, 1);
            } else {
                ps.selectedBuildingIndices.push(buildingIndex);
            }
        },

        // ============ 給料日: 売却確定 ============
        confirmPaydaySell: ({ G, ctx, events }) => {
            if (G.phase !== 'payday' || !G.paydayState) return INVALID_MOVE;
            const ps = G.paydayState;
            const pid = String(ps.currentPlayerIndex);
            const p = G.players[pid];

            const selectedVPs = ps.selectedBuildingIndices.map(bi => getCardDef(p.buildings[bi].card.defId).vp);
            const sellTotal = selectedVPs.reduce((sum, vp) => sum + vp, 0);
            const totalFunds = p.money + sellTotal;

            const allSellableCount = p.buildings.filter(b => !getCardDef(b.card.defId).unsellable).length;
            const allSelected = ps.selectedBuildingIndices.length === allSellableCount;

            if (ps.selectedBuildingIndices.length === 0 && p.money < ps.totalWage) return INVALID_MOVE;

            // 過剰売却チェック（全選択でも1つ除いて払えるなら過剰）
            if (selectedVPs.length > 0) {
                const minVP = Math.min(...selectedVPs);
                if ((totalFunds - minVP) >= ps.totalWage) return INVALID_MOVE;
            }

            if (totalFunds < ps.totalWage && !allSelected) return INVALID_MOVE;

            // 売却実行
            const sorted = [...ps.selectedBuildingIndices].sort((a, b) => b - a);
            for (const bi of sorted) {
                const slot = p.buildings[bi];
                const def = getCardDef(slot.card.defId);
                p.money += def.vp;
                G.publicWorkplaces.push({
                    id: `sold_${slot.card.uid}`,
                    name: def.name,
                    effectText: def.effectText,
                    multipleAllowed: false,
                    workers: [],
                    specialEffect: '',
                    addedAtRound: G.round,
                    fromBuilding: true,
                    fromBuildingDefId: def.id,
                });
                pushLog(G, `P${ps.currentPlayerIndex + 1}が給料日に[${def.name}]を売却（$${def.vp}）`);
                p.buildings.splice(bi, 1);
            }

            continuePayday(G, ctx, events);
        },

        // ============ 給料日: 売却なしで確定 ============
        confirmPayday: ({ G, ctx, events }) => {
            if (G.phase !== 'payday' || !G.paydayState) return INVALID_MOVE;
            continuePayday(G, ctx, events);
        },
    },

    // オンラインプレイ用: 他プレイヤーの手札を隠蔽
    playerView: ({ G, ctx, playerID }) => {
        if (!playerID) return G;
        const filtered = JSON.parse(JSON.stringify(G));
        for (const pid of Object.keys(filtered.players)) {
            if (pid !== playerID) {
                filtered.players[pid].hand = filtered.players[pid].hand.map((c: any) => ({
                    uid: c.uid,
                    defId: 'HIDDEN',
                }));
            }
        }
        // デッキと捨て山の内容も隠蔽（枚数のみ公開）
        filtered.deck = filtered.deck.map(() => ({ uid: 'x', defId: 'HIDDEN' }));
        return filtered;
    },
};

// ============================================================
// 公共職場効果適用
// ============================================================
function applyPublicWPEffect(G: GameState, ctx: Ctx, events: any, wp: Workplace, pid: string) {
    const p = G.players[pid];

    const sellInfo = parseSellEffect(wp.specialEffect);
    if (sellInfo) {
        G.activePlayer = parseInt(pid);
        G.phase = 'discard';
        G.discardState = {
            count: sellInfo.count,
            reason: `${wp.name}（${sellInfo.count}枚捨て→$${sellInfo.amount}）`,
            selectedIndices: [],
            callbackAction: 'sell',
            callbackData: { amount: sellInfo.amount },
        };
        return;
    }

    switch (wp.specialEffect) {
        case 'draw1':
            p.hand.push(...drawCards(G, 1));
            break;
        case 'start_player_draw':
            p.hand.push(...drawCards(G, 1));
            G.startPlayer = parseInt(pid);
            break;
        case 'hire_worker':
            if (p.workers < p.maxWorkers) p.workers++;
            break;
        case 'hire_immediate':
            if (p.workers < p.maxWorkers) { p.workers++; p.availableWorkers++; }
            break;
        case 'expand4':
            p.workers = 4;
            break;
        case 'expand5':
            p.workers = 5;
            break;
        case 'build':
            G.activePlayer = parseInt(pid);
            G.phase = 'build';
            G.buildState = { costReduction: 0, drawAfterBuild: 0, action: 'build' };
            return;
    }

    if (wp.fromBuildingDefId) {
        return applyBuildingEffect(G, ctx, events, pid, wp.fromBuildingDefId);
    }

    advanceTurnOrPhase(G, ctx, events);
}

// ============================================================
// 建物効果適用
// ============================================================
function applyBuildingEffect(G: GameState, ctx: Ctx, events: any, pid: string, defId: string) {
    const p = G.players[pid];

    switch (defId) {
        case 'design_office': {
            const revealed = drawCards(G, 5);
            if (revealed.length === 0) {
                advanceTurnOrPhase(G, ctx, events);
                return;
            }
            G.activePlayer = parseInt(pid);
            G.phase = 'designOffice';
            G.designOfficeState = { revealedCards: revealed };
            return;
        }

        case 'farm': case 'slash_burn': case 'coffee_shop':
        case 'orchard': case 'large_farm': case 'steel_mill': case 'chemical_plant':
        case 'mansion':
            applySimpleBuildingEffect(G, pid, defId);
            advanceTurnOrPhase(G, ctx, events);
            return;

        case 'factory':
            G.activePlayer = parseInt(pid);
            G.phase = 'discard';
            G.discardState = {
                count: 2, reason: '工場（2枚捨て→4枚引く）',
                selectedIndices: [], callbackAction: 'draw', callbackData: { count: 4 },
            };
            return;
        case 'auto_factory':
            G.activePlayer = parseInt(pid);
            G.phase = 'discard';
            G.discardState = {
                count: 3, reason: '自動車工場（3枚捨て→7枚引く）',
                selectedIndices: [], callbackAction: 'draw', callbackData: { count: 7 },
            };
            return;

        case 'restaurant':
            G.activePlayer = parseInt(pid);
            G.phase = 'discard';
            G.discardState = {
                count: 1, reason: 'レストラン（1枚捨て→家計$15）',
                selectedIndices: [], callbackAction: 'restaurant', callbackData: {},
            };
            return;

        case 'construction_co':
            G.activePlayer = parseInt(pid);
            G.phase = 'build';
            G.buildState = { costReduction: 1, drawAfterBuild: 0, action: 'construction_co' };
            return;
        case 'pioneer':
            G.activePlayer = parseInt(pid);
            G.phase = 'build';
            G.buildState = { costReduction: 99, drawAfterBuild: 0, action: 'pioneer' };
            return;
        case 'general_contractor':
            G.activePlayer = parseInt(pid);
            G.phase = 'build';
            G.buildState = { costReduction: 0, drawAfterBuild: 2, action: 'general_contractor' };
            return;

        case 'dual_construction':
            G.activePlayer = parseInt(pid);
            G.phase = 'dualConstruction';
            G.dualConstructionState = { selectedCardIndices: [] };
            return;

        default:
            advanceTurnOrPhase(G, ctx, events);
    }
}

/** 建設時のパッシブ効果（倉庫、社宅など） */
function applyBuildPassiveEffect(p: PlayerState, defId: string) {
    if (defId === 'warehouse') p.maxHandSize += 4;
    if (defId === 'company_housing') { p.maxWorkers++; }
}
