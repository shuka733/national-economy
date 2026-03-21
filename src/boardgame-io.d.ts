declare module 'boardgame.io' {
    export interface Ctx {
        numPlayers: number;
        currentPlayer: string;
        playOrderPos: number;
        phase?: string | null;
        activePlayers?: Record<string, string | null> | null;
        turn?: number;
    }

    export interface MoveContext<G = any> {
        G: G;
        ctx: Ctx;
        events: any;
        playerID?: string | null;
    }

    export type MoveFn<G = any> = (context: MoveContext<G>, ...args: any[]) => any;

    export interface TurnOrderConfig<G = any> {
        first?: (args: { G: G; ctx: Ctx }) => number | string;
        next?: (args: { G: G; ctx: Ctx }) => number | string | null;
    }

    export interface TurnConfig<G = any> {
        order?: TurnOrderConfig<G>;
        stages?: Record<string, any>;
    }

    export interface Game<G = any> {
        name: string;
        setup?: (args: { ctx: Ctx }, setupData?: any) => G;
        turn?: TurnConfig<G>;
        moves?: Record<string, MoveFn<G>>;
        playerView?: (args: { G: G; ctx: Ctx; playerID?: string | null }) => G;
        phases?: Record<string, any>;
        endIf?: (args: { G: G; ctx: Ctx }) => any;
        ai?: any;
    }
}

declare module 'boardgame.io/core' {
    export const INVALID_MOVE: unique symbol;
    export const Stage: {
        NULL: null;
    };
}

declare module 'boardgame.io/react' {
    import * as React from 'react';
    import type { Ctx } from 'boardgame.io';

    export interface BoardProps<G = any> {
        G: G;
        ctx: Ctx;
        moves: any;
        playerID?: string | null;
        isActive?: boolean;
        isConnected?: boolean;
        matchData?: any;
        credentials?: string;
        events?: any;
        reset?: () => void;
        undo?: () => void;
        redo?: () => void;
    }

    export function Client(options: any): React.ComponentType<any>;
}

declare module 'boardgame.io/client' {
    export function Client(options: any): any;
}

declare module 'boardgame.io/multiplayer' {
    export function Local(options?: any): any;
}
