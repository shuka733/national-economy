// ============================================================
// batch-test.ts — ホットシートモード仮想バッチテスト
// vitestの環境でViteのバンドラ経由import解決を利用
// NationalEconomy.setup/movesを直接呼び出す
// 各人数(2,3,4人) × 各難易度(random,heuristic) × 200回
// ============================================================
import { describe, it, expect } from 'vitest';
import { NationalEconomy } from './game';
import { decideCPUMove } from './bots';
import type { GameState } from './types';
import type { AIDifficulty } from './bots';
import { INVALID_MOVE } from 'boardgame.io/core';

// 設定
const GAMES_PER_CONFIG = 200;
const MAX_MOVES_PER_GAME = 5000;

function runSingleGame(
    numPlayers: number,
    difficulty: AIDifficulty,
): { success: boolean; error?: string; moveCount: number } {
    // 疑似ctx
    let currentPlayer = '0';
    let playOrderPos = 0;
    const ctx = {
        numPlayers,
        get currentPlayer() { return currentPlayer; },
        get playOrderPos() { return playOrderPos; },
    };

    // 疑似events
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

    // ゲーム初期化
    const setupFn = NationalEconomy.setup!;
    const G = setupFn({ ctx, events } as any, undefined) as GameState;

    let moveCount = 0;
    let consecutiveFailures = 0;

    const moveDefs = NationalEconomy.moves as any;

    while (moveCount < MAX_MOVES_PER_GAME) {
        // ゲーム終了チェック
        if (G.phase === 'gameEnd') {
            return { success: true, moveCount };
        }

        // activePidを決定
        let activePid: string;
        if (G.phase === 'payday' && G.paydayState) {
            const unconfirmed = Object.entries(G.paydayState.playerStates)
                .find(([, ps]) => !ps.confirmed);
            activePid = unconfirmed ? unconfirmed[0] : String(G.paydayState.currentPlayerIndex);
        } else if (G.phase === 'cleanup' && G.cleanupState) {
            const unconfirmed = Object.entries(G.cleanupState.playerStates)
                .find(([, ps]) => !ps.confirmed);
            activePid = unconfirmed ? unconfirmed[0] : String(G.cleanupState.currentPlayerIndex);
        } else {
            activePid = currentPlayer;
        }

        const action = decideCPUMove(G, activePid, difficulty);
        if (action) {
            const moveFn = moveDefs[action.moveName];
            if (moveFn) {
                const result = moveFn(
                    { G, ctx, events, playerID: activePid },
                    ...action.args
                );
                if (result === INVALID_MOVE) {
                    consecutiveFailures++;
                } else {
                    consecutiveFailures = 0;
                }
                moveCount++;
            } else {
                consecutiveFailures++;
            }
        } else {
            consecutiveFailures++;
        }

        if (consecutiveFailures > 200) {
            return {
                success: false,
                error: `スタック: 200回連続失敗 (phase=${G.phase}, round=${G.round}, activePlayer=${G.activePlayer}, curPlayer=${currentPlayer})`,
                moveCount
            };
        }
    }

    return {
        success: false,
        error: `フリーズ: ${MAX_MOVES_PER_GAME}move超過 (phase=${G.phase}, round=${G.round})`,
        moveCount
    };
}

// テストスイート
describe('ホットシート仮想バッチテスト', () => {
    for (const numPlayers of [2, 3, 4]) {
        for (const difficulty of ['random', 'heuristic'] as AIDifficulty[]) {
            it(`${numPlayers}人プレイ / ${difficulty} × ${GAMES_PER_CONFIG}回`, () => {
                let completed = 0;
                let frozen = 0;
                const errors: string[] = [];

                for (let i = 0; i < GAMES_PER_CONFIG; i++) {
                    const { success, error } = runSingleGame(numPlayers, difficulty);
                    if (success) {
                        completed++;
                    } else {
                        frozen++;
                        if (error && errors.length < 5) {
                            errors.push(`Game#${i + 1}: ${error}`);
                        }
                    }
                }

                console.log(`  ${numPlayers}人/${difficulty}: 完了=${completed}/${GAMES_PER_CONFIG}, フリーズ=${frozen}`);
                if (errors.length > 0) {
                    console.log('  エラー:', errors.join(' | '));
                }

                expect(frozen).toBe(0);
            }, 120000); // タイムアウト120秒
        }
    }
});
