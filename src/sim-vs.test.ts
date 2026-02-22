// ============================================================
// sim-vs.test.ts — AI対戦テスト (Strategic vs Heuristic)
// ============================================================
import { describe, it, expect } from 'vitest';
import { NationalEconomy } from './game';
import { getCardDef } from './cards';
import { decideCPUMove } from './bots';
import type { GameState } from './types';
import type { AIDifficulty } from './bots';
import { INVALID_MOVE } from 'boardgame.io/core';

const GAMES_TO_RUN = 500;
const MAX_MOVES_PER_GAME = 5000;

interface GameResult {
    success: boolean;
    error?: string;
    moveCount: number;
    scores?: { pid: string; score: number; difficulty: AIDifficulty; breakdown?: any }[];
}

function runVsGame(numPlayers: number): GameResult {
    const difficulties: AIDifficulty[] = [];
    for (let i = 0; i < numPlayers; i++) {
        // 偶数番手をstrategic、奇数番手をheuristicにする
        difficulties.push(i % 2 === 0 ? 'strategic' : 'heuristic');
    }

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

    // ゲーム初期化（Glory版）
    const setupFn = NationalEconomy.setup!;
    const G = setupFn({ ctx, events } as any, { version: 'glory' }) as GameState;

    let moveCount = 0;
    let consecutiveFailures = 0;
    const moveDefs = NationalEconomy.moves as any;

    while (moveCount < MAX_MOVES_PER_GAME) {
        if (G.phase === 'gameEnd') {
            const finalScores = G.finalScores?.map(s => {
                const p = G.players[s.playerIndex];
                const moneyVP = Math.floor(p.money / 3);
                const buildingVP = p.buildings.reduce((sum, b) => sum + getCardDef(b.card.defId).vp, 0);
                const tokenVP = Math.floor(p.vpTokens / 3);
                // bonusVPなどは簡便のため全体のスコアからの差戻しとする
                const bonusVP = s.score - (moneyVP + buildingVP + tokenVP);

                return {
                    pid: String(s.playerIndex),
                    score: s.score,
                    difficulty: difficulties[s.playerIndex],
                    breakdown: { moneyVP, buildingVP, tokenVP, bonusVP }
                };
            }) || [];
            return { success: true, moveCount, scores: finalScores };
        }

        let activePid: string;
        if (G.phase === 'payday' && G.paydayState) {
            const unconfirmed = Object.entries(G.paydayState.playerStates).find(([, ps]) => !ps.confirmed);
            activePid = unconfirmed ? unconfirmed[0] : String(G.paydayState.currentPlayerIndex);
        } else if (G.phase === 'cleanup' && G.cleanupState) {
            const unconfirmed = Object.entries(G.cleanupState.playerStates).find(([, ps]) => !ps.confirmed);
            activePid = unconfirmed ? unconfirmed[0] : String(G.cleanupState.currentPlayerIndex);
        } else {
            activePid = currentPlayer;
        }

        const difficulty = difficulties[parseInt(activePid)];
        const action = decideCPUMove(G, activePid, difficulty);

        if (action) {
            const moveFn = moveDefs[action.moveName];
            if (moveFn) {
                const result = moveFn({ G, ctx, events, playerID: activePid }, ...action.args);
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
                error: `スタック: 200回連続失敗 (phase=${G.phase}, round=${G.round})`,
                moveCount
            };
        }
    }

    return { success: false, error: 'フリーズ', moveCount };
}

describe('AI対戦シミュレーション', () => {
    it(`4人プレイ (2 Strategic vs 2 Heuristic) × ${GAMES_TO_RUN}回`, () => {
        let strategicWins = 0;
        let heuristicWins = 0;
        let ties = 0;

        let sMoneyVP = 0, sBuildingVP = 0, sTokenVP = 0, sBonusVP = 0;
        let hMoneyVP = 0, hBuildingVP = 0, hTokenVP = 0, hBonusVP = 0;

        let strategicTotalScore = 0;
        let heuristicTotalScore = 0;

        for (let i = 0; i < GAMES_TO_RUN; i++) {
            const result = runVsGame(4);
            expect(result.success).toBe(true);

            if (result.scores) {
                const maxScore = Math.max(...result.scores.map(s => s.score));
                const winners = result.scores.filter(s => s.score === maxScore);

                for (const s of result.scores) {
                    if (s.difficulty === 'strategic') {
                        strategicTotalScore += s.score;
                        sMoneyVP += s.breakdown!.moneyVP;
                        sBuildingVP += s.breakdown!.buildingVP;
                        sTokenVP += s.breakdown!.tokenVP;
                        sBonusVP += s.breakdown!.bonusVP;
                    } else {
                        heuristicTotalScore += s.score;
                        hMoneyVP += s.breakdown!.moneyVP;
                        hBuildingVP += s.breakdown!.buildingVP;
                        hTokenVP += s.breakdown!.tokenVP;
                        hBonusVP += s.breakdown!.bonusVP;
                    }
                }

                // 勝者集計
                if (winners.length === 1) {
                    if (winners[0].difficulty === 'strategic') strategicWins++;
                    else heuristicWins++;
                } else {
                    ties++;
                }
            }
        }

        const N = GAMES_TO_RUN * 2;
        const sAvg = (strategicTotalScore / N).toFixed(2);
        const hAvg = (heuristicTotalScore / N).toFixed(2);

        console.log('========================================');
        console.log(`対戦結果 (${GAMES_TO_RUN}試合)`);
        console.log(`Strategic勝利: ${strategicWins}回 (${((strategicWins / GAMES_TO_RUN) * 100).toFixed(1)}%)`);
        console.log(`Heuristic勝利: ${heuristicWins}回 (${((heuristicWins / GAMES_TO_RUN) * 100).toFixed(1)}%)`);
        console.log(`引き分け: ${ties}回`);
        console.log('');
        console.log(`[Strategic 平均]`);
        console.log(`  総合: ${sAvg}点`);
        console.log(`  内訳: 建物 ${(sBuildingVP / N).toFixed(2)}, 現金 ${(sMoneyVP / N).toFixed(2)}, トークン ${(sTokenVP / N).toFixed(2)}, ボーナス等 ${(sBonusVP / N).toFixed(2)}`);
        console.log('');
        console.log(`[Heuristic 平均]`);
        console.log(`  総合: ${hAvg}点`);
        console.log(`  内訳: 建物 ${(hBuildingVP / N).toFixed(2)}, 現金 ${(hMoneyVP / N).toFixed(2)}, トークン ${(hTokenVP / N).toFixed(2)}, ボーナス等 ${(hBonusVP / N).toFixed(2)}`);
        console.log('========================================');

        // とりあえずパスさせる
        expect(true).toBe(true);
    }, 300000); // 300秒タイムアウト
});
