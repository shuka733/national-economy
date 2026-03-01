// ============================================================
// Board.tsx  –  メインUI (v8: 3カラムレイアウト + エフェクト)
// ============================================================
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import type { GameState, Card, PlayerState } from './types';
import { getConstructionCost, isConsumable, getWagePerWorker, canBuildAnything, canBuildFarmFree, canDualConstruct, canPlaceOnBuilding, getRoundWorkplaceInfo } from './game';
import { TIMING } from './constants';
import { decideCPUMove } from './bots';
import type { CPUConfig } from './App';
import { soundManager } from './SoundManager';
import { SoundSettings } from './SoundSettings';
import { CPUSettings } from './CPUSettings';
import { useAnimations } from './components/AnimationLayer';
import { BgImageOverlay } from './components/BgImageOverlay';
// HandScene3D は現在未使用（ポンチ絵ベースのHTMLレイアウトに置換済み）
import {
    IconMoney, IconWorker, IconHouse, IconDeck, IconDiscard, IconLog,
    IconHammer, IconRobot, IconPlayer, IconSearch, IconTrash, IconPayment,
    IconTrophy, IconSoundOn, IconSoundOff, TagFarm, TagFactory, TagLock
} from './components/Icons';

import { getCardDef, CONSUMABLE_DEF_ID } from './cards';
/** P2P: playerViewで隠されたカードの判定 */
const isHidden = (c: Card) => c.defId === 'HIDDEN';
const cName = (defId: string) => defId === CONSUMABLE_DEF_ID ? '消費財' : getCardDef(defId).name;
const cTags = (defId: string) => {
    if (defId === CONSUMABLE_DEF_ID) return '';
    const d = getCardDef(defId);
    const t: string[] = [];
    if (d.tags.includes('farm')) t.push('※農園');
    if (d.tags.includes('factory')) t.push('※工場');
    if (d.unsellable) t.push('🔒');
    return t.join(' ');
};
const cEffect = (defId: string) => {
    if (defId === CONSUMABLE_DEF_ID) return '';
    return getCardDef(defId).effectText;
};

/** ラウンドごとの追加職場名マッピング (game.ts getRoundWorkplaceInfoから取得) */
function getRoundWorkplaceName(round: number): string {
    return getRoundWorkplaceInfo(round)?.name ?? '';
}

/** タグバッジ JSX */
function TagBadges({ defId }: { defId: string }) {
    if (defId === CONSUMABLE_DEF_ID) return null;
    const d = getCardDef(defId);
    return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, position: 'relative', zIndex: 1 }}>
            {d.tags.includes('farm') && <span className="tag-badge tag-farm"><TagFarm size={10} /> 農園</span>}
            {d.tags.includes('factory') && <span className="tag-badge tag-factory"><TagFactory size={10} /> 工場</span>}
            {d.unsellable && <span className="tag-badge tag-lock"><TagLock size={10} /> 売却不可</span>}
        </div>
    );
}

/** カード背景画像: テキストの背面に半透明で表示 */
function CardBgImage({ defId }: { defId: string }) {
    if (defId === CONSUMABLE_DEF_ID) return null;
    const d = getCardDef(defId);
    if (!d.image) return null;
    return <BgImageOverlay src={`${import.meta.env.BASE_URL}${d.image!.replace(/^\//, '')}`} />;
}

/** ラウンド番号 → 職場ID マッピング (game.ts getRoundWorkplaceInfoから取得) */
function getRoundWorkplaceId(round: number): string {
    return getRoundWorkplaceInfo(round)?.id ?? '';
}

/** 職場ID → カード画像パス マッピング */
function getWorkplaceImage(wpId: string): string | null {
    const map: Record<string, string> = {
        quarry: 'cards/quarry.png',
        mine: 'cards/mine.png',
        school: 'cards/school.png',
        carpenter: 'cards/carpenter.png',
        ruins: 'cards/ruins.png',
        stall: 'cards/stall.png',
        market: 'cards/market.png',
        high_school: 'cards/highschool.png',
        supermarket: 'cards/supermarket.png',
        university: 'cards/university.png',
        dept_store: 'cards/department_store.png',
        vocational: 'cards/vocational_school.png',
        expo: 'cards/world_expo.png',
    };
    // carpenter_2, carpenter_3 等の派生IDにも対応
    if (wpId.startsWith('carpenter')) return map.carpenter;
    return map[wpId] ?? null;
}

/** 職場カード背景画像: テキストの背面に半透明で表示 */
function WorkplaceBgImage({ wpId }: { wpId: string }) {
    const img = getWorkplaceImage(wpId);
    if (!img) return null;
    return <BgImageOverlay src={`${import.meta.env.BASE_URL}${img}`} />;
}

/** CPU自動プレイ用: GameStateのフェーズ・選択状態を一意表現する文字列を生成
 *  P2Pの非同期更新で同じstateに対してmoveを重複発行するのを防止する */
function computeCpuStateSignature(G: GameState, activePid: string): string {
    const parts: string[] = [G.phase, String(G.round), String(G.activePlayer), activePid, String(G.log.length)];
    if (G.discardState) parts.push('ds', String(G.discardState.count), ...G.discardState.selectedIndices.map(String));
    if (G.paydayState) {
        const pps = G.paydayState.playerStates[activePid];
        if (pps) parts.push('ps', String(pps.confirmed), ...pps.selectedBuildingIndices.map(String));
    }
    if (G.cleanupState) {
        const cps = G.cleanupState.playerStates[activePid];
        if (cps) parts.push('cs', String(cps.confirmed), ...cps.selectedIndices.map(String));
    }
    if (G.dualConstructionState) parts.push('dc', ...G.dualConstructionState.selectedCardIndices.map(String));
    if (G.designOfficeState) parts.push('do', String(G.designOfficeState.revealedCards.length));
    if (G.buildState) parts.push('bs', G.buildState.action);
    return parts.join('|');
}



