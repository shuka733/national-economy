// ============================================================
// sim_glory.ts  –  グローリー拡張 CPU全自動シミュレーション
// ============================================================
// ブラウザ内でグローリー版のCPUゲームを自動実行し、
// 動作の正しさを検証する。
// 使用方法: http://localhost:5173/test.html?mode=glory
// ============================================================

import { NationalEconomy } from './game';
import { decideCPUMove } from './bots';
import type { GameState } from './types';
import type { AIDifficulty } from './bots';

interface SimResult {
    success: boolean;
    rounds: number;
    error?: string;
    moveCount: number;
    lastPhase?: string;
    lastMove?: string;
    finalScores?: { playerIndex: number; score: number }[];
}

/**
 * グローリー版のゲームを1回CPUのみで最後まで実行する
 */
function runOneGloryGame(numPlayers: number, difficulty: AIDifficulty): SimResult {
    // ゲーム初期化（version: 'glory' を指定）
    const setupArg = {
        ctx: {
            numPlayers,
            currentPlayer: '0',
            turn: 0,
            phase: null,
        },
        random: {
            Shuffle: <T>(arr: T[]): T[] => {
                const a = [...arr];
                for (let i = a.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [a[i], a[j]] = [a[j], a[i]];
                }
                return a;
            }
        }
    };

    let G: GameState;
    try {
        // version='glory' を setupData として渡す
        G = (NationalEconomy.setup as any)(setupArg, { version: 'glory' });
    } catch (e: any) {
        return { success: false, rounds: 0, error: `セットアップ失敗: ${e.message}`, moveCount: 0 };
    }

    const MAX_MOVES = 5000;
    let moveCount = 0;
    let lastMove = '';

    // boardgame.io の ctx/events を模擬する
    const ctx: any = {
        numPlayers,
        currentPlayer: String(G.activePlayer ?? 0),
        turn: 0,
        phase: null,
    };

    const events: any = {
        endTurn: (opts?: { next?: string }) => {
            if (opts?.next !== undefined) {
                ctx.currentPlayer = String(opts.next);
                G.activePlayer = parseInt(opts.next);
            } else {
                const nextId = (parseInt(ctx.currentPlayer) + 1) % numPlayers;
                ctx.currentPlayer = String(nextId);
                G.activePlayer = nextId;
            }
        },
        setPhase: () => { },
        endPhase: () => { },
        setActivePlayers: () => { }, // P2P用、ホットシートシミュでは不要
    };

    while (moveCount < MAX_MOVES) {
        // ゲーム終了チェック
        if (G.phase === 'gameEnd') {
            return {
                success: true,
                rounds: G.round,
                moveCount,
                lastPhase: G.phase,
                lastMove,
                finalScores: G.finalScores?.map(s => ({ playerIndex: s.playerIndex, score: s.score })),
            };
        }

        // activePlayerをctxに同期
        if (G.activePlayer !== undefined && G.activePlayer !== null) {
            ctx.currentPlayer = String(G.activePlayer);
        }

        // payday/cleanup フェーズは全プレイヤーを順番に処理する
        let activePid = ctx.currentPlayer;
        if (G.phase === 'payday' && G.paydayState) {
            const unconfirmed = Object.entries(G.paydayState.playerStates)
                .find(([, ps]) => !ps.confirmed);
            if (unconfirmed) activePid = unconfirmed[0];
        } else if (G.phase === 'cleanup' && G.cleanupState) {
            const unconfirmed = Object.entries(G.cleanupState.playerStates)
                .find(([, ps]) => !ps.confirmed);
            if (unconfirmed) activePid = unconfirmed[0];
        }

        const p = G.players[activePid];
        if (!p) {
            return {
                success: false, rounds: G.round,
                error: `プレイヤー${activePid}が存在しない (phase=${G.phase}, activePlayer=${G.activePlayer})`,
                moveCount, lastPhase: G.phase, lastMove,
            };
        }

        // CPU AIによる手の決定
        let cpuMove;
        try {
            cpuMove = decideCPUMove(G, activePid, difficulty);
        } catch (e: any) {
            return {
                success: false, rounds: G.round,
                error: `AI決定エラー (R${G.round}, phase=${G.phase}, pid=${activePid}): ${e.message}`,
                moveCount, lastPhase: G.phase, lastMove,
            };
        }

        if (!cpuMove) {
            return {
                success: false, rounds: G.round,
                error: `AIがnullを返した (R${G.round}, phase=${G.phase}, pid=${activePid}, avail=${p.availableWorkers}, hand=${p.hand.length}, money=$${p.money})`,
                moveCount, lastPhase: G.phase, lastMove,
            };
        }

        // move実行
        const moveFn = (NationalEconomy.moves as any)?.[cpuMove.moveName];
        if (!moveFn) {
            return {
                success: false, rounds: G.round,
                error: `不明なmove: ${cpuMove.moveName} (phase=${G.phase})`,
                moveCount, lastPhase: G.phase, lastMove,
            };
        }

        lastMove = `${cpuMove.moveName}(${JSON.stringify(cpuMove.args).substring(0, 60)})`;

        try {
            const result = moveFn({ G, ctx, events, playerID: activePid }, ...cpuMove.args);
            if (result === 'INVALID_MOVE') {
                return {
                    success: false, rounds: G.round,
                    error: `INVALID_MOVE: ${lastMove} (R${G.round}, phase=${G.phase}, pid=${activePid})`,
                    moveCount, lastPhase: G.phase, lastMove,
                };
            }
        } catch (e: any) {
            return {
                success: false, rounds: G.round,
                error: `move例外: ${lastMove} - ${e.message}`,
                moveCount, lastPhase: G.phase, lastMove,
            };
        }

        moveCount++;
    }

    return {
        success: false, rounds: G.round,
        error: `最大手数${MAX_MOVES}到達（無限ループ疑い）R${G.round}, phase=${G.phase}`,
        moveCount, lastPhase: G.phase, lastMove,
    };
}

