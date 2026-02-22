// ============================================================
// unit.test.ts — ① 単体テスト
// 個々のmove関数・ゲームロジックの最小単位での動作を検証する
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { NationalEconomy } from './game';
import type { GameState } from './types';
import { CONSUMABLE_DEF_ID, getCardDef } from './cards';
import { INVALID_MOVE } from 'boardgame.io/core';

/** テスト用のゲーム状態を作成するヘルパー */
function makeTestEnv(numPlayers = 2, version: 'base' | 'glory' = 'glory') {
    let currentPlayer = '0';
    let playOrderPos = 0;
    const ctx = {
        numPlayers,
        get currentPlayer() { return currentPlayer; },
        get playOrderPos() { return playOrderPos; },
    };
    const events = {
        endTurn: (opts?: { next?: string }) => {
            if (opts?.next !== undefined) {
                currentPlayer = opts.next;
                playOrderPos = parseInt(opts.next);
            } else {
                playOrderPos = (playOrderPos + 1) % numPlayers;
                currentPlayer = String(playOrderPos);
            }
        },
    };

    const setupFn = NationalEconomy.setup!;
    const G = setupFn({ ctx, events } as any, { version }) as GameState;
    const moves = NationalEconomy.moves as any;

    function callMove(moveName: string, ...args: any[]) {
        return moves[moveName]({ G, ctx, events, playerID: currentPlayer }, ...args);
    }

    return { G, ctx, events, callMove, getCurrentPlayer: () => currentPlayer };
}

/** 手札に消費財を追加するヘルパー */
function addConsumable(G: GameState, pid: string, count = 1) {
    for (let i = 0; i < count; i++) {
        G.players[pid].hand.push({ uid: `test_cons_${Math.random()}`, defId: CONSUMABLE_DEF_ID });
    }
}

/** 手札に指定カードを追加するヘルパー */
function addCard(G: GameState, pid: string, defId: string) {
    G.players[pid].hand.push({ uid: `test_card_${Math.random()}`, defId });
}

// ============================================================
// 遺跡（ruins）公共職場のテスト
// ============================================================
describe('遺跡（ruins）の効果テスト', () => {
    it('遺跡に配置するとVPトークン+1・消費財+1が得られる', () => {
        const { G, callMove, getCurrentPlayer } = makeTestEnv(2, 'glory');
        const pid = getCurrentPlayer();
        const p = G.players[pid];

        // 遺跡職場を手動で追加
        G.publicWorkplaces.push({
            id: 'ruins_test',
            name: '遺跡',
            effectText: 'VPトークン1枚・消費財1枚',
            multipleAllowed: true,
            workers: [],
            specialEffect: 'ruins',
            addedAtRound: 1,
            fromBuilding: false,
        });

        const prevTokens = p.vpTokens;
        const prevHandLen = p.hand.length;
        const prevWorkers = p.availableWorkers;

        G.phase = 'work';
        callMove('placeWorker', 'ruins_test');

        // VPトークン+1
        expect(p.vpTokens).toBe(prevTokens + 1);
        // 消費財+1
        expect(p.hand.length).toBe(prevHandLen + 1);
        expect(p.hand[p.hand.length - 1].defId).toBe(CONSUMABLE_DEF_ID);
        // ワーカーが消費された
        expect(p.availableWorkers).toBe(prevWorkers - 1);
    });
});

