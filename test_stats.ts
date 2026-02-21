import { NationalEconomy } from './src/game';
import { decideCPUMove } from './src/bots';

const setupArg = {
    ctx: { numPlayers: 2, currentPlayer: '0', turn: 0, phase: null },
    random: { Shuffle: (arr: any[]) => arr }
};

const G = (NationalEconomy.setup as any)(setupArg, { version: 'glory' });

const ctx: any = { numPlayers: 2, currentPlayer: '0', turn: 0, phase: null };
const events: any = {
    endTurn: (opts?: { next?: string }) => {
        if (opts?.next !== undefined) {
            ctx.currentPlayer = String(opts.next);
            G.activePlayer = parseInt(opts.next);
        } else {
            const nextId = (parseInt(ctx.currentPlayer) + 1) % 2;
            ctx.currentPlayer = String(nextId);
            G.activePlayer = nextId;
        }
    },
    setPhase: () => { }, endPhase: () => { }, setActivePlayers: () => { },
};

let moveCount = 0;
while (G.phase !== 'gameEnd' && moveCount < 1000) {
    let activePid = ctx.currentPlayer;
    if (G.phase === 'payday' && G.paydayState) {
        const unconfirmed = Object.entries(G.paydayState.playerStates).find(([, ps]) => !ps.confirmed);
        if (unconfirmed) activePid = unconfirmed[0];
    } else if (G.phase === 'cleanup' && G.cleanupState) {
        const unconfirmed = Object.entries(G.cleanupState.playerStates).find(([, ps]) => !ps.confirmed);
        if (unconfirmed) activePid = unconfirmed[0];
    }

    // Make sure we have G.activePlayer synced
    G.activePlayer = parseInt(activePid);

    const move = decideCPUMove(G, activePid, 'heuristic');
    if (!move) break;

    const moveFn = (NationalEconomy.moves as any)[move.moveName];
    moveFn({ G, ctx, events, playerID: activePid }, ...move.args);
    moveCount++;
}

console.log(JSON.stringify(G.stats, null, 2));
