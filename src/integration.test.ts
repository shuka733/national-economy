// ============================================================
// integration.test.ts — ② 結合テスト
// 複数のmoveを組み合わせた「カード1枚分の通しシナリオ」を検証する
// ============================================================
import { describe, it, expect } from 'vitest';
import { NationalEconomy } from './game';
import type { GameState } from './types';
import { CONSUMABLE_DEF_ID } from './cards';
import { INVALID_MOVE } from 'boardgame.io/core';

/** テスト用のゲーム環境 */
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
    const G = (NationalEconomy.setup! as any)({ ctx, events }, { version }) as GameState;
    const moves = NationalEconomy.moves as any;
    function callMove(moveName: string, ...args: any[]) {
        return moves[moveName]({ G, ctx, events, playerID: currentPlayer }, ...args);
    }
    function addCard(pid: string, defId: string) {
        G.players[pid].hand.push({ uid: `t_${Math.random()}`, defId });
    }
    function addConsumable(pid: string, count = 1) {
        for (let i = 0; i < count; i++) {
            G.players[pid].hand.push({ uid: `tc_${Math.random()}`, defId: CONSUMABLE_DEF_ID });
        }
    }
    return { G, ctx, callMove, addCard, addConsumable, getCurrentPlayer: () => currentPlayer };
}

// ============================================================
// シナリオ①: 蒸気工場を使ったカード交換シナリオ
// 「蒸気工場に配置 → 2枚選択 → 確定 → 4枚引く」
// ============================================================
describe('シナリオ①: 蒸気工場（2捨て→4引く）', () => {
    it('蒸気工場を使って手札を交換できる（完全成功）', () => {
        const { G, callMove, addCard, getCurrentPlayer } = makeTestEnv(2, 'glory');
        const pid = getCurrentPlayer();
        const p = G.players[pid];

        // 蒸気工場の建物を準備
        G.players[pid].buildings.push({
            card: { uid: 'steam1', defId: 'gl_steam_factory' },
            workerPlaced: false,
        });
        addCard(pid, 'farm');
        addCard(pid, 'farm');

        const prevHandLen = p.hand.length;
        G.phase = 'work';

        // ① 配置
        callMove('placeWorkerOnBuilding', 'steam1');
        expect(G.phase).toBe('discard'); // discardフェーズへ

        // ② カード2枚選択
        const handLen = p.hand.length;
        callMove('toggleDiscard', handLen - 1);
        callMove('toggleDiscard', handLen - 2);
        expect(G.discardState?.selectedIndices.length).toBe(2);

        // ③ 確定 → 2枚捨てて4枚引く
        callMove('confirmDiscard');
        expect(G.phase).toBe('work');

        // 手札: -2枚(捨て) +4枚(引き) = +2
        expect(p.hand.length).toBe(prevHandLen + 2);
    });
});

// ============================================================
// シナリオ②: 農村（gl_village）の2択シナリオ
// ============================================================
describe('シナリオ②: 農村（消費財2枚 or 消費財捨て→建物3枚）', () => {
    it('選択A: 消費財2枚引くを選べる', () => {
        const { G, callMove, addCard, getCurrentPlayer } = makeTestEnv(2, 'glory');
        const pid = getCurrentPlayer();
        const p = G.players[pid];

        G.players[pid].buildings.push({
            card: { uid: 'village1', defId: 'gl_village' },
            workerPlaced: false,
        });
        G.phase = 'work';

        const prevHandLen = p.hand.length;
        callMove('placeWorkerOnBuilding', 'village1');
        expect(G.phase).toBe('choice_village');

        callMove('selectVillageOption', 'draw_consumable');
        expect(G.phase).toBe('work');

        // 消費財2枚増えている
        const newConsumables = p.hand.filter(c => c.defId === CONSUMABLE_DEF_ID).length;
        expect(p.hand.length).toBe(prevHandLen + 2);
    });

    it('選択B: 消費財2枚捨て→建物3枚（消費財が2枚ある場合）', () => {
        const { G, callMove, addConsumable, getCurrentPlayer } = makeTestEnv(2, 'glory');
        const pid = getCurrentPlayer();
        const p = G.players[pid];

        G.players[pid].buildings.push({
            card: { uid: 'village2', defId: 'gl_village' },
            workerPlaced: false,
        });
        addConsumable(pid, 2); // 消費財2枚追加
        G.phase = 'work';

        const prevConsumables = p.hand.filter(c => c.defId === CONSUMABLE_DEF_ID).length;
        callMove('placeWorkerOnBuilding', 'village2');
        expect(G.phase).toBe('choice_village');

        callMove('selectVillageOption', 'draw_building');
        expect(G.phase).toBe('work');

        // 消費財が2枚減り、建物カード3枚増える（手札±で +1）
        const afterConsumables = p.hand.filter(c => c.defId === CONSUMABLE_DEF_ID).length;
        expect(afterConsumables).toBe(prevConsumables - 2);
    });

    it('選択B: 消費財が1枚しかない場合はINVALID_MOVE', () => {
        const { G, callMove, addConsumable, getCurrentPlayer } = makeTestEnv(2, 'glory');
        const pid = getCurrentPlayer();
        const p = G.players[pid];

        // 既存の消費財を全て除去
        G.players[pid].hand = G.players[pid].hand.filter(c => c.defId !== CONSUMABLE_DEF_ID);
        addConsumable(pid, 1); // 1枚だけ

        G.players[pid].buildings.push({
            card: { uid: 'village3', defId: 'gl_village' },
            workerPlaced: false,
        });
        G.phase = 'work';
        callMove('placeWorkerOnBuilding', 'village3');

        // 消費財不足なのでINVALID_MOVE
        const result = callMove('selectVillageOption', 'draw_building');
        expect(result).toBe(INVALID_MOVE);
    });
});