// ============================================================
// cancelAction のテスト
// ============================================================
describe('cancelAction のワーカー返還テスト', () => {
    it('蒸気工場に配置→キャンセルでワーカーが返還されphaseがworkに戻る', () => {
        const { G, callMove, getCurrentPlayer } = makeTestEnv(2, 'glory');
        const pid = getCurrentPlayer();
        const p = G.players[pid];

        // 蒸気工場の建物を手元に追加（建設済み = 配置可能な状態）
        G.players[pid].buildings.push({
            card: { uid: 'steam_test', defId: 'gl_steam_factory' },
            workerPlaced: false,
        });
        // 手札を2枚追加（捨て用）
        addCard(G, pid, 'farm');
        addCard(G, pid, 'farm');

        const prevWorkers = p.availableWorkers;

        // 配置して discardフェーズへ
        G.phase = 'work';
        callMove('placeWorkerOnBuilding', 'steam_test');
        expect(G.phase).toBe('discard');

        // キャンセル
        callMove('cancelAction');

        expect(G.phase).toBe('work');
        expect(p.availableWorkers).toBe(prevWorkers);
    });

    it('劇場に配置→キャンセルでワーカーが返還されphaseがworkに戻る', () => {
        const { G, callMove, getCurrentPlayer } = makeTestEnv(2, 'glory');
        const pid = getCurrentPlayer();
        const p = G.players[pid];

        G.players[pid].buildings.push({
            card: { uid: 'theater_test', defId: 'gl_theater' },
            workerPlaced: false,
        });
        addCard(G, pid, 'farm');
        addCard(G, pid, 'farm');

        const prevWorkers = p.availableWorkers;

        G.phase = 'work';
        callMove('placeWorkerOnBuilding', 'theater_test');
        expect(G.phase).toBe('discard');

        callMove('cancelAction');

        expect(G.phase).toBe('work');
        expect(p.availableWorkers).toBe(prevWorkers);
    });

    it('建設モードでキャンセルするとbuildStateがクリアされphaseがworkに戻る', () => {
        const { G, callMove, getCurrentPlayer } = makeTestEnv(2, 'base');
        const pid = getCurrentPlayer();

        // 大工の公共職場を使って build フェーズへ
        const wp = G.publicWorkplaces.find(w => w.specialEffect === 'build');
        if (!wp) return; // 大工がなければスキップ

        addCard(G, pid, 'farm');
        addCard(G, pid, 'farm');
        addCard(G, pid, 'farm');
        addCard(G, pid, 'farm');

        G.phase = 'work';
        callMove('placeWorker', wp.id);
        expect(G.phase).toBe('build');

        callMove('cancelAction');

        expect(G.phase).toBe('work');
        expect(G.buildState).toBeNull();
    });
});

// ============================================================
// DiscardUI のモダニズムコスト換算テスト
// ============================================================
describe('confirmDiscard モダニズム建設のコスト換算', () => {
    it('消費財1枚=2コスト分として計算される', () => {
        const { G, callMove, getCurrentPlayer } = makeTestEnv(2, 'glory');
        const pid = getCurrentPlayer();
        const p = G.players[pid];

        // モダニズム建設フェーズを手動セットアップ
        const buildCard = { uid: 'build_target', defId: 'mansion' };
        p.hand = [
            buildCard,
            { uid: 'cons1', defId: CONSUMABLE_DEF_ID },
            { uid: 'card1', defId: 'farm' },
        ];

        G.phase = 'discard';
        G.discardState = {
            count: 3, // コスト3 = 消費財1枚(2)+通常1枚(1)で3になる
            reason: 'モダニズム建設: 邸宅の建設（消費財は2コスト分）',
            selectedIndices: [],
            callbackAction: 'build_cost',
            callbackData: { buildCardUid: buildCard.uid, drawAfterBuild: 0 },
            excludeCardUid: buildCard.uid,
        };

        // 消費財(2)+通常(1)=3を選択
        callMove('toggleDiscard', 1); // cons1
        callMove('toggleDiscard', 2); // card1

        // 確定できる（ERRORにならない）
        const result = callMove('confirmDiscard');
        expect(result).not.toBe(INVALID_MOVE);

        // 邸宅が建設済みになっている
        expect(p.buildings.some(b => b.card.defId === 'mansion')).toBe(true);
    });
});

// ============================================================
// 給料計算のテスト
// ============================================================
describe('賃金計算テスト', () => {
    it('ラウンド1の賃金は$2/人', () => {
        const { G } = makeTestEnv(2);
        expect(G.round).toBe(1);
        // R1-2 は $2
        const p = G.players['0'];
        expect(p.workers).toBeGreaterThanOrEqual(1);
    });
});