// ============================================================
// メインBoard
// ============================================================
export function Board({ G: rawG, ctx, moves, playerID, cpuConfig }: BoardProps<GameState> & { cpuConfig?: CPUConfig }) {
    const [showDiscard, setShowDiscard] = useState(false);
    // 手札長押しプレビュー用
    // プレビューデータ型: カード or 公共職場
    type PreviewData =
        | { type: 'card'; defId: string }
        | { type: 'workplace'; wpId: string; name: string; effectText: string; multipleAllowed: boolean };
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // pressingCardIdxはuseRefで管理（再レンダリングによるonPointerLeave発火を防ぐ）
    const pressingCardIdxRef = useRef<number | null>(null);
    const clearPreviewTimer = () => {
        if (previewTimerRef.current) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null; }
    };
    // カード用プレビュー開始
    const startCardPreview = (defId: string, cardIdx: number) => {
        clearPreviewTimer();
        pressingCardIdxRef.current = cardIdx;
        previewTimerRef.current = setTimeout(() => {
            setPreviewData({ type: 'card', defId });
        }, TIMING.LONG_PRESS_MS);
    };
    // 公共職場用プレビュー開始
    const startWorkplacePreview = (wp: { id: string; name: string; effectText: string; multipleAllowed: boolean; fromBuildingDefId?: string }, cardIdx: number) => {
        clearPreviewTimer();
        pressingCardIdxRef.current = cardIdx;
        previewTimerRef.current = setTimeout(() => {
            // 売却建物（fromBuildingDefIdあり）はCardDefフォーマットで表示
            if (wp.fromBuildingDefId) {
                setPreviewData({ type: 'card', defId: wp.fromBuildingDefId });
            } else {
                setPreviewData({ type: 'workplace', wpId: wp.id, name: wp.name, effectText: wp.effectText, multipleAllowed: wp.multipleAllowed });
            }
        }, TIMING.LONG_PRESS_MS);
    };
    const endPreview = () => {
        clearPreviewTimer();
        pressingCardIdxRef.current = null;
        // プレビュー表示済みの場合は閉じない（オーバーレイのクリックで閉じる）
    };
    const closePreview = () => {
        clearPreviewTimer();
        pressingCardIdxRef.current = null;
        setPreviewData(null);
    };
    const [showLog, setShowLog] = useState(false);
    const [muted, setMuted] = useState(soundManager.getSettings().isMuted);
    const [showSettings, setShowSettings] = useState(false);
    const [showCpuSettings, setShowCpuSettings] = useState(false);
    // ラウンド変化アナウンス
    const [roundAnnounce, setRoundAnnounce] = useState<number | null>(null);
    // ラウンドカードフリップ用
    const [flipRound, setFlipRound] = useState<number | null>(null);
    // ラウンドカード移動アニメーション用
    const [roundCardAnim, setRoundCardAnim] = useState<{ round: number; phase: 'flip' | 'move' | 'settled'; deckRect: DOMRect | null; targetRect: DOMRect | null } | null>(null);
    // ラウンド追加職場のスロット位置参照（移動先取得用）
    const roundWorkplaceRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const prevRoundRef = useRef(rawG.round);
    const curPid = ctx.currentPlayer;
    const curIdx = parseInt(curPid);

    // プレイヤーごとのミープル色マッピング
    const PLAYER_COLORS = ['blue', 'green', 'yellow', 'purple'];
    const getMeepleSrc = (playerIndex: number) => `${import.meta.env.BASE_URL}meeples/p${playerIndex + 1}_${PLAYER_COLORS[playerIndex]}.png`;
    // ワーカードラッグ状態（Refベース: documentリスナーから常に最新値を参照）
    const workerDragRef = useRef<{ x: number; y: number; hoveredUid: string | null; workerIndex: number } | null>(null);
    const [workerDragRender, setWorkerDragRender] = useState<typeof workerDragRef.current>(null);
    // movesへの最新参照（マウント時1回のdocumentリスナーから使用）
    const movesRef = useRef(moves);
    movesRef.current = moves;
    // prepareDrawDetectionへの最新参照（ドローモーション発火用）
    const prepareDrawDetectionRef = useRef<(discardCount?: number, drawUpOnly?: boolean) => void>(() => { });

    // ドローアニメーション中のUI表示凍結用: rawGのスナップショット
    // drawAnimRef.current=false → 常にrawGを更新（最新を追従）
    // drawAnimRef.current=true → 凍結されたGを参照（UIがラウンド遷移しない）
    const frozenGRef = useRef(rawG);

    // ドローアニメーション実行中フラグ（Refで即時同期、CPU useEffectで即座に参照可能）
    const drawAnimRef = useRef(false);
    // drawAnimRef変更時にCPU useEffectを再実行させるためのダミーstate
    const [drawAnimTick, setDrawAnimTick] = useState(0);

    // ドロー検知用: move前の状態を保存するRef（displayCurPidより前に宣言必須）
    const lastMoveRef = useRef<{ pid: string; handCount: number; deckCount: number; drawUpOnly?: boolean } | null>(null);

    // レンダー中にドロー発生を同期検出して、drawAnimRefを即設定
    // （useEffect/useLayoutEffectではレンダー後のため、最初のレンダーでdisplayCurPidが正しく凍結されない問題を回避）
    if (lastMoveRef.current && !drawAnimRef.current) {
        const { pid: movePid, handCount: beforeHand, deckCount: beforeDeck } = lastMoveRef.current;
        const movePlayer = rawG.players[movePid];
        if (movePlayer) {
            if (movePlayer.hand.length > beforeHand) {
                // 手札が増えた = ドロー発生 → 即座にフラグON
                drawAnimRef.current = true;
            }
            // 設計事務所: 手札は増えないがデッキから5枚引いた → ドロー1_下発火用
            const deckDiff = beforeDeck - rawG.deck.length;
            if (movePlayer.hand.length === beforeHand && deckDiff > 0 && rawG.phase === 'designOffice') {
                drawAnimRef.current = true;
            }
        }
    }

    // frozenGRef更新: アニメーション中でない場合のみ最新rawGで更新
    if (!drawAnimRef.current) {
        frozenGRef.current = rawG;
    }

    // G: UIレンダリング用（アニメーション中は凍結された前の状態を使用）
    // rawG: ロジック用（useLayoutEffect, moves, CPU処理で使用）
    const G = drawAnimRef.current ? frozenGRef.current : rawG;
    const displayPhase = G.phase;
    const wage = getWagePerWorker(G.round);

    // ドローアニメーション中のUI表示凍結用
    // アニメーション中は前プレイヤーの表示を維持（ターンが即遷移して見えない問題の対策）
    const prevCurPidRef = useRef(curPid);
    const displayCurPid = drawAnimRef.current ? prevCurPidRef.current : curPid;
    const displayCurIdx = parseInt(displayCurPid);
    // アニメーション中でない場合のみ前の値を更新
    if (!drawAnimRef.current) {
        prevCurPidRef.current = curPid;
    }

    // ====== P2P対応 ======
    // playerIDがあればP2P（オンライン）モード、なければホットシート/CPU対戦
    // ドローアニメーション中はmyPidを前プレイヤーに固定（ホットシートで正しい手札を追跡するため）
    const myPid = playerID ?? (drawAnimRef.current ? displayCurPid : curPid);
    const isOnline = playerID !== null && playerID !== undefined;

    // モーダルフェーズ中の操作者判定
    // payday/cleanup は同時処理対応: P2Pでは全員が自分の操作をする
    // build/discard/designOffice/dualConstruction は手番プレイヤーの操作なので ctx.currentPlayer を使用
    const modalPhases = ['payday', 'cleanup', 'discard', 'build', 'designOffice', 'dualConstruction'];
    const isModalPhase = modalPhases.includes(displayPhase);

    // payday/cleanupでは各プレイヤーが自分を操作
    // P2P時: 給料日/精算は自分のplayerStatesに基づく
    let effectivePlayer: string;
    let isMyTurn: boolean;
    if (G.phase === 'payday' && G.paydayState) {
        if (isOnline) {
            const pps = G.paydayState.playerStates[myPid];
            isMyTurn = !!pps && !pps.confirmed && pps.needsSelling;
            effectivePlayer = myPid;
        } else {
            effectivePlayer = String(G.activePlayer);
            isMyTurn = effectivePlayer === myPid;
        }
    } else if (G.phase === 'cleanup' && G.cleanupState) {
        if (isOnline) {
            const cps = G.cleanupState.playerStates[myPid];
            isMyTurn = !!cps && !cps.confirmed && cps.excessCount > 0;
            effectivePlayer = myPid;
        } else {
            effectivePlayer = String(G.activePlayer);
            isMyTurn = effectivePlayer === myPid;
        }
    } else {
        effectivePlayer = curPid;
        isMyTurn = effectivePlayer === myPid;
    }




    // ====== オーディオ管理 (BGM & Log Watcher) ======
    useEffect(() => {
        soundManager.playBGM();
    }, []);

    const lastLogLen = useRef(G.log.length);
    useEffect(() => {
        if (G.log.length > lastLogLen.current) {
            // 最新のログを取得してSFXを再生
            const entry = G.log[G.log.length - 1];
            const text = entry.text;

            if (text.includes('=== Round')) soundManager.playSFX('round_start');
            else if (text.includes('給料日')) soundManager.playSFX('payday'); // 給料日開始
            else if (text.includes('未払い')) soundManager.playSFX('debt');
            else if (text.includes('売却')) soundManager.playSFX('sell');
            else if (text.includes('建設')) {
                if (text.includes('自動車工場') || text.includes('製鉄所') || text.includes('ゼネコン') || text.includes('二胡市')) {
                    soundManager.playSFX('build_heavy');
                } else {
                    soundManager.playSFX('build');
                }
            }
            else if (text.includes('引く')) soundManager.playSFX('draw');
            else if (text.includes('家計')) soundManager.playSFX('coin_get');
            else if (text.includes('支払い')) soundManager.playSFX('coin_pay');
            else if (text.includes('スタートプレイヤー')) soundManager.playSFX('marker');
            else if (text.includes('配置')) soundManager.playSFX('place');
            else if (text.includes('捨て')) soundManager.playSFX('discard');
            else if (text.includes('キャンセル')) soundManager.playSFX('cancel');

            lastLogLen.current = G.log.length;
        }
    }, [G.log]);

    // ====== ラウンド変化検知 → フリップ → 移動 → アナウンス ======
    useEffect(() => {
        if (rawG.round !== prevRoundRef.current) {
            prevRoundRef.current = rawG.round;
            const startSequence = () => {
                // デッキ位置を事前取得
                const deckRect = roundDeckRef.current?.getBoundingClientRect() ?? null;
                // ① フリップ開始
                setFlipRound(rawG.round);
                // フリップ中はまだtargetRectは取れない → moveフェーズで取得
                setRoundCardAnim({ round: rawG.round, phase: 'flip', deckRect, targetRect: null });

                // ② 800ms: フリップ完了 → 移動フェーズ
                const moveTimer = setTimeout(() => {
                    setFlipRound(null); // デッキのフリップを解除（デッキ表示に戻す）
                    // 移動先のDOMRect取得
                    const targetEl = roundWorkplaceRefs.current[rawG.round];
                    const targetRect = targetEl?.getBoundingClientRect() ?? null;
                    setRoundCardAnim(prev => prev ? { ...prev, phase: 'move', targetRect } : null);
                    // rAF後にsettled → CSSのtransitionで移動
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            setRoundCardAnim(prev => prev ? { ...prev, phase: 'settled' } : null);
                        });
                    });
                }, TIMING.FLIP_DURATION_MS);

                // ③ 1500ms: 移動完了 + アナウンス表示
                const announceTimer = setTimeout(() => {
                    setRoundAnnounce(rawG.round);
                    setTimeout(() => setRoundAnnounce(null), TIMING.ANNOUNCE_SHOW_MS);
                }, TIMING.ANNOUNCE_SHOW_MS);

                // ④ 2000ms: アニメーション終了
                const doneTimer = setTimeout(() => {
                    setRoundCardAnim(null);
                }, TIMING.ROUND_ANIM_TOTAL_MS);

                return { moveTimer, announceTimer, doneTimer };
            };
            if (drawAnimRef.current) {
                const poll = setInterval(() => {
                    if (!drawAnimRef.current) {
                        clearInterval(poll);
                        startSequence();
                    }
                }, 100);
                return () => clearInterval(poll);
            } else {
                const { moveTimer, announceTimer, doneTimer } = startSequence();
                return () => { clearTimeout(moveTimer); clearTimeout(announceTimer); clearTimeout(doneTimer); };
            }
        }
    }, [rawG.round]);

    // ====== アニメーション管理 ======
    const { triggerRipple, triggerDraw, isDrawAnimating, AnimationOverlay } = useAnimations();

    const handAreaRef = useRef<HTMLDivElement>(null);
    const handFanContainerRef = useRef<HTMLDivElement>(null);
    const buildingDeckRef = useRef<HTMLDivElement>(null);
    const consumableDeckRef = useRef<HTMLDivElement>(null);
    const roundDeckRef = useRef<HTMLDivElement>(null);
    // ドロー検知用: move前にデッキ座標を事前保存（move後にDOMが消失する可能性対策）
    const deckRectCacheRef = useRef<{ buildingRect: DOMRect | null; consumableRect: DOMRect | null } | null>(null);

    // hand-fan-containerのサイズをResizeObserverで追跡（レンダリング中のDOM読み取り排除）
    // コールバックrefパターン: DOMノードの再マウント（例: 設計事務所モーダル→閉じ）時にResizeObserverを再設定
    const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 600, h: 200 });
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const handFanContainerCallbackRef = useCallback((node: HTMLDivElement | null) => {
        // 前のResizeObserverをクリーンアップ
        if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
            resizeObserverRef.current = null;
        }
        // refも更新（他のコードがhandFanContainerRef.currentを参照するため）
        handFanContainerRef.current = node;
        if (node) {
            const ro = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    setContainerSize(prev => {
                        if (Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1) return prev;
                        return { w: width, h: height };
                    });
                }
            });
            ro.observe(node);
            resizeObserverRef.current = ro;
            // 初期サイズ設定
            setContainerSize({ w: node.clientWidth, h: node.clientHeight });
        }
    }, []);

    // ドローアニメーション中の追加スロット数
    const [drawAnimSlots, setDrawAnimSlots] = useState(0);
    // カードドロー検知: move前の手札枚数と現在の手札枚数を比較
    // useLayoutEffectを使用: レンダー後・ペイント前に同期実行されるため、
    // drawAnimRef.current=trueがブラウザ描画前に設定され、displayCurPidが正しく維持される
    useLayoutEffect(() => {
        // lastMoveRefがない場合はチェック不要
        if (!lastMoveRef.current) return;
        const { pid: movePid, handCount: beforeHand, deckCount: beforeDeck } = lastMoveRef.current;
        const player = rawG.players[movePid];
        if (!player) return;

        const currentHandCount = player.hand.length;
        const currentDeckCount = rawG.deck.length;
        const handDiff = currentHandCount - beforeHand;
        const deckDiff = beforeDeck - currentDeckCount;

        if (handDiff > 0) {
            // 手札が増えた → ドロー発生
            drawAnimRef.current = true;

            // drawUpOnly: ドロー2_上のみ（設計事務所カード選択後など）
            if (lastMoveRef.current?.drawUpOnly) {
                setDrawAnimSlots(handDiff);
                // 即座にドロー2_上開始（ドロー1_下なし）
                setTimeout(() => { setDrawAnimSlots(0); }, 10);
                const HAND_IN_DURATION = 400;
                const STAGGER_DELAY = 100;
                const POST_DRAW_WAIT = 500;
                const handInTotalTime = HAND_IN_DURATION + (handDiff - 1) * STAGGER_DELAY;
                setTimeout(() => {
                    setDrawAnimSlots(0);
                    drawAnimRef.current = false;
                    lastMoveRef.current = null;
                    setDrawAnimTick(t => t + 1);
                }, 10 + handInTotalTime + POST_DRAW_WAIT);
                deckRectCacheRef.current = null;
                return;
            }

            const buildingDrawCount = Math.max(0, deckDiff);
            const consumableDrawCount = Math.max(0, handDiff - buildingDrawCount);

            // ドロー中の新カードを画面外に配置
            setDrawAnimSlots(handDiff);

            // ドロー1_下（deck-out）開始
            // キャッシュから建物/消費財デッキの座標を取得
            const cached = deckRectCacheRef.current as { buildingRect: DOMRect | null; consumableRect: DOMRect | null } | null;

            // 建物カードドロー分のアニメーション
            if (buildingDrawCount > 0) {
                const bRect = cached?.buildingRect ?? buildingDeckRef.current?.getBoundingClientRect();
                if (bRect) {
                    triggerDraw('building', buildingDrawCount, bRect, () => { });
                }
            }

            // 消費財ドロー分のアニメーション
            if (consumableDrawCount > 0) {
                const cRect = cached?.consumableRect ?? consumableDeckRef.current?.getBoundingClientRect();
                if (cRect) {
                    // 建物ドローがある場合はその分遅延させる
                    const delay = buildingDrawCount * 100;
                    setTimeout(() => {
                        triggerDraw('consumable', consumableDrawCount, cRect, () => { });
                    }, delay);
                }
            }

            deckRectCacheRef.current = null; // キャッシュ消費

            // --- 動的タイミング計算 ---
            // ドロー1_下: DECK_OUT_DURATION(300ms) + (N-1) * STAGGER_DELAY(100ms)
            // ドロー2_上: HAND_IN_DURATION(400ms) + (N-1) * STAGGER_DELAY(100ms)
            const DECK_OUT_DURATION = TIMING.DECK_OUT_MS;
            const STAGGER_DELAY = TIMING.STAGGER_DELAY_MS;
            const HAND_IN_DURATION = TIMING.HAND_IN_MS;
            const PHASE_GAP = 10;
            const POST_DRAW_WAIT = TIMING.POST_DRAW_WAIT_MS;

            const deckOutTotalTime = DECK_OUT_DURATION + (handDiff - 1) * STAGGER_DELAY;
            const handInTotalTime = HAND_IN_DURATION + (handDiff - 1) * STAGGER_DELAY;

            // ドロー1_下の最後のモーション完了からPHASE_GAP後にドロー2_上開始
            setTimeout(() => {
                setDrawAnimSlots(0);
            }, deckOutTotalTime + PHASE_GAP);

            // ドロー2_上の最後のモーション完了からPOST_DRAW_WAIT後にターン遷移
            const TOTAL_ANIM_DURATION = deckOutTotalTime + PHASE_GAP + handInTotalTime + POST_DRAW_WAIT;
            setTimeout(() => {
                setDrawAnimSlots(0);
                drawAnimRef.current = false;
                lastMoveRef.current = null;
                setDrawAnimTick(t => t + 1);
            }, TOTAL_ANIM_DURATION);
        } else if (handDiff === 0 && deckDiff > 0 && rawG.phase === 'designOffice') {
            // 設計事務所: 手札は増えないがデッキから5枚引いた → ドロー1_下のみ発火
            drawAnimRef.current = true;

            const cached = deckRectCacheRef.current as { buildingRect: DOMRect | null; consumableRect: DOMRect | null } | null;
            const bRect = cached?.buildingRect ?? buildingDeckRef.current?.getBoundingClientRect();
            deckRectCacheRef.current = null;

            const DECK_OUT_DURATION = 300;
            const STAGGER_DELAY = 100;

            if (bRect) {
                triggerDraw('building', deckDiff, bRect, () => { });
            }

            // ドロー1_下完了後にDesignOfficeUI表示のためアニメーション終了
            const deckOutTotalTime = DECK_OUT_DURATION + (deckDiff - 1) * STAGGER_DELAY;
            setTimeout(() => {
                drawAnimRef.current = false;
                lastMoveRef.current = null;
                setDrawAnimTick(t => t + 1);
            }, deckOutTotalTime + 200); // 200ms余裕
        } else if (!drawAnimRef.current) {
            // ドローが発生せず、かつアニメーション中でもない場合のみフラグを解除
            // （最終ターンでクリーンアップ遷移時にGが再更新されてもアニメーション中断しない）
            drawAnimRef.current = false;
            lastMoveRef.current = null;
            setDrawAnimTick(t => t + 1);
        }
        // G全体を監視（どのワークプレイスでも確実に発火）
    }, [rawG]);

    // 手札スロットの位置を計算するヘルパー
    const getHandSlotPositions = useCallback((totalCards: number): { x: number; y: number; w: number; h: number }[] => {
        if (!handAreaRef.current) return [];
        const containerRect = handAreaRef.current.getBoundingClientRect();
        const containerH = containerRect.height;
        const containerW = containerRect.width;
        const cardH = (containerH - 30) * 0.84;
        const cardW = cardH * 63 / 88;

        if (totalCards <= 0) return [];
        if (totalCards === 1) {
            return [{ x: containerRect.left + (containerW - cardW) / 2, y: containerRect.top + 30 + (containerH - 30 - cardH) / 2, w: cardW, h: cardH }];
        }

        const neededSpacing = (containerW - cardW) / (totalCards - 1);
        const spacing = Math.min(neededSpacing, cardW);
        const totalWidth = cardW + spacing * (totalCards - 1);
        const startX = containerRect.left + (containerW - totalWidth) / 2;
        const cardY = containerRect.top + 30 + (containerH - 30 - cardH);

        const slots: { x: number; y: number; w: number; h: number }[] = [];
        for (let i = 0; i < totalCards; i++) {
            slots.push({ x: startX + i * spacing, y: cardY, w: cardW, h: cardH });
        }
        return slots;
    }, []);

    // スケーリングはCSSのみで実現（.game-scalerクラスで制御）
    // JSによるtransform設定は不要。フェーズ遷移時の再マウントでも安定動作する。

    // ドロー検知準備ヘルパー: ドロー発生の可能性があるmove呼び出し前に実行
    // lastMoveRefとdeckRectCacheRefを設定し、move後のuseLayoutEffectでドロー検知を可能にする
    // discardCount: confirmDiscard時に同時に捨てる枚数（工場: 2枚捨て→4枚ドロー等）
    const prepareDrawDetection = useCallback((discardCount: number = 0, drawUpOnly: boolean = false) => {
        lastMoveRef.current = {
            pid: myPid,
            handCount: (rawG.players[myPid]?.hand?.length ?? 0) - discardCount,
            deckCount: rawG.deck.length,
            drawUpOnly,
        };
        // 建物デッキと消費財デッキの座標を両方キャッシュ
        // DiscardUI表示中はDOMにデッキが存在しないので、既存キャッシュを保持
        const bRect = buildingDeckRef.current?.getBoundingClientRect() ?? null;
        const cRect = consumableDeckRef.current?.getBoundingClientRect() ?? null;
        if (bRect || cRect) {
            deckRectCacheRef.current = {
                buildingRect: bRect,
                consumableRect: cRect,
            };
        }
        // bRectもcRectもnullの場合は既存キャッシュを維持（handlePlaceWorkerOnBuildingからの保存値）
    }, [myPid, rawG]);
    // ドラッグ用Ref接続（マウント時1回のdocumentリスナーから参照）
    prepareDrawDetectionRef.current = prepareDrawDetection;

    // ワーカー配置ラッパー: 配置時にリップルエフェクトを発火
    const handlePlaceWorker = useCallback((wpId: string, event: React.MouseEvent) => {
        // ドローアニメーション中はワーカー配置をブロック
        if (drawAnimRef.current) return;
        soundManager.playSFX('click');
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        triggerRipple(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
            '',
            'rgba(45, 212, 191, 0.6)'
        );
        // ドロー検知準備（move前の状態保存）
        prepareDrawDetection();
        moves.placeWorker(wpId);
    }, [moves, triggerRipple, myPid, rawG]);

    const handlePlaceWorkerOnBuilding = useCallback((cardUid: string, event: React.MouseEvent) => {
        // ドローアニメーション中はワーカー配置をブロック
        if (drawAnimRef.current) return;
        soundManager.playSFX('click');
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        triggerRipple(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
            '',
            'rgba(212, 168, 83, 0.6)'
        );
        // ドロー検知準備（move前の状態保存）
        prepareDrawDetection();
        moves.placeWorkerOnBuilding(cardUid);
    }, [moves, triggerRipple, myPid, rawG, prepareDrawDetection]);

    // ====== カードドラッグ操作（シャドウバース風・上にドラッグして使用） ======
    const [dragState, setDragState] = useState<{
        cardIndex: number;
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
    } | null>(null);
    const dragThreshold = 50; // 上方向50px以上でプレイ確定

    const handleCardPointerDown = useCallback((ci: number, e: React.PointerEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragState({
            cardIndex: ci,
            startX: e.clientX,
            startY: e.clientY,
            currentX: e.clientX,
            currentY: e.clientY,
        });
    }, []);

    const handleCardPointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragState) return;
        setDragState(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);
    }, [dragState]);

    const handleCardPointerUp = useCallback((e: React.PointerEvent) => {
        if (!dragState) return;
        const dy = dragState.startY - e.clientY; // 上方向が正
        if (dy > dragThreshold) {
            // ドラッグ成功: カード使用
            soundManager.playSFX('click');
            prepareDrawDetection();
            moves.selectBuildCard(dragState.cardIndex);
        }
        setDragState(null);
    }, [dragState, moves]);

    // ====== CPU自動プレイ ======
    // P2P重複move防止: 同じstateに対してmoveを2回以上発行しないためのガード
    const cpuMoveSignatureRef = useRef<string>('');
    // フォールバック: signatureが一定時間変わらない場合にリセットするためのタイマー
    const cpuStuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!cpuConfig?.enabled) return;
        if (G.phase === 'gameEnd') return;
        if (showCpuSettings) return; // 設定中は停止
        // ドローアニメーション中はCPU moveをブロック（Refで即時参照）
        if (drawAnimRef.current) return;

        // CPU自動プレイ時の給料日・精算: 各CPUプレイヤーの未確認分を処理
        let activePid = curPid;
        if (G.phase === 'payday' && G.paydayState) {
            // 未確認のCPUプレイヤーを探す
            const unconfirmed = Object.entries(G.paydayState.playerStates)
                .find(([pid, ps]) => !ps.confirmed && cpuConfig.cpuPlayers.includes(pid));
            activePid = unconfirmed ? unconfirmed[0] : String(G.paydayState.currentPlayerIndex);
        } else if (G.phase === 'cleanup' && G.cleanupState) {
            const unconfirmed = Object.entries(G.cleanupState.playerStates)
                .find(([pid, ps]) => !ps.confirmed && cpuConfig.cpuPlayers.includes(pid));
            activePid = unconfirmed ? unconfirmed[0] : String(G.cleanupState.currentPlayerIndex);
        }

        if (!cpuConfig.cpuPlayers.includes(activePid)) return;

        // stateSignature: トグル系フェーズの状態を一意に表す文字列
        const sig = computeCpuStateSignature(G, activePid);

        // P2Pではmove発行後にGが非同期で更新されるため、
        // 同じsignatureに対して再度moveを発行するのを防ぐ
        // ホットシートではMoveが同期処理されるため重複チェック不要
        const isOnlineMode = playerID !== null && playerID !== undefined;
        if (isOnlineMode && sig === cpuMoveSignatureRef.current) return;

        // SoundManagerから常に最新の設定を取得（cpuConfig.moveDelayは無視）
        const delay = soundManager.getSettings().cpuMoveDelay;
        const timer = setTimeout(() => {
            // タイマー発火時にも再チェック（P2Pのみ）
            if (isOnlineMode && sig === cpuMoveSignatureRef.current) return;

            const action = decideCPUMove(G, activePid, cpuConfig.difficulty);
            if (action) {
                const moveFn = (moves as any)[action.moveName];
                if (moveFn) {
                    // move発行前にsignatureを記録（P2P重複防止用）
                    cpuMoveSignatureRef.current = sig;
                    moveFn(...action.args);
                }
            }
        }, delay);

        // フォールバック: 3秒後にsignatureをリセット（CPUが停止した場合の回復）
        if (cpuStuckTimerRef.current) clearTimeout(cpuStuckTimerRef.current);
        cpuStuckTimerRef.current = setTimeout(() => {
            cpuMoveSignatureRef.current = '';
        }, 3000);

        return () => {
            clearTimeout(timer);
            if (cpuStuckTimerRef.current) clearTimeout(cpuStuckTimerRef.current);
        };
    }, [G, curPid, cpuConfig, moves, showCpuSettings, playerID, drawAnimTick]);

    // ゲーム終了
    if (G.phase === 'gameEnd' && G.finalScores) return <GameOver G={G} />;

    // P2P: 自分のターンでない場合のモーダル系は「待機中」表示
    if (isOnline && isModalPhase && !isMyTurn) {
        const phaseLabels: Record<string, string> = {
            payday: '💰 給料日の処理',
            cleanup: '🗑️ 手札整理',
            discard: '🃏 カード選択',
            build: '🔨 建設',
            designOffice: '🔍 設計事務所',
            dualConstruction: '🏗️ 二胡市建設',
        };
        return (
            <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 16 }}>
                <div className="glass-card animate-slide-up" style={{ padding: 40, maxWidth: 420, width: '100%', textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 2s ease-in-out infinite' }}>⏳</div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>P{G.activePlayer + 1} が操作中...</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{phaseLabels[G.phase] || G.phase}を行っています</p>
                    <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 16 }}>しばらくお待ちください</p>
                </div>
            </div>
        );
    }

    // ===== ①②③ ポップアップ廃止: payday/cleanup/discard はメインボード上でインライン操作 =====
    // 給料日（建物売却）: メインボードの建物カードから直接選択
    const isPaydayPhase = G.phase === 'payday' && G.paydayState;
    const paydayPlayerState = isPaydayPhase
        ? G.paydayState!.playerStates[isOnline ? myPid : String(G.paydayState!.currentPlayerIndex)]
        : null;
    const needsPaydaySelling = paydayPlayerState && !paydayPlayerState.confirmed && paydayPlayerState.needsSelling;

    // 精算（手札クリーンアップ）: メインボードの手札から直接選択
    const isCleanupPhase = G.phase === 'cleanup' && G.cleanupState;
    const cleanupPlayerState = isCleanupPhase
        ? G.cleanupState!.playerStates[isOnline ? myPid : String(G.cleanupState!.currentPlayerIndex)]
        : null;
    const needsCleanup = cleanupPlayerState && !cleanupPlayerState.confirmed && cleanupPlayerState.excessCount > 0;

    // 捨てカード選択: メインボードの手札から直接選択
    const isDiscardPhase = rawG.phase === 'discard' && rawG.discardState;

    // 設計事務所モーダル（rawGで判定: ドロー1_下完了後に表示するためアニメーション中は非表示）
    if (rawG.phase === 'designOffice' && rawG.designOfficeState && !drawAnimRef.current) return <DesignOfficeUI G={rawG} moves={moves} onBeforeSelect={() => prepareDrawDetection(0, true)} />;

    // 二胡市建設モーダル
    if (G.phase === 'dualConstruction' && G.dualConstructionState) return <DualConstructionUI G={G} moves={moves} pid={curPid} />;

    // ホットシートでカレントプレイヤー = 自分
    const myIdx = parseInt(myPid);
    const myPlayer = G.players[myPid];

    // ====== ワーカードラッグ: documentレベルのPointerMove/Up/Cancel処理 ======
    // マウント時1回だけリスナー登録。Refで最新値を参照するためレースコンディションなし
    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            if (!workerDragRef.current) return;
            const elBelow = document.elementFromPoint(e.clientX, e.clientY);
            // 自分の建物 or 公共職場を検出
            const buildingEl = elBelow?.closest('[data-building-uid]') as HTMLElement | null;
            const workplaceEl = elBelow?.closest('[data-workplace-id]') as HTMLElement | null;
            const hoveredId = buildingEl?.dataset.buildingUid ?? workplaceEl?.dataset.workplaceId ?? null;
            workerDragRef.current = { ...workerDragRef.current, x: e.clientX, y: e.clientY, hoveredUid: hoveredId };
            setWorkerDragRender({ ...workerDragRef.current });
        };
        const onUp = (e: PointerEvent) => {
            if (!workerDragRef.current) return;
            const elBelow = document.elementFromPoint(e.clientX, e.clientY);
            // 自分の建物を検出
            const buildingEl = elBelow?.closest('[data-building-uid]') as HTMLElement | null;
            if (buildingEl) {
                const uid = buildingEl.dataset.buildingUid!;
                soundManager.playSFX('click');
                prepareDrawDetectionRef.current();
                movesRef.current.placeWorkerOnBuilding(uid);
            }
            // 公共職場を検出
            const workplaceEl = elBelow?.closest('[data-workplace-id]') as HTMLElement | null;
            if (!buildingEl && workplaceEl) {
                const wpId = workplaceEl.dataset.workplaceId!;
                soundManager.playSFX('click');
                prepareDrawDetectionRef.current();
                movesRef.current.placeWorker(wpId);
            }
            workerDragRef.current = null;
            setWorkerDragRender(null);
        };
        const onCancel = () => {
            workerDragRef.current = null;
            setWorkerDragRender(null);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onCancel);
        return () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onCancel);
        };
    }, []);

    // 対戦相手（自分以外）
    const opponents = Array.from({ length: ctx.numPlayers }, (_, i) => i)
        .filter(i => String(i) !== myPid);

    // 家計ボックスのプレッシャー判定（ラウンド7以降で家計が少ない場合）
    const totalWorkers = Object.values(G.players).reduce((sum, p) => sum + p.workers, 0);
    const wagePressure = G.round >= 7 && G.household < totalWorkers * wage;

    // 建設フェーズ判定
    const isBuildPhase = G.phase === 'build' && G.buildState;
    const canInteract = (!isOnline || isMyTurn);

    // 売却建物（公共職場のうちfromBuilding=true）
    const fixedWorkplaces = G.publicWorkplaces.filter(wp => !wp.fromBuilding);
    const soldWorkplaces = G.publicWorkplaces.filter(wp => wp.fromBuilding);

    // 手札カードの動的重なり計算（コンテナ幅に自動フィット）
    // ResizeObserverで取得したcontainerSizeを使用（レンダリング中のDOM読み取り排除）
    const getCardOverlapMargin = (total: number, isMyHand: boolean) => {
        if (total <= 1) return 0;
        if (isMyHand) {
            // containerSizeはResizeObserverで追跡済み（padding 8px*2を除く）
            const containerW = containerSize.w - 16;
            const cardH = containerSize.h * 0.84;
            const cardW = cardH * 63 / 88;
            const neededSpacing = (containerW - cardW) / (total - 1);
            return Math.min(neededSpacing, cardW) - cardW;
        } else {
            // 相手の手札は小さいカードで変更なし
            const cardWidth = 24;
            const containerWidth = 100;
            const neededSpacing = (containerWidth - cardWidth) / (total - 1);
            return Math.min(neededSpacing, cardWidth) - cardWidth;
        }
    };

    // デッキの厚みクラス判定
    const deckDepthClass = (count: number) => {
        if (count === 0) return 'empty-deck';
        if (count === 1) return 'single-card';
        return 'has-depth';
    };

    return (
        <div className="game-bg game-layout">
            <AnimationOverlay />
            {/* ワーカードラッグ中のゴーストミープル */}
            {workerDragRender && (
                <img
                    src={getMeepleSrc(parseInt(myPid))}
                    className="worker-drag-ghost"
                    style={{ left: workerDragRender.x, top: workerDragRender.y }}
                    alt=""
                />
            )}
            {/* 長押しプレビューオーバーレイ（カード / 公共職場） */}
            {previewData && (() => {
                if (previewData.type === 'card') {
                    // カード（建物 / 売却建物）フォーマット
                    const pDef = getCardDef(previewData.defId);
                    if (!pDef) return null;
                    const imgSrc = pDef.image ? `${import.meta.env.BASE_URL}${pDef.image.replace(/^\//, '')}` : null;
                    const tagLabel = pDef.tags.includes('farm') ? '🌿 農場' : pDef.tags.includes('factory') ? '🏭 工場' : '🏢 施設';
                    return (
                        <div className="card-preview-overlay" onPointerUp={closePreview} onClick={closePreview}>
                            <div className="card-preview-card">
                                <div className="card-preview-image">
                                    {imgSrc && <img src={imgSrc} alt={pDef.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                </div>
                                <div className="card-preview-info">
                                    <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', marginBottom: 4 }}>{pDef.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{tagLabel}</div>
                                    <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                                        <span style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 600 }}>コスト: <b style={{ color: 'var(--gold-light)' }}>C{pDef.cost}</b></span>
                                        <span style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 600 }}>得点: <b style={{ color: 'var(--gold-light)' }}>{pDef.vp}VP</b></span>
                                    </div>
                                    {pDef.effectText && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{pDef.effectText}</div>}
                                </div>
                            </div>
                        </div>
                    );
                } else {
                    // 公共職場フォーマット（コスト/VP省略）
                    const wpImg = getWorkplaceImage(previewData.wpId);
                    const wpImgSrc = wpImg ? `${import.meta.env.BASE_URL}${wpImg}` : null;
                    return (
                        <div className="card-preview-overlay" onPointerUp={closePreview} onClick={closePreview}>
                            <div className="card-preview-card">
                                <div className="card-preview-image">
                                    {wpImgSrc && <img src={wpImgSrc} alt={previewData.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                </div>
                                <div className="card-preview-info">
                                    <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', marginBottom: 4 }}>{previewData.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>🏛️ 公共職場</div>
                                    {previewData.effectText && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{previewData.effectText}</div>}
                                    {previewData.multipleAllowed && <div style={{ fontSize: 12, color: 'var(--purple)', marginTop: 6, fontWeight: 600 }}>∞ 複数配置可能</div>}
                                </div>
                            </div>
                        </div>
                    );
                }
            })()}
            <div className="game-scaler">
                {/* ラウンドアナウンスオーバーレイ */}
                {roundAnnounce !== null && (
                    <div className="round-announce-overlay" key={`round-${roundAnnounce}`}>
                        <div className="round-announce-text">Round {roundAnnounce}</div>
                    </div>
                )}
                {/* ====== ヘッダー ====== */}
                <div className="game-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', borderRadius: 6 }}>
                    <h1 style={{ fontSize: 13, fontWeight: 900, color: 'var(--gold)', margin: 0, display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '1px' }}>
                        <IconHammer size={14} color="var(--gold)" /> NATIONAL ECONOMY
                    </h1>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="stat-badge"><span style={{ color: 'var(--text-dim)', fontSize: 8, fontWeight: 700 }}>ROUND</span><b style={{ color: 'var(--blue)', fontSize: 12 }}>{G.round}</b><span style={{ color: 'var(--text-dim)' }}>/9</span></span>
                        <span className="stat-badge"><IconDeck size={10} color="var(--purple)" /><b style={{ color: 'var(--purple)', fontSize: 10 }}>{G.deck.length}</b></span>
                        <button onClick={() => { soundManager.playSFX('click'); setShowDiscard(!showDiscard); }} className="stat-badge" style={{ cursor: 'pointer', border: '1px solid rgba(251, 146, 60, 0.15)' }}>
                            <IconDiscard size={10} color="var(--orange)" /><b style={{ color: 'var(--orange)', fontSize: 10 }}>{G.discard.length}</b>
                        </button>
                        <button onClick={() => { soundManager.playSFX('click'); setShowLog(!showLog); }} className="stat-badge" style={{ cursor: 'pointer', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                            <IconLog size={10} color="#818cf8" /><b style={{ color: '#818cf8', fontSize: 10 }}>{G.log.length}</b>
                        </button>
                        <button onClick={() => { soundManager.playSFX('click'); setShowSettings(true); }} className="stat-badge" style={{ cursor: 'pointer', padding: '3px 6px' }} title="音量設定">
                            {muted ? <IconSoundOff size={12} /> : <IconSoundOn size={12} />}
                        </button>
                        {cpuConfig?.enabled && (
                            <button onClick={() => { soundManager.playSFX('click'); setShowCpuSettings(true); }} className="stat-badge" style={{ cursor: 'pointer', padding: '3px 6px' }} title="CPU設定">
                                <IconRobot size={12} />
                            </button>
                        )}
                    </div>
                </div>

                {/* 設定・モーダル系 */}
                {showSettings && <SoundSettings onClose={() => { setShowSettings(false); setMuted(soundManager.getSettings().isMuted); }} />}
                {showCpuSettings && <CPUSettings onClose={() => setShowCpuSettings(false)} />}
                {showDiscard && <DiscardPileModal discard={G.discard} onClose={() => setShowDiscard(false)} />}
                {showLog && <LogModal log={G.log} onClose={() => setShowLog(false)} />}

                {/* 建設キャンセルバーはインフォバーに移動（項目5） */}

                {/* ====== メインエリア: 左列(相手)+右列(公共の場) ====== */}
                <div className="game-main-area">

                    {/* ==== 左列: P2/P3/P4 + ターン + ログ ==== */}
                    <div className="area-opponents">
                        {/* ターン表示 */}
                        <div className="turn-bar" style={{ marginBottom: 2, fontSize: 10 }}>
                            {cpuConfig?.enabled && cpuConfig.cpuPlayers.includes(displayCurPid) ? <IconRobot size={12} /> : <IconPlayer size={12} />}
                            <span><b style={{ color: 'var(--gold-light)' }}>P{displayCurIdx + 1}</b> のターン</span>
                            {cpuConfig?.enabled && cpuConfig.cpuPlayers.includes(displayCurPid) && (
                                <span style={{ marginLeft: 4, fontSize: 8, color: 'var(--text-dim)', background: 'rgba(160, 120, 48, 0.15)', padding: '1px 4px', borderRadius: 3, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                    <span className="animate-pulse">●</span> Thinking…
                                </span>
                            )}
                        </div>

                        {/* 相手プレイヤー */}
                        {opponents.map(i => {
                            const pid = String(i);
                            const p = G.players[pid];
                            const active = pid === displayCurPid;
                            const isCpu = cpuConfig?.enabled && cpuConfig.cpuPlayers.includes(pid);
                            return (
                                <div key={pid} className={`opponent-card ${active ? 'opponent-card-active' : 'opponent-card-inactive'}`}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                                        <span style={{ fontWeight: 700, fontSize: 10, color: active ? 'var(--teal)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                            {isCpu ? <IconRobot size={10} /> : <IconPlayer size={10} />}
                                            P{i + 1}
                                            {i === G.startPlayer && <span style={{ color: 'var(--orange)', fontSize: 8 }}>★</span>}
                                        </span>
                                        {/* ステータスバッジ */}
                                        <div style={{ display: 'flex', gap: 3 }}>
                                            <span className="stat-badge" style={{ fontSize: 8, padding: '1px 4px' }}>
                                                <IconMoney size={8} color="var(--gold-light)" /><b style={{ color: 'var(--gold-light)' }}>${p.money}</b>
                                            </span>
                                            <span className="stat-badge" style={{ fontSize: 8, padding: '1px 4px' }}>
                                                <IconWorker size={8} color="var(--blue)" /><b style={{ color: 'var(--blue)' }}>{p.availableWorkers}/{p.workers}</b>
                                            </span>
                                            {p.unpaidDebts > 0 && <span className="stat-badge" style={{ fontSize: 8, padding: '1px 4px', borderColor: 'rgba(248,113,113,0.3)' }}><b style={{ color: 'var(--red)' }}>Debt {p.unpaidDebts}</b></span>}
                                        </div>
                                    </div>

                                    {/* 手札（ミニ直線配置） */}
                                    <div className="opponent-hand-fan" style={{ display: 'flex', justifyContent: 'center' }}>
                                        {Array.from({ length: p.hand.length }).map((_, ci) => (
                                            <div key={ci} className="opponent-hand-card" style={{
                                                marginLeft: ci === 0 ? 0 : getCardOverlapMargin(p.hand.length, false),
                                                zIndex: ci + 1,
                                            }} />
                                        ))}
                                    </div>

                                    {/* 建物（水平スクロール） */}
                                    {p.buildings.length > 0 && (
                                        <div className="opponent-buildings-scroll">
                                            {p.buildings.map((b, bi) => {
                                                const def = getCardDef(b.card.defId);
                                                const color = def.tags.includes('farm') ? 'var(--green)' : def.tags.includes('factory') ? 'var(--orange)' : 'var(--blue)';
                                                return (
                                                    <div key={bi} className={`opponent-building-card ${b.workerPlaced ? 'used' : ''}`}
                                                        style={{ borderColor: color }}
                                                        title={`${def.name} (${def.vp}VP) ${def.effectText}`}>
                                                        <span style={{ fontSize: 7, fontWeight: 700, color: b.workerPlaced ? 'var(--text-dim)' : 'var(--text-secondary)' }}>{def.name}</span>
                                                        <span style={{ fontSize: 6, color: 'var(--gold-dim)' }}>{def.vp}VP</span>
                                                        {b.workerPlaced && <IconWorker size={7} color="var(--blue)" />}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* コンパクトログ */}
                        <div className="inline-log" style={{ marginTop: 'auto' }}>
                            <div style={{ fontSize: 8, color: 'var(--text-dim)', fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                                <IconLog size={8} /> LOG
                                <button onClick={() => { soundManager.playSFX('click'); setShowLog(true); }} style={{ marginLeft: 'auto', fontSize: 7, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>全件</button>
                            </div>
                            {G.log.slice(-3).reverse().map((entry, i) => (
                                <div key={G.log.length - i}
                                    className={`log-entry ${entry.text.startsWith('===') ? 'log-entry-round' : entry.text.startsWith('---') ? 'log-entry-phase' : 'log-entry-action'}`}
                                    style={{ fontSize: 7 }}>
                                    {entry.text}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ==== 右列: 公共の場 ==== */}
                    <div className="area-public" style={{ border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 4 }}>
                        {/* 家計 */}
                        <div className={`household-box ${wagePressure ? 'wage-pressure' : ''}`}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, zIndex: 1 }}>
                                <IconHouse size={16} color={wagePressure ? 'var(--red)' : 'var(--teal)'} />
                                <div>
                                    <div style={{ fontSize: 8, color: 'var(--text-dim)', fontWeight: 600 }}>HOUSEHOLD</div>
                                    <div style={{ fontSize: 18, fontWeight: 900, color: wagePressure ? 'var(--red)' : 'var(--green)', lineHeight: 1 }}>${G.household}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10, zIndex: 1 }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 7, color: 'var(--text-dim)' }}>WAGE</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)' }}>${wage}</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 7, color: 'var(--text-dim)' }}>ROUND</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>{G.round}/9</div>
                                </div>
                            </div>
                        </div>

                        {/* デッキ + 職場の横並びエリア */}
                        <div className="public-cards-area">
                            {/* デッキ列（左縦列） */}
                            <div className="deck-column">
                                {/* ラウンドカード: 9枚物理重ね（R1~R9） */}
                                {/* 各ラウンドのカードを重ねて表示。G.round以降のみ。最上面がフリップ対象 */}
                                <div ref={roundDeckRef} className={`deck-card deck-round ${deckDepthClass(9 - G.round + 1)}`} style={{ position: 'relative' }}>
                                    {(() => {
                                        // 残りラウンド: 大きいラウンド→小さいラウンドの順（最上面＝現在ラウンド）
                                        const remainingRounds = Array.from({ length: 9 }, (_, i) => 9 - i)
                                            .filter(r => r >= G.round);
                                        return remainingRounds.map((r, i) => {
                                            const isTop = i === remainingRounds.length - 1; // 最上面＝最小ラウンド
                                            const isFlipping = isTop && flipRound !== null;
                                            const wageForRound = getWagePerWorker(r);
                                            const wpName = getRoundWorkplaceName(r);
                                            return (
                                                <div key={`round-${r}`}
                                                    style={{
                                                        position: i === 0 ? 'relative' : 'absolute',
                                                        inset: i === 0 ? undefined : 0,
                                                        zIndex: i,
                                                    }}>
                                                    {isTop ? (
                                                        // 最上面: フリップ対応
                                                        <div className={`round-card-flipper ${isFlipping ? 'flipping' : ''}`}>
                                                            {/* 表面: ラウンド番号 */}
                                                            <div className="deck-top-face round-card-front">
                                                                <div className="deck-count" style={{ color: 'var(--blue)' }}>R{r}</div>
                                                                <div className="deck-label">${wageForRound}/人</div>
                                                            </div>
                                                            {/* 裏面: 追加職場名 */}
                                                            <div className="deck-top-face round-card-back" style={{ overflow: 'hidden' }}>
                                                                <WorkplaceBgImage wpId={getRoundWorkplaceId(r)} />
                                                                <div style={{ fontSize: 7, color: 'var(--text-dim)', position: 'relative', zIndex: 1 }}>新職場</div>
                                                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', position: 'relative', zIndex: 1 }}>
                                                                    {wpName || '—'}
                                                                </div>
                                                                <div style={{ fontSize: 7, color: 'var(--text-dim)', position: 'relative', zIndex: 1 }}>R{r}</div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        // 下層カード: フリップなし、表面のみ
                                                        <div className="deck-top-face">
                                                            <div className="deck-count" style={{ color: 'var(--blue)' }}>R{r}</div>
                                                            <div className="deck-label">${wageForRound}/人</div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                                {/* 消費財デッキ: 仮想的に10枚重ね描画 */}
                                <div ref={consumableDeckRef} className="deck-card deck-consumable has-depth" style={{ position: 'relative' }}>
                                    {Array.from({ length: 10 }).map((_, i) => (
                                        <div key={`cons-stack-${i}`} className="deck-top-face" style={{
                                            position: i === 0 ? 'relative' : 'absolute',
                                            inset: i === 0 ? undefined : 0,
                                            zIndex: 10 - i,
                                        }}>
                                            {i === 0 && <div className="deck-label">消費財</div>}
                                        </div>
                                    ))}
                                </div>
                                {/* 建物カードデッキ: デッキ枚数分重ね描画 + ホバーポップアップ */}
                                <div ref={buildingDeckRef} className={`deck-card deck-building ${deckDepthClass(G.deck.length)}`} style={{ position: 'relative' }}>
                                    {Array.from({ length: Math.min(G.deck.length, 20) }).map((_, i) => (
                                        <div key={`build-stack-${i}`} className="deck-top-face" style={{
                                            position: i === 0 ? 'relative' : 'absolute',
                                            inset: i === 0 ? undefined : 0,
                                            zIndex: 20 - i,
                                        }}>
                                            {i === 0 && <div className="deck-label">建物デッキ</div>}
                                        </div>
                                    ))}
                                    <div className="deck-count-popup">枚数: {G.deck.length}</div>
                                </div>
                                {/* 捨て札 */}
                                <div className={`deck-card deck-discard ${deckDepthClass(G.discard.length)}`}
                                    onClick={() => { soundManager.playSFX('click'); setShowDiscard(true); }}
                                    style={{ cursor: 'pointer', position: 'relative' }}>
                                    {/* 最上位8枚の散らばりカード */}
                                    {G.discard.slice(-8).map((c, i) => {
                                        // uidベースの決定論的シード値でランダム性を生成
                                        const seed = c.uid.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
                                        const rot = ((seed % 13) - 6);  // -6 ~ +6 deg
                                        const dx = ((seed * 7 % 7) - 3); // -3 ~ +3 px
                                        const dy = ((seed * 13 % 7) - 3); // -3 ~ +3 px
                                        return (
                                            <div key={c.uid} className="discard-scatter-card"
                                                style={{
                                                    transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`,
                                                    zIndex: i + 1,
                                                    animationDelay: `${i * 0.02}s`,
                                                }}>
                                                <CardBgImage defId={c.defId} />
                                                <div className="discard-scatter-name">{cName(c.defId)}</div>
                                            </div>
                                        );
                                    })}
                                    {/* 枚数バッジ（右上角に小さく表示） */}
                                    {G.discard.length > 0 && (
                                        <div style={{
                                            position: 'absolute', top: 2, right: 2, zIndex: 20,
                                            background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: '1px 4px',
                                            fontSize: 8, color: 'var(--text-dim)', fontWeight: 600, pointerEvents: 'none',
                                        }}>{G.discard.length}</div>
                                    )}
                                </div>
                            </div>

                            {/* 職場エリア: 初期配置 + ラウンド追加 + 売却建物 */}
                            <div className="workplaces-area">
                                <div className="workplaces-layout">
                                    {/* 初期配置エリア: 4列×2行グリッド */}
                                    <div className="initial-workplaces-grid">
                                        {/* 1行目: 採石場/鉱山/学校/(遺跡) */}
                                        {(() => {
                                            const row1Order = ['quarry', 'mine', 'school', 'ruins'];
                                            const row1 = row1Order.map(id => fixedWorkplaces.find(wp => wp.id === id)).filter(Boolean);
                                            return Array.from({ length: 4 }).map((_, col) => {
                                                const wp = row1[col];
                                                if (!wp) return <div key={`init-r1-${col}`} className="workplace-empty" />;
                                                const ok = G.phase === 'work' && canInteract && canPlacePublic(G, curPid, wp);
                                                return (
                                                    <div key={wp.id}
                                                        data-workplace-id={wp.id}
                                                        onPointerDown={() => { if (!workerDragRender) startWorkplacePreview(wp, 2000 + col); }}
                                                        onPointerUp={() => { if (!workerDragRender) endPreview(); }}
                                                        onPointerLeave={() => { if (!workerDragRender) endPreview(); }}
                                                        className={`workplace-card ${ok ? 'workplace-available' : 'game-card-disabled'} ${workerDragRender?.hoveredUid === wp.id ? 'worker-drag-hover' : ''}`}
                                                        style={{ position: 'relative', overflow: 'hidden' }}>
                                                        <WorkplaceBgImage wpId={wp.id} />
                                                        <div style={{ fontWeight: 700, fontSize: 8, color: ok ? 'var(--teal)' : 'var(--text-dim)', position: 'relative', zIndex: 1 }}>{wp.name}</div>
                                                        <div style={{ fontSize: 7, color: 'var(--text-dim)', marginTop: 1, lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{wp.effectText}</div>
                                                        {wp.multipleAllowed && <div style={{ fontSize: 6, color: 'var(--purple)', position: 'relative', zIndex: 1 }}>∞ 複数可</div>}
                                                        {wp.workers.length > 0 && (
                                                            <div style={{ marginTop: 2, display: 'flex', gap: 1, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
                                                                {wp.workers.map((w, i) => <span key={i} className="worker-chip"><img src={getMeepleSrc(w)} className="worker-chip-icon" alt="" />P{w + 1}</span>)}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            });
                                        })()}
                                        {/* 2行目: 大工×N + 空白 */}
                                        {(() => {
                                            const carpenters = fixedWorkplaces.filter(wp => wp.name.includes('大工'));
                                            return Array.from({ length: 4 }).map((_, col) => {
                                                const wp = carpenters[col];
                                                if (!wp) return <div key={`init-r2-${col}`} className="workplace-empty" />;
                                                const ok = G.phase === 'work' && canInteract && canPlacePublic(G, curPid, wp);
                                                return (
                                                    <div key={wp.id}
                                                        data-workplace-id={wp.id}
                                                        onPointerDown={() => { if (!workerDragRender) startWorkplacePreview(wp, 2100 + col); }}
                                                        onPointerUp={() => { if (!workerDragRender) endPreview(); }}
                                                        onPointerLeave={() => { if (!workerDragRender) endPreview(); }}
                                                        className={`workplace-card ${ok ? 'workplace-available' : 'game-card-disabled'} ${workerDragRender?.hoveredUid === wp.id ? 'worker-drag-hover' : ''}`}
                                                        style={{ position: 'relative', overflow: 'hidden' }}>
                                                        <WorkplaceBgImage wpId={wp.id} />
                                                        <div style={{ fontWeight: 700, fontSize: 8, color: ok ? 'var(--teal)' : 'var(--text-dim)', position: 'relative', zIndex: 1 }}>{wp.name}</div>
                                                        <div style={{ fontSize: 7, color: 'var(--text-dim)', marginTop: 1, lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{wp.effectText}</div>
                                                        {wp.workers.length > 0 && (
                                                            <div style={{ marginTop: 2, display: 'flex', gap: 1, position: 'relative', zIndex: 1 }}>
                                                                {wp.workers.map((w, i) => <span key={i} className="worker-chip"><img src={getMeepleSrc(w)} className="worker-chip-icon" alt="" />P{w + 1}</span>)}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>

                                    {/* ラウンド追加エリア: 通常の職場カード表示 + フローティング移動要素 */}
                                    {(() => {
                                        const roundAdded = fixedWorkplaces.filter(wp => wp.addedAtRound > 0);
                                        if (roundAdded.length === 0) return null;
                                        const row1 = roundAdded.filter(wp => wp.addedAtRound >= 2 && wp.addedAtRound <= 5)
                                            .sort((a, b) => a.addedAtRound - b.addedAtRound);
                                        const row2 = roundAdded.filter(wp => wp.addedAtRound >= 6)
                                            .sort((a, b) => a.addedAtRound - b.addedAtRound);
                                        const maxCols = Math.max(row1.length, row2.length, 1);

                                        // 通常の職場カード（アニメ中は非表示）
                                        const SimpleWorkplaceCard = ({ wp, ok }: { wp: typeof roundAdded[0]; ok: boolean }) => {
                                            const isAnimating = roundCardAnim && wp.addedAtRound === roundCardAnim.round;
                                            return (
                                                <div
                                                    ref={(el) => { roundWorkplaceRefs.current[wp.addedAtRound] = el; }}
                                                    data-workplace-id={wp.id}
                                                    onPointerDown={() => { if (!workerDragRender) startWorkplacePreview(wp, 2200 + wp.addedAtRound); }}
                                                    onPointerUp={() => { if (!workerDragRender) endPreview(); }}
                                                    onPointerLeave={() => { if (!workerDragRender) endPreview(); }}
                                                    className={`workplace-card ${ok && !isAnimating ? 'workplace-available' : 'game-card-disabled'} ${workerDragRender?.hoveredUid === wp.id ? 'worker-drag-hover' : ''}`}
                                                    style={{ ...(isAnimating ? { opacity: 0 } : {}), position: 'relative', overflow: 'hidden' }}>
                                                    <WorkplaceBgImage wpId={wp.id} />
                                                    <div style={{ fontWeight: 700, fontSize: 8, color: ok ? 'var(--teal)' : 'var(--text-dim)', position: 'relative', zIndex: 1 }}>{wp.name}</div>
                                                    <div style={{ fontSize: 7, color: 'var(--text-dim)', marginTop: 1, lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{wp.effectText}</div>
                                                    {wp.multipleAllowed && <div style={{ fontSize: 6, color: 'var(--purple)', position: 'relative', zIndex: 1 }}>∞ 複数可</div>}
                                                    {wp.workers.length > 0 && (
                                                        <div style={{ marginTop: 2, display: 'flex', gap: 1, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
                                                            {wp.workers.map((w, i) => <span key={i} className="worker-chip"><img src={getMeepleSrc(w)} className="worker-chip-icon" alt="" />P{w + 1}</span>)}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        };

                                        return (
                                            <>
                                                <div className="round-workplaces-grid" style={{ gridTemplateColumns: `repeat(${maxCols}, var(--pub-card-w))` }}>
                                                    {Array.from({ length: maxCols }).map((_, col) => {
                                                        const wp = row1[col];
                                                        if (!wp) return <div key={`round-r1-${col}`} className="workplace-empty" />;
                                                        const ok = G.phase === 'work' && canInteract && canPlacePublic(G, curPid, wp);
                                                        return <SimpleWorkplaceCard key={wp.id} wp={wp} ok={ok} />;
                                                    })}
                                                    {Array.from({ length: maxCols }).map((_, col) => {
                                                        const wp = row2[col];
                                                        if (!wp) return <div key={`round-r2-${col}`} className="workplace-empty" />;
                                                        const ok = G.phase === 'work' && canInteract && canPlacePublic(G, curPid, wp);
                                                        return <SimpleWorkplaceCard key={wp.id} wp={wp} ok={ok} />;
                                                    })}
                                                </div>
                                                {/* フローティング移動要素: フリップ後のカードがデッキ位置→職場位置へ移動 */}
                                                {roundCardAnim && (roundCardAnim.phase === 'move' || roundCardAnim.phase === 'settled') && roundCardAnim.deckRect && (() => {
                                                    const wpName = getRoundWorkplaceName(roundCardAnim.round);
                                                    const dr = roundCardAnim.deckRect;
                                                    const tr = roundCardAnim.targetRect;
                                                    const isSettled = roundCardAnim.phase === 'settled';
                                                    return (
                                                        <div className="workplace-card" style={{
                                                            position: 'fixed',
                                                            left: isSettled && tr ? tr.left : dr.left,
                                                            top: isSettled && tr ? tr.top : dr.top,
                                                            width: isSettled && tr ? tr.width : dr.width,
                                                            height: isSettled && tr ? tr.height : dr.height,
                                                            zIndex: 200,
                                                            transition: isSettled ? 'left 0.6s cubic-bezier(0.4, 0, 0.2, 1), top 0.6s cubic-bezier(0.4, 0, 0.2, 1), width 0.6s ease, height 0.6s ease' : 'none',
                                                            pointerEvents: 'none',
                                                            overflow: 'hidden',
                                                        }}>
                                                            <WorkplaceBgImage wpId={getRoundWorkplaceId(roundCardAnim.round)} />
                                                            <div style={{ fontSize: 7, color: 'var(--text-dim)', position: 'relative', zIndex: 1 }}>新職場</div>
                                                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', position: 'relative', zIndex: 1 }}>{wpName || '—'}</div>
                                                            <div style={{ fontSize: 7, color: 'var(--text-dim)', position: 'relative', zIndex: 1 }}>R{roundCardAnim.round}</div>
                                                        </div>
                                                    );
                                                })()}
                                            </>
                                        );
                                    })()}
                                </div>

                                {/* 売却建物 */}
                                {soldWorkplaces.length > 0 && (
                                    <div>
                                        <div className="workplaces-row-label" style={{ color: 'var(--green)' }}>
                                            <IconHouse size={8} color="var(--green)" /> 売却建物
                                        </div>
                                        <div className="sold-buildings-area">
                                            <div className="sold-buildings-grid">
                                                {soldWorkplaces.map(wp => {
                                                    const ok = G.phase === 'work' && canInteract && canPlacePublic(G, curPid, wp);
                                                    const def = wp.fromBuildingDefId ? getCardDef(wp.fromBuildingDefId) : null;
                                                    return (
                                                        <div key={wp.id}
                                                            data-workplace-id={wp.id}
                                                            onPointerDown={() => { if (!workerDragRender) startWorkplacePreview(wp, 2300 + soldWorkplaces.indexOf(wp)); }}
                                                            onPointerUp={() => { if (!workerDragRender) endPreview(); }}
                                                            onPointerLeave={() => { if (!workerDragRender) endPreview(); }}
                                                            className={`hand-card building-card-in-field ${ok ? 'hand-card-playable' : ''} ${!ok && wp.workers.length > 0 ? 'building-placed' : ''} ${workerDragRender?.hoveredUid === wp.id ? 'worker-drag-hover' : ''}`}
                                                            style={{
                                                                borderColor: ok ? 'rgba(45, 212, 191, 0.4)' : 'rgba(45, 212, 191, 0.15)',
                                                            }}>
                                                            {wp.fromBuildingDefId && <CardBgImage defId={wp.fromBuildingDefId} />}
                                                            <div style={{ fontWeight: 700, fontSize: 9, lineHeight: 1.2, color: ok ? 'var(--text-primary)' : 'var(--text-dim)', position: 'relative', zIndex: 1 }}>
                                                                {wp.name}
                                                            </div>
                                                            {def && (
                                                                <>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, position: 'relative', zIndex: 1 }}>
                                                                        <span style={{ fontSize: 8, color: 'var(--text-dim)', fontWeight: 600 }}>C{def.cost}</span>
                                                                        <span style={{ fontSize: 8, color: 'var(--gold-dim)', fontWeight: 600 }}>{def.vp}VP</span>
                                                                    </div>
                                                                    <TagBadges defId={wp.fromBuildingDefId!} />
                                                                    {def.effectText && <div style={{ fontSize: 6, color: 'var(--text-dim)', marginTop: 'auto', lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{def.effectText}</div>}
                                                                </>
                                                            )}
                                                            {!def && <div style={{ fontSize: 7, color: 'var(--text-dim)', marginTop: 1, lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{wp.effectText}</div>}
                                                            {wp.workers.length > 0 && (
                                                                <div style={{ marginTop: 2, display: 'flex', gap: 1, position: 'relative', zIndex: 1 }}>
                                                                    {wp.workers.map((w, i) => <span key={i} className="worker-chip"><img src={getMeepleSrc(w)} className="worker-chip-icon" alt="" />P{w + 1}</span>)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* /public-cards-area */}
                        </div>
                    </div>
                </div >

                {/* ====== 下段: 自分の場 ====== */}
                < div className="area-my-field" >
                    {/* 左: ワーカーコマ + 手札 */}
                    < div className="my-hand-section" ref={handAreaRef} >
                        {/* ワーカーコマ */}
                        <div className="worker-tokens" >
                            {
                                Array.from({ length: myPlayer.workers }).map((_, i) => {
                                    const isAvailable = i < myPlayer.availableWorkers;
                                    const canDrag = isAvailable && G.phase === 'work' && canInteract && curPid === myPid;
                                    return (
                                        <img key={i}
                                            src={getMeepleSrc(parseInt(myPid))}
                                            className={`worker-token ${!isAvailable ? 'used' : ''} ${canDrag ? 'draggable' : ''} ${workerDragRender?.workerIndex === i ? 'dragging' : ''}`}
                                            onPointerDown={(e) => {
                                                if (!canDrag) return;
                                                e.preventDefault();
                                                workerDragRef.current = { x: e.clientX, y: e.clientY, hoveredUid: null, workerIndex: i };
                                                setWorkerDragRender({ ...workerDragRef.current });
                                            }}
                                            alt="worker"
                                        />
                                    );
                                })
                            }
                        </div >

                        {/* ① 精算インフォバー: 手札エリアの上 */}
                        {
                            needsCleanup && (
                                <div className="inline-info-bar" style={{ borderColor: 'var(--red)' }}>
                                    <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                                        <span style={{ color: 'var(--red)', fontWeight: 700 }}>{cleanupPlayerState!.selectedIndices.length}/{cleanupPlayerState!.excessCount}</span>枚を選択
                                    </span>
                                    <button onClick={() => { soundManager.playSFX('click'); moves.confirmDiscard(); }}
                                        disabled={cleanupPlayerState!.selectedIndices.length !== cleanupPlayerState!.excessCount}
                                        className="btn-danger" style={{ fontSize: 11, padding: '2px 8px', lineHeight: 1 }}>
                                        ✓
                                    </button>
                                </div>
                            )
                        }
                        {/* ③ 捨て札選択インフォバー: 手札エリアの上 */}
                        {
                            isDiscardPhase && (
                                <div className="inline-info-bar" style={{ borderColor: 'var(--orange)' }}>
                                    <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                                        <span style={{ color: 'var(--red)', fontWeight: 700 }}>{rawG.discardState!.selectedIndices.length}/{rawG.discardState!.count}</span>枚を選択
                                    </span>
                                    <button onClick={() => {
                                        soundManager.playSFX('click');
                                        // build_cost: 建設カード1枚が手札→建物になるため+1
                                        const buildExtra = rawG.discardState!.callbackAction === 'build_cost' ? 1 : 0;
                                        prepareDrawDetection(rawG.discardState!.count + buildExtra);
                                        moves.confirmDiscard();
                                    }}
                                        disabled={rawG.discardState!.selectedIndices.length !== rawG.discardState!.count}
                                        className="btn-danger" style={{ fontSize: 11, padding: '2px 8px', lineHeight: 1 }}>
                                        ✓
                                    </button>
                                    <button onClick={() => { soundManager.playSFX('click'); moves.cancelAction(); }}
                                        className="btn-ghost" style={{ fontSize: 11, padding: '2px 8px', lineHeight: 1 }}>
                                        ✕
                                    </button>
                                </div>
                            )
                        }

                        {/* 手札（直線配置・動的重なり） */}
                        <div className="hand-fan-container" ref={handFanContainerCallbackRef}>
                            {(() => {
                                const showHand = !isOnline || myPid === playerID;
                                if (!showHand) return (
                                    <div className="hand-fan">
                                        <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>手札 {myPlayer.hand.length}枚</div>
                                    </div>
                                );
                                // ドローアニメーション中はrawG（リアル）の手札を使用
                                // frozenGの手札はドロー前のカウントなのでdrawAnimSlotsとの整合性が取れない
                                const handSource = drawAnimRef.current ? (rawG.players[myPid]?.hand ?? myPlayer.hand) : myPlayer.hand;
                                const visibleCards = handSource;
                                // ドロー1_下中は旧枚数のmarginで既存カードの位置をキープ
                                // ドロー2_上開始時(drawAnimSlots=0)に新枚数のmarginに切替→CSSトランジションで滑らかに移動
                                const oldCount = lastMoveRef.current?.handCount ?? visibleCards.length;
                                const overlapForNew = getCardOverlapMargin(visibleCards.length, true);
                                // ドローアニメーション中は常に新枚数のmarginを使用
                                // Phase1でmargin/paddingを事前シフト→Phase2で新カードが最終横位置にそのまま登場
                                const overlapMargin = overlapForNew;

                                // --- paddingLeft 計算: 常に新枚数(visibleCards.length)ベースで中央揃え ---
                                // ドロー時は追加後の枚数で先行計算→既存カードが滑らかに左へ寄る
                                const containerW = containerSize.w - 16; // padding 8px*2
                                const cardH = containerSize.h * 0.84;
                                const cardW = cardH * 63 / 88;
                                const totalCardsWidth = visibleCards.length <= 1
                                    ? cardW
                                    : cardW + (visibleCards.length - 1) * (cardW + overlapForNew);
                                const paddingLeft = Math.max(0, (containerW - totalCardsWidth) / 2);

                                return (
                                    <div className="hand-fan" style={{
                                        paddingLeft,
                                        transition: drawAnimRef.current ? 'padding-left 0.4s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
                                    }}>
                                        {visibleCards.map((c, ci) => {
                                            // ドロー中: 末尾N枚を画面外に配置（ドロー2_上アニメーション用）
                                            const isDrawingCard = drawAnimSlots > 0 && ci >= visibleCards.length - drawAnimSlots;
                                            // ドロー2_上: 新カードのスタガーディレイ計算
                                            // lastMoveRef.handCountが旧カード数 → ci >= 旧カード数 のカードが新カード
                                            const oldCardCount = lastMoveRef.current?.handCount ?? visibleCards.length;
                                            const isNewCard = ci >= oldCardCount;
                                            const newCardStagger = (drawAnimSlots === 0 && drawAnimRef.current && isNewCard)
                                                ? (ci - oldCardCount) * 0.1
                                                : 0;
                                            const drawStyle = isDrawingCard
                                                ? { transform: 'translateY(300%)', transition: 'none' as const, opacity: 0, position: 'absolute' as const, pointerEvents: 'none' as const }
                                                : drawAnimSlots === 0 && drawAnimRef.current && isNewCard
                                                    ? { transform: 'translateY(0)', transition: `transform 0.4s cubic-bezier(0.4, 0, 0.2, 1) ${newCardStagger}s, opacity 0.15s ease ${newCardStagger}s`, opacity: 1 }
                                                    : drawAnimRef.current && !isNewCard && !isDrawingCard
                                                        ? { transition: 'margin-left 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }
                                                        : {};

                                            if (isHidden(c)) {
                                                return (
                                                    <div key={`hidden-${ci}`} className="hand-card hand-card-hidden"
                                                        style={{ marginLeft: ci === 0 ? 0 : overlapMargin, zIndex: ci + 1, ...drawStyle }}>
                                                        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-dim)', textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>🂠</div>
                                                    </div>
                                                );
                                            }
                                            const isCons = isConsumable(c);
                                            const def = isCons ? null : getCardDef(c.defId);
                                            // クリック判定: 建設 / 精算 / 捨て札選択
                                            let canClick = false;
                                            let isSelected = false;
                                            let isExcluded = false;
                                            let clickAction: (() => void) | null = null;

                                            if (canInteract && isBuildPhase && !isCons && def) {
                                                const bs = G.buildState!;
                                                if (bs.action === 'pioneer') {
                                                    canClick = def.tags.includes('farm');
                                                } else {
                                                    const cost = getConstructionCost(myPlayer, c.defId, bs.costReduction);
                                                    canClick = myPlayer.hand.length - 1 >= cost;
                                                }
                                                clickAction = () => { prepareDrawDetection(); moves.selectBuildCard(ci); };
                                            } else if (needsCleanup) {
                                                // 精算: 手札から捨てるカードを選択
                                                isSelected = cleanupPlayerState!.selectedIndices.includes(ci);
                                                canClick = true;
                                                clickAction = () => moves.toggleDiscard(ci);
                                            } else if (isDiscardPhase) {
                                                // 捨て札選択: 建設コスト支払い等
                                                const ds = rawG.discardState!;
                                                const excludeUids = new Set<string>();
                                                if (ds.excludeCardUid) excludeUids.add(ds.excludeCardUid);
                                                if (ds.callbackAction === 'dual_build_cost' && ds.callbackData.buildCardUid2) {
                                                    excludeUids.add(ds.callbackData.buildCardUid2 as string);
                                                }
                                                isExcluded = excludeUids.has(c.uid);
                                                isSelected = ds.selectedIndices.includes(ci);
                                                canClick = !isExcluded;
                                                clickAction = () => moves.toggleDiscard(ci);
                                            }

                                            const selectedStyle = isSelected
                                                ? { transform: 'translateY(-10px)' }
                                                : isExcluded
                                                    ? { borderColor: 'rgba(212, 168, 83, 0.4)', opacity: 0.6 }
                                                    : {};

                                            return (
                                                <div key={c.uid}
                                                    onClick={() => { if (canClick && clickAction && !previewData) { soundManager.playSFX('click'); clickAction(); } }}
                                                    onPointerDown={() => { if (!isCons) startCardPreview(c.defId, ci); }}
                                                    onPointerUp={endPreview}
                                                    onPointerLeave={endPreview}
                                                    className={`hand-card ${isCons ? 'hand-card-consumable' : ''} ${canClick ? 'hand-card-playable' : ''} ${pressingCardIdxRef.current === ci ? 'hand-card-pressing' : ''}`}
                                                    style={{ marginLeft: ci === 0 ? 0 : overlapMargin, zIndex: ci + 1, ...drawStyle, ...selectedStyle }}>
                                                    <CardBgImage defId={c.defId} />
                                                    <div style={{ fontWeight: 700, fontSize: 9, lineHeight: 1.2, color: isCons ? 'var(--text-secondary)' : 'var(--text-primary)', position: 'relative', zIndex: 1 }}>
                                                        {cName(c.defId)}
                                                    </div>
                                                    {def && (
                                                        <>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, position: 'relative', zIndex: 1, opacity: 1 }}>
                                                                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>
                                                                    C{isBuildPhase ? getConstructionCost(myPlayer, c.defId, G.buildState!.costReduction) : def.cost}
                                                                </span>
                                                                <span style={{ fontSize: 10, color: 'var(--gold-light)', fontWeight: 600 }}>{def.vp}VP</span>
                                                            </div>
                                                            <div style={{ opacity: 1 }}><TagBadges defId={c.defId} /></div>
                                                            {def.effectText && <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 'auto', lineHeight: 1.2, position: 'relative', zIndex: 1, opacity: 1 }}>{def.effectText}</div>}
                                                        </>
                                                    )}
                                                    {isCons && <div style={{ fontSize: 7, color: 'var(--text-dim)', marginTop: 2, position: 'relative', zIndex: 1 }}>消費財</div>}
                                                    {isSelected && <div style={{ color: 'var(--red)', fontSize: 8, fontWeight: 700, position: 'relative', zIndex: 1 }}>✓ 捨てる</div>}
                                                    {isExcluded && <div style={{ color: 'var(--gold)', fontSize: 7, position: 'relative', zIndex: 1 }}>建設対象</div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                            {myPlayer.hand.length > 10 && (
                                <div style={{ position: 'absolute', right: -8, bottom: 40, fontSize: 8, color: 'var(--gold-dim)', writingMode: 'vertical-rl' }}>
                                    +{myPlayer.hand.length - 10}枚 →
                                </div>
                            )}
                        </div>
                    </div >

                    {/* 中: 自分の建物 */}
                    < div className="my-buildings-section" >
                        {/* ② 給料日インフォバー: 建物エリアの上 */}
                        {
                            needsPaydaySelling && (() => {
                                const ps = G.paydayState!;
                                const p = G.players[isOnline ? myPid : String(ps.currentPlayerIndex)];
                                const pps = paydayPlayerState!;
                                const selectedVPs = pps.selectedBuildingIndices.map(bi => getCardDef(p.buildings[bi].card.defId).vp);
                                const sellTotal = selectedVPs.reduce((sum, vp) => sum + vp, 0);
                                const totalFunds = p.money + sellTotal;
                                const canAfford = totalFunds >= pps.totalWage;
                                const allSellableCount = p.buildings.filter(b => !getCardDef(b.card.defId).unsellable).length;
                                const allSellableSelected = pps.selectedBuildingIndices.length === allSellableCount;
                                let isExcessive = false;
                                if (selectedVPs.length > 0 && !allSellableSelected) {
                                    const minVP = Math.min(...selectedVPs);
                                    if ((totalFunds - minVP) >= pps.totalWage) isExcessive = true;
                                }
                                const canConfirm = !isExcessive && (canAfford || allSellableSelected);
                                return (
                                    <div className="buildings-info-bar" style={{ borderColor: 'var(--red)' }}>
                                        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                                            💰 給料日 — 賃金<b style={{ color: 'var(--red)' }}>${pps.totalWage}</b> 所持<b style={{ color: 'var(--gold-light)' }}>${p.money}</b>+売却<b style={{ color: 'var(--green)' }}>${sellTotal}</b>
                                        </span>
                                        {isExcessive && <span style={{ fontSize: 9, color: 'var(--red)' }}>⚠ 売りすぎ</span>}
                                        <button onClick={() => { soundManager.playSFX('click'); moves.confirmPaydaySell(); }}
                                            disabled={!canConfirm}
                                            className="btn-danger" style={{ fontSize: 9, padding: '2px 8px' }}>
                                            ✓
                                        </button>
                                    </div>
                                );
                            })()
                        }
                        {/* payday: 売却不要の待機表示 */}
                        {
                            isPaydayPhase && paydayPlayerState && !needsPaydaySelling && !paydayPlayerState.confirmed && (
                                <div className="buildings-info-bar" style={{ borderColor: 'var(--gold)' }}>
                                    <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>💰 給料は自動支払い済み</span>
                                    <button onClick={() => { soundManager.playSFX('click'); moves.confirmPayday(); }}
                                        className="btn-primary" style={{ fontSize: 9, padding: '2px 8px' }}>
                                        ✓
                                    </button>
                                </div>
                            )
                        }
                        {/* ⑤ 建設案内インフォバー: 建物エリアの上 */}
                        {
                            isBuildPhase && (
                                <div className="buildings-info-bar" style={{ borderColor: 'var(--gold)' }}>
                                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <IconHammer size={10} /> 建設するカードを選択
                                    </span>
                                    <button onClick={() => { soundManager.playSFX('click'); moves.cancelAction(); }}
                                        className="btn-ghost" style={{ fontSize: 9, padding: '2px 8px' }}>
                                        ✕ キャンセル
                                    </button>
                                </div>
                            )
                        }

                        <div className="my-buildings-scroll">
                            {myPlayer.buildings.map((b, bi) => {
                                const def = getCardDef(b.card.defId);
                                const canActivate = curPid === myPid && G.phase === 'work' && !b.workerPlaced && canInteract && canPlaceOnBuilding(G, myPlayer, b.card.defId);
                                // payday売却判定
                                const isPaydaySellable = needsPaydaySelling && !def.unsellable;
                                const isPaydaySelected = needsPaydaySelling && (paydayPlayerState?.selectedBuildingIndices ?? []).includes(bi);
                                const color = isPaydaySelected ? 'var(--red)'
                                    : (canActivate || isPaydaySellable) ? 'rgba(45, 212, 191, 0.4)' : 'rgba(45, 212, 191, 0.15)';
                                return (
                                    <div key={`${b.card.defId}-${bi}`}
                                        data-building-uid={b.card.uid}
                                        onClick={(e) => {
                                            // ワーカー配置はドラッグ&ドロップのみ（クリック配置削除）
                                            if (isPaydaySellable) {
                                                const pps2 = paydayPlayerState!;
                                                const alreadySelected = pps2.selectedBuildingIndices.includes(bi);
                                                if (!alreadySelected) {
                                                    const p2 = G.players[isOnline ? myPid : String(G.paydayState!.currentPlayerIndex)];
                                                    const currentSellTotal = pps2.selectedBuildingIndices.reduce((sum: number, si: number) => sum + getCardDef(p2.buildings[si].card.defId).vp, 0);
                                                    if (p2.money + currentSellTotal >= pps2.totalWage) return;
                                                }
                                                soundManager.playSFX('click'); moves.togglePaydaySell(bi);
                                            }
                                        }}
                                        onPointerDown={() => { if (!workerDragRender) startCardPreview(b.card.defId, 1000 + bi); }}
                                        onPointerUp={() => { if (!workerDragRender) endPreview(); }}
                                        onPointerLeave={() => { if (!workerDragRender) endPreview(); }}
                                        className={`hand-card building-card-in-field ${canActivate || isPaydaySellable ? 'hand-card-playable' : ''} ${b.workerPlaced && !isPaydayPhase ? 'building-placed' : ''} ${workerDragRender?.hoveredUid === b.card.uid && canActivate ? 'worker-drag-hover' : ''}`}
                                        style={{
                                            borderColor: color,
                                            ...(isPaydaySelected ? { boxShadow: '0 0 12px rgba(248, 113, 113, 0.3)' } : {}),
                                            ...(needsPaydaySelling && def.unsellable ? { opacity: 0.5 } : {}),
                                        }}
                                        title={`${def.name} (${def.vp}VP) ${def.effectText}`}>
                                        <CardBgImage defId={b.card.defId} />
                                        <div style={{ fontWeight: 700, fontSize: 9, lineHeight: 1.2, color: b.workerPlaced ? 'var(--text-dim)' : 'var(--text-primary)', position: 'relative', zIndex: 1 }}>
                                            {def.name}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, position: 'relative', zIndex: 1 }}>
                                            <span style={{ fontSize: 8, color: 'var(--text-dim)', fontWeight: 600 }}>C{def.cost}</span>
                                            <span style={{ fontSize: 8, color: 'var(--gold-dim)', fontWeight: 600 }}>{def.vp}VP</span>
                                        </div>
                                        <TagBadges defId={b.card.defId} />
                                        {def.effectText && <div style={{ fontSize: 6, color: 'var(--text-dim)', marginTop: 'auto', lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{def.effectText}</div>}
                                        {b.workerPlaced && <img src={getMeepleSrc(parseInt(myPid))} className="worker-on-building-icon" alt="配置済み" />}
                                        {isPaydaySelected && <div style={{ color: 'var(--red)', fontSize: 8, fontWeight: 700, position: 'relative', zIndex: 1 }}>💰 売却</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div >

                    {/* 右: ステータス */}
                    < div className="my-status-panel" >
                        <span className="stat-badge" style={{ fontSize: 9, padding: '2px 6px' }}>
                            <IconMoney size={9} color="var(--gold-light)" /><b style={{ color: 'var(--gold-light)' }}>${myPlayer.money}</b>
                        </span>
                        <span className="stat-badge" style={{ fontSize: 9, padding: '2px 6px' }}>
                            <IconDeck size={9} color="var(--text-secondary)" /><b style={{ color: 'var(--text-secondary)' }}>{myPlayer.hand.length}/{myPlayer.maxHandSize}</b>
                        </span>
                        {
                            myPlayer.unpaidDebts > 0 && (
                                <span className="stat-badge" style={{ fontSize: 9, padding: '2px 6px', borderColor: 'rgba(248,113,113,0.3)' }}>
                                    <b style={{ color: 'var(--red)' }}>Debt {myPlayer.unpaidDebts}</b>
                                </span>
                            )
                        }
                        {
                            myPlayer.vpTokens > 0 && (
                                <span className="stat-badge" style={{ fontSize: 9, padding: '2px 6px' }}>
                                    <IconTrophy size={9} color="var(--gold)" /><b style={{ color: 'var(--gold)' }}>{myPlayer.vpTokens}</b>
                                </span>
                            )
                        }
                    </div >
                </div >
            </div >
        </div >
    );
}

// ============================================================
// ゲームログモーダル
// ============================================================
function LogModal({ log, onClose }: { log: GameState['log']; onClose: () => void }) {
    const bottomRef = useRef<HTMLDivElement>(null);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, []);

    const roundGroups: { round: number; entries: typeof log }[] = [];
    for (const entry of log) {
        const last = roundGroups[roundGroups.length - 1];
        if (last && last.round === entry.round) {
            last.entries.push(entry);
        } else {
            roundGroups.push({ round: entry.round, entries: [entry] });
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#818cf8', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <IconLog size={20} /> ゲームログ
                    </h2>
                    <button onClick={() => { soundManager.playSFX('click'); onClose(); }} className="btn-ghost">閉じる</button>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: '60vh', paddingRight: 4 }}>
                    {roundGroups.map((group, gi) => (
                        <div key={gi}>
                            {group.entries.map((entry, ei) => (
                                <div key={`${gi}-${ei}`}
                                    className={`log-entry ${entry.text.startsWith('===') ? 'log-entry-round' : entry.text.startsWith('---') ? 'log-entry-phase' : 'log-entry-action'}`}>
                                    {entry.text}
                                </div>
                            ))}
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>
            </div>
        </div>
    );
}

// ============================================================
// 設計事務所 5枚選択UI
// ============================================================
function DesignOfficeUI({ G, moves, onBeforeSelect }: { G: GameState; moves: any; onBeforeSelect?: () => void }) {
    const dos = G.designOfficeState!;
    // 選択状態（排他選択: 1枚のみ）
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    // 長押しプレビュー用
    const [previewDefId, setPreviewDefId] = useState<string | null>(null);
    const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clearTimer = () => { if (previewTimer.current) { clearTimeout(previewTimer.current); previewTimer.current = null; } };
    const startCardPreview = (defId: string) => {
        clearTimer();
        previewTimer.current = setTimeout(() => { setPreviewDefId(defId); }, 300);
    };
    const endCardPreview = () => { clearTimer(); };
    const closeCardPreview = () => { clearTimer(); setPreviewDefId(null); };

    return (
        <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            {/* 長押しプレビューオーバーレイ */}
            {previewDefId && (() => {
                const pDef = getCardDef(previewDefId);
                if (!pDef) return null;
                const imgSrc = pDef.image ? `${import.meta.env.BASE_URL}${pDef.image.replace(/^\//, '')}` : null;
                const tagLabel = pDef.tags.includes('farm') ? '🌿 農場' : pDef.tags.includes('factory') ? '🏭 工場' : '🏢 施設';
                return (
                    <div className="card-preview-overlay" onPointerUp={closeCardPreview} onClick={closeCardPreview}>
                        <div className="card-preview-card">
                            <div className="card-preview-image">
                                {imgSrc && <img src={imgSrc} alt={pDef.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            </div>
                            <div className="card-preview-info">
                                <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', marginBottom: 4 }}>{pDef.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{tagLabel}</div>
                                <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                                    <span style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 600 }}>コスト: <b style={{ color: 'var(--gold-light)' }}>C{pDef.cost}</b></span>
                                    <span style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 600 }}>得点: <b style={{ color: 'var(--gold-light)' }}>{pDef.vp}VP</b></span>
                                </div>
                                {pDef.effectText && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{pDef.effectText}</div>}
                            </div>
                        </div>
                    </div>
                );
            })()}
            <div className="modal-content animate-slide-up" style={{ position: 'relative', maxWidth: 700 }}>
                {/* キャンセルボタン廃止 */}
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconSearch size={22} color="var(--gold)" /> 設計事務所
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
                    山札から<b style={{ color: 'var(--teal)' }}>{dos.revealedCards.length}枚</b>公開。
                    <b style={{ color: 'var(--gold)' }}>1枚</b>を選んで確定してください。残りは捨て札になります。
                </p>
                {/* カード5枚1行グリッド */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16, padding: '0 8px 10px' }}>
                    {dos.revealedCards.map((c, ci) => {
                        const isCons = isConsumable(c);
                        const def = isCons ? null : getCardDef(c.defId);
                        const isSelected = selectedIdx === ci;
                        return (
                            <div key={c.uid}
                                onClick={() => {
                                    if (previewDefId) return; // プレビュー中は選択無効
                                    soundManager.playSFX('click');
                                    setSelectedIdx(isSelected ? null : ci);
                                }}
                                onPointerDown={() => { if (!isCons) startCardPreview(c.defId); }}
                                onPointerUp={endCardPreview}
                                onPointerLeave={endCardPreview}
                                className={`hand-card hand-card-playable`}
                                style={{
                                    height: 180,
                                    flexShrink: 1,
                                    cursor: 'pointer',
                                    ...(isSelected ? {
                                        borderColor: 'var(--teal)',
                                        transform: 'translateY(-10px)',
                                        boxShadow: '0 0 12px rgba(45, 212, 191, 0.4)',
                                    } : {}),
                                }}>
                                <CardBgImage defId={c.defId} />
                                {/* カード名 */}
                                <div style={{ fontWeight: 700, fontSize: 9, lineHeight: 1.2, color: isCons ? 'var(--text-secondary)' : 'var(--text-primary)', position: 'relative', zIndex: 1 }}>
                                    {cName(c.defId)}
                                </div>
                                {def && (
                                    <>
                                        {/* コスト・VP */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, position: 'relative', zIndex: 1 }}>
                                            <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>C{def.cost}</span>
                                            <span style={{ fontSize: 10, color: 'var(--gold-light)', fontWeight: 600 }}>{def.vp}VP</span>
                                        </div>
                                        {/* 属性タグ */}
                                        <TagBadges defId={c.defId} />
                                        {/* 説明文 */}
                                        {def.effectText && <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 'auto', lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{def.effectText}</div>}
                                    </>
                                )}
                                {isCons && <div style={{ fontSize: 7, color: 'var(--text-dim)', marginTop: 2, position: 'relative', zIndex: 1 }}>消費財</div>}
                                {/* 選択マーク */}
                                {isSelected && <div style={{ position: 'absolute', top: 4, right: 4, fontSize: 14, zIndex: 2 }}>✓</div>}
                            </div>
                        );
                    })}
                </div>
                {/* 確定ボタン */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button
                        onClick={() => { if (selectedIdx !== null) { soundManager.playSFX('click'); onBeforeSelect?.(); moves.selectDesignOfficeCard(selectedIdx); } }}
                        disabled={selectedIdx === null}
                        className="btn-primary"
                        style={{ fontSize: 11, padding: '4px 16px', lineHeight: 1 }}>
                        ✓
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// 二胡市建設 選択UI
// ============================================================
function DualConstructionUI({ G, moves, pid }: { G: GameState; moves: any; pid: string }) {
    const ds = G.dualConstructionState!;
    const p = G.players[pid];

    const costGroups: Record<number, number> = {};
    for (const c of p.hand) {
        if (!isConsumable(c)) {
            const def = getCardDef(c.defId);
            costGroups[def.cost] = (costGroups[def.cost] || 0) + 1;
        }
    }
    const validCosts = new Set(Object.entries(costGroups).filter(([_, count]) => count >= 2).map(([cost]) => parseInt(cost)));

    const firstSelectedCost = ds.selectedCardIndices.length > 0
        ? getCardDef(p.hand[ds.selectedCardIndices[0]].defId).cost
        : null;

    let canConfirm = ds.selectedCardIndices.length === 2;
    if (canConfirm) {
        const c1 = p.hand[ds.selectedCardIndices[0]];
        const cost = getCardDef(c1.defId).cost;
        const remaining = p.hand.length - 2;
        if (remaining < cost) canConfirm = false;
    }

    return (
        <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="modal-content animate-slide-up" style={{ position: 'relative' }}>
                <button onClick={() => { soundManager.playSFX('click'); moves.cancelAction(); }} className="btn-ghost" style={{ position: 'absolute', top: 16, right: 16 }}>✕ キャンセル</button>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconHammer size={22} color="var(--gold)" /> 二胡市建設
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>
                    同じコストの建物カードを<b style={{ color: 'var(--gold)' }}>2枚</b>選択してください（コストは1つ分のみ支払い）
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>選択中: {ds.selectedCardIndices.length}/2枚</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {p.hand.map((c, ci) => {
                        const isCons = isConsumable(c);
                        if (isCons) return (
                            <div key={c.uid} className="game-card game-card-disabled" style={{ minWidth: 100 }}>
                                <div style={{ fontWeight: 700, fontSize: 12 }}>消費財</div>
                            </div>
                        );
                        const def = getCardDef(c.defId);
                        const selected = ds.selectedCardIndices.includes(ci);
                        let selectable = false;
                        if (selected) selectable = true;
                        else if (ds.selectedCardIndices.length >= 2) selectable = false;
                        else if (firstSelectedCost !== null) selectable = def.cost === firstSelectedCost;
                        else selectable = validCosts.has(def.cost);

                        return (
                            <div key={c.uid} onClick={() => selectable && (soundManager.playSFX('click'), moves.toggleDualCard(ci))}
                                className={`game-card ${selected ? 'game-card-selected' : selectable ? 'game-card-clickable' : 'game-card-disabled'}`}
                                style={{ minWidth: 100 }}>
                                <div style={{ fontWeight: 700, fontSize: 12 }}>{def.name}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>C{def.cost}/{def.vp}VP</div>
                                <TagBadges defId={c.defId} />
                                {selected && <div style={{ color: 'var(--gold)', fontSize: 11, marginTop: 4, fontWeight: 700 }}>✓ 選択中</div>}
                            </div>
                        );
                    })}
                </div>
                <button onClick={() => { soundManager.playSFX('click'); moves.confirmDualConstruction(); }}
                    disabled={!canConfirm}
                    className="btn-primary">
                    ✅ 建設決定（{ds.selectedCardIndices.length}/2枚選択中）
                </button>
            </div>
        </div>
    );
}

// ============================================================
// 捨てカード選択UI
// ============================================================
function DiscardUI({ G, moves, pid, onBeforeConfirm }: { G: GameState; moves: any; pid: string; onBeforeConfirm?: (discardCount: number) => void }) {
    const ds = G.discardState!;
    const p = G.players[pid];

    const excludeUids = new Set<string>();
    if (ds.excludeCardUid) excludeUids.add(ds.excludeCardUid);
    if (ds.callbackAction === 'dual_build_cost' && ds.callbackData.buildCardUid2) {
        excludeUids.add(ds.callbackData.buildCardUid2 as string);
    }

    return (
        <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="modal-content animate-slide-up" style={{ position: 'relative', maxWidth: 750 }}>
                <button onClick={() => { soundManager.playSFX('click'); moves.cancelAction(); }} className="btn-ghost" style={{ position: 'absolute', top: 16, right: 16 }}>✕ キャンセル</button>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconTrash size={22} color="var(--gold)" /> カードを捨てる
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
                    {ds.reason} — <b style={{ color: 'var(--red)' }}>{ds.count}枚</b>選択してください（選択中: {ds.selectedIndices.length}枚）
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {p.hand.map((c, ci) => {
                        const excluded = excludeUids.has(c.uid);
                        const selected = ds.selectedIndices.includes(ci);
                        const isCons = isConsumable(c);
                        return (
                            <div key={c.uid}
                                onClick={() => !excluded && (soundManager.playSFX('click'), moves.toggleDiscard(ci))}
                                className={`game-card ${excluded ? '' : 'game-card-clickable'}`}
                                style={{
                                    minWidth: 100,
                                    ...(excluded ? { borderColor: 'rgba(212, 168, 83, 0.3)', background: 'rgba(212, 168, 83, 0.08)', opacity: 0.6, cursor: 'not-allowed' } : {}),
                                    ...(selected ? { borderColor: 'var(--red)', boxShadow: '0 0 15px rgba(248, 113, 113, 0.2)' } : {}),
                                }}>
                                <div style={{ fontWeight: 700, fontSize: 12 }}>{cName(c.defId)}</div>
                                {excluded && <div style={{ fontSize: 9, color: 'var(--gold)' }}>建設対象</div>}
                                {!isCons && !excluded && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>C{getCardDef(c.defId).cost}/{getCardDef(c.defId).vp}VP</div>}
                                <TagBadges defId={c.defId} />
                                {selected && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 4, fontWeight: 700 }}>✓ 捨てる</div>}
                            </div>
                        );
                    })}
                </div>
                <button onClick={() => { soundManager.playSFX('click'); onBeforeConfirm?.(ds.count); moves.confirmDiscard(); }}
                    disabled={ds.selectedIndices.length !== ds.count}
                    className="btn-danger">
                    ✅ 確定（{ds.selectedIndices.length}/{ds.count}）
                </button>
            </div>
        </div>
    );
}

// ============================================================
// 給料日UI
// ============================================================
function PaydayUI({ G, moves, myPid, isOnline }: { G: GameState; moves: any; myPid: string; isOnline: boolean }) {
    const ps = G.paydayState!;

    // P2P時: 自分のplayerStatesを使う / ホットシート: currentPlayerIndexを使う
    const targetPid = isOnline ? myPid : String(ps.currentPlayerIndex);
    const pps = ps.playerStates[targetPid];
    const p = G.players[targetPid];

    // 確認済みまたは売却不要 → 待機画面
    if (pps && (pps.confirmed || !pps.needsSelling)) {
        const waiting = Object.entries(ps.playerStates).filter(([_, s]) => !s.confirmed);
        return (
            <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div className="glass-card animate-slide-up" style={{ padding: 40, maxWidth: 420, width: '100%', textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 2s ease-in-out infinite' }}>💰</div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>給料日処理中...</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>あなたの賌金は自動支払い済みです</p>
                    {waiting.length > 0 && <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 8 }}>待機中: {waiting.map(([pid]) => `P${parseInt(pid) + 1}`).join(', ')}</p>}
                </div>
            </div>
        );
    }

    // 売却操作が必要なプレイヤーのUI
    const selectedVPs = (pps?.selectedBuildingIndices ?? []).map(bi => getCardDef(p.buildings[bi].card.defId).vp);
    const sellTotal = selectedVPs.reduce((sum, vp) => sum + vp, 0);
    const totalWage = pps?.totalWage ?? ps.totalWage;
    const totalFunds = p.money + sellTotal;
    const canAfford = totalFunds >= totalWage;
    const shortage = totalWage - p.money;

    const allSellableCount = p.buildings.filter(b => !getCardDef(b.card.defId).unsellable).length;
    const allSellableSelected = (pps?.selectedBuildingIndices ?? []).length === allSellableCount;

    let isExcessive = false;
    if (selectedVPs.length > 0 && !allSellableSelected) {
        const minVP = Math.min(...selectedVPs);
        if ((totalFunds - minVP) >= totalWage) isExcessive = true;
    }

    const canConfirm = !isExcessive && (canAfford || allSellableSelected);

    return (
        <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="modal-content animate-slide-up" style={{ maxWidth: 640 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconPayment size={22} color="var(--gold)" /> 給料日 — P{parseInt(targetPid) + 1}
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div className="glass-card" style={{ padding: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>賌金</div>
                        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                            ${ps.wagePerWorker}/人 × {Math.max(0, p.workers - p.robotWorkers)}人 = <span style={{ color: 'var(--red)' }}>${totalWage}</span>
                        </div>
                    </div>
                    <div className="glass-card" style={{ padding: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>所持金 + 売却</div>
                        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                            <span style={{ color: 'var(--gold-light)' }}>${p.money}</span> + <span style={{ color: 'var(--green)' }}>${sellTotal}</span> = <span style={{ color: totalFunds >= totalWage ? 'var(--green)' : 'var(--red)' }}>${totalFunds}</span>
                        </div>
                    </div>
                </div>

                {shortage > 0 && <p style={{ color: 'var(--red)', marginBottom: 12, fontSize: 13 }}>⚠️ 不足: ${shortage} — 建物を売却してください（1VP=$1）</p>}

                {p.buildings.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <IconHouse size={14} /> 建物（クリックで売却選択/解除）:
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                            {p.buildings.map((b, bi) => {
                                const def = getCardDef(b.card.defId);
                                const selected = (pps?.selectedBuildingIndices ?? []).includes(bi);
                                const disabled = def.unsellable;
                                return (
                                    <div key={b.card.uid} onClick={() => !disabled && (soundManager.playSFX('click'), moves.togglePaydaySell(bi))}
                                        className={`game-card ${disabled ? 'game-card-disabled' : 'game-card-clickable'}`}
                                        style={{
                                            ...(selected ? { borderColor: 'var(--gold)', boxShadow: 'var(--glow-gold)' } : {}),
                                        }}>
                                        <div style={{ fontWeight: 700, fontSize: 12 }}>{def.name}</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{def.vp}VP = <b style={{ color: 'var(--gold-light)' }}>${def.vp}</b></div>
                                        {disabled && <div style={{ color: 'var(--red)', fontSize: 9 }}>売却不可</div>}
                                        {selected && <div style={{ color: 'var(--gold)', fontSize: 11, marginTop: 3, fontWeight: 700 }}>✓ 売却</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {isExcessive && <p style={{ color: 'var(--orange)', fontSize: 12, marginBottom: 8 }}>⚠️ 余分に建物を売ることはできません</p>}

                <button onClick={() => {
                    soundManager.playSFX('click');
                    moves.confirmPaydaySell();
                }}
                    disabled={!canConfirm}
                    className="btn-primary">
                    <IconPayment size={16} /> 支払い確定{!canAfford && allSellableSelected ? `（不足$${totalWage - totalFunds}は負債）` : ''}
                </button>
            </div>
        </div>
    );
}

// ============================================================
// 精算UI
// ============================================================
function CleanupUI({ G, moves, myPid, isOnline }: { G: GameState; moves: any; myPid: string; isOnline: boolean }) {
    const cs = G.cleanupState!;

    // P2P時: 自分のplayerStatesを使う / ホットシート: currentPlayerIndexを使う
    const targetPid = isOnline ? myPid : String(cs.currentPlayerIndex);
    const cps = cs.playerStates[targetPid];
    const p = G.players[targetPid];

    // 確認済みまたは精算不要 → 待機画面
    if (cps && (cps.confirmed || cps.excessCount === 0)) {
        const waiting = Object.entries(cs.playerStates).filter(([_, s]) => !s.confirmed);
        return (
            <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div className="glass-card animate-slide-up" style={{ padding: 40, maxWidth: 420, width: '100%', textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 2s ease-in-out infinite' }}>🗑️</div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>精算処理中...</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>あなたの手札整理は完了しています</p>
                    {waiting.length > 0 && <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 8 }}>待機中: {waiting.map(([pid]) => `P${parseInt(pid) + 1}`).join(', ')}</p>}
                </div>
            </div>
        );
    }

    const excessCount = cps?.excessCount ?? cs.excessCount;
    const selectedIndices = cps?.selectedIndices ?? cs.selectedIndices;

    return (
        <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="modal-content animate-slide-up" style={{ maxWidth: 750 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconTrash size={22} color="var(--gold)" /> 精算 — P{parseInt(targetPid) + 1}
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
                    手札上限 {p.maxHandSize}枚を超えています。<b style={{ color: 'var(--red)' }}>{excessCount}枚</b>捨ててください（選択中: {selectedIndices.length}枚）
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {p.hand.map((c, ci) => {
                        const selected = selectedIndices.includes(ci);
                        return (
                            <div key={c.uid} onClick={() => { soundManager.playSFX('click'); moves.toggleDiscard(ci); }}
                                className={`game-card game-card-clickable`}
                                style={{
                                    minWidth: 90,
                                    ...(selected ? { borderColor: 'var(--red)', boxShadow: '0 0 15px rgba(248, 113, 113, 0.2)' } : {}),
                                }}>
                                <div style={{ fontWeight: 700, fontSize: 12 }}>{cName(c.defId)}</div>
                                {!isConsumable(c) && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>C{getCardDef(c.defId).cost}/{getCardDef(c.defId).vp}VP</div>}
                                <TagBadges defId={c.defId} />
                                {selected && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 3, fontWeight: 700 }}>✓ 捨てる</div>}
                            </div>
                        );
                    })}
                </div>
                <button onClick={() => { soundManager.playSFX('click'); moves.confirmDiscard(); }}
                    disabled={selectedIndices.length !== excessCount}
                    className="btn-danger">
                    ✅ 確定（{selectedIndices.length}/{excessCount}）
                </button>
            </div>
        </div>
    );
}

// ============================================================
// 捨て札表示モーダル
// ============================================================
function DiscardPileModal({ discard, onClose }: { discard: GameState['discard']; onClose: () => void }) {
    const groups: Record<string, number> = {};
    for (const c of discard) {
        const n = cName(c.defId);
        groups[n] = (groups[n] || 0) + 1;
    }
    const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--orange)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconDiscard size={20} color="var(--orange)" /> 捨て札（{discard.length}枚）
                </h2>
                {entries.length === 0 ? <p style={{ color: 'var(--text-dim)' }}>なし</p> : (
                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text-dim)', fontWeight: 500 }}>カード名</th>
                                <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text-dim)', fontWeight: 500 }}>枚数</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map(([name, count]) => (
                                <tr key={name} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <td style={{ padding: '5px 0' }}>{name}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 0', color: 'var(--orange)', fontWeight: 700 }}>{count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <button onClick={() => { soundManager.playSFX('click'); onClose(); }} className="btn-ghost" style={{ marginTop: 16 }}>閉じる</button>
            </div>
        </div>
    );
}

// ============================================================
// ゲーム終了
// ============================================================
function GameOver({ G }: { G: GameState }) {
    const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null);
    const [expandedDebt, setExpandedDebt] = useState<number | null>(null);
    const [showFinalLog, setShowFinalLog] = useState(false);
    useEffect(() => {
        soundManager.playSFX('win');
    }, []);

    if (!G.finalScores) return null;
    return (
        <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="modal-content animate-slide-up" style={{ maxWidth: 700 }}>
                <h1 className="trophy-glow" style={{ textAlign: 'center', fontSize: 32, fontWeight: 900, color: 'var(--gold)', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                    <IconTrophy size={48} color="var(--gold)" /> ゲーム終了！
                </h1>
                {G.finalScores.map((s, i) => {
                    const isExpanded = expandedPlayer === s.playerIndex;
                    const isDebtExpanded = expandedDebt === s.playerIndex;
                    return (
                        <div key={s.playerIndex} className="glass-card" style={{
                            marginBottom: 12, padding: 16,
                            ...(i === 0 ? { borderColor: 'rgba(212, 168, 83, 0.3)', boxShadow: 'var(--glow-gold)' } : {}),
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span style={{ fontSize: 28 }}>{['🥇', '🥈', '🥉'][i] || `${i + 1}位`}</span>
                                    <span style={{ fontWeight: 700, fontSize: 18 }}>P{s.playerIndex + 1}</span>
                                </div>
                                <span style={{ fontSize: 28, fontWeight: 900, color: 'var(--gold)' }}>{s.breakdown.total}VP</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
                                <div className="glass-card" style={{ padding: 10 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>建物合計</div>
                                    <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 16 }}>{s.breakdown.buildingVP + s.breakdown.bonusVP}VP</div>
                                    <button onClick={() => { soundManager.playSFX('click'); setExpandedPlayer(isExpanded ? null : s.playerIndex); }} className="btn-ghost" style={{ fontSize: 9, marginTop: 4, padding: '1px 6px' }}>
                                        {isExpanded ? '▲ 閉じる' : '▼ 内訳'}
                                    </button>
                                </div>
                                <div className="glass-card" style={{ padding: 10 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>所持金</div>
                                    <div style={{ fontWeight: 700, color: 'var(--gold-light)', fontSize: 16 }}>{s.breakdown.moneyVP}VP</div>
                                </div>
                                <div className="glass-card" style={{ padding: 10 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>未払い賃金</div>
                                    <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: 16 }}>{s.breakdown.debtVP}VP</div>
                                    {s.breakdown.rawDebts > 0 && (
                                        <button onClick={() => { soundManager.playSFX('click'); setExpandedDebt(isDebtExpanded ? null : s.playerIndex); }} className="btn-ghost" style={{ fontSize: 9, marginTop: 4, padding: '1px 6px' }}>
                                            {isDebtExpanded ? '▲ 閉じる' : '▼ 内訳'}
                                        </button>
                                    )}
                                </div>
                            </div>
                            {isExpanded && s.breakdown.buildingDetails && (
                                <div className="glass-card" style={{ marginTop: 8, padding: 12 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>📋 建物VP内訳:</div>
                                    {s.breakdown.buildingDetails.map((bd, bdi) => (
                                        <div key={bdi} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{ fontSize: 12 }}>{bd.name}</span>
                                            <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
                                                {bd.bonusVP > 0 ? `${bd.baseVP} + ${bd.bonusVP}` : `${bd.baseVP}`}VP
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {isDebtExpanded && s.breakdown.rawDebts > 0 && (
                                <div className="glass-card" style={{ marginTop: 8, padding: 12 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>📋 未払い賃金内訳:</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <span>未払い賃金カード</span>
                                        <span style={{ color: 'var(--red)' }}>{s.breakdown.rawDebts}枚 × -3 = {s.breakdown.rawDebts * -3}VP</span>
                                    </div>
                                    {s.breakdown.hasLawOffice && s.breakdown.exemptedDebts > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span>法律事務所による免除</span>
                                            <span style={{ color: 'var(--green)' }}>+{s.breakdown.exemptedDebts * 3}VP（{s.breakdown.exemptedDebts}枚免除）</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', marginTop: 4, fontWeight: 700, fontSize: 12 }}>
                                        <span>合計</span>
                                        <span style={{ color: 'var(--red)' }}>{s.breakdown.debtVP}VP</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
                <div style={{ textAlign: 'center', marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button onClick={() => { soundManager.playSFX('click'); setShowFinalLog(!showFinalLog); }} className="btn-ghost" style={{ padding: '10px 20px' }}>
                        📜 ゲームログ
                    </button>
                    <button onClick={() => { soundManager.playSFX('click'); window.location.reload(); }} className="btn-primary" style={{ padding: '10px 28px', fontSize: 16 }}>
                        🔄 もう一度
                    </button>
                </div>
                {showFinalLog && <LogModal log={G.log} onClose={() => setShowFinalLog(false)} />}
            </div>
        </div>
    );
}

// ============================================================
// 配置可能チェック（公共職場）— game.tsの共有関数を利用
// ============================================================
function canPlacePublic(G: GameState, pid: string, wp: GameState['publicWorkplaces'][0]): boolean {
    const p = G.players[pid];
    if (p.availableWorkers <= 0) return false;
    if (!wp.multipleAllowed && wp.workers.length > 0) return false;

    if (wp.specialEffect === 'hire_worker' && p.workers >= p.maxWorkers) return false;
    if (wp.specialEffect === 'expand4' && p.workers >= 4) return false;
    if (wp.specialEffect === 'expand5' && p.workers >= 5) return false;
    if (wp.specialEffect === 'hire_immediate' && p.workers >= p.maxWorkers) return false;

    if (wp.specialEffect === 'build' && !canBuildAnything(p, 0)) return false;

    const sell = wp.specialEffect.match(/^sell_(\d+)_(\d+)$/);
    if (sell) {
        if (p.hand.length < parseInt(sell[1])) return false;
        if (G.household < parseInt(sell[2])) return false;
    }

    // 建物由来の職場はgame.tsの共有関数で判定（Glory拡張にも対応）
    if (wp.fromBuildingDefId) {
        const def = getCardDef(wp.fromBuildingDefId);
        if (def.unsellable && wp.fromBuildingDefId !== 'slash_burn') return false;
        if (!canPlaceOnBuilding(G, p, wp.fromBuildingDefId)) return false;
    }
    return true;
}
