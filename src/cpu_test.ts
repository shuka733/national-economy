// ============================================================
// cpu_test.ts  –  ブラウザ内CPU全自動テスト (v2: 修正版)
// ============================================================
// Viteの開発サーバー経由で実行。boardgame.ioのESM問題を回避。
// events.endTurnを正しくmockしてプレイヤー切り替えを実装。
// ============================================================

import { NationalEconomy } from './game';
import { decideCPUMove } from './bots';
import type { GameState, GameVersion } from './types';
import type { AIDifficulty } from './bots';

interface TestResult {
    success: boolean;
    rounds: number;
    error?: string;
    moveCount: number;
    lastPhase?: string;
    lastMove?: string;
}

/**
 * 1回のゲームをCPUのみで最後まで実行
 */
function runOneGame(numPlayers: number, version: GameVersion, difficulty: AIDifficulty): TestResult {
    // ゲーム初期化
    const mockSetupArg = {
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
        G = (NationalEconomy.setup as any)(mockSetupArg, { version });
    } catch (e: any) {
        return { success: false, rounds: 0, error: `setup失敗: ${e.message}`, moveCount: 0 };
    }

    const MAX_MOVES = 5000;
    let moveCount = 0;
    let lastMove = '';

    // ctx: boardgame.ioの模擬。endTurnが呼ばれたらcurrentPlayerを更新する。
    const ctx: any = {
        numPlayers,
        currentPlayer: String(G.activePlayer ?? 0),
        turn: 0,
        phase: null,
    };

    // events: endTurnを実装してプレイヤー切り替え
    const events: any = {
        endTurn: (opts?: { next?: string }) => {
            if (opts?.next !== undefined) {
                ctx.currentPlayer = String(opts.next);
                G.activePlayer = parseInt(opts.next);
            } else {
                // 次のプレイヤーに順送り
                const nextId = (parseInt(ctx.currentPlayer) + 1) % numPlayers;
                ctx.currentPlayer = String(nextId);
                G.activePlayer = nextId;
            }
        },
        setPhase: () => { },
        endPhase: () => { },
    };

    while (moveCount < MAX_MOVES) {
        // ゲーム終了チェック
        if (G.phase === 'gameEnd') {
            return { success: true, rounds: G.round, moveCount, lastPhase: G.phase, lastMove };
        }

        // ctx.currentPlayerをG.activePlayerに同期
        if (G.activePlayer !== undefined && G.activePlayer !== null) {
            ctx.currentPlayer = String(G.activePlayer);
        }

        const pid = ctx.currentPlayer;
        const p = G.players[pid];
        if (!p) {
            return {
                success: false, rounds: G.round,
                error: `プレイヤー${pid}が存在しない (activePlayer=${G.activePlayer})`,
                moveCount, lastPhase: G.phase, lastMove,
            };
        }

        // CPU AIによる手の決定
        let cpuMove;
        try {
            cpuMove = decideCPUMove(G, pid, difficulty);
        } catch (e: any) {
            return {
                success: false, rounds: G.round,
                error: `AI決定エラー (R${G.round}, phase=${G.phase}, pid=${pid}): ${e.message}`,
                moveCount, lastPhase: G.phase, lastMove,
            };
        }

        if (!cpuMove) {
            return {
                success: false, rounds: G.round,
                error: `AIがnullを返した (R${G.round}, phase=${G.phase}, pid=${pid}, avail=${p.availableWorkers}, hand=${p.hand.length}, money=$${p.money})`,
                moveCount, lastPhase: G.phase, lastMove,
            };
        }

        // move実行
        const moveFn = (NationalEconomy.moves as any)?.[cpuMove.moveName];
        if (!moveFn) {
            return {
                success: false, rounds: G.round,
                error: `不明なmove: ${cpuMove.moveName}`,
                moveCount, lastPhase: G.phase, lastMove,
            };
        }

        lastMove = `${cpuMove.moveName}(${JSON.stringify(cpuMove.args).substring(0, 50)})`;

        try {
            const result = moveFn({ G, ctx, events }, ...cpuMove.args);
            if (result === 'INVALID_MOVE') {
                return {
                    success: false, rounds: G.round,
                    error: `INVALID_MOVE: ${lastMove} R${G.round}, phase=${G.phase}, pid=${pid}`,
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
        error: `最大手数${MAX_MOVES}到達（無限ループ）R${G.round}, phase=${G.phase}`,
        moveCount, lastPhase: G.phase, lastMove,
    };
}

/**
 * テストスイート実行
 */
function runAllTests(): string {
    const ITERATIONS = 50;
    const configs = [
        { numPlayers: 2, version: 'base' as GameVersion, label: '2人プレイ (Basic)' },
        { numPlayers: 3, version: 'base' as GameVersion, label: '3人プレイ (Basic)' },
        { numPlayers: 4, version: 'base' as GameVersion, label: '4人プレイ (Basic)' },
    ];

    const lines: string[] = [];
    lines.push('============================================================');
    lines.push('National Economy CPU自動テスト');
    lines.push(`各構成 ${ITERATIONS}回 × ${configs.length}構成 = ${ITERATIONS * configs.length}ゲーム`);
    lines.push('============================================================\n');

    let totalSuccess = 0;
    let totalFail = 0;

    for (const config of configs) {
        lines.push(`--- ${config.label} (${ITERATIONS}回) ---`);
        let success = 0;
        let fail = 0;
        const errors: string[] = [];
        const moveCounts: number[] = [];

        for (let i = 0; i < ITERATIONS; i++) {
            const result = runOneGame(config.numPlayers, config.version, 'heuristic');
            if (result.success) {
                success++;
                moveCounts.push(result.moveCount);
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

        lines.push(`  結果: 成功=${success}, 失敗=${fail}`);
        if (moveCounts.length > 0) {
            lines.push(`  平均手数: ${avgMoves}`);
        }
        if (errors.length > 0) {
            lines.push(`  エラー詳細 (最初${errors.length}件):`);
            for (const e of errors) lines.push(e);
        }
        lines.push('');

        totalSuccess += success;
        totalFail += fail;
    }

    lines.push('============================================================');
    lines.push(`合計: 成功=${totalSuccess}, 失敗=${totalFail} / ${totalSuccess + totalFail}`);
    lines.push('============================================================');

    return lines.join('\n');
}

/**
 * P2Pシミュレーションテスト（boardgame.io Local()使用）
 * ホスト→ゲストのmoveルーティングを含むP2Pの全自動テスト
 */
async function runP2POneGame(numPlayers: number): Promise<TestResult> {
    const { Client: BGClient } = await import('boardgame.io/client');
    const { Local } = await import('boardgame.io/multiplayer');

    const localMP = Local();
    const clients: any[] = [];

    for (let i = 0; i < numPlayers; i++) {
        const client = BGClient({
            game: NationalEconomy,
            numPlayers,
            playerID: String(i),
            multiplayer: localMP,
        });
        client.start();
        clients.push(client);
    }

    // P2Pプロキシ経由でmove実行（App.tsxのhostMovesと同じロジック）
    function proxyMove(name: string, args: any[]) {
        const state = clients[0].getState();
        const cp = state?.ctx?.currentPlayer ?? '0';
        const client = clients[parseInt(cp)];
        if (client?.moves[name]) {
            client.moves[name](...args);
        }
    }

    const MAX_MOVES = 2000;
    let moveCount = 0;
    let lastMove = '';

    while (moveCount < MAX_MOVES) {
        const state = clients[0].getState();
        if (!state) break;
        const G: GameState = state.G;

        if (G.phase === 'gameEnd') {
            for (const c of clients) c.stop();
            return { success: true, rounds: G.round, moveCount, lastPhase: G.phase, lastMove };
        }

        // 操作対象プレイヤー判定（修正後のeffectivePlayerロジック）
        let activePid = state.ctx.currentPlayer;
        if (G.phase === 'payday' && G.paydayState) {
            activePid = String(G.paydayState.currentPlayerIndex);
        } else if (G.phase === 'cleanup' && G.cleanupState) {
            activePid = String(G.cleanupState.currentPlayerIndex);
        }

        const action = decideCPUMove(G, activePid, 'heuristic');
        if (!action) {
            for (const c of clients) c.stop();
            return {
                success: false, rounds: G.round,
                error: `AIがnullを返した (R${G.round}, phase=${G.phase}, pid=${activePid})`,
                moveCount, lastPhase: G.phase, lastMove,
            };
        }

        lastMove = `${action.moveName}(${JSON.stringify(action.args).substring(0, 50)})`;

        // P2Pプロキシ経由でmove実行
        proxyMove(action.moveName, action.args);
        moveCount++;

        // UIブロック防止
        if (moveCount % 50 === 0) {
            await new Promise(r => setTimeout(r, 0));
        }
    }

    const finalState = clients[0].getState();
    for (const c of clients) c.stop();
    return {
        success: false, rounds: finalState?.G?.round ?? 0,
        error: `最大手数${MAX_MOVES}到達（無限ループ）`,
        moveCount, lastPhase: finalState?.G?.phase, lastMove,
    };
}

async function runP2PTests(): Promise<string> {
    const ITERATIONS = 5;
    const configs = [
        { numPlayers: 2, label: '2人プレイ (P2P)' },
        { numPlayers: 3, label: '3人プレイ (P2P)' },
        { numPlayers: 4, label: '4人プレイ (P2P)' },
    ];

    const lines: string[] = [];
    lines.push('============================================================');
    lines.push('P2P Auto-Play テスト (boardgame.io Local)');
    lines.push(`各構成 ${ITERATIONS}回 × ${configs.length}構成 = ${ITERATIONS * configs.length}ゲーム`);
    lines.push('============================================================\n');

    let totalSuccess = 0;
    let totalFail = 0;

    for (const config of configs) {
        lines.push(`--- ${config.label} (${ITERATIONS}回) ---`);
        let success = 0;
        let fail = 0;
        const errors: string[] = [];
        const moveCounts: number[] = [];

        for (let i = 0; i < ITERATIONS; i++) {
            const result = await runP2POneGame(config.numPlayers);
            if (result.success) {
                success++;
                moveCounts.push(result.moveCount);
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

        lines.push(`  結果: 成功=${success}, 失敗=${fail}`);
        if (moveCounts.length > 0) {
            lines.push(`  平均手数: ${avgMoves}`);
        }
        if (errors.length > 0) {
            lines.push(`  エラー詳細 (最初${errors.length}件):`);
            for (const e of errors) lines.push(e);
        }
        lines.push('');

        totalSuccess += success;
        totalFail += fail;
    }

    lines.push('============================================================');
    lines.push(`合計: 成功=${totalSuccess}, 失敗=${totalFail} / ${totalSuccess + totalFail}`);
    lines.push('============================================================');

    return lines.join('\n');
}

// URLパラメータでテストモード切替
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode');

if (mode === 'p2p') {
    // P2Pテストモード（非同期）
    (async () => {
        const output = await runP2PTests();
        console.log(output);
        const pre = document.createElement('pre');
        pre.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1a1a2e;color:#e0e0e0;padding:20px;overflow:auto;font-size:14px;font-family:monospace';
        pre.textContent = output;
        document.body.appendChild(pre);
    })();
} else {
    // 通常CPUテスト（同期）
    const output = runAllTests();
    console.log(output);
    const pre = document.createElement('pre');
    pre.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1a1a2e;color:#e0e0e0;padding:20px;overflow:auto;font-size:14px;font-family:monospace';
    pre.textContent = output;
    document.body.appendChild(pre);
}
