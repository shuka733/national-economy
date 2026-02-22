// ============================================================
// game.ts  –  ナショナルエコノミー ゲームロジック (v5)
// ============================================================
import type { Game, Ctx } from 'boardgame.io';
import { INVALID_MOVE, Stage } from 'boardgame.io/core';
import type { GameState, PlayerState, Workplace, Card, BuildingVPDetail, ScoreBreakdown, GameVersion, GameStats } from './types';
import { getCardDef, getDeckDefs, CONSUMABLE_DEF_ID } from './cards';

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
function buildDeck(version: GameVersion): Card[] {
    const cards: Card[] = [];
    const defs = getDeckDefs(version);
    for (const def of defs) {
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

/** 建設コスト計算（変動コスト対応） */
export function getConstructionCost(p: PlayerState, defId: string, costReduction: number): number {
    const def = getCardDef(defId);
    let base = def.cost;

    // Glory: 変動コスト
    if (def.variableCostType === 'vp_token' && def.variableCostParam !== undefined) {
        if (p.vpTokens >= def.variableCostParam) {
            // 変動値の定義が「VPトークンN枚以上でコスト-X」
            // ここでは簡易的に、Gloryのルールに従いハードコード気味に処理するか、
            // variableCostParamを「閾値」とし、減少量は都度定義するか？
            // 蒸気工場(2): VP2 -> -1
            // 精錬所(5): VP3 -> -2
            // 温室(6): VP4 -> -2
            // 機関車(7): VP5 -> -3
            // 汎用化が難しいのでID分岐またはパラメータ工夫が必要。
            // 今回は一旦ID分岐またはswitchで実装する
            if (def.id === 'gl_steam_factory') base -= 1;
            else if (def.id === 'gl_refinery') base -= 2;
            else if (def.id === 'gl_greenhouse') base -= 2;
            else if (def.id === 'gl_locomotive_factory') base -= 3;
        }
    }

    return Math.max(0, base - costReduction);
}

/** 建設可能か（コスト削減込み） */
function canBuildAnything(p: PlayerState, costReduction: number, isModernism: boolean = false): boolean {
    for (const card of p.hand) {
        if (isConsumable(card)) continue;
        const cost = getConstructionCost(p, card.defId, costReduction);

        if (isModernism) {
            // モダニズム: 消費財は2枚分、その他は1枚分
            let totalValue = 0;
            for (const h of p.hand) {
                if (h.uid === card.uid) continue; // 建設対象は除外
                totalValue += isConsumable(h) ? 2 : 1;
            }
            if (totalValue >= cost) return true;
        } else {
            if (p.hand.length - 1 >= cost) return true;
        }
    }
    return false;
}

/** モダニズム建設が可能か（消費財2枚分カウント） */
export function canBuildModernism(p: PlayerState): boolean {
    for (const card of p.hand) {
        if (isConsumable(card)) continue;
        const cost = getConstructionCost(p, card.defId, 0);
        let totalValue = 0;
        for (const h of p.hand) {
            if (h.uid === card.uid) continue;
            totalValue += isConsumable(h) ? 2 : 1;
        }
        if (totalValue >= cost) return true;
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

        // Glory
        case 'gl_steam_factory': return p.hand.length >= 2;
        case 'gl_locomotive_factory': return p.hand.length >= 3;
        case 'gl_theater': return p.hand.length >= 2;
        case 'gl_colonist': return canBuildAnything(p, 0);
        case 'gl_skyscraper': return canBuildAnything(p, 0);
        case 'gl_modernism_construction': return canBuildModernism(p);
        case 'gl_teleporter': return canBuildAnything(p, 99);

        default: return true;
    }
}

// ============================================================
// 初期 & ラウンド職場
// ============================================================
function createInitialWorkplaces(numPlayers: number, version: GameVersion): Workplace[] {
    const wps: Workplace[] = [
        { id: 'quarry', name: '採石場', effectText: 'カード1枚引く＋スタートプレイヤー', multipleAllowed: false, workers: [], specialEffect: 'start_player_draw', addedAtRound: 0, fromBuilding: false },
        { id: 'mine', name: '鉱山', effectText: 'カード1枚引く（複数配置可）', multipleAllowed: true, workers: [], specialEffect: 'draw1', addedAtRound: 0, fromBuilding: false },
        { id: 'school', name: '学校', effectText: '労働者+1（次ラウンドから）', multipleAllowed: false, workers: [], specialEffect: 'hire_worker', addedAtRound: 0, fromBuilding: false },
        { id: 'carpenter', name: '大工', effectText: '建物を1つ建設', multipleAllowed: false, workers: [], specialEffect: 'build', addedAtRound: 0, fromBuilding: false },
    ];

    // Glory: 遺跡
    if (version === 'glory') {
        wps.push({ id: 'ruins', name: '遺跡', effectText: '消費財1枚＋VPトークン1枚を得る', multipleAllowed: false, workers: [], specialEffect: 'ruins', addedAtRound: 0, fromBuilding: false });
    }

    const carpCount = numPlayers <= 2 ? 1 : numPlayers <= 3 ? 2 : 3;
    for (let i = 1; i < carpCount; i++) {
        wps.push({ ...wps[3], id: `carpenter_${i + 1} `, workers: [] });
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
export function calculateScores(G: GameState): { playerIndex: number; score: number; breakdown: ScoreBreakdown }[] {
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

        // Glory: VP Tokens (3 tokens = 10 VP, remainder 1pt each)
        // Set of 3 = 10pts. Remainder = 1pt each ? -> No, rule says "1枚1点" implies remainder is 1pt each.
        // Rule: "3枚セットごとに10点。端数は1枚1点。"
        const tokenSets = Math.floor(p.vpTokens / 3);
        const tokenRemainder = p.vpTokens % 3;
        const tokenVP = tokenSets * 10 + tokenRemainder;
        if (tokenVP > 0) {
            bonusVP += tokenVP;
            // Add explanation to breakdown if needed, or just include in total bonus
            buildingDetails.push({ name: 'VPトークン', baseVP: 0, bonusVP: tokenVP });
        }

        // Glory: Specific card bonuses
        if (has('gl_consumers_coop')) {
            // 農業の資産価値20以上 -> +18
            const agriValue = p.buildings
                .filter(b => getCardDef(b.card.defId).tags.includes('farm'))
                .reduce((sum, b) => sum + getCardDef(b.card.defId).vp, 0);
            if (agriValue >= 20) {
                bonusVP += 18;
                buildingDetails.push({ name: '消費者組合ボーナス', baseVP: 0, bonusVP: 18 });
            }
        }
        if (has('gl_guild_hall')) {
            // 農業と工業両方所持 -> +20
            const hasFarm = p.buildings.some(b => getCardDef(b.card.defId).tags.includes('farm'));
            const hasFactory = p.buildings.some(b => getCardDef(b.card.defId).tags.includes('factory'));
            if (hasFarm && hasFactory) {
                bonusVP += 20;
                buildingDetails.push({ name: 'ギルドホールボーナス', baseVP: 0, bonusVP: 20 });
            }
        }
        if (has('gl_ivory_tower')) {
            // VPトークン7枚以上 -> +22
            if (p.vpTokens >= 7) {
                bonusVP += 22;
                buildingDetails.push({ name: '象牙の塔ボーナス', baseVP: 0, bonusVP: 22 });
            }
        }
        if (has('gl_revolution_square')) {
            // 人間の労働者5人 -> +18
            const humanWorkers = p.workers - p.robotWorkers;
            if (humanWorkers >= 5) {
                bonusVP += 18;
                buildingDetails.push({ name: '革命広場ボーナス', baseVP: 0, bonusVP: 18 });
            }
        }
        if (has('gl_harvest_festival')) {
            // 手札に消費財4枚以上 -> +26
            const consumables = p.hand.filter(c => isConsumable(c)).length;
            if (consumables >= 4) {
                bonusVP += 26;
                buildingDetails.push({ name: '収穫祭ボーナス', baseVP: 0, bonusVP: 26 });
            }
        }
        if (has('gl_tech_exhibition')) {
            // 工業の資産価値30以上 -> +24
            const factoryValue = p.buildings
                .filter(b => getCardDef(b.card.defId).tags.includes('factory'))
                .reduce((sum, b) => sum + getCardDef(b.card.defId).vp, 0);
            if (factoryValue >= 30) {
                bonusVP += 24;
                buildingDetails.push({ name: '技術展示会ボーナス', baseVP: 0, bonusVP: 24 });
            }
        }
        if (has('gl_temple_of_purification')) {
            // 唯一の売却不可 -> +30
            const unsellables = p.buildings.filter(b => getCardDef(b.card.defId).unsellable);
            if (unsellables.length === 1 && unsellables[0].card.defId === 'gl_temple_of_purification') {
                bonusVP += 30;
                buildingDetails.push({ name: '浄火の神殿ボーナス', baseVP: 0, bonusVP: 30 });
            }
        }

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
    pushLog(G, `--- 給料日（賌金$${wage}/人） ---`);

    // 全プレイヤーの給料日状態を同時に初期化
    const playerStates: { [pid: string]: import('./types').PaydayPlayerState } = {};
    let firstNeedsSelling = -1;

    for (let i = 0; i < Object.keys(G.players).length; i++) {
        const p = G.players[String(i)];
        const payingWorkers = Math.max(0, p.workers - p.robotWorkers);
        const total = wage * payingWorkers;

        if (p.money >= total) {
            // 自動支払い
            p.money -= total;
            G.household += total;
            pushLog(G, `P${i + 1}: 賌金$${total}を支払い（残金$${p.money}）`);
            playerStates[String(i)] = {
                totalWage: total,
                needsSelling: false,
                selectedBuildingIndices: [],
                confirmed: true,
            };
        } else {
            const hasSellable = p.buildings.some(b => !getCardDef(b.card.defId).unsellable);
            if (hasSellable) {
                // 売却が必要→操作待ち
                playerStates[String(i)] = {
                    totalWage: total,
                    needsSelling: true,
                    selectedBuildingIndices: [],
                    confirmed: false,
                };
                if (firstNeedsSelling < 0) firstNeedsSelling = i;
            } else {
                // 売却可能な建物なし→自動で負債処理
                const paid = p.money;
                G.household += paid;
                p.money = 0;
                const debt = total - paid;
                p.unpaidDebts += debt;
                pushLog(G, `P${i + 1}: 賌金$${total}不足（$${paid}のみ支払）、$${debt}が未払い（負債合計: ${p.unpaidDebts}）`);
                playerStates[String(i)] = {
                    totalWage: total,
                    needsSelling: false,
                    selectedBuildingIndices: [],
                    confirmed: true,
                };
            }
        }
    }

    G.paydayState = {
        wagePerWorker: wage,
        playerStates,
        // 後方互換用
        currentPlayerIndex: firstNeedsSelling >= 0 ? firstNeedsSelling : 0,
        totalWage: firstNeedsSelling >= 0 ? playerStates[String(firstNeedsSelling)].totalWage : 0,
        selectedBuildingIndices: [],
    };
    G.activePlayer = firstNeedsSelling >= 0 ? firstNeedsSelling : 0;

    // 全員が自動処理済みなら即座に次へ
    const allConfirmed = Object.values(playerStates).every(ps => ps.confirmed);
    if (allConfirmed) {
        finishPayday(G, _ctx, _events);
    } else {
        if (G.isOnline) {
            // P2P対応: 全未確認プレイヤーが同時にMoveを送信できるようにする
            _events.setActivePlayers({ all: Stage.NULL });
        } else {
            // ホットシート: ctx.currentPlayerをcurrentPlayerIndexに同期
            _events.endTurn({ next: String(G.paydayState.currentPlayerIndex) });
        }
    }
}

/** 給料日の続行: 全員confirmedなら次のフェーズへ、そうでなければ次の未確認プレイヤーに切り替え */
function continuePayday(G: GameState, ctx: Ctx, events: any) {
    if (!G.paydayState) return;
    const allConfirmed = Object.values(G.paydayState.playerStates).every(ps => ps.confirmed);
    if (allConfirmed) {
        G.paydayState = null;
        finishPayday(G, ctx, events);
    } else {
        // 次の未確認プレイヤーにcurrentPlayerIndexを更新
        const nextUnconfirmed = Object.entries(G.paydayState.playerStates)
            .find(([, ps]) => !ps.confirmed);
        if (nextUnconfirmed) {
            const nextPid = parseInt(nextUnconfirmed[0]);
            G.paydayState.currentPlayerIndex = nextPid;
            G.paydayState.totalWage = nextUnconfirmed[1].totalWage;
            G.paydayState.selectedBuildingIndices = nextUnconfirmed[1].selectedBuildingIndices;
            G.activePlayer = nextPid;
            if (!G.isOnline) {
                // ホットシート: ctx.currentPlayerを同期
                events.endTurn({ next: String(nextPid) });
            }
            // P2P: endTurnは呼ばず、setActivePlayersで全員がMove可能な状態を維持
        }
    }
}

function finishPayday(G: GameState, ctx: Ctx, events: any) {
    G.paydayState = null;
    startCleanup(G, ctx, events);
}

function startCleanup(G: GameState, _ctx: Ctx, events: any) {
    G.phase = 'cleanup';

    // 全プレイヤーの精算状態を同時に初期化
    const playerStates: { [pid: string]: import('./types').CleanupPlayerState } = {};
    let firstNeedsCleanup = -1;
    let anyNeedsCleanup = false;

    for (let i = 0; i < Object.keys(G.players).length; i++) {
        const p = G.players[String(i)];
        const excess = Math.max(0, p.hand.length - p.maxHandSize);
        if (excess > 0) {
            playerStates[String(i)] = {
                excessCount: excess,
                selectedIndices: [],
                confirmed: false,
            };
            anyNeedsCleanup = true;
            if (firstNeedsCleanup < 0) firstNeedsCleanup = i;
        } else {
            playerStates[String(i)] = {
                excessCount: 0,
                selectedIndices: [],
                confirmed: true,
            };
        }
    }

    if (!anyNeedsCleanup) {
        finishCleanup(G, _ctx, events);
        return;
    }

    G.cleanupState = {
        playerStates,
        // 後方互換用
        currentPlayerIndex: firstNeedsCleanup,
        excessCount: firstNeedsCleanup >= 0 ? playerStates[String(firstNeedsCleanup)].excessCount : 0,
        selectedIndices: [],
    };
    G.activePlayer = firstNeedsCleanup;
    if (G.isOnline) {
        // P2P対応: 全未確認プレイヤーが同時にMoveを送信できるようにする
        events.setActivePlayers({ all: Stage.NULL });
    } else {
        // ホットシート: ctx.currentPlayerをcurrentPlayerIndexに同期
        events.endTurn({ next: String(firstNeedsCleanup) });
    }
}

/** 精算の続行: 全員confirmedなら次のフェーズへ、そうでなければ次の未確認プレイヤーに切り替え */
function continueCleanup(G: GameState, ctx: Ctx, events: any) {
    if (!G.cleanupState) return;
    const allConfirmed = Object.values(G.cleanupState.playerStates).every(ps => ps.confirmed);
    if (allConfirmed) {
        G.cleanupState = null;
        finishCleanup(G, ctx, events);
    } else {
        // 次の未確認プレイヤーにcurrentPlayerIndexを更新
        const nextUnconfirmed = Object.entries(G.cleanupState.playerStates)
            .find(([, ps]) => !ps.confirmed);
        if (nextUnconfirmed) {
            const nextPid = parseInt(nextUnconfirmed[0]);
            G.cleanupState.currentPlayerIndex = nextPid;
            G.cleanupState.excessCount = nextUnconfirmed[1].excessCount;
            G.cleanupState.selectedIndices = nextUnconfirmed[1].selectedIndices;
            G.activePlayer = nextPid;
            if (!G.isOnline) {
                // ホットシート: ctx.currentPlayerを同期
                events.endTurn({ next: String(nextPid) });
            }
            // P2P: endTurnは呼ばず、setActivePlayersで全員がMove可能な状態を維持
        }
    }
}

function recordRoundStats(G: GameState) {
    if (!G.stats) return;
    const scores = calculateScores(G);
    for (const pid of Object.keys(G.players)) {
        const p = G.players[pid];
        const pScore = scores.find(s => s.playerIndex === parseInt(pid));
        G.stats.players[pid].push({
            round: G.round,
            money: p.money,
            workers: p.workers,
            buildingCount: p.buildings.length,
            unpaidDebts: p.unpaidDebts,
            vpTokens: p.vpTokens,
            currentVP: pScore ? pScore.score : 0,
        });
    }
}

function finishCleanup(G: GameState, _ctx: Ctx, _events: any) {
    G.cleanupState = null;

    // 現在のラウンドの統計を記録
    recordRoundStats(G);

    if (G.round >= 9) {
        G.phase = 'gameEnd';
        G.finalScores = calculateScores(G);
        pushLog(G, '=== ゲーム終了！ ===');
        return;
    }
    advanceRound(G, _events);
}

function advanceRound(G: GameState, events: any) {
    G.round++;
    pushLog(G, `=== ラウンド ${G.round} 開始（賃金: $${getWagePerWorker(G.round)}, 家計: $${G.household}) ===`);
    const newWP = getRoundWorkplace(G.round, G.numPlayers);
    if (newWP) {
        G.publicWorkplaces.push(newWP);
        pushLog(G, `新しい職場 [${newWP.name}] が追加されました (効果: ${newWP.effectText})`);
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
    // Glory effects
    if (defId === 'gl_relic') { p.vpTokens += 2; return; }
    if (defId === 'gl_studio') { p.hand.push(...drawCards(G, 1)); p.vpTokens += 1; return; }
    if (defId === 'gl_game_cafe') {
        const isLastAction = Object.values(G.players).every(pl => pl.availableWorkers === 0);
        // Note: this function is called immediately after placement, so p.availableWorkers is already decremented.
        // But "last action of the round" means NO ONE has workers left? Or THIS player? 
        // "ラウンド最後の行動" usually means the very last worker placed in the round.
        // Check if all players have 0 available workers.
        if (totalAvailableWorkers(G) === 0) {
            p.money += 10; G.household -= 10;
        } else {
            p.money += 5; G.household -= 5;
        }
        return;
    }
    if (defId === 'gl_automaton') {
        if (p.workers < p.maxWorkers) {
            p.workers++;
            p.robotWorkers++;
            p.availableWorkers++; // "即座に使用可能"
            pushLog(G, `P${parseInt(pid) + 1}は機械人形を獲得し、即座に使用可能になった！`);
        }
        return;
    }

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

        // Glory simple effects
        case 'gl_poultry_farm': {
            const drawCount = (p.hand.length % 2 !== 0) ? 3 : 2;
            drawConsumables(G, pid, drawCount);
            break;
        }
        case 'gl_cotton_farm': drawConsumables(G, pid, 5); break;
        case 'gl_museum': {
            const amount = (p.hand.length === 5) ? 14 : 7;
            p.money += amount; G.household -= amount;
            break;
        }
        case 'gl_coal_mine': p.hand.push(...drawCards(G, 5)); break;
        case 'gl_refinery': p.hand.push(...drawCards(G, 3)); break;
        case 'gl_greenhouse': drawConsumables(G, pid, 4); break;
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

    setup: ({ ctx }, setupData): GameState => {
        _uidCounter = 0;
        const version: GameVersion = (setupData && setupData.version) ? setupData.version : 'base';
        const deck = buildDeck(version);
        const players: { [k: string]: PlayerState } = {};
        for (let i = 0; i < ctx.numPlayers; i++) {
            players[String(i)] = {
                hand: deck.splice(0, 3),
                money: 5 + i,
                workers: 2,
                availableWorkers: 2,
                buildings: [],
                unpaidDebts: 0,
                maxHandSize: 5,
                maxWorkers: 5,
                vpTokens: 0,
                robotWorkers: 0,
            };
        }
        const initialLog: GameState['log'] = [{ text: `=== ラウンド 1 開始（${ctx.numPlayers}人プレイ / Version: ${version}） ===`, round: 1 }];

        const stats: GameStats = { players: {} };
        for (let i = 0; i < ctx.numPlayers; i++) {
            stats.players[String(i)] = [];
        }

        return {
            version,
            players,
            publicWorkplaces: createInitialWorkplaces(ctx.numPlayers, version),
            household: 0, round: 1, phase: 'work', startPlayer: 0,
            deck, discard: [], consumableCounter: 0,
            numPlayers: ctx.numPlayers,
            discardState: null, buildState: null, paydayState: null, cleanupState: null,
            designOfficeState: null, dualConstructionState: null,
            activePlayer: 0,
            log: initialLog,
            finalScores: null,
            isOnline: !!(setupData && setupData.isOnline),
            stats,
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

            // Multi-Worker Check
            const requiredWorkers = wp.specialEffect === 'ruins' ? 0 : 1; // Ruins takes 1? Usually 1.
            // Check if workplace has specific requirement (only specific cards have >1 in Glory, public WPs are usually 1)
            // But Glory cards can become workplaces.
            let workerCost = 1;
            if (wp.fromBuildingDefId) {
                const def = getCardDef(wp.fromBuildingDefId);
                if (def.workerReq) workerCost = def.workerReq;
            }
            if (p.availableWorkers < workerCost) return INVALID_MOVE;

            wp.workers.push(parseInt(pid));
            p.availableWorkers -= workerCost;

            pushLog(G, `P${parseInt(pid) + 1}が[${wp.name}]に配置 (残りワーカー: ${p.availableWorkers}, 所持金: $${p.money})`);

            // Glory: Ruins Effect
            if (wp.specialEffect === 'ruins') {
                p.hand.push(makeConsumable());
                p.vpTokens += 1;
                pushLog(G, `P${parseInt(pid) + 1}が遺跡で消費財とVPトークンを獲得`);
                G.phase = 'work';
                advanceTurnOrPhase(G, ctx, events);
                return;
            }

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
            const workerCost = def.workerReq || 1;
            if (p.availableWorkers < workerCost) return INVALID_MOVE;

            if (!canPlaceOnBuildingWP(G, p, defId)) return INVALID_MOVE;

            slot.workerPlaced = true;
            p.availableWorkers -= workerCost;

            pushLog(G, `P${parseInt(pid) + 1}が自分の[${def.name}]に配置 (残りワーカー: ${p.availableWorkers}, 所持金: $${p.money})`);
            return applyBuildingEffect(G, ctx, events, pid, defId);
        },

        // ============ デバッグ用 ============
        debug_setState: ({ G }, payload: any) => {
            const pid = payload.pid || '0';
            const p = G.players[pid];
            if (payload.money !== undefined) p.money = payload.money;
            if (payload.vpTokens !== undefined) p.vpTokens = payload.vpTokens;
            if (payload.robotWorkers !== undefined) p.robotWorkers = payload.robotWorkers;
            if (payload.workers !== undefined) p.workers = payload.workers;
            if (payload.availableWorkers !== undefined) p.availableWorkers = payload.availableWorkers;
            if (payload.hand !== undefined) p.hand = payload.hand; // expects Card[]
            if (payload.buildings !== undefined) p.buildings = payload.buildings; // expects Building[]
            if (payload.household !== undefined) G.household = payload.household;
        },

        // ============ カード捨て選択トグル ============
        toggleDiscard: ({ G, ctx, playerID }, cardIndex: number) => {
            // 精算フェーズの場合は個別playerStateを操作
            if (G.cleanupState) {
                // P2P対応: playerIDから操作元プレイヤーを特定
                const pid = (playerID !== undefined && playerID !== null) ? String(playerID) : String(G.cleanupState.currentPlayerIndex);
                const cps = G.cleanupState.playerStates[pid];
                if (!cps || cps.confirmed) return INVALID_MOVE;
                const idx = cps.selectedIndices.indexOf(cardIndex);
                if (idx >= 0) cps.selectedIndices.splice(idx, 1);
                else cps.selectedIndices.push(cardIndex);
                return;
            }
            if (!G.discardState) return INVALID_MOVE;
            const state = G.discardState;

            const idx = state.selectedIndices.indexOf(cardIndex);
            if (idx >= 0) state.selectedIndices.splice(idx, 1);
            else state.selectedIndices.push(cardIndex);
        },

        // ============ カード捨て確定 ============
        confirmDiscard: ({ G, ctx, events, playerID }) => {
            if (G.phase === 'cleanup' && G.cleanupState) {
                // P2P対応: playerIDから操作元プレイヤーを特定
                const pid = (playerID !== undefined && playerID !== null) ? String(playerID) : String(G.cleanupState.currentPlayerIndex);
                const cps = G.cleanupState.playerStates[pid];
                if (!cps || cps.confirmed) return INVALID_MOVE;
                if (cps.selectedIndices.length !== cps.excessCount) return INVALID_MOVE;
                const p = G.players[pid];
                const sorted = [...cps.selectedIndices].sort((a, b) => b - a);
                for (const i of sorted) { discardCard(G, p.hand[i]); p.hand.splice(i, 1); }
                pushLog(G, `P${parseInt(pid) + 1}が精算で${cps.excessCount}枚を捨てた (手札: ${p.hand.length}枚)`);
                cps.confirmed = true;
                continueCleanup(G, ctx, events);
                return;
            }
            if (!G.discardState) return INVALID_MOVE;
            const ds = G.discardState;
            const pid = ctx.currentPlayer;
            const p = G.players[pid];

            // Modernism Check: Consumables count as 2
            let currentCount = ds.selectedIndices.length;
            if (ds.reason.includes('モダニズム')) {
                currentCount = 0;
                for (const i of ds.selectedIndices) {
                    if (isConsumable(p.hand[i])) currentCount += 2;
                    else currentCount += 1;
                }
                // Allow over-payment if unavoidable? N.E rules usually exact or min discard.
                // Assuming exact match or exceed by 1 only if necessary? 
                // For simplicity, strict check: MUST equal or be close?
                // Actually, "Consumables count as 2" might mean we can pay 3 cost with 1 Consumable + 1 Card (Total 3). 
                // But if cost is 3 and we select 2 Consumables (Total 4), is it allowed? 
                // Usually yes, overpayment is allowed if minimal set. 
                // NOT implementing complex "minimal" check for now. strict ">= cost" is safer for user progress.
                if (currentCount < ds.count) return INVALID_MOVE;
            } else {
                if (currentCount !== ds.count) return INVALID_MOVE;
            }

            if (ds.excludeCardUid) {
                const exIdx = p.hand.findIndex(c => c.uid === ds.excludeCardUid);
                if (ds.selectedIndices.includes(exIdx)) return INVALID_MOVE;
            }

            const sorted = [...ds.selectedIndices].sort((a, b) => b - a);
            // Actual Discard
            const discardedCards = [];
            for (const i of sorted) {
                const c = p.hand[i];
                discardedCards.push(c);
                discardCard(G, c);
                p.hand.splice(i, 1);
            }

            const action = ds.callbackAction;
            const data = ds.callbackData;
            G.discardState = null;

            switch (action) {
                case 'sell': {
                    const amount = data.amount as number;
                    G.household -= amount;
                    p.money += amount;
                    pushLog(G, `P${parseInt(pid) + 1}が${ds.count}枚を売却 → $${amount}獲得 (所持金: $${p.money}, 家計: $${G.household})`);
                    G.phase = 'work';
                    advanceTurnOrPhase(G, ctx, events);
                    break;
                }
                case 'draw': {
                    const count = data.count as number;
                    p.hand.push(...drawCards(G, count));
                    pushLog(G, `P${parseInt(pid) + 1}が${ds.count}枚を捨てて${count}枚ドロー (手札: ${p.hand.length}枚)`);
                    G.phase = 'work';
                    advanceTurnOrPhase(G, ctx, events);
                    break;
                }
                case 'restaurant': {
                    G.household -= 15;
                    p.money += 15;
                    pushLog(G, `P${parseInt(pid) + 1}が1枚を捨ててレストランを利用 → $15獲得 (所持金: $${p.money}, 家計: $${G.household})`);
                    G.phase = 'work';
                    advanceTurnOrPhase(G, ctx, events);
                    break;
                }
                case 'money_20': {
                    p.money += 20;
                    G.household -= 20;
                    pushLog(G, `P${parseInt(pid) + 1}が2枚を捨てて劇場を利用 → $20獲得`);
                    G.phase = 'work';
                    advanceTurnOrPhase(G, ctx, events);
                    break;
                }
                case 'build_cost': {
                    const bd = data as { buildCardUid: string; drawAfterBuild: number };
                    // Find card based on UID (hand might have shifted if we didn't use UID, but we do)
                    // Wait, previous logic spliced from hand... 
                    // Need to find WHERE the build card is. It was NOT discarded.
                    // But we just spliced Discards. The indices in hand changed.
                    // We need to find the card by UID again.
                    const cardIdx = p.hand.findIndex(c => c.uid === bd.buildCardUid);
                    if (cardIdx < 0) { G.phase = 'work'; advanceTurnOrPhase(G, ctx, events); break; }

                    const card = p.hand.splice(cardIdx, 1)[0];
                    p.buildings.push({ card, workerPlaced: false });
                    applyBuildPassiveEffect(G, pid, card.defId);

                    const def = getCardDef(card.defId);
                    let logMsg = `P${parseInt(pid) + 1}が[${def.name}]を建設`;

                    // Handle Post-Build Effects
                    const buildAction = G.buildState?.action;

                    if (bd.drawAfterBuild > 0) {
                        const drawn = drawCards(G, bd.drawAfterBuild);
                        p.hand.push(...drawn);
                        logMsg += ` & ${drawn.length}枚ドロー`;
                    }

                    if (buildAction === 'gl_colonist') {
                        drawConsumables(G, pid, 1);
                        logMsg += ` & 消費財1枚獲得`;
                    }
                    else if (buildAction === 'gl_skyscraper') {
                        if (p.hand.length === 0) {
                            const drawn = drawCards(G, 2);
                            p.hand.push(...drawn);
                            logMsg += ` & (手札0枚ボーナス)2枚ドロー`;
                        }
                    }

                    pushLog(G, logMsg);

                    G.buildState = null;
                    G.phase = 'work';
                    advanceTurnOrPhase(G, ctx, events);
                    break;
                }
                case 'dual_build_cost': {
                    const bd = data as { buildCardUid1: string; buildCardUid2: string };
                    const names: string[] = [];
                    for (const uid of [bd.buildCardUid1, bd.buildCardUid2]) {
                        const idx = p.hand.findIndex(c => c.uid === uid);
                        if (idx >= 0) {
                            const c = p.hand.splice(idx, 1)[0];
                            p.buildings.push({ card: c, workerPlaced: false });
                            applyBuildPassiveEffect(G, pid, c.defId);
                            names.push(getCardDef(c.defId).name);
                        }
                    }
                    pushLog(G, `P${parseInt(pid) + 1}が[二胡市建設]で[${names.join(']と[')}]を建設 (手札: ${p.hand.length}枚)`);
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

            const actualCost = getConstructionCost(p, card.defId, bs.costReduction);
            if (bs.action === 'pioneer') {
                p.hand.splice(cardIndex, 1);
                p.buildings.push({ card, workerPlaced: false });
                applyBuildPassiveEffect(G, pid, card.defId);
                pushLog(G, `P${parseInt(pid) + 1}が[開拓民]で[${def.name}]を無料建設`);
                G.buildState = null;
                G.phase = 'work';
                advanceTurnOrPhase(G, ctx, events);
                return;
            }

            if (bs.action === 'gl_modernism_construction') {
                let totalValue = 0;
                for (const h of p.hand) {
                    if (h.uid === card.uid) continue;
                    totalValue += isConsumable(h) ? 2 : 1;
                }
                if (totalValue < actualCost) return INVALID_MOVE;
            } else {
                if (p.hand.length - 1 < actualCost) return INVALID_MOVE;
            }

            if (actualCost === 0) {
                p.hand.splice(cardIndex, 1);
                p.buildings.push({ card, workerPlaced: false });
                applyBuildPassiveEffect(G, pid, card.defId);

                let logMsg = `P${parseInt(pid) + 1}が[${def.name}]を建設（コスト0）`;

                if (bs.drawAfterBuild > 0) {
                    const drawn = drawCards(G, bs.drawAfterBuild);
                    p.hand.push(...drawn);
                    logMsg += ` & ${drawn.length}枚ドロー`;
                }

                if (bs.action === 'gl_colonist') {
                    drawConsumables(G, pid, 1);
                    logMsg += ` & 消費財1枚獲得`;
                } else if (bs.action === 'gl_skyscraper') {
                    if (p.hand.length === 0) {
                        const drawn = drawCards(G, 2);
                        p.hand.push(...drawn);
                        logMsg += ` & (手札0枚ボーナス)2枚ドロー`;
                    }
                }

                pushLog(G, logMsg);
                G.buildState = null;
                G.phase = 'work';
                advanceTurnOrPhase(G, ctx, events);
                return;
            }

            G.phase = 'discard';
            const reason = (bs.action === 'gl_modernism_construction')
                ? `${def.name}の建設（モダニズム：消費財は2コスト分）`
                : `${def.name}の建設コスト（${actualCost}枚）`;

            G.discardState = {
                count: actualCost,
                reason: reason,
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
                const buildingDefIds = ['construction_co', 'pioneer', 'general_contractor', 'gl_colonist', 'gl_skyscraper', 'gl_modernism_construction', 'gl_teleporter'];
                if (buildingDefIds.includes(action)) {
                    const slot = p.buildings.find(b => b.card.defId === action && b.workerPlaced);
                    if (slot) {
                        slot.workerPlaced = false;
                        const def = getCardDef(action);
                        p.availableWorkers += def.workerReq || 1;
                    }
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
                    // callbackAction='draw'になるカード一覧（工場系）
                    const drawFactoryDefIds = ['factory', 'auto_factory', 'gl_steam_factory', 'gl_locomotive_factory'];
                    let found = false;
                    for (const defId of drawFactoryDefIds) {
                        const slot = p.buildings.find(b => b.card.defId === defId && b.workerPlaced);
                        if (slot) { slot.workerPlaced = false; p.availableWorkers++; found = true; break; }
                    }
                    if (!found) {
                        for (const wp of G.publicWorkplaces) {
                            if (wp.fromBuildingDefId && drawFactoryDefIds.includes(wp.fromBuildingDefId) && wp.workers.includes(parseInt(pid))) {
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
                } else if (ds.callbackAction === 'money_20') {
                    // callbackAction='money_20'になるカード（劇場）
                    const slot = p.buildings.find(b => b.card.defId === 'gl_theater' && b.workerPlaced);
                    if (slot) { slot.workerPlaced = false; p.availableWorkers++; }
                    else {
                        for (const wp of G.publicWorkplaces) {
                            if (wp.fromBuildingDefId === 'gl_theater' && wp.workers.includes(parseInt(pid))) {
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
                    applyBuildPassiveEffect(G, pid, c.defId);
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
        togglePaydaySell: ({ G, playerID }, buildingIndex: number) => {
            if (G.phase !== 'payday' || !G.paydayState) return INVALID_MOVE;
            const ps = G.paydayState;
            // P2P対応: playerIDから操作元プレイヤーを特定
            const pid = (playerID !== undefined && playerID !== null) ? String(playerID) : String(ps.currentPlayerIndex);
            const pps = ps.playerStates[pid];
            if (!pps || pps.confirmed || !pps.needsSelling) return INVALID_MOVE;

            const p = G.players[pid];
            if (buildingIndex < 0 || buildingIndex >= p.buildings.length) return INVALID_MOVE;

            const def = getCardDef(p.buildings[buildingIndex].card.defId);
            if (def.unsellable) return INVALID_MOVE;

            const idx = pps.selectedBuildingIndices.indexOf(buildingIndex);
            if (idx >= 0) {
                pps.selectedBuildingIndices.splice(idx, 1);
            } else {
                pps.selectedBuildingIndices.push(buildingIndex);
            }
        },

        // ============ 給料日: 売却確定 ============
        confirmPaydaySell: ({ G, ctx, events, playerID }) => {
            if (G.phase !== 'payday' || !G.paydayState) return INVALID_MOVE;
            const ps = G.paydayState;
            // P2P対応: playerIDから操作元プレイヤーを特定
            const pid = (playerID !== undefined && playerID !== null) ? String(playerID) : String(ps.currentPlayerIndex);
            const pps = ps.playerStates[pid];
            if (!pps || pps.confirmed) return INVALID_MOVE;
            const p = G.players[pid];

            const selectedVPs = pps.selectedBuildingIndices.map(bi => getCardDef(p.buildings[bi].card.defId).vp);
            const sellTotal = selectedVPs.reduce((sum, vp) => sum + vp, 0);
            const totalFunds = p.money + sellTotal;

            const allSellableCount = p.buildings.filter(b => !getCardDef(b.card.defId).unsellable).length;
            const allSelected = pps.selectedBuildingIndices.length === allSellableCount;

            if (pps.selectedBuildingIndices.length === 0 && p.money < pps.totalWage) return INVALID_MOVE;

            // 過剰売却チェック
            if (selectedVPs.length > 0) {
                const minVP = Math.min(...selectedVPs);
                if ((totalFunds - minVP) >= pps.totalWage) return INVALID_MOVE;
            }

            if (totalFunds < pps.totalWage && !allSelected) return INVALID_MOVE;

            // 売却実行
            const sorted = [...pps.selectedBuildingIndices].sort((a, b) => b - a);
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
                pushLog(G, `P${parseInt(pid) + 1}が給料日に[${def.name}]を売却（$${def.vp}）`);
                p.buildings.splice(bi, 1);
            }

            // 賌金支払い
            if (p.money >= pps.totalWage) {
                p.money -= pps.totalWage;
                G.household += pps.totalWage;
                pushLog(G, `P${parseInt(pid) + 1}: 賌金$${pps.totalWage}を支払い（残金$${p.money}）`);
            } else {
                const paid = p.money;
                G.household += paid;
                p.money = 0;
                const debt = pps.totalWage - paid;
                p.unpaidDebts += debt;
                pushLog(G, `P${parseInt(pid) + 1}: 賌金$${pps.totalWage}不足（$${paid}のみ支払）、$${debt}が未払い`);
            }

            pps.confirmed = true;
            continuePayday(G, ctx, events);
        },

        // ============ 給料日: 売却なしで確定 ============
        confirmPayday: ({ G, ctx, events, playerID }) => {
            if (G.phase !== 'payday' || !G.paydayState) return INVALID_MOVE;
            // P2P対応: playerIDから操作元プレイヤーを特定
            const pid = (playerID !== undefined && playerID !== null) ? String(playerID) : String(G.paydayState.currentPlayerIndex);
            const pps = G.paydayState.playerStates[pid];
            if (!pps) return INVALID_MOVE;
            if (!pps.confirmed) {
                pps.confirmed = true;
            }
            continuePayday(G, ctx, events);
        },

        // ============ 農村: 選択 ============
        selectVillageOption: ({ G, ctx, events }, option: 'draw_consumable' | 'draw_building') => {
            if (G.phase !== 'choice_village') return INVALID_MOVE;
            const pid = ctx.currentPlayer;
            const p = G.players[pid];

            if (option === 'draw_consumable') {
                drawConsumables(G, pid, 2);
                pushLog(G, `P${parseInt(pid) + 1}が[農村]で消費財2枚を獲得`);
                G.phase = 'work';
                advanceTurnOrPhase(G, ctx, events);
            } else if (option === 'draw_building') {
                const consumables = p.hand.filter(c => isConsumable(c));
                if (consumables.length < 2) return INVALID_MOVE;

                // 消費財を2枚捨てる
                let discarded = 0;
                for (let i = p.hand.length - 1; i >= 0 && discarded < 2; i--) {
                    if (isConsumable(p.hand[i])) {
                        p.hand.splice(i, 1); // 消費財は捨て札に行かない
                        discarded++;
                    }
                }
                const drawn = drawCards(G, 3);
                p.hand.push(...drawn);
                pushLog(G, `P${parseInt(pid) + 1}が[農村]で消費財2枚を捨てて建物カード${drawn.length}枚を獲得`);
                G.phase = 'work';
                advanceTurnOrPhase(G, ctx, events);
            }
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
        case 'ruins':
            p.vpTokens++;
            drawConsumables(G, pid, 1);
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
            G.phase = 'designOffice';
            G.designOfficeState = { revealedCards: revealed };
            return;
        }

        case 'farm': case 'slash_burn': case 'coffee_shop':
        case 'orchard': case 'large_farm': case 'steel_mill': case 'chemical_plant':
        case 'mansion':
        // Glory Simple Effects
        case 'gl_relic': case 'gl_studio': case 'gl_game_cafe': case 'gl_automaton':
        case 'gl_poultry_farm': case 'gl_cotton_farm':
        case 'gl_coal_mine': case 'gl_refinery': case 'gl_greenhouse':
        case 'gl_museum': case 'gl_monument':
            applySimpleBuildingEffect(G, pid, defId);
            advanceTurnOrPhase(G, ctx, events);
            return;

        case 'factory':
            G.phase = 'discard';
            G.discardState = {
                count: 2, reason: '工場（2枚捨て→4枚引く）',
                selectedIndices: [], callbackAction: 'draw', callbackData: { count: 4 },
            };
            return;
        case 'auto_factory':
            G.phase = 'discard';
            G.discardState = {
                count: 3, reason: '自動車工場（3枚捨て→7枚引く）',
                selectedIndices: [], callbackAction: 'draw', callbackData: { count: 7 },
            };
            return;

        case 'restaurant':
            G.phase = 'discard';
            G.discardState = {
                count: 1, reason: 'レストラン（1枚捨て→家計$15）',
                selectedIndices: [], callbackAction: 'restaurant', callbackData: {},
            };
            return;

        case 'construction_co':
            G.phase = 'build';
            G.buildState = { costReduction: 1, drawAfterBuild: 0, action: 'construction_co' };
            return;
        case 'pioneer':
            G.phase = 'build';
            G.buildState = { costReduction: 99, drawAfterBuild: 0, action: 'pioneer' };
            return;
        case 'general_contractor':
            G.phase = 'build';
            G.buildState = { costReduction: 0, drawAfterBuild: 2, action: 'general_contractor' };
            return;

        // Glory Complex Effects
        case 'gl_village':
            G.phase = 'choice_village';
            pushLog(G, `P${parseInt(pid) + 1}が[農村]の効果を選択中...`);
            return;
        case 'gl_colonist':
            G.phase = 'build';
            // drawAfterBuild is for Building Cards. We need Consumable. 
            // Hack: Use specific action name to handle consumable draw in generic build callback if possible, 
            // or we might need to extend BuildState.
            // For now let's rely on 'action' string to handle post-build effect.
            G.buildState = { costReduction: 0, drawAfterBuild: 0, action: 'gl_colonist' };
            return;
        case 'gl_skyscraper':
            G.phase = 'build';
            G.buildState = { costReduction: 0, drawAfterBuild: 0, action: 'gl_skyscraper' };
            return;
        case 'gl_modernism_construction':
            G.phase = 'build';
            G.buildState = { costReduction: 0, drawAfterBuild: 0, action: 'gl_modernism_construction' };
            return;
        case 'gl_teleporter':
            G.phase = 'build';
            G.buildState = { costReduction: 99, drawAfterBuild: 0, action: 'gl_teleporter' };
            return;

        case 'gl_steam_factory':
            G.phase = 'discard';
            G.discardState = {
                count: 2, reason: '蒸気工場（2枚捨て→4枚引く）',
                selectedIndices: [], callbackAction: 'draw', callbackData: { count: 4 },
            };
            return;
        case 'gl_locomotive_factory':
            G.phase = 'discard';
            G.discardState = {
                count: 3, reason: '機関車工場（3枚捨て→7枚引く）',
                selectedIndices: [], callbackAction: 'draw', callbackData: { count: 7 },
            };
            return;
        case 'gl_theater':
            G.phase = 'discard';
            G.discardState = {
                count: 2, reason: '劇場（2枚捨て→$20）',
                selectedIndices: [], callbackAction: 'money_20', callbackData: {},
            };
            return;

        case 'dual_construction':
            G.phase = 'dualConstruction';
            G.dualConstructionState = { selectedCardIndices: [] };
            return;

        default:
            advanceTurnOrPhase(G, ctx, events);
    }
}

/** 建設時の即時効果（倉庫、社宅、機械人形、遺物など） */
function applyBuildPassiveEffect(G: GameState, pid: string, defId: string) { // Changed signature to take G and pid
    const p = G.players[pid];
    if (defId === 'warehouse') p.maxHandSize += 4;
    if (defId === 'company_housing') { p.maxWorkers++; }

    // Glory Immediate Effects
    if (defId === 'gl_automaton') {
        if (p.workers < p.maxWorkers) {
            p.workers++;
            p.robotWorkers++;
            p.availableWorkers++;
            pushLog(G, `P${parseInt(pid) + 1}は機械人形を獲得`);
        }
    }
    if (defId === 'gl_relic') {
        p.vpTokens += 2;
        pushLog(G, `P${parseInt(pid) + 1}は遺物を建設してVPトークン2枚を獲得`);
    }
    if (defId === 'gl_studio') {
        p.hand.push(...drawCards(G, 1));
        p.vpTokens += 1;
        pushLog(G, `P${parseInt(pid) + 1}は工房を建設してカード1枚とVPトークン1枚を獲得`);
    }
}