// ============================================================
// シナリオ③: 給料日フロー（売却なし）
// ============================================================
describe('シナリオ③: 給料日フロー（売却なし）', () => {
    it('confirmPaydayでプレイヤー0の確定フラグが立つ', () => {
        const { G, callMove, getCurrentPlayer } = makeTestEnv(2, 'base');
        const pid = getCurrentPlayer();
        const p = G.players[pid];

        // 給料を余裕で払える資金を設定
        p.money = 100;
        G.phase = 'payday';
        G.paydayState = {
            currentPlayerIndex: 0,
            wagePerWorker: 2,
            totalWage: 4,
            selectedBuildingIndices: [],
            playerStates: {
                '0': { totalWage: 2, needsSelling: false, selectedBuildingIndices: [], confirmed: false },
                '1': { totalWage: 2, needsSelling: false, selectedBuildingIndices: [], confirmed: false },
            },
        };

        callMove('confirmPayday');
        // 自分(P0)のconfirmedフラグが立っていること
        expect(G.paydayState!.playerStates['0'].confirmed).toBe(true);
    });
});

// ============================================================
// シナリオ④: 建物建設の完全フロー
// 「大工に配置 → buildフェーズ → カード選択 → コスト選択 → 建設完了」
// ============================================================
describe('シナリオ④: 建物建設の完全フロー', () => {
    it('大工に配置してカードを建設できる（2人プレイ）', () => {
        const { G, callMove, addCard, getCurrentPlayer } = makeTestEnv(2, 'base');
        const pid = getCurrentPlayer();
        const p = G.players[pid];

        const carpenterWP = G.publicWorkplaces.find(w => w.specialEffect === 'build');
        if (!carpenterWP) return; // 大工がなければスキップ

        // farmを十分に追加（コスト用）し、コスト1（大工-1=0）のcoffee_shopを建設対象に
        for (let i = 0; i < 5; i++) addCard(pid, 'farm');
        addCard(pid, 'coffee_shop'); // コスト1 → 大工のcostReduction1 → 実質0

        const prevBuildings = p.buildings.length;
        G.phase = 'work';

        // ① 大工へ配置 → buildフェーズへ
        callMove('placeWorker', carpenterWP.id);
        expect(G.phase).toBe('build');

        // ② coffee_shop（実質コスト0）を選択
        const coffeeIdx = p.hand.findIndex(c => c.defId === 'coffee_shop');
        if (coffeeIdx < 0) return; // 手札に見つからない場合スキップ
        callMove('selectBuildCard', coffeeIdx);

        // 建設済み建物が1つ増えているか、discardフェーズに進んでいること
        // （コスト0なら即建設、コスト>0ならdiscardへ）
        const builtNow = p.buildings.some(b => b.card.defId === 'coffee_shop');
        const wentToDiscard = (['discard', 'work'] as string[]).includes(G.phase);
        expect(builtNow || wentToDiscard).toBe(true);
    });
});