/**
 * グローリーシミュレーションを全構成で実行し、結果文字列を返す
 */
function runGlorySimulation(): string {
    const ITERATIONS = 50;
    const configs = [
        { numPlayers: 2, label: '2人プレイ (Glory)' },
        { numPlayers: 3, label: '3人プレイ (Glory)' },
        { numPlayers: 4, label: '4人プレイ (Glory)' },
    ];
    const difficulty: AIDifficulty = 'heuristic';

    const lines: string[] = [];
    lines.push('============================================================');
    lines.push(' National Economy グローリー拡張 CPU自動シミュレーション');
    lines.push(`   ${ITERATIONS}試合 × ${configs.length}構成 = ${ITERATIONS * configs.length}ゲーム`);
    lines.push('============================================================\n');

    let totalSuccess = 0;
    let totalFail = 0;

    for (const config of configs) {
        lines.push(`--- ${config.label} (${ITERATIONS}回) ---`);
        let success = 0;
        let fail = 0;
        const errors: string[] = [];
        const moveCounts: number[] = [];
        const scores: number[] = [];

        for (let i = 0; i < ITERATIONS; i++) {
            const result = runOneGloryGame(config.numPlayers, difficulty);
            if (result.success) {
                success++;
                moveCounts.push(result.moveCount);
                if (result.finalScores && result.finalScores.length > 0) {
                    // 1位のスコアを記録
                    scores.push(result.finalScores[0].score);
                }
            } else {
                fail++;
                if (errors.length < 5) {
                    errors.push(`  ゲーム#${i + 1}: ${result.error}`);
                }
            }
        }

        const avgMoves = moveCounts.length > 0
            ? Math.round(moveCounts.reduce((a, b) => a + b, 0) / moveCounts.length)
            : 0;
        const avgTopScore = scores.length > 0
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : 0;
        const successRate = Math.round((success / ITERATIONS) * 100);

        lines.push(`  結果: 成功=${success}/${ITERATIONS} (${successRate}%), 失敗=${fail}`);
        if (moveCounts.length > 0) {
            lines.push(`  平均手数: ${avgMoves}手 / 平均トップスコア: ${avgTopScore}点`);
        }
        if (errors.length > 0) {
            lines.push(`  ⚠ エラー詳細 (最初${errors.length}件):`);
            for (const e of errors) lines.push(e);
        } else {
            lines.push(`  ✓ エラーなし`);
        }
        lines.push('');

        totalSuccess += success;
        totalFail += fail;
    }

    lines.push('============================================================');
    const totalSuccessRate = Math.round((totalSuccess / (totalSuccess + totalFail)) * 100);
    lines.push(`合計: 成功=${totalSuccess}, 失敗=${totalFail} / ${totalSuccess + totalFail}ゲーム (${totalSuccessRate}%)`);
    if (totalFail === 0) {
        lines.push('✓ 全ゲームがエラーなく完走しました！');
    } else {
        lines.push('⚠ 一部ゲームでエラーが発生しました。上記エラー詳細を確認してください。');
    }
    lines.push('============================================================');

    return lines.join('\n');
}

// シミュレーション実行 & 結果表示
const output = runGlorySimulation();
console.log(output);

const pre = document.createElement('pre');
pre.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'background:#0d1117', 'color:#c9d1d9',
    'padding:24px', 'overflow:auto',
    'font-size:13px', 'font-family:monospace',
    'line-height:1.6', 'white-space:pre-wrap',
].join(';');

// 色付き表示（成功は緑、エラーは赤）
const colored = output
    .replace(/(✓[^\n]*)/g, '<span style="color:#3fb950">$1</span>')
    .replace(/(⚠[^\n]*)/g, '<span style="color:#f85149">$1</span>')
    .replace(/(  ゲーム#[^\n]*)/g, '<span style="color:#ffa657">$1</span>');

pre.innerHTML = colored;
document.body.appendChild(pre);
