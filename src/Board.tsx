// ============================================================
// Board.tsx  –  メインUI (v8: 3カラムレイアウト + エフェクト)
// ============================================================
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import type { GameState, Card, PlayerState, Workplace, PaydayPlayerState } from './types';
import { getConstructionCost, isConsumable, getWagePerWorker, canBuildAnything, canBuildFarmFree, canDualConstruct, canPlaceOnBuilding, getRoundWorkplaceInfo } from './game';
import { TIMING, FEATURE_DEFAULTS } from './constants';
import type { FeatureFlags } from './constants';
import { DebugPanel } from './components/DebugPanel';
import { decideCPUMove } from './bots';
import type { CPUConfig } from './App';
import { soundManager } from './SoundManager';
import { SoundSettings } from './SoundSettings';
import { CPUSettings } from './CPUSettings';
import { useAnimations } from './components/AnimationLayer';
import { BgImageOverlay } from './components/BgImageOverlay';
import { getThemedCardImagePath, getThemedWorkplaceImagePath } from './themeUtils';
import './cpu-anim.css';
// HandScene3D は現在未使用（ポンチ絵ベースのHTMLレイアウトに置換済み）
import {
    IconMoney, IconWorker, IconHouse, IconDeck, IconDiscard, IconLog,
    IconHammer, IconRobot, IconPlayer, IconSearch, IconTrash, IconPayment,
    IconTrophy, IconSoundOn, IconSoundOff, IconFullscreen, IconFullscreenExit,
    TagFarm, TagFactory, TagLock
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
function getPlayerDisplayName(playerNames: GameState['playerNames'] | undefined, playerId: string | number): string {
    const pid = String(playerId);
    const fallback = `P${Number(pid) + 1}`;
    const rawName = playerNames?.[pid];
    if (typeof rawName !== 'string') return fallback;
    const trimmed = rawName.trim();
    return trimmed || fallback;
}
function shortenPlayerDisplayName(name: string, maxLength: number = 10): string {
    if (name.length <= maxLength) return name;
    return `${name.slice(0, Math.max(1, maxLength - 1))}…`;
}
const opponentConsumableCardStyle: React.CSSProperties = {
    background: 'linear-gradient(170deg, rgba(87, 83, 78, 1) 0%, rgba(50, 46, 42, 1) 100%)',
    borderColor: 'rgba(168, 162, 158, 0.15)',
};
const opponentRevealedCardStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, var(--teal-15), rgba(30,30,40,0.9))',
};
const MOBILE_TOUCH_UI_QUERY = '(max-width: 900px) and (pointer: coarse)';
function matchesMobileTouchUi(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(MOBILE_TOUCH_UI_QUERY).matches;
}

type FullscreenCapableDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitFullscreenEnabled?: boolean;
    webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenCapableElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
};

/** ラウンドごとの追加職場名マッピング (game.ts getRoundWorkplaceInfoから取得) */
function getRoundWorkplaceName(round: number): string {
    return getRoundWorkplaceInfo(round)?.name ?? '';
}

/** タグバッジ JSX */
function TagBadges({ defId, compact = false }: { defId: string; compact?: boolean }) {
    if (defId === CONSUMABLE_DEF_ID) return null;
    const d = getCardDef(defId);
    return (
        <div style={{ display: 'flex', gap: compact ? 2 : 4, flexWrap: 'wrap', marginTop: compact ? 2 : 4, position: 'relative', zIndex: 1 }}>
            {d.tags.includes('farm') && <span className="tag-badge tag-farm"><TagFarm size={"calc(var(--fs) * 1.11)"} /> 農園</span>}
            {d.tags.includes('factory') && <span className="tag-badge tag-factory"><TagFactory size={"calc(var(--fs) * 1.11)"} /> 工場</span>}
            {d.unsellable && <span className="tag-badge tag-lock"><TagLock size={"calc(var(--fs) * 1.11)"} /> 売却不可</span>}
        </div>
    );
}

/** effectText内の数値・キーワードを自動ハイライトして表示（Slay the Spire風） */
function renderEffectText(text: string): React.ReactNode {
    if (!text) return null;
    // 数値パターン: $15, 5枚, 3枚, +3VP, +6VP, -1, 2つ, 1人, 4枚
    // キーワード: 消費財, 農園, 工場, 売却不可, 手札, 山札, 捨て札, 家計, 負債, 労働者
    const pattern = /(\$\d+|\d+枚|\d+つ|\d+人|[+\-]\d+VP|\d+VP|コスト[+\-]?\d+|[※]?農園|[※]?工場|売却不可|消費財|手札|山札|捨て札|家計|負債トークン|負債|労働者|建物|建設|無料)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        const m = match[0];
        // 数値系: ゴールドで太字, キーワード系: ティール色
        const isNumeric = /^\$?\d|^[+\-]\d|^コスト/.test(m);
        parts.push(
            <b key={key++} style={{
                color: isNumeric ? 'var(--gold-light)' : 'var(--teal)',
                fontWeight: 700,
            }}>{m}</b>
        );
        lastIndex = pattern.lastIndex;
    }
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }
    return parts;
}

/** カード背景画像: テキストの背面に半透明で表示 */
function CardBgImage({ defId }: { defId: string }) {
    if (defId === CONSUMABLE_DEF_ID) return null;
    const d = getCardDef(defId);
    if (!d.image) return null;
    const themedPath = getThemedCardImagePath(d.image);
    return <BgImageOverlay src={`${import.meta.env.BASE_URL}${themedPath.replace(/^\//, '')}`} />;
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
    const themedImg = getThemedWorkplaceImagePath(img);
    return <BgImageOverlay src={`${import.meta.env.BASE_URL}${themedImg}`} />;
}

/** CPU自動プレイ用: GameStateのフェーズ・選択状態を一意表現する文字列を生成
 *  P2Pの非同期更新で同じstateに対してmoveを重複発行するのを防止する */
function computeCpuStateSignature(G: GameState, activePid: string): string {
    const parts: string[] = [G.phase, String(G.round), String(G.activePlayer), activePid, String(G.log.length)];
    if (G.discardState) parts.push('ds', String(G.discardState.count), ...G.discardState.selectedIndices.map(String));
    if (G.paydayState) {
        const pps = G.paydayState.playerStates[activePid];
        if (pps) parts.push(
            'ps',
            pps.step,
            String(pps.confirmed),
            String(pps.excessCount),
            ...pps.selectedBuildingIndices.map(String),
            ...pps.selectedIndices.map(i => `d${i}`)
        );
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
    // NPC手札表示トグル（pid → 表示中かどうか）
    const [npcHandVisible, setNpcHandVisible] = useState<Record<string, boolean>>({});
    // CPUミープル飛行アニメーション中フラグ（useEffect再発火防止用）
    const cpuAnimInProgressRef = useRef(false);
    // フィーチャーフラグ (デバッグパネルでリアルタイム切替可能)
    const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({ ...FEATURE_DEFAULTS });
    const [showDebugPanel, setShowDebugPanel] = useState(false);
    const [isMobileTouchUi, setIsMobileTouchUi] = useState(matchesMobileTouchUi);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isFullscreenSupported, setIsFullscreenSupported] = useState(false);
    const boardLayoutRef = useRef<HTMLDivElement | null>(null);
    // 手札長押し/ホバープレビュー用
    // プレビューデータ型: カード or 公共職場
    type PreviewData =
        | { type: 'card'; defId: string }
        | { type: 'workplace'; wpId: string; name: string; effectText: string; multipleAllowed: boolean };
    type HoverPreviewMode = 'auto' | 'above-hand';
    type PlacementDelta =
        | { playerId: string; moveName: 'placeWorker'; targetId: string }
        | { playerId: string; moveName: 'placeWorkerOnBuilding'; targetId: string };
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const previewDataRef = useRef<PreviewData | null>(null);
    const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const previewSourceRef = useRef<'press' | 'hover' | null>(null);
    const isMobileTouchUiRef = useRef(isMobileTouchUi);
    // pressingCardIdxはuseRefで管理（再レンダリングによるonPointerLeave発火を防ぐ）
    const pressingCardIdxRef = useRef<number | null>(null);
    const hoverPreviewModeRef = useRef<HoverPreviewMode>('auto');
    // ホバープレビュー中かどうかのフラグ（閉じ方の制御用）
    const isHoverPreviewRef = useRef(false);
    // ホバープレビュー元カードの位置（カーソル離脱検知用）
    const hoverCardRectRef = useRef<DOMRect | null>(null);
    const animationRectCacheRef = useRef<{
        players: Record<string, DOMRect>;
        workplaces: Record<string, DOMRect>;
        buildings: Record<string, DOMRect>;
    }>({
        players: {},
        workplaces: {},
        buildings: {},
    });
    const handledPlacementAnimationSeqRef = useRef(rawG.lastPlacementEvent?.seq ?? 0);
    const activePlacementAnimationSeqRef = useRef<number | null>(null);
    useEffect(() => {
        previewDataRef.current = previewData;
    }, [previewData]);
    useEffect(() => {
        isMobileTouchUiRef.current = isMobileTouchUi;
    }, [isMobileTouchUi]);
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const media = window.matchMedia(MOBILE_TOUCH_UI_QUERY);
        const update = () => setIsMobileTouchUi(media.matches);
        update();
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', update);
            return () => media.removeEventListener('change', update);
        }
        media.addListener(update);
        return () => media.removeListener(update);
    }, []);
    const syncFullscreenState = useCallback(() => {
        if (typeof document === 'undefined') return;
        const doc = document as FullscreenCapableDocument;
        const target = boardLayoutRef.current as FullscreenCapableElement | null;
        setIsFullscreen(Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement));
        setIsFullscreenSupported(Boolean(
            doc.fullscreenEnabled ||
            doc.webkitFullscreenEnabled ||
            target?.requestFullscreen ||
            target?.webkitRequestFullscreen
        ));
    }, []);
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const update = () => syncFullscreenState();
        update();
        document.addEventListener('fullscreenchange', update);
        document.addEventListener('webkitfullscreenchange', update as EventListener);
        return () => {
            document.removeEventListener('fullscreenchange', update);
            document.removeEventListener('webkitfullscreenchange', update as EventListener);
        };
    }, [syncFullscreenState]);
    const toggleFullscreen = useCallback(async () => {
        if (typeof document === 'undefined') return;
        const doc = document as FullscreenCapableDocument;
        const target = boardLayoutRef.current as FullscreenCapableElement | null;
        if (!target) return;
        soundManager.playSFX('click');
        try {
            if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
                if (doc.exitFullscreen) {
                    await doc.exitFullscreen();
                } else if (doc.webkitExitFullscreen) {
                    await doc.webkitExitFullscreen();
                }
                return;
            }
            if (target.requestFullscreen) {
                try {
                    await target.requestFullscreen({ navigationUI: 'hide' });
                } catch {
                    await target.requestFullscreen();
                }
                return;
            }
            if (target.webkitRequestFullscreen) {
                await target.webkitRequestFullscreen();
            }
        } catch (error) {
            console.warn('Failed to toggle fullscreen mode.', error);
        }
    }, []);
    const clearPreviewTimer = () => {
        if (previewTimerRef.current) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null; }
    };
    // カード用プレビュー開始
    const startCardPreview = (defId: string, cardIdx?: number, previewMode: HoverPreviewMode = 'auto') => {
        clearPreviewTimer();
        isHoverPreviewRef.current = false;
        hoverPreviewModeRef.current = previewMode;
        previewSourceRef.current = 'press';
        pressingCardIdxRef.current = cardIdx ?? null;
        previewTimerRef.current = setTimeout(() => {
            setPreviewData({ type: 'card', defId });
        }, TIMING.LONG_PRESS_MS);
    };
    // 公共職場用プレビュー開始
    const startWorkplacePreview = (wp: { id: string; name: string; effectText: string; multipleAllowed: boolean; fromBuildingDefId?: string }, cardIdx: number) => {
        clearPreviewTimer();
        isHoverPreviewRef.current = false;
        hoverPreviewModeRef.current = 'auto';
        previewSourceRef.current = 'press';
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
    // ホバーによるカードプレビュー開始（eから元カードの位置を記録）
    const startHoverCardPreview = (defId: string, cardIdx: number, e: React.PointerEvent) => {
        if (!featureFlags.HOVER_PREVIEW) return;
        clearPreviewTimer();
        // 既存のホバープレビューがあれば閉じてから新しいプレビューを開始
        if (isHoverPreviewRef.current) {
            isHoverPreviewRef.current = false;
            setPreviewData(null);
        }
        hoverCardRectRef.current = (e.currentTarget as HTMLElement).getBoundingClientRect();
        hoverPreviewModeRef.current = 'auto';
        previewSourceRef.current = 'hover';
        pressingCardIdxRef.current = cardIdx;
        previewTimerRef.current = setTimeout(() => {
            isHoverPreviewRef.current = true;
            setPreviewData({ type: 'card', defId });
        }, TIMING.HOVER_PREVIEW_MS);
    };
    const startHoverCardPreviewWithMode = (defId: string, cardIdx: number, e: React.PointerEvent, hoverMode: HoverPreviewMode) => {
        if (!featureFlags.HOVER_PREVIEW) return;
        clearPreviewTimer();
        if (isHoverPreviewRef.current) {
            isHoverPreviewRef.current = false;
            setPreviewData(null);
        }
        hoverCardRectRef.current = (e.currentTarget as HTMLElement).getBoundingClientRect();
        hoverPreviewModeRef.current = hoverMode;
        previewSourceRef.current = 'hover';
        pressingCardIdxRef.current = cardIdx;
        previewTimerRef.current = setTimeout(() => {
            isHoverPreviewRef.current = true;
            setPreviewData({ type: 'card', defId });
        }, TIMING.HOVER_PREVIEW_MS);
    };
    // ホバーによる職場プレビュー開始（eから元カードの位置を記録）
    const startHoverWorkplacePreview = (wp: { id: string; name: string; effectText: string; multipleAllowed: boolean; fromBuildingDefId?: string }, cardIdx: number, e: React.PointerEvent) => {
        if (!featureFlags.HOVER_PREVIEW) return;
        clearPreviewTimer();
        if (isHoverPreviewRef.current) {
            isHoverPreviewRef.current = false;
            setPreviewData(null);
        }
        hoverCardRectRef.current = (e.currentTarget as HTMLElement).getBoundingClientRect();
        hoverPreviewModeRef.current = 'auto';
        previewSourceRef.current = 'hover';
        pressingCardIdxRef.current = cardIdx;
        previewTimerRef.current = setTimeout(() => {
            isHoverPreviewRef.current = true;
            if (wp.fromBuildingDefId) {
                setPreviewData({ type: 'card', defId: wp.fromBuildingDefId });
            } else {
                setPreviewData({ type: 'workplace', wpId: wp.id, name: wp.name, effectText: wp.effectText, multipleAllowed: wp.multipleAllowed });
            }
        }, TIMING.HOVER_PREVIEW_MS);
    };
    // ホバープレビュー中にカーソルが元カード領域外に出たか判定（暗転モード用: オーバーレイがポインタイベントを受ける場合）
    const handlePreviewPointerMove = (e: React.PointerEvent) => {
        if (!isHoverPreviewRef.current || !hoverCardRectRef.current) return;
        const r = hoverCardRectRef.current;
        const margin = 20; // 少し余裕を持たせる
        if (e.clientX < r.left - margin || e.clientX > r.right + margin ||
            e.clientY < r.top - margin || e.clientY > r.bottom + margin) {
            closePreview();
        }
    };
    // ホバー離脱時のプレビュー終了
    // no-darkenモード: オーバーレイがpointer-events:noneなのでカードのonPointerLeaveが正常発火→プレビューを閉じる
    // darkenモード: オーバーレイがポインタを奪うため即発火→タイマーキャンセルのみ（handlePreviewPointerMoveで閉じる）
    const endHoverPreview = () => {
        clearPreviewTimer();
        pressingCardIdxRef.current = null;
        if (previewSourceRef.current === 'hover') previewSourceRef.current = null;
        if (isHoverPreviewRef.current && !featureFlags.DARKEN_ON_PREVIEW) {
            isHoverPreviewRef.current = false;
            hoverPreviewModeRef.current = 'auto';
            hoverCardRectRef.current = null;
            setPreviewData(null);
        }
    };
    const endPreview = () => {
        clearPreviewTimer();
        pressingCardIdxRef.current = null;
        if (previewSourceRef.current === 'press' && !previewDataRef.current) previewSourceRef.current = null;
        // プレビュー表示済みの場合は閉じない（オーバーレイのクリックで閉じる）
    };
    const closePreview = () => {
        clearPreviewTimer();
        pressingCardIdxRef.current = null;
        isHoverPreviewRef.current = false;
        hoverPreviewModeRef.current = 'auto';
        hoverCardRectRef.current = null;
        previewSourceRef.current = null;
        setPreviewData(null);
    };
    // no-darkenモードのホバープレビュー中: documentクリックで閉じる
    // （プレビューカードがpointer-events:noneのため、onClickでは閉じられない）
    useEffect(() => {
        if (!previewData || !isHoverPreviewRef.current || featureFlags.DARKEN_ON_PREVIEW) return;
        const handler = () => closePreview();
        document.addEventListener('pointerdown', handler);
        return () => document.removeEventListener('pointerdown', handler);
    });
    useEffect(() => {
        const handlePressPreviewRelease = () => {
            if (previewSourceRef.current !== 'press') return;
            clearPreviewTimer();
            pressingCardIdxRef.current = null;
            if (isMobileTouchUiRef.current && previewDataRef.current) {
                isHoverPreviewRef.current = false;
                hoverPreviewModeRef.current = 'auto';
                hoverCardRectRef.current = null;
                previewSourceRef.current = null;
                setPreviewData(null);
                return;
            }
            if (!previewDataRef.current) previewSourceRef.current = null;
        };
        document.addEventListener('pointerup', handlePressPreviewRelease, true);
        document.addEventListener('pointercancel', handlePressPreviewRelease, true);
        return () => {
            document.removeEventListener('pointerup', handlePressPreviewRelease, true);
            document.removeEventListener('pointercancel', handlePressPreviewRelease, true);
        };
    }, []);
    // クリック配置モード: 職場を直接クリックするだけでワーカーを配置
    const handleWorkplaceClickPlace = (wpId: string) => {
        if (!featureFlags.CLICK_PLACE_WORKER) return;
        if (rawG.phase !== 'work' || !canInteract || curPid !== myPid) return;
        // 利用可能なワーカーがあるか確認
        const realMyPlayer = rawG.players[myPid];
        if (!realMyPlayer || realMyPlayer.availableWorkers <= 0) return;
        // ドラッグ中は無視（ドラッグ操作と競合しないように）
        if (workerDragRef.current) return;
        soundManager.playSFX('click');
        prepareDrawDetection();
        moves.placeWorker(wpId);
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
    // CPU対戦: 最後に手番だった人間プレイヤーIDを保持（CPUターン中のmyPid固定用）
    const lastHumanPidRef = useRef(curPid);

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
    // CPU対戦モード: CPUターン中はmyPidを直前の人間プレイヤーに固定（手札丸見え防止）
    // 全員CPUの場合は観戦モード → 従来通り手番プレイヤーに追従
    const allCpu = !!(cpuConfig?.enabled && cpuConfig.cpuPlayers.length >= ctx.numPlayers);
    const isCpuTurn = !!(cpuConfig?.enabled && !allCpu && cpuConfig.cpuPlayers.includes(curPid));
    if (cpuConfig?.enabled && !cpuConfig.cpuPlayers.includes(curPid)) {
        lastHumanPidRef.current = curPid; // 人間ターン時のみ更新
    }
    // ドローアニメーション中はmyPidを前プレイヤーに固定（ホットシートで正しい手札を追跡するため）
    const myPid = playerID ?? (isCpuTurn
        ? lastHumanPidRef.current
        : (drawAnimRef.current ? displayCurPid : curPid));
    const isOnline = playerID !== null && playerID !== undefined;
    const isModalPhase = false;

    // モーダルフェーズ中の操作者判定
    // payday/cleanup は同時処理対応: P2Pでは全員が自分の操作をする
    // build/discard/designOffice/dualConstruction は手番プレイヤーの操作なので ctx.currentPlayer を使用
    // payday/cleanupでは各プレイヤーが自分を操作
    // P2P時: 給料日/精算は自分のplayerStatesに基づく
    let effectivePlayer: string;
    let isMyTurn: boolean;
    if (G.phase === 'payday' && G.paydayState) {
        if (isOnline) {
            const pps = G.paydayState.playerStates[myPid];
            isMyTurn = !!pps && !pps.confirmed && pps.step !== 'done';
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
            const pendingOpponentPlacementSeq = isOnline
                && rawG.lastPlacementEvent
                && rawG.lastPlacementEvent.playerId !== myPid
                && rawG.lastPlacementEvent.seq > handledPlacementAnimationSeqRef.current
                ? rawG.lastPlacementEvent.seq
                : null;
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
            if (drawAnimRef.current || pendingOpponentPlacementSeq !== null) {
                const poll = setInterval(() => {
                    if (
                        !drawAnimRef.current
                        && (
                            pendingOpponentPlacementSeq === null
                            || handledPlacementAnimationSeqRef.current >= pendingOpponentPlacementSeq
                        )
                    ) {
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
    }, [isOnline, myPid, rawG.lastPlacementEvent, rawG.round]);

    // ====== アニメーション管理 ======
    const { triggerRipple, triggerMeepleFlight, triggerDraw, isDrawAnimating, AnimationOverlay } = useAnimations();

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

    const snapshotAnimationRects = useCallback(() => {
        const players: Record<string, DOMRect> = {};
        const workplaces: Record<string, DOMRect> = {};
        const buildings: Record<string, DOMRect> = {};

        document.querySelectorAll<HTMLElement>('[data-player-id]').forEach((el) => {
            const pid = el.dataset.playerId;
            if (pid) players[pid] = el.getBoundingClientRect();
        });
        document.querySelectorAll<HTMLElement>('[data-workplace-id]').forEach((el) => {
            const workplaceId = el.dataset.workplaceId;
            if (workplaceId) workplaces[workplaceId] = el.getBoundingClientRect();
        });
        document.querySelectorAll<HTMLElement>('[data-building-uid]').forEach((el) => {
            const buildingUid = el.dataset.buildingUid;
            if (buildingUid) buildings[buildingUid] = el.getBoundingClientRect();
        });

        if (
            Object.keys(players).length > 0 ||
            Object.keys(workplaces).length > 0 ||
            Object.keys(buildings).length > 0
        ) {
            animationRectCacheRef.current = { players, workplaces, buildings };
        }
    }, []);

    const getWorkerAnimationStartRect = useCallback((pid: string, preferPlayerPanel: boolean = false): DOMRect | null => {
        const workerToken = !preferPlayerPanel
            ? document.querySelector(`[data-player-id="${pid}"] .worker-token:not(.used)`) as HTMLElement | null
            : null;
        const originEl =
            workerToken
            ?? document.querySelector(`[data-player-id="${pid}"] [data-player-origin="${pid}"]`) as HTMLElement | null
            ?? document.querySelector(`[data-player-id="${pid}"]`) as HTMLElement | null;

        return originEl?.getBoundingClientRect() ?? animationRectCacheRef.current.players[pid] ?? null;
    }, []);

    const getPlacementTargetRect = useCallback((placement: PlacementDelta): DOMRect | null => {
        if (placement.moveName === 'placeWorker') {
            const el = document.querySelector(`[data-workplace-id="${placement.targetId}"]`) as HTMLElement | null;
            return el?.getBoundingClientRect() ?? animationRectCacheRef.current.workplaces[placement.targetId] ?? null;
        }

        const el = document.querySelector(`[data-building-uid="${placement.targetId}"]`) as HTMLElement | null;
        return el?.getBoundingClientRect() ?? animationRectCacheRef.current.buildings[placement.targetId] ?? null;
    }, []);

    const playWorkerPlacementAnimation = useCallback(async (
        pid: string,
        placement: PlacementDelta,
        options?: { preferPlayerPanel?: boolean; rippleColor?: string }
    ): Promise<boolean> => {
        let startRect = getWorkerAnimationStartRect(pid, options?.preferPlayerPanel ?? false);
        let targetRect = getPlacementTargetRect(placement);
        if (!startRect || !targetRect) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            startRect = getWorkerAnimationStartRect(pid, options?.preferPlayerPanel ?? false);
            targetRect = getPlacementTargetRect(placement);
        }
        if (!startRect || !targetRect) return false;

        await triggerMeepleFlight(startRect, targetRect, getMeepleSrc(parseInt(pid)));
        triggerRipple(
            targetRect.left + targetRect.width / 2,
            targetRect.top + targetRect.height / 2,
            '',
            options?.rippleColor ?? 'var(--teal-60)'
        );
        return true;
    }, [getPlacementTargetRect, getWorkerAnimationStartRect, getMeepleSrc, triggerMeepleFlight, triggerRipple]);

    const detectPlacementDelta = useCallback((prevState: GameState, nextState: GameState): PlacementDelta | null => {
        for (const nextWp of nextState.publicWorkplaces) {
            const prevWp = prevState.publicWorkplaces.find(wp => wp.id === nextWp.id);
            if (!prevWp) continue;
            if (nextWp.workers.length > prevWp.workers.length) {
                const placedPid = nextWp.workers[nextWp.workers.length - 1];
                return {
                    playerId: String(placedPid),
                    moveName: 'placeWorker',
                    targetId: nextWp.id,
                };
            }
        }

        for (const pid of Object.keys(nextState.players)) {
            const prevBuildings = prevState.players[pid]?.buildings ?? [];
            const nextBuildings = nextState.players[pid]?.buildings ?? [];
            for (const nextSlot of nextBuildings) {
                const prevSlot = prevBuildings.find(slot => slot.card.uid === nextSlot.card.uid);
                if (prevSlot && !prevSlot.workerPlaced && nextSlot.workerPlaced) {
                    return {
                        playerId: pid,
                        moveName: 'placeWorkerOnBuilding',
                        targetId: nextSlot.card.uid,
                    };
                }
            }
        }

        return null;
    }, []);

    useLayoutEffect(() => {
        snapshotAnimationRects();
    });

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
            'var(--teal-60)'
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
            'var(--gold-60)'
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
    // CPUミープル飛行完了待ちタイマー（cleanup用）
    const cpuAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!cpuConfig?.enabled) return;
        if (G.phase === 'gameEnd') return;
        if (showCpuSettings) return; // 設定中は停止
        // ドローアニメーション中はCPU moveをブロック（Refで即時参照）
        if (drawAnimRef.current) return;
        // ミープル飛行アニメーション中はmoveをブロック（二重発火防止）
        if (cpuAnimInProgressRef.current) return;

        // CPU自動プレイ時の給料日・精算: 各CPUプレイヤーの未確認分を処理
        let activePid = curPid;
        if (G.phase === 'payday' && G.paydayState) {
            // 未確認のCPUプレイヤーを探す
            const unconfirmedPid = Object.keys(G.paydayState.playerStates)
                .find((pid) => {
                    const ps = G.paydayState!.playerStates[pid] as PaydayPlayerState | undefined;
                    return !!ps && !ps.confirmed && ps.step !== 'done' && cpuConfig.cpuPlayers.includes(pid);
                });
            activePid = unconfirmedPid ?? String(G.paydayState.currentPlayerIndex);
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

                    // CPUワーカー配置: Web Animations APIでミープルが飛んでいくアニメーション
                    if (action.moveName === 'placeWorker' || action.moveName === 'placeWorkerOnBuilding') {
                        const targetEl = action.moveName === 'placeWorker'
                            ? document.querySelector(`[data-workplace-id="${action.args[0]}"]`) as HTMLElement | null
                            : document.querySelector(`[data-building-uid="${action.args[0]}"]`) as HTMLElement | null;
                        // 開始位置: 利用可能なワーカートークンを掴む（なければプレイヤーエリアから）
                        const workerToken = document.querySelector(`[data-player-id="${activePid}"] .worker-token:not(.used)`) as HTMLElement | null;
                        const startEl = workerToken || document.querySelector(`[data-player-id="${activePid}"]`) as HTMLElement | null;

                        if (targetEl && startEl) {
                            const startRect = startEl.getBoundingClientRect();
                            const targetRect = targetEl.getBoundingClientRect();
                            const pidIdx = parseInt(activePid);

                            // アニメーション中フラグON（useEffect再発火防止）
                            cpuAnimInProgressRef.current = true;

                            // DOM直接操作でミープル要素を作成（Reactを経由しない）
                            const meeple = document.createElement('img');
                            meeple.src = getMeepleSrc(pidIdx);
                            meeple.style.cssText = 'position:fixed;left:0;top:0;width:32px;height:32px;z-index:300;pointer-events:none;border-radius:50%;';
                            document.body.appendChild(meeple);

                            const sx = startRect.left + startRect.width / 2 - 16;
                            const sy = startRect.top + startRect.height / 2 - 16;
                            const ex = targetRect.left + targetRect.width / 2 - 16;
                            const ey = targetRect.top + targetRect.height / 2 - 16;

                            // 持ち上げ時にclick SE
                            soundManager.playSFX('click');

                            // Web Animations API: GPUアクセラレーションで滑らか60FPS
                            const anim = meeple.animate([
                                {
                                    transform: `translate(${sx}px, ${sy}px) scale(0.7)`,
                                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                                },
                                {
                                    transform: `translate(${ex}px, ${ey}px) scale(1.1)`,
                                    filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.5)) drop-shadow(0 0 12px var(--teal-40))',
                                },
                            ], {
                                duration: 600,
                                easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                                fill: 'forwards',
                            });

                            anim.onfinish = () => {
                                // 着地: リップル + move実行
                                const rippleColor = action.moveName === 'placeWorker'
                                    ? 'var(--teal-60)'
                                    : 'var(--gold-60)';
                                triggerRipple(
                                    targetRect.left + targetRect.width / 2,
                                    targetRect.top + targetRect.height / 2,
                                    '', rippleColor
                                );
                                meeple.remove();
                                cpuAnimInProgressRef.current = false;
                                moveFn(...action.args);
                            };
                        } else {
                            moveFn(...action.args);
                        }
                    } else {
                        // その他のアクション: 即座実行
                        soundManager.playSFX('click');
                        moveFn(...action.args);
                    }
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

    useEffect(() => {
        const placement = rawG.lastPlacementEvent;
        if (!placement) return;
        if (placement.seq <= handledPlacementAnimationSeqRef.current) return;
        if (activePlacementAnimationSeqRef.current === placement.seq) return;

        if (!isOnline || placement.playerId === myPid) {
            handledPlacementAnimationSeqRef.current = placement.seq;
            return;
        }

        const rippleColor = placement.moveName === 'placeWorker'
            ? 'var(--teal-60)'
            : 'var(--gold-60)';

        activePlacementAnimationSeqRef.current = placement.seq;
        void (async () => {
            try {
                await playWorkerPlacementAnimation(placement.playerId, placement, {
                    preferPlayerPanel: true,
                    rippleColor,
                });
            } finally {
                handledPlacementAnimationSeqRef.current = placement.seq;
                activePlacementAnimationSeqRef.current = null;
            }
        })();
    }, [isOnline, myPid, playWorkerPlacementAnimation, rawG.lastPlacementEvent]);

    // ===== ①②③ ポップアップ廃止: payday/cleanup/discard はメインボード上でインライン操作 =====
    // 給料日（建物売却）: メインボードの建物カードから直接選択
    const isPaydayPhase = G.phase === 'payday' && G.paydayState;
    const paydayPlayerState = isPaydayPhase
        ? G.paydayState!.playerStates[isOnline ? myPid : String(G.activePlayer)]
        : null;
    const needsPaydaySelling = !!(paydayPlayerState && !paydayPlayerState.confirmed && paydayPlayerState.step === 'payday' && paydayPlayerState.needsSelling);

    // 精算（手札クリーンアップ）: メインボードの手札から直接選択
    const isCleanupPhase = false;
    const cleanupPlayerState = isCleanupPhase
        ? G.cleanupState!.playerStates[isOnline ? myPid : String(G.cleanupState!.currentPlayerIndex)]
        : paydayPlayerState;
    const needsCleanup = !!(
        cleanupPlayerState
        && 'step' in cleanupPlayerState
        && !cleanupPlayerState.confirmed
        && cleanupPlayerState.step === 'cleanup'
        && cleanupPlayerState.excessCount > 0
    );

    // 捨てカード選択: メインボードの手札から直接選択
    const isDiscardPhase = rawG.phase === 'discard' && rawG.discardState;

    // ホットシートでカレントプレイヤー = 自分
    const myIdx = parseInt(myPid);
    const myPlayer = G.players[myPid];
    const playerName = (pid: string | number) => getPlayerDisplayName(G.playerNames, pid);
    const playerChipLabel = (pid: string | number) => shortenPlayerDisplayName(playerName(pid), 8);
    const renderWorkerChip = (pid: number, key: React.Key) => (
        <span key={key} className="worker-chip" title={playerName(pid)}>
            <img src={getMeepleSrc(pid)} className="worker-chip-icon" alt="" />
            {playerChipLabel(pid)}
        </span>
    );
    const getOpponentActivityLabel = (pid: string): string | null => {
        if (G.phase === 'payday' && G.paydayState) {
            const pps = G.paydayState.playerStates[pid];
            if (pps && !pps.confirmed && pps.step !== 'done') return '清算中...';
        }
        if (
            isOnline &&
            pid === curPid &&
            ['discard', 'build', 'designOffice', 'dualConstruction', 'choice_village', 'choice_automaton', 'choice_modernism', 'choice_teleporter', 'choice_skyscraper'].includes(G.phase)
        ) {
            return '選択中...';
        }
        return null;
    };

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

    // ====== 早期return: 全てのフック呼び出しの後に配置（Reactフックルール準拠） ======

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
                    <div style={{ fontSize: 'var(--fs-icon)', marginBottom: 16, animation: 'pulse 2s ease-in-out infinite' }}>⏳</div>
                    <h2 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>{playerName(G.activePlayer)} が操作中...</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{phaseLabels[G.phase] || G.phase}を行っています</p>
                    <p style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-xl2)', marginTop: 16 }}>しばらくお待ちください</p>
                </div>
            </div>
        );
    }

    // 設計事務所モーダル（rawGで判定: ドロー1_下完了後に表示するためアニメーション中は非表示）
    if (rawG.phase === 'designOffice' && rawG.designOfficeState && !drawAnimRef.current && isMyTurn) return <DesignOfficeUI G={rawG} moves={moves} onBeforeSelect={() => prepareDrawDetection(0, true)} />;

    // 二胡市建設モーダル
    if (G.phase === 'dualConstruction' && G.dualConstructionState && isMyTurn) return <DualConstructionUI G={G} moves={moves} pid={curPid} />;

    // 対戦相手（自分以外）
    const opponents = Array.from({ length: ctx.numPlayers }, (_, i) => i)
        .filter(i => String(i) !== myPid);

    // 家計ボックスのプレッシャー判定（ラウンド7以降で家計が少ない場合）
    const totalWorkers = Object.keys(G.players).reduce((sum, pid) => sum + G.players[pid].workers, 0);
    const wagePressure = G.round >= 7 && G.household < totalWorkers * wage;

    // 建設フェーズ判定
    const isBuildPhase = G.phase === 'build' && G.buildState;
    const canInteract = (!isOnline || isMyTurn);

    // 売却建物（公共職場のうちfromBuilding=true）
    const publicWorkplaces = G.publicWorkplaces as Workplace[];
    const fixedWorkplaces = publicWorkplaces.filter((wp) => !wp.fromBuilding);
    const soldWorkplaces = publicWorkplaces.filter((wp) => wp.fromBuilding);

    // 手札カードの動的重なり計算（コンテナ幅に自動フィット）
    // ResizeObserverで取得したcontainerSizeを使用（レンダリング中のDOM読み取り排除）
    const getMobileBaseCardH = () => {
        const mobileViewportW = typeof window !== 'undefined' ? window.innerWidth : containerSize.w;
        const mobilePubCardW = Math.min(54, Math.max(28, (mobileViewportW - 340) / 8));
        return mobilePubCardW * 88 / 63;
    };
    const getMyHandLayout = (total: number) => {
        const horizontalInset = isMobileTouchUi ? 2 : 16;
        const containerW = Math.max(0, containerSize.w - horizontalInset);
        const mobileBaseCardH = getMobileBaseCardH();
        const mobileVerticalGutter = 2;
        const maxCardH = isMobileTouchUi
            ? Math.max(mobileBaseCardH, Math.max(0, containerSize.h - mobileVerticalGutter * 2))
            : Math.max(0, containerSize.h * handCardScale);
        const maxCardW = maxCardH * 63 / 88;
        if (total <= 0) {
            return {
                cardH: maxCardH,
                cardW: maxCardW,
                overlapMargin: 0,
                paddingLeft: Math.max(0, (containerW - maxCardW) / 2),
            };
        }

        const cardW = maxCardW;
        const cardH = maxCardH;
        const step = total <= 1 ? 0 : Math.min(cardW, Math.max(0, (containerW - cardW) / (total - 1)));
        const overlapMargin = total <= 1 ? 0 : step - cardW;
        const totalCardsWidth = total <= 1 ? cardW : cardW + (total - 1) * step;
        const paddingLeft = Math.max(0, (containerW - totalCardsWidth) / 2);
        return { cardH, cardW, overlapMargin, paddingLeft };
    };
    const getCardOverlapMargin = (total: number, isMyHand: boolean) => {
        if (total <= 1) return 0;
        if (isMyHand) {
            // containerSizeはResizeObserverで追跡済み（padding 8px*2を除く）
            const containerW = containerSize.w - 16;
            const cardH = containerSize.h * handCardScale;
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

    const boardLayoutClassName = `game-bg game-layout${isMobileTouchUi ? ' mobile-touch-ui' : ''}`;
    const gameScalerClassName = `game-scaler${isMobileTouchUi ? ' mobile-touch-ui' : ''}`;
    const handCardScale = isMobileTouchUi ? 0.9 : 0.84;
    const myHandSource = drawAnimRef.current ? (rawG.players[myPid]?.hand ?? myPlayer.hand) : myPlayer.hand;
    const myHandLayout = getMyHandLayout(myHandSource.length);
    const mobileBaseCardH = getMobileBaseCardH();
    const mobileHandScale = isMobileTouchUi && mobileBaseCardH > 0 ? myHandLayout.cardH / mobileBaseCardH : 1;
    const mobileHandAreaWidthPercent = Math.min(70, Math.max(35, 35 * mobileHandScale));
    const mobileMyFieldStyle = isMobileTouchUi
        ? ({
            '--mobile-self-card-height': `${myHandLayout.cardH}px`,
            '--mobile-hand-area-width': `${mobileHandAreaWidthPercent}%`,
        } as React.CSSProperties)
        : undefined;

    return (
        <div className={boardLayoutClassName} ref={boardLayoutRef}>
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
            {/* CPUミープル飛行アニメーションはWeb Animations APIでDOM直接操作（React外） */}
            {/* 長押し/ホバープレビューオーバーレイ（カード / 公共職場） */}
            {previewData && (() => {
                // ホバープレビュー時の位置計算（元カードの上方向に表示、上にスペースなければ下方向）
                const hoverPos = isHoverPreviewRef.current && hoverCardRectRef.current ? (() => {
                    const r = hoverCardRectRef.current!;
                    const pw = 280; // プレビュー幅（CSSのcard-preview-cardと一致）
                    const ph = 420; // プレビュー概算高さ（画像+テキスト+タグの全体）
                    const gap = 4;  // カードとプレビューの隙間（近接表示）
                    // 水平位置: カード中央に揃え、画面端からはみ出さないようクランプ
                    let left = r.left + (r.width - pw) / 2;
                    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
                    // 垂直位置: 下方向優先（カードの下に表示）、下にスペースなければ上方向
                    const spaceBelow = window.innerHeight - r.bottom;
                    let top: number;
                    if (spaceBelow >= ph + gap) {
                        top = r.bottom + gap; // 下に表示（カードに被らない）
                    } else {
                        // 上に表示: カードの上方向に配置し、画面上端からはみ出さないようにする
                        // 高さ制限はCSSのmax-height: 70vhに委ねる（maxHeightのインライン指定はしない）
                        top = r.top - ph - gap;
                        top = Math.max(4, top);
                    }
                    // 上下両端のクランプ: 画面からはみ出さない
                    top = Math.max(4, Math.min(top, window.innerHeight - ph - 4));
                    return { position: 'fixed' as const, left, top, width: pw, zIndex: 10000 };
                })() : null;
                const previewStyle = hoverPreviewModeRef.current === 'above-hand' && hoverCardRectRef.current && handAreaRef.current
                    ? (() => {
                        const cardRect = hoverCardRectRef.current!;
                        const handRect = handAreaRef.current!.getBoundingClientRect();
                        const previewWidth = Math.min(280, window.innerWidth * 0.7);
                        const gap = Math.max(4, Math.min(12, handRect.height * 0.06));
                        const availableAbove = Math.max(0, handRect.top - gap - 8);
                        let left = cardRect.left + (cardRect.width - previewWidth) / 2;
                        left = Math.max(8, Math.min(left, window.innerWidth - previewWidth - 8));
                        return {
                            position: 'fixed' as const,
                            left,
                            bottom: Math.max(8, window.innerHeight - handRect.top + gap),
                            width: previewWidth,
                            maxHeight: availableAbove,
                            zIndex: 10000,
                        };
                    })()
                    : hoverPos;

                if (previewData.type === 'card') {
                    // カード（建物 / 売却建物）フォーマット
                    const pDef = getCardDef(previewData.defId);
                    if (!pDef) return null;
                    const imgSrc = pDef.image ? `${import.meta.env.BASE_URL}${getThemedCardImagePath(pDef.image).replace(/^\//, '')}` : null;
                    const tagLabel = pDef.tags.includes('farm') ? '🌿 農場' : pDef.tags.includes('factory') ? '🏭 工場' : '🏢 施設';
                    return (
                        <div className={`card-preview-overlay${featureFlags.DARKEN_ON_PREVIEW ? '' : ' no-darken'}`} onPointerUp={closePreview} onClick={closePreview} onPointerMove={handlePreviewPointerMove}>
                            <div className="card-preview-card" style={previewStyle || undefined}>
                                <div className="card-preview-image">
                                    {imgSrc && <img src={imgSrc} alt={pDef.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                </div>
                                <div className="card-preview-info">
                                    {/* ヘッダー: カード名 + タイプ */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-2)' }}>
                                        <div style={{ fontWeight: 900, fontSize: 'var(--fs-4xl)', color: 'var(--text-primary)', letterSpacing: '0.5px' }}>{pDef.name}</div>
                                        <span style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-dim)', fontWeight: 500 }}>{tagLabel}</span>
                                    </div>
                                    {/* スタッツ行: コスト / VP */}
                                    <div style={{ display: 'flex', gap: 'var(--sp-4)', marginBottom: 'var(--sp-3)', alignItems: 'center' }}>
                                        <span className="card-preview-stat">
                                            <span style={{ color: 'var(--gold-light)', fontSize: 'var(--fs-3xl)', fontWeight: 800 }}>C{pDef.cost}</span>
                                        </span>
                                        <span className="card-preview-stat">
                                            <span style={{ color: 'var(--gold-light)', fontSize: 'var(--fs-3xl)', fontWeight: 800 }}>{pDef.vp}VP</span>
                                        </span>
                                    </div>
                                    {/* セパレーター */}
                                    <div className="card-preview-separator" />
                                    {/* 効果テキスト: ハイライト付き */}
                                    {pDef.effectText && (
                                        <div className="card-preview-effect">
                                            {renderEffectText(pDef.effectText)}
                                        </div>
                                    )}
                                    {/* タグバッジ */}
                                    {(pDef.tags.length > 0 || pDef.unsellable) && (
                                        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginTop: 'var(--sp-3)' }}>
                                            {pDef.tags.includes('farm') && <span className="tag-badge tag-farm"><TagFarm size={"calc(var(--fs) * 1.33)"} /> 農園</span>}
                                            {pDef.tags.includes('factory') && <span className="tag-badge tag-factory"><TagFactory size={"calc(var(--fs) * 1.33)"} /> 工場</span>}
                                            {pDef.unsellable && <span className="tag-badge tag-lock"><TagLock size={"calc(var(--fs) * 1.33)"} /> 売却不可</span>}
                                            {pDef.consumeOnUse && <span className="tag-badge" style={{ color: 'var(--red)', background: 'var(--red-15)' }}>🔥 使い捨て</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                } else {
                    // 公共職場フォーマット（コスト/VP省略）
                    const wpImg = getWorkplaceImage(previewData.wpId);
                    const wpImgSrc = wpImg ? `${import.meta.env.BASE_URL}${getThemedWorkplaceImagePath(wpImg)}` : null;
                    return (
                        <div className={`card-preview-overlay${featureFlags.DARKEN_ON_PREVIEW ? '' : ' no-darken'}`} onPointerUp={closePreview} onClick={closePreview} onPointerMove={handlePreviewPointerMove}>
                            <div className="card-preview-card" style={previewStyle || undefined}>
                                <div className="card-preview-image">
                                    {wpImgSrc && <img src={wpImgSrc} alt={previewData.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                </div>
                                <div className="card-preview-info">
                                    {/* ヘッダー: 職場名 + タイプ */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-2)' }}>
                                        <div style={{ fontWeight: 900, fontSize: 'var(--fs-4xl)', color: 'var(--text-primary)', letterSpacing: '0.5px' }}>{previewData.name}</div>
                                        <span style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-dim)', fontWeight: 500 }}>🏛️ 公共職場</span>
                                    </div>
                                    {/* セパレーター */}
                                    <div className="card-preview-separator" />
                                    {/* 効果テキスト: ハイライト付き */}
                                    {previewData.effectText && (
                                        <div className="card-preview-effect">
                                            {renderEffectText(previewData.effectText)}
                                        </div>
                                    )}
                                    {/* 特殊ルール */}
                                    {previewData.multipleAllowed && (
                                        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
                                            <span className="tag-badge" style={{ color: 'var(--purple)', background: 'rgba(167,139,250,0.15)' }}>∞ 複数配置可能</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                }
            })()}
            {showDiscard && <DiscardPileModal discard={G.discard} onClose={() => setShowDiscard(false)} />}
            <div className={gameScalerClassName}>
                {/* ラウンドアナウンスオーバーレイ */}
                {roundAnnounce !== null && (
                    <div className="round-announce-overlay" key={`round-${roundAnnounce}`}>
                        <div className="round-announce-text">Round {roundAnnounce}</div>
                    </div>
                )}
                {/* ====== ヘッダー ====== */}
                <div className="game-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', borderRadius: 6 }}>
                    <h1 style={{ fontSize: 'var(--fs-xl3)', fontWeight: 900, color: 'var(--gold)', margin: 0, display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '1px' }}>
                        <IconHammer size={"calc(var(--fs) * 1.56)"} color="var(--gold)" /> NATIONAL ECONOMY
                    </h1>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="stat-badge"><span style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-md)', fontWeight: 700 }}>ROUND</span><b style={{ color: 'var(--blue)', fontSize: 'var(--fs-xl2)' }}>{G.round}</b><span style={{ color: 'var(--text-dim)' }}>/9</span></span>
                        <span className="stat-badge"><IconDeck size={"calc(var(--fs) * 1.11)"} color="var(--purple)" /><b style={{ color: 'var(--purple)', fontSize: 'var(--fs-lg)' }}>{G.deck.length}</b></span>
                        <button onClick={() => { soundManager.playSFX('click'); setShowDiscard(!showDiscard); }} className="stat-badge" style={{ cursor: 'pointer', border: '1px solid var(--glass-border)' }}>
                            <IconDiscard size={"calc(var(--fs) * 1.11)"} color="var(--orange)" /><b style={{ color: 'var(--orange)', fontSize: 'var(--fs-lg)' }}>{G.discard.length}</b>
                        </button>
                        <button onClick={() => { soundManager.playSFX('click'); setShowLog(!showLog); }} className="stat-badge" style={{ cursor: 'pointer', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                            <IconLog size={"calc(var(--fs) * 1.11)"} color="#818cf8" /><b style={{ color: '#818cf8', fontSize: 'var(--fs-lg)' }}>{G.log.length}</b>
                        </button>
                        <button onClick={() => { soundManager.playSFX('click'); setShowSettings(true); }} className="stat-badge" style={{ cursor: 'pointer', padding: '3px 6px' }} title="音量設定">
                            {muted ? <IconSoundOff size={"calc(var(--fs) * 1.33)"} /> : <IconSoundOn size={"calc(var(--fs) * 1.33)"} />}
                        </button>
                        {cpuConfig?.enabled && (
                            <button onClick={() => { soundManager.playSFX('click'); setShowCpuSettings(true); }} className="stat-badge" style={{ cursor: 'pointer', padding: '3px 6px' }} title="CPU設定">
                                <IconRobot size={"calc(var(--fs) * 1.33)"} />
                            </button>
                        )}
                        <button onClick={() => { soundManager.playSFX('click'); setShowDebugPanel(!showDebugPanel); }} className="stat-badge" style={{ cursor: 'pointer', padding: '3px 6px', border: showDebugPanel ? '1px solid rgba(212,168,83,0.4)' : undefined }} title="デバッグパネル">
                            <span style={{ fontSize: 'var(--fs-xl2)' }}>🔧</span>
                        </button>
                    </div>
                </div>

                {/* 設定・モーダル系 */}
                {showSettings && <SoundSettings onClose={() => { setShowSettings(false); setMuted(soundManager.getSettings().isMuted); }} />}
                {showCpuSettings && <CPUSettings onClose={() => setShowCpuSettings(false)} />}
                {showDebugPanel && <DebugPanel features={featureFlags} onFeaturesChange={setFeatureFlags} onClose={() => setShowDebugPanel(false)} />}

                {showLog && <LogModal log={G.log} onClose={() => setShowLog(false)} />}

                {/* 建設キャンセルバーはインフォバーに移動（項目5） */}

                {/* ====== メインエリア: 左列(相手)+右列(公共の場) ====== */}
                <div className="game-main-area">

                    {/* ==== 左列: P2/P3/P4 + ターン + ログ ==== */}
                    <div className="area-opponents">
                        {/* ターン表示 */}
                        <div className="turn-bar" style={{ marginBottom: 2, fontSize: 'var(--fs-lg)' }}>
                            {cpuConfig?.enabled && cpuConfig.cpuPlayers.includes(displayCurPid) ? <IconRobot size={"calc(var(--fs) * 1.33)"} /> : <IconPlayer size={"calc(var(--fs) * 1.33)"} />}
                            <span title={playerName(displayCurPid)}><b style={{ color: 'var(--gold-light)' }}>{playerName(displayCurPid)}</b> のターン</span>
                            {cpuConfig?.enabled && cpuConfig.cpuPlayers.includes(displayCurPid) && (
                                <span style={{
                                    marginLeft: 4, fontSize: 'var(--fs-md)', color: 'var(--teal)',
                                    background: 'linear-gradient(135deg, var(--teal-15), rgba(96, 165, 250, 0.08))',
                                    padding: '2px 6px', borderRadius: 4,
                                    border: '1px solid var(--teal-15)',
                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                }}>
                                    <span style={{
                                        display: 'inline-flex', gap: 2, alignItems: 'center',
                                    }}>
                                        {[0, 1, 2].map(i => (
                                            <span key={i} style={{
                                                width: 3, height: 3, borderRadius: '50%',
                                                background: 'var(--teal)',
                                                animation: `cpuThinkDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                                                opacity: 0.4,
                                            }} />
                                        ))}
                                    </span>
                                    <span style={{ letterSpacing: '0.5px' }}>Thinking</span>
                                </span>
                            )}
                        </div>

                        {/* 相手プレイヤー */}
                        <div className="opponents-container">
                            {opponents.map(i => {
                                const pid = String(i);
                                const p = G.players[pid];
                                const active = pid === displayCurPid;
                                const isCpu = cpuConfig?.enabled && cpuConfig.cpuPlayers.includes(pid);
                                const isNpcHandShown = !!(isCpu && npcHandVisible[pid]);
                                const opponentActivityLabel = getOpponentActivityLabel(pid);
                                // CPUミープル飛行アニメーション用: opponent-cardにプレイヤーIDを付与
                                return (
                                    <div key={pid} data-player-id={pid} className={`opponent-card ${active ? 'opponent-card-active' : 'opponent-card-inactive'}`}>
                                        <div className="opponent-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2, flexShrink: 0 }}>
                                            <span className="opponent-player-tag" data-player-origin={pid} style={{ fontWeight: 700, fontSize: 'var(--fs-lg)', color: active ? 'var(--teal)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                {isCpu ? <IconRobot size={"calc(var(--fs) * 1.11)"} /> : <IconPlayer size={"calc(var(--fs) * 1.11)"} />}
                                                <span title={playerName(pid)} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '11ch' }}>
                                                    {playerName(pid)}
                                                </span>
                                                {opponentActivityLabel && <span style={{ color: 'var(--gold-dim)', fontSize: 'var(--fs-sm)', whiteSpace: 'nowrap' }}>{opponentActivityLabel}</span>}
                                                {i === G.startPlayer && <span style={{ color: 'var(--orange)', fontSize: 'var(--fs-md)' }}>★</span>}
                                            </span>
                                            {/* ステータスバッジ + NPC手札トグル */}
                                            <div className="opponent-header-stats" style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                                <span className="stat-badge" style={{ fontSize: 'var(--fs-md)', padding: '1px 4px' }}>
                                                    <IconMoney size={"calc(var(--fs) * 0.89)"} color="var(--gold-light)" /><b style={{ color: 'var(--gold-light)' }}>${p.money}</b>
                                                </span>
                                                <span className="stat-badge" style={{ fontSize: 'var(--fs-md)', padding: '1px 4px' }}>
                                                    <IconWorker size={"calc(var(--fs) * 0.89)"} color="var(--blue)" /><b style={{ color: 'var(--blue)' }}>{p.availableWorkers}/{p.workers}</b>
                                                </span>
                                                {p.unpaidDebts > 0 && <span className="stat-badge" style={{ fontSize: 'var(--fs-md)', padding: '1px 4px', borderColor: 'var(--red-30)' }}><b style={{ color: 'var(--red)' }}>Debt {p.unpaidDebts}</b></span>}
                                                {/* NPC手札トグルボタン（CPUプレイヤーのみ表示） */}
                                                {isCpu && (
                                                    <button
                                                        onClick={() => { soundManager.playSFX('click'); setNpcHandVisible(prev => ({ ...prev, [pid]: !prev[pid] })); }}
                                                        title={isNpcHandShown ? 'NPC手札を隠す' : 'NPC手札を表示'}
                                                        style={{
                                                            background: isNpcHandShown ? 'var(--teal-15)' : 'var(--glass-bg)',
                                                            border: `1px solid ${isNpcHandShown ? 'var(--teal-40)' : 'var(--glass-border)'}`,
                                                            borderRadius: 4,
                                                            padding: '1px 4px',
                                                            cursor: 'pointer',
                                                            fontSize: 'var(--fs-lg)',
                                                            lineHeight: 1,
                                                            transition: 'all 0.2s ease',
                                                        }}
                                                    >
                                                        {isNpcHandShown ? '👁️' : '🙈'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* 手札（ミニ直線配置）: NPC手札トグルで表示切替 */}
                                        <div className="opponent-hand-fan" style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                                            {p.hand.map((c: Card, ci: number) => {
                                                const isVisibleCard = isNpcHandShown && !isHidden(c);
                                                return (
                                                    <div key={c.uid}
                                                        onPointerDown={() => { if (isVisibleCard) startCardPreview(c.defId, 4000 + i * 100 + ci); }}
                                                        onPointerUp={endPreview}
                                                        onPointerLeave={() => { endPreview(); endHoverPreview(); }}
                                                        onPointerEnter={(e) => { if (isVisibleCard) startHoverCardPreview(c.defId, 4000 + i * 100 + ci, e); }}
                                                        className="opponent-hand-card"
                                                        style={{
                                                            marginLeft: ci === 0 ? 0 : getCardOverlapMargin(p.hand.length, false),
                                                            zIndex: ci + 1,
                                                            ...(isConsumable(c)
                                                                ? opponentConsumableCardStyle
                                                                : isVisibleCard
                                                                    ? opponentRevealedCardStyle
                                                                    : {}),
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            padding: '1px',
                                                            overflow: 'hidden',
                                                        }}>
                                                        {isVisibleCard && (
                                                            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', lineHeight: 1.1, wordBreak: 'break-all' }}>
                                                                {cName(c.defId)}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* 建物（カードスプライト・水平スクロール） */}
                                        {p.buildings.length > 0 && (
                                            <div className="opponent-buildings-scroll">
                                                {p.buildings.map((b, bi) => {
                                                    const def = getCardDef(b.card.defId);
                                                    const borderColor = def.tags.includes('farm') ? 'var(--tag-farm-bg)' : def.tags.includes('factory') ? 'var(--tag-factory-bg)' : 'var(--glass-border)';
                                                    return (
                                                        <div key={bi}
                                                            data-building-uid={b.card.uid}
                                                            onPointerDown={() => { startCardPreview(b.card.defId, 3000 + i * 100 + bi); }}
                                                            onPointerUp={endPreview}
                                                            onPointerLeave={() => { endPreview(); endHoverPreview(); }}
                                                            onPointerEnter={(e) => { startHoverCardPreview(b.card.defId, 3000 + i * 100 + bi, e); }}
                                                            className={`opponent-building-sprite ${b.workerPlaced ? 'building-placed' : ''}`}
                                                            style={{ borderColor }}>
                                                            <CardBgImage defId={b.card.defId} />
                                                            <div style={{ fontWeight: 700, fontSize: 'var(--fs-md)', lineHeight: 1.2, color: b.workerPlaced ? 'var(--text-dim)' : 'var(--text-primary)', position: 'relative', zIndex: 1 }}>{def.name}</div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, position: 'relative', zIndex: 1 }}>
                                                                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)', fontWeight: 600 }}>C{def.cost}</span>
                                                                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--gold-dim)', fontWeight: 600 }}>{def.vp}VP</span>
                                                            </div>
                                                            <TagBadges defId={b.card.defId} compact={isMobileTouchUi} />
                                                            {def.effectText && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-dim)', marginTop: 'auto', lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{def.effectText}</div>}
                                                            {b.workerPlaced && <img src={getMeepleSrc(parseInt(pid))} className="worker-on-building-icon" alt="配置済み" />}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* コンパクトログ */}
                        <div className="inline-log" style={{ marginTop: 'auto' }}>
                            <div style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-dim)', fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                                <IconLog size={"calc(var(--fs) * 1.11)"} /> LOG
                                <button onClick={() => { soundManager.playSFX('click'); setShowLog(true); }} style={{ marginLeft: 'auto', fontSize: 'var(--fs-base)', color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>全件</button>
                            </div>
                            {G.log.slice(-3).reverse().map((entry, i) => (
                                <div key={G.log.length - i}
                                    className={`log-entry ${entry.text.startsWith('===') ? 'log-entry-round' : entry.text.startsWith('---') ? 'log-entry-phase' : 'log-entry-action'}`}
                                    style={{ fontSize: 'var(--fs-base)' }}>
                                    {entry.text}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ==== 右列: 公共の場 ==== */}
                    <div className="area-public" style={{ border: '1px solid var(--glass-border)', borderRadius: 4 }}>
                        {/* 家計 */}
                        <div className={`household-box ${wagePressure ? 'wage-pressure' : ''}`}>
                            <div className="household-main" style={{ display: 'flex', alignItems: 'center', gap: 8, zIndex: 1 }}>
                                <IconHouse size={"calc(var(--fs) * 1.78)"} color={wagePressure ? 'var(--red)' : 'var(--teal)'} />
                                <div className="household-summary">
                                    <div className="household-title" style={{ fontSize: 'var(--fs-md)', color: 'var(--text-dim)', fontWeight: 600 }}>HOUSEHOLD</div>
                                    <div className="household-total" style={{ fontSize: 'var(--fs-4xl)', fontWeight: 900, color: wagePressure ? 'var(--red)' : 'var(--green)', lineHeight: 1 }}>${G.household}</div>
                                </div>
                            </div>
                            <div className="household-meta" style={{ display: 'flex', gap: 10, zIndex: 1 }}>
                                <div className="household-meta-item" style={{ textAlign: 'center' }}>
                                    <div className="household-meta-label" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)' }}>WAGE</div>
                                    <div className="household-meta-value" style={{ fontSize: 'var(--fs-xl3)', fontWeight: 700, color: 'var(--teal)' }}>${wage}</div>
                                </div>
                                <div className="household-meta-item" style={{ textAlign: 'center' }}>
                                    <div className="household-meta-label" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)' }}>ROUND</div>
                                    <div className="household-meta-value" style={{ fontSize: 'var(--fs-xl3)', fontWeight: 700, color: 'var(--blue)' }}>{G.round}/9</div>
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
                                                                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)', position: 'relative', zIndex: 1 }}>新職場</div>
                                                                <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--teal)', position: 'relative', zIndex: 1 }}>
                                                                    {wpName || '—'}
                                                                </div>
                                                                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)', position: 'relative', zIndex: 1 }}>R{r}</div>
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
                                            fontSize: 'var(--fs-md)', color: 'var(--text-dim)', fontWeight: 600, pointerEvents: 'none',
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
                                                        onClick={() => handleWorkplaceClickPlace(wp.id)}
                                                        onPointerDown={() => { if (!workerDragRender) startWorkplacePreview(wp, 2000 + col); }}
                                                        onPointerUp={() => { if (!workerDragRender) endPreview(); }}
                                                        onPointerLeave={() => { if (!workerDragRender) endPreview(); endHoverPreview(); }}
                                                        onPointerEnter={(e) => { startHoverWorkplacePreview(wp, 2000 + col, e); }}
                                                        className={`workplace-card ${ok ? 'workplace-available' : 'game-card-disabled'} ${workerDragRender?.hoveredUid === wp.id ? 'worker-drag-hover' : ''}`}
                                                        style={{ position: 'relative', overflow: 'hidden' }}>
                                                        <WorkplaceBgImage wpId={wp.id} />
                                                        <div style={{ fontWeight: 700, fontSize: 'var(--fs-md)', color: ok ? 'var(--teal)' : 'var(--text-dim)', position: 'relative', zIndex: 1 }}>{wp.name}</div>
                                                        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)', marginTop: 1, lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{wp.effectText}</div>
                                                        {wp.multipleAllowed && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--purple)', position: 'relative', zIndex: 1 }}>∞ 複数可</div>}
                                                        {wp.workers.length > 0 && (
                                                            <div style={{ marginTop: 2, display: 'flex', gap: 1, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
                                                                {wp.workers.map((w, i) => renderWorkerChip(w, i))}
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
                                                        onClick={() => handleWorkplaceClickPlace(wp.id)}
                                                        onPointerDown={() => { if (!workerDragRender) startWorkplacePreview(wp, 2100 + col); }}
                                                        onPointerUp={() => { if (!workerDragRender) endPreview(); }}
                                                        onPointerLeave={() => { if (!workerDragRender) endPreview(); endHoverPreview(); }}
                                                        onPointerEnter={(e) => { startHoverWorkplacePreview(wp, 2100 + col, e); }}
                                                        className={`workplace-card ${ok ? 'workplace-available' : 'game-card-disabled'} ${workerDragRender?.hoveredUid === wp.id ? 'worker-drag-hover' : ''}`}
                                                        style={{ position: 'relative', overflow: 'hidden' }}>
                                                        <WorkplaceBgImage wpId={wp.id} />
                                                        <div style={{ fontWeight: 700, fontSize: 'var(--fs-md)', color: ok ? 'var(--teal)' : 'var(--text-dim)', position: 'relative', zIndex: 1 }}>{wp.name}</div>
                                                        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)', marginTop: 1, lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{wp.effectText}</div>
                                                        {wp.workers.length > 0 && (
                                                            <div style={{ marginTop: 2, display: 'flex', gap: 1, position: 'relative', zIndex: 1 }}>
                                                                {wp.workers.map((w, i) => renderWorkerChip(w, i))}
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

                                        // インラインレンダー関数（コンポーネントではない）でDOM安定性を保証
                                        // ※レンダー内でコンポーネントを定義するとstate変更でDOMが再作成されポインタイベントが失われる
                                        const renderWorkplaceCard = (wp: typeof roundAdded[0], ok: boolean) => {
                                            const isAnimating = roundCardAnim && wp.addedAtRound === roundCardAnim.round;
                                            return (
                                                <div
                                                    key={wp.id}
                                                    ref={(el) => { roundWorkplaceRefs.current[wp.addedAtRound] = el; }}
                                                    data-workplace-id={wp.id}
                                                    onClick={() => handleWorkplaceClickPlace(wp.id)}
                                                    onPointerDown={() => { if (!workerDragRender) startWorkplacePreview(wp, 2200 + wp.addedAtRound); }}
                                                    onPointerUp={() => { if (!workerDragRender) endPreview(); }}
                                                    onPointerLeave={() => { if (!workerDragRender) endPreview(); endHoverPreview(); }}
                                                    onPointerEnter={(e) => { startHoverWorkplacePreview(wp, 2200 + wp.addedAtRound, e); }}
                                                    className={`workplace-card ${ok && !isAnimating ? 'workplace-available' : 'game-card-disabled'} ${workerDragRender?.hoveredUid === wp.id ? 'worker-drag-hover' : ''}`}
                                                    style={{ ...(isAnimating ? { opacity: 0 } : {}), position: 'relative', overflow: 'hidden' }}>
                                                    <WorkplaceBgImage wpId={wp.id} />
                                                    <div style={{ fontWeight: 700, fontSize: 'var(--fs-md)', color: ok ? 'var(--teal)' : 'var(--text-dim)', position: 'relative', zIndex: 1 }}>{wp.name}</div>
                                                    <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)', marginTop: 1, lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{wp.effectText}</div>
                                                    {wp.multipleAllowed && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--purple)', position: 'relative', zIndex: 1 }}>∞ 複数可</div>}
                                                    {wp.workers.length > 0 && (
                                                        <div style={{ marginTop: 2, display: 'flex', gap: 1, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
                                                            {wp.workers.map((w, i) => renderWorkerChip(w, i))}
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
                                                        return renderWorkplaceCard(wp, ok);
                                                    })}
                                                    {Array.from({ length: maxCols }).map((_, col) => {
                                                        const wp = row2[col];
                                                        if (!wp) return <div key={`round-r2-${col}`} className="workplace-empty" />;
                                                        const ok = G.phase === 'work' && canInteract && canPlacePublic(G, curPid, wp);
                                                        return renderWorkplaceCard(wp, ok);
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
                                                            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)', position: 'relative', zIndex: 1 }}>新職場</div>
                                                            <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--teal)', position: 'relative', zIndex: 1 }}>{wpName || '—'}</div>
                                                            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)', position: 'relative', zIndex: 1 }}>R{roundCardAnim.round}</div>
                                                        </div>
                                                    );
                                                })()}
                                            </>
                                        );
                                    })()}
                                </div>

                                {/* 売却建物 */}
                                {soldWorkplaces.length > 0 && (
                                    <div style={{ position: 'relative', zIndex: 3 }}>
                                        <div className="workplaces-row-label sold-buildings-label" style={{ color: 'var(--green)' }}>
                                            <IconHouse size={"calc(var(--fs) * 0.89)"} color="var(--green)" /> 売却建物
                                        </div>
                                        <div className="sold-buildings-area">
                                            <div className="sold-buildings-grid">
                                                {soldWorkplaces.map(wp => {
                                                    const ok = G.phase === 'work' && canInteract && canPlacePublic(G, curPid, wp);
                                                    const def = wp.fromBuildingDefId ? getCardDef(wp.fromBuildingDefId) : null;
                                                    return (
                                                        <div key={wp.id}
                                                            data-workplace-id={wp.id}
                                                            onClick={() => handleWorkplaceClickPlace(wp.id)}
                                                            onPointerDown={() => { if (!workerDragRender) startWorkplacePreview(wp, 2300 + soldWorkplaces.indexOf(wp)); }}
                                                            onPointerUp={() => { if (!workerDragRender) endPreview(); }}
                                                            onPointerLeave={() => { if (!workerDragRender) endPreview(); endHoverPreview(); }}
                                                            onPointerEnter={(e) => { startHoverWorkplacePreview(wp, 2300 + soldWorkplaces.indexOf(wp), e); }}
                                                            className={`hand-card building-card-in-field ${ok ? 'hand-card-playable' : ''} ${!ok && wp.workers.length > 0 ? 'building-placed' : ''} ${workerDragRender?.hoveredUid === wp.id ? 'worker-drag-hover' : ''}`}
                                                            style={{
                                                                borderColor: ok ? 'var(--teal-40)' : 'var(--teal-15)',
                                                            }}>
                                                            {wp.fromBuildingDefId && <CardBgImage defId={wp.fromBuildingDefId} />}
                                                            <div style={{ fontWeight: 700, fontSize: 'var(--fs-base)', lineHeight: 1.2, color: ok ? 'var(--text-primary)' : 'var(--text-dim)', position: 'relative', zIndex: 1 }}>
                                                                {wp.name}
                                                            </div>
                                                            {def && (
                                                                <>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, position: 'relative', zIndex: 1 }}>
                                                                        <span style={{ fontSize: 'var(--fs-md)', color: 'var(--text-dim)', fontWeight: 600 }}>C{def.cost}</span>
                                                                        <span style={{ fontSize: 'var(--fs-md)', color: 'var(--gold-dim)', fontWeight: 600 }}>{def.vp}VP</span>
                                                                    </div>
                                                                    <TagBadges defId={wp.fromBuildingDefId!} compact={isMobileTouchUi} />
                                                                    {def.effectText && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-dim)', marginTop: 'auto', lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{def.effectText}</div>}
                                                                </>
                                                            )}
                                                            {!def && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)', marginTop: 1, lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{wp.effectText}</div>}
                                                            {wp.workers.length > 0 && (
                                                                <div style={{ marginTop: 2, display: 'flex', gap: 1, position: 'relative', zIndex: 1 }}>
                                                                    {wp.workers.map((w, i) => renderWorkerChip(w, i))}
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
                < div className="area-my-field" data-player-id={myPid} style={mobileMyFieldStyle} >
                    {/* 左: ワーカーコマ + 手札 */}
                    < div className="my-hand-section" ref={handAreaRef} >
                        {/* ワーカーコマ */}
                        <div className="worker-tokens" >
                            {/* ワーカーの使用済み状態はドローアニメーション凍結の影響を受けないよう、
                                常にrawG（最新ステート）を参照する */}
                            {(() => {
                                const realMyPlayer = rawG.players[myPid];
                                return Array.from({ length: realMyPlayer.workers }).map((_, i) => {
                                    const isAvailable = i < realMyPlayer.availableWorkers;
                                    const canDrag = isAvailable && rawG.phase === 'work' && canInteract && curPid === myPid;
                                    return (
                                        <img key={i}
                                            src={getMeepleSrc(parseInt(myPid))}
                                            className={`worker-token ${!isAvailable ? 'used' : ''} ${canDrag ? 'draggable worker-available-pulse' : ''} ${workerDragRender?.workerIndex === i ? 'dragging' : ''}`}
                                            onPointerDown={(e) => {
                                                if (!canDrag) return;
                                                e.preventDefault();
                                                workerDragRef.current = { x: e.clientX, y: e.clientY, hoveredUid: null, workerIndex: i };
                                                setWorkerDragRender({ ...workerDragRef.current });
                                            }}
                                            alt="worker"
                                        />
                                    );
                                });
                            })()}
                        </div >

                        {/* ① 精算インフォバー: 手札エリアの上 */}
                        {
                            needsCleanup && (
                                <div className="inline-info-bar" style={{ borderColor: 'var(--red)' }}>
                                    <span style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-secondary)' }}>
                                        <span style={{ color: 'var(--red)', fontWeight: 700 }}>{cleanupPlayerState!.selectedIndices.length}/{cleanupPlayerState!.excessCount}</span>枚を選択
                                    </span>
                                    <button onClick={() => { soundManager.playSFX('click'); moves.confirmDiscard(); }}
                                        disabled={cleanupPlayerState!.selectedIndices.length !== cleanupPlayerState!.excessCount}
                                        className="btn-danger" style={{ fontSize: 'var(--fs-xl)', padding: '2px 8px', lineHeight: 1 }}>
                                        ✓
                                    </button>
                                </div>
                            )
                        }
                        {/* ③ 捨て札選択インフォバー: 手札エリアの上 */}
                        {
                            isDiscardPhase && (
                                <div className="inline-info-bar" style={{ borderColor: 'var(--orange)' }}>
                                    <span style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-secondary)' }}>
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
                                        className="btn-danger" style={{ fontSize: 'var(--fs-xl)', padding: '2px 8px', lineHeight: 1 }}>
                                        ✓
                                    </button>
                                    <button onClick={() => { soundManager.playSFX('click'); moves.cancelAction(); }}
                                        className="btn-ghost" style={{ fontSize: 'var(--fs-xl)', padding: '2px 8px', lineHeight: 1 }}>
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
                                        <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-dim)' }}>手札 {myPlayer.hand.length}枚</div>
                                    </div>
                                );
                                // ドローアニメーション中はrawG（リアル）の手札を使用
                                // frozenGの手札はドロー前のカウントなのでdrawAnimSlotsとの整合性が取れない
                                const visibleCards = myHandSource;
                                // ドロー1_下中は旧枚数のmarginで既存カードの位置をキープ
                                // ドロー2_上開始時(drawAnimSlots=0)に新枚数のmarginに切替→CSSトランジションで滑らかに移動
                                const overlapForNew = myHandLayout.overlapMargin;
                                // ドローアニメーション中は常に新枚数のmarginを使用
                                // Phase1でmargin/paddingを事前シフト→Phase2で新カードが最終横位置にそのまま登場
                                const overlapMargin = overlapForNew;

                                // --- paddingLeft 計算: 常に新枚数(visibleCards.length)ベースで中央揃え ---
                                // ドロー時は追加後の枚数で先行計算→既存カードが滑らかに左へ寄る
                                const paddingLeft = myHandLayout.paddingLeft;

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
                                                        style={{ marginLeft: ci === 0 ? 0 : overlapMargin, zIndex: ci + 1, ...(isMobileTouchUi ? { height: 'var(--mobile-self-card-height)' } : {}), ...drawStyle }}>
                                                        <div style={{ fontWeight: 700, fontSize: 'var(--fs-3xl)', color: 'var(--text-dim)', textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>🂠</div>
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
                                            // ワーカードラッグ中に大工系職場にホバー → 建設可能カードをプレビュー強調
                                            let isDragBuildHighlight = false;

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

                                            // ワーカードラッグ中に大工系職場にホバー → 建設可能カードを強調
                                            if (!canClick && !isCons && def && workerDragRender?.hoveredUid?.startsWith('carpenter')) {
                                                const carpenterCostReduction = 0; // 大工のコスト軽減は0
                                                const cost = getConstructionCost(myPlayer, c.defId, carpenterCostReduction);
                                                isDragBuildHighlight = myPlayer.hand.length - 1 >= cost;
                                            }

                                            const selectedStyle = isSelected
                                                ? { transform: 'translateY(-10px)' }
                                                : isExcluded
                                                    ? { borderColor: 'var(--gold-40)', opacity: 0.6 }
                                                    : {};

                                            return (
                                                <div key={c.uid}
                                                    onClick={() => { if (canClick && clickAction && !previewData) { soundManager.playSFX('click'); clickAction(); } }}
                                                    onPointerDown={() => { if (!isCons) startCardPreview(c.defId, ci, 'above-hand'); }}
                                                    onPointerUp={endPreview}
                                                    onPointerLeave={() => { endPreview(); endHoverPreview(); }}
                                                    onPointerEnter={(e) => { if (!isCons) startHoverCardPreviewWithMode(c.defId, ci, e, 'above-hand'); }}
                                                    className={`hand-card ${isCons ? 'hand-card-consumable' : ''} ${canClick || isDragBuildHighlight ? 'hand-card-playable' : ''} ${workerDragRender?.hoveredUid?.startsWith('carpenter') && !isDragBuildHighlight && !isCons ? 'hand-card-drag-dimmed' : ''} ${pressingCardIdxRef.current === ci ? 'hand-card-pressing' : ''}`}
                                                    style={{ marginLeft: ci === 0 ? 0 : overlapMargin, zIndex: ci + 1, ...(isMobileTouchUi ? { height: 'var(--mobile-self-card-height)' } : {}), ...drawStyle, ...selectedStyle }}>
                                                    <CardBgImage defId={c.defId} />
                                                    <div style={{ fontWeight: 700, fontSize: 'var(--fs-base)', lineHeight: 1.2, color: isCons ? 'var(--text-secondary)' : 'var(--text-primary)', position: 'relative', zIndex: 1 }}>
                                                        {cName(c.defId)}
                                                    </div>
                                                    {def && (
                                                        <>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, position: 'relative', zIndex: 1, opacity: 1 }}>
                                                                <span style={{ fontSize: 'var(--fs-md)', color: 'var(--text-dim)', fontWeight: 600 }}>
                                                                    C{isBuildPhase ? getConstructionCost(myPlayer, c.defId, G.buildState!.costReduction) : def.cost}
                                                                </span>
                                                                <span style={{ fontSize: 'var(--fs-md)', color: 'var(--gold-dim)', fontWeight: 600 }}>{def.vp}VP</span>
                                                            </div>
                                                            <div style={{ opacity: 1 }}><TagBadges defId={c.defId} compact={isMobileTouchUi} /></div>
                                                            {def.effectText && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-dim)', marginTop: 'auto', lineHeight: 1.2, position: 'relative', zIndex: 1, opacity: 1 }}>{def.effectText}</div>}
                                                        </>
                                                    )}
                                                    {isCons && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)', marginTop: 2, position: 'relative', zIndex: 1 }}>消費財</div>}
                                                    {isSelected && <div style={{ color: 'var(--red)', fontSize: 'var(--fs-md)', fontWeight: 700, position: 'relative', zIndex: 1 }}>✓ 捨てる</div>}
                                                    {isExcluded && <div style={{ color: 'var(--gold)', fontSize: 'var(--fs-sm)', position: 'relative', zIndex: 1 }}>建設対象</div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                            {myPlayer.hand.length > 10 && (
                                <div style={{ position: 'absolute', right: -8, bottom: 40, fontSize: 'var(--fs-md)', color: 'var(--gold-dim)', writingMode: 'vertical-rl' }}>
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
                                        <span style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-secondary)' }}>
                                            💰 給料日 — 賃金<b style={{ color: 'var(--red)' }}>${pps.totalWage}</b> 所持<b style={{ color: 'var(--gold-light)' }}>${p.money}</b>+売却<b style={{ color: 'var(--green)' }}>${sellTotal}</b>
                                        </span>
                                        {isExcessive && <span style={{ fontSize: 'var(--fs-base)', color: 'var(--red)' }}>⚠ 売りすぎ</span>}
                                        <button onClick={() => { soundManager.playSFX('click'); moves.confirmPaydaySell(); }}
                                            disabled={!canConfirm}
                                            className="btn-danger" style={{ fontSize: 'var(--fs-base)', padding: '2px 8px' }}>
                                            ✓
                                        </button>
                                    </div>
                                );
                            })()
                        }
                        {/* payday: 売却不要の待機表示 */}
                        {
                            isPaydayPhase && paydayPlayerState && paydayPlayerState.step === 'payday' && !needsPaydaySelling && !paydayPlayerState.confirmed && (
                                <div className="buildings-info-bar" style={{ borderColor: 'var(--gold)' }}>
                                    <span style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-secondary)' }}>💰 給料は自動支払い済み</span>
                                    <button onClick={() => { soundManager.playSFX('click'); moves.confirmPayday(); }}
                                        className="btn-primary" style={{ fontSize: 'var(--fs-base)', padding: '2px 8px' }}>
                                        ✓
                                    </button>
                                </div>
                            )
                        }
                        {/* ⑤ 建設案内インフォバー: 建物エリアの上 */}
                        {
                            isBuildPhase && (
                                <div className="buildings-info-bar" style={{ borderColor: 'var(--gold)' }}>
                                    <span style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <IconHammer size={"calc(var(--fs) * 1.11)"} /> 建設するカードを選択
                                    </span>
                                    <button onClick={() => { soundManager.playSFX('click'); moves.cancelAction(); }}
                                        className="btn-ghost" style={{ fontSize: 'var(--fs-base)', padding: '2px 8px' }}>
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
                                    : (canActivate || isPaydaySellable) ? 'var(--teal-40)' : 'var(--teal-15)';
                                return (
                                    <div key={`${b.card.defId}-${bi}`}
                                        data-building-uid={b.card.uid}
                                        onClick={(e) => {
                                            // CLICK_PLACE_WORKERフラグ有効時: クリックでワーカーを配置
                                            if (canActivate && featureFlags.CLICK_PLACE_WORKER && !workerDragRef.current) {
                                                handlePlaceWorkerOnBuilding(b.card.uid, e);
                                                return;
                                            }
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
                                        onPointerLeave={() => { if (!workerDragRender) endPreview(); endHoverPreview(); }}
                                        onPointerEnter={(e) => { startHoverCardPreview(b.card.defId, 1000 + bi, e); }}
                                        className={`hand-card building-card-in-field ${canActivate || isPaydaySellable ? 'hand-card-playable' : ''} ${b.workerPlaced && !isPaydayPhase ? 'building-placed' : ''} ${workerDragRender?.hoveredUid === b.card.uid && canActivate ? 'worker-drag-hover' : ''}`}
                                        style={{
                                            borderColor: color,
                                            ...(isMobileTouchUi ? { height: myHandLayout.cardH } : {}),
                                            ...(isPaydaySelected ? { boxShadow: '0 0 12px var(--red-30)' } : {}),
                                            ...(needsPaydaySelling && def.unsellable ? { opacity: 0.5 } : {}),
                                        }}
                                        title={`${def.name} (${def.vp}VP) ${def.effectText}`}>
                                        <CardBgImage defId={b.card.defId} />
                                        <div style={{ fontWeight: 700, fontSize: 'var(--fs-base)', lineHeight: 1.2, color: b.workerPlaced ? 'var(--text-dim)' : 'var(--text-primary)', position: 'relative', zIndex: 1 }}>
                                            {def.name}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, position: 'relative', zIndex: 1 }}>
                                            <span style={{ fontSize: 'var(--fs-md)', color: 'var(--text-dim)', fontWeight: 600 }}>C{def.cost}</span>
                                            <span style={{ fontSize: 'var(--fs-md)', color: 'var(--gold-dim)', fontWeight: 600 }}>{def.vp}VP</span>
                                        </div>
                                        <TagBadges defId={b.card.defId} compact={isMobileTouchUi} />
                                        {def.effectText && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-dim)', marginTop: 'auto', lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{def.effectText}</div>}
                                        {b.workerPlaced && <img src={getMeepleSrc(parseInt(myPid))} className="worker-on-building-icon" alt="配置済み" />}
                                        {isPaydaySelected && <div style={{ color: 'var(--red)', fontSize: 'var(--fs-md)', fontWeight: 700, position: 'relative', zIndex: 1 }}>💰 売却</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div >

                    {/* 右: ステータス */}
                    < div className="my-status-panel" >
                        <span className="stat-badge" style={{ fontSize: 'var(--fs-base)', padding: '2px 6px' }}>
                            <IconMoney size={"var(--fs)"} color="var(--gold-light)" /><b style={{ color: 'var(--gold-light)' }}>${myPlayer.money}</b>
                        </span>
                        <span className="stat-badge" style={{ fontSize: 'var(--fs-base)', padding: '2px 6px' }}>
                            <IconDeck size={"var(--fs)"} color="var(--text-secondary)" /><b style={{ color: 'var(--text-secondary)' }}>{myPlayer.hand.length}/{myPlayer.maxHandSize}</b>
                        </span>
                        {
                            myPlayer.vpTokens > 0 && (
                                <span className="stat-badge" style={{ fontSize: 'var(--fs-base)', padding: '2px 6px' }}>
                                    <IconTrophy size={"var(--fs)"} color="var(--gold)" /><b style={{ color: 'var(--gold)' }}>{myPlayer.vpTokens}</b>
                                </span>
                            )
                        }
                        {
                            myPlayer.unpaidDebts > 0 && (
                                <span className="stat-badge" style={{ fontSize: 'var(--fs-base)', padding: '2px 6px', borderColor: 'var(--red-30)' }}>
                                    <b style={{ color: 'var(--red)' }}>Debt {myPlayer.unpaidDebts}</b>
                                </span>
                            )
                        }
                        {isFullscreenSupported && (
                            <button
                                type="button"
                                onClick={toggleFullscreen}
                                className="fullscreen-toggle-button"
                                title={isFullscreen ? '全画面表示を終了' : '全画面表示'}
                                aria-label={isFullscreen ? '全画面表示を終了' : '全画面表示'}
                            >
                                {isFullscreen
                                    ? <IconFullscreenExit size={"calc(var(--fs) * 1.44)"} />
                                    : <IconFullscreen size={"calc(var(--fs) * 1.44)"} />}
                            </button>
                        )}
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
                    <h2 style={{ margin: 0, fontSize: 'var(--fs-4xl)', fontWeight: 700, color: '#818cf8', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <IconLog size={"calc(var(--fs) * 2.22)"} /> ゲームログ
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
    const previewDefIdRef = useRef<string | null>(null);
    const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clearTimer = () => { if (previewTimer.current) { clearTimeout(previewTimer.current); previewTimer.current = null; } };
    useEffect(() => {
        previewDefIdRef.current = previewDefId;
    }, [previewDefId]);
    const startCardPreview = (defId: string) => {
        clearTimer();
        previewTimer.current = setTimeout(() => { setPreviewDefId(defId); }, 300);
    };
    const endCardPreview = () => { clearTimer(); };
    const closeCardPreview = () => { clearTimer(); setPreviewDefId(null); };
    useEffect(() => {
        const handlePreviewRelease = () => {
            clearTimer();
            if (matchesMobileTouchUi() && previewDefIdRef.current) setPreviewDefId(null);
        };
        document.addEventListener('pointerup', handlePreviewRelease, true);
        document.addEventListener('pointercancel', handlePreviewRelease, true);
        return () => {
            document.removeEventListener('pointerup', handlePreviewRelease, true);
            document.removeEventListener('pointercancel', handlePreviewRelease, true);
        };
    }, []);

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
                                <div style={{ fontWeight: 700, fontSize: 'var(--fs-4xl)', color: 'var(--text-primary)', marginBottom: 4 }}>{pDef.name}</div>
                                <div style={{ fontSize: 'var(--fs-xl2)', color: 'var(--text-secondary)', marginBottom: 6 }}>{tagLabel}</div>
                                <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                                    <span style={{ fontSize: 'var(--fs-2xl)', color: 'var(--text-dim)', fontWeight: 600 }}>コスト: <b style={{ color: 'var(--gold-light)' }}>C{pDef.cost}</b></span>
                                    <span style={{ fontSize: 'var(--fs-2xl)', color: 'var(--text-dim)', fontWeight: 600 }}>得点: <b style={{ color: 'var(--gold-light)' }}>{pDef.vp}VP</b></span>
                                </div>
                                {pDef.effectText && <div style={{ fontSize: 'var(--fs-xl3)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{pDef.effectText}</div>}
                            </div>
                        </div>
                    </div>
                );
            })()}
            <div className="modal-content animate-slide-up" style={{ position: 'relative', maxWidth: 700 }}>
                {/* キャンセルボタン廃止 */}
                <h2 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 700, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconSearch size={"calc(var(--fs) * 2.44)"} color="var(--gold)" /> 設計事務所
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
                                        boxShadow: '0 0 12px var(--teal-40)',
                                    } : {}),
                                }}>
                                <CardBgImage defId={c.defId} />
                                {/* カード名 */}
                                <div style={{ fontWeight: 700, fontSize: 'var(--fs-base)', lineHeight: 1.2, color: isCons ? 'var(--text-secondary)' : 'var(--text-primary)', position: 'relative', zIndex: 1 }}>
                                    {cName(c.defId)}
                                </div>
                                {def && (
                                    <>
                                        {/* コスト・VP */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, position: 'relative', zIndex: 1 }}>
                                            <span style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-secondary)', fontWeight: 600 }}>C{def.cost}</span>
                                            <span style={{ fontSize: 'var(--fs-lg)', color: 'var(--gold-light)', fontWeight: 600 }}>{def.vp}VP</span>
                                        </div>
                                        {/* 属性タグ */}
                                        <TagBadges defId={c.defId} />
                                        {/* 説明文 */}
                                        {def.effectText && <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-secondary)', marginTop: 'auto', lineHeight: 1.2, position: 'relative', zIndex: 1 }}>{def.effectText}</div>}
                                    </>
                                )}
                                {isCons && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dim)', marginTop: 2, position: 'relative', zIndex: 1 }}>消費財</div>}
                                {/* 選択マーク */}
                                {isSelected && <div style={{ position: 'absolute', top: 4, right: 4, fontSize: 'var(--fs-2xl)', zIndex: 2 }}>✓</div>}
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
                        style={{ fontSize: 'var(--fs-xl)', padding: '4px 16px', lineHeight: 1 }}>
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
                <h2 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 700, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconHammer size={"calc(var(--fs) * 2.44)"} color="var(--gold)" /> 二胡市建設
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>
                    同じコストの建物カードを<b style={{ color: 'var(--gold)' }}>2枚</b>選択してください（コストは1つ分のみ支払い）
                </p>
                <p style={{ fontSize: 'var(--fs-xl)', color: 'var(--text-dim)', marginBottom: 16 }}>選択中: {ds.selectedCardIndices.length}/2枚</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {p.hand.map((c, ci) => {
                        const isCons = isConsumable(c);
                        if (isCons) return (
                            <div key={c.uid} className="game-card game-card-disabled" style={{ minWidth: 100 }}>
                                <div style={{ fontWeight: 700, fontSize: 'var(--fs-xl2)' }}>消費財</div>
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
                                <div style={{ fontWeight: 700, fontSize: 'var(--fs-xl2)' }}>{def.name}</div>
                                <div style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-dim)' }}>C{def.cost}/{def.vp}VP</div>
                                <TagBadges defId={c.defId} />
                                {selected && <div style={{ color: 'var(--gold)', fontSize: 'var(--fs-xl)', marginTop: 4, fontWeight: 700 }}>✓ 選択中</div>}
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
                <h2 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 700, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconTrash size={"calc(var(--fs) * 2.44)"} color="var(--gold)" /> カードを捨てる
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
                                    ...(excluded ? { borderColor: 'var(--gold-40)', background: 'var(--gold-15)', opacity: 0.6, cursor: 'not-allowed' } : {}),
                                    ...(selected ? { borderColor: 'var(--red)', boxShadow: '0 0 15px var(--red-30)' } : {}),
                                }}>
                                <div style={{ fontWeight: 700, fontSize: 'var(--fs-xl2)' }}>{cName(c.defId)}</div>
                                {excluded && <div style={{ fontSize: 'var(--fs-base)', color: 'var(--gold)' }}>建設対象</div>}
                                {!isCons && !excluded && <div style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-dim)' }}>C{getCardDef(c.defId).cost}/{getCardDef(c.defId).vp}VP</div>}
                                <TagBadges defId={c.defId} />
                                {selected && <div style={{ color: 'var(--red)', fontSize: 'var(--fs-xl)', marginTop: 4, fontWeight: 700 }}>✓ 捨てる</div>}
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
    const playerName = (pid: string | number) => getPlayerDisplayName(G.playerNames, pid);

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
                    <div style={{ fontSize: 'var(--fs-icon)', marginBottom: 16, animation: 'pulse 2s ease-in-out infinite' }}>💰</div>
                    <h2 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>給料日処理中...</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>あなたの賌金は自動支払い済みです</p>
                    {waiting.length > 0 && <p style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-xl2)', marginTop: 8 }}>待機中: {waiting.map(([pid]) => playerName(pid)).join(', ')}</p>}
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
                <h2 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 700, color: 'var(--gold)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconPayment size={"calc(var(--fs) * 2.44)"} color="var(--gold)" /> 給料日 — {playerName(targetPid)}
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div className="glass-card" style={{ padding: 12 }}>
                        <div style={{ fontSize: 'var(--fs-xl)', color: 'var(--text-dim)' }}>賌金</div>
                        <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, marginTop: 4 }}>
                            ${ps.wagePerWorker}/人 × {Math.max(0, p.workers - p.robotWorkers)}人 = <span style={{ color: 'var(--red)' }}>${totalWage}</span>
                        </div>
                    </div>
                    <div className="glass-card" style={{ padding: 12 }}>
                        <div style={{ fontSize: 'var(--fs-xl)', color: 'var(--text-dim)' }}>所持金 + 売却</div>
                        <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, marginTop: 4 }}>
                            <span style={{ color: 'var(--gold-light)' }}>${p.money}</span> + <span style={{ color: 'var(--green)' }}>${sellTotal}</span> = <span style={{ color: totalFunds >= totalWage ? 'var(--green)' : 'var(--red)' }}>${totalFunds}</span>
                        </div>
                    </div>
                </div>

                {shortage > 0 && <p style={{ color: 'var(--red)', marginBottom: 12, fontSize: 'var(--fs-xl3)' }}>⚠️ 不足: ${shortage} — 建物を売却してください（1VP=$1）</p>}

                {p.buildings.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 'var(--fs-xl)', color: 'var(--text-dim)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <IconHouse size={"calc(var(--fs) * 1.56)"} /> 建物（クリックで売却選択/解除）:
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
                                        <div style={{ fontWeight: 700, fontSize: 'var(--fs-xl2)' }}>{def.name}</div>
                                        <div style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-dim)' }}>{def.vp}VP = <b style={{ color: 'var(--gold-light)' }}>${def.vp}</b></div>
                                        {disabled && <div style={{ color: 'var(--red)', fontSize: 'var(--fs-base)' }}>売却不可</div>}
                                        {selected && <div style={{ color: 'var(--gold)', fontSize: 'var(--fs-xl)', marginTop: 3, fontWeight: 700 }}>✓ 売却</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {isExcessive && <p style={{ color: 'var(--orange)', fontSize: 'var(--fs-xl2)', marginBottom: 8 }}>⚠️ 余分に建物を売ることはできません</p>}

                <button onClick={() => {
                    soundManager.playSFX('click');
                    moves.confirmPaydaySell();
                }}
                    disabled={!canConfirm}
                    className="btn-primary">
                    <IconPayment size={"calc(var(--fs) * 1.78)"} /> 支払い確定{!canAfford && allSellableSelected ? `（不足$${totalWage - totalFunds}は負債）` : ''}
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
    const playerName = (pid: string | number) => getPlayerDisplayName(G.playerNames, pid);

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
                    <div style={{ fontSize: 'var(--fs-icon)', marginBottom: 16, animation: 'pulse 2s ease-in-out infinite' }}>🗑️</div>
                    <h2 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>精算処理中...</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>あなたの手札整理は完了しています</p>
                    {waiting.length > 0 && <p style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-xl2)', marginTop: 8 }}>待機中: {waiting.map(([pid]) => playerName(pid)).join(', ')}</p>}
                </div>
            </div>
        );
    }

    const excessCount = cps?.excessCount ?? cs.excessCount;
    const selectedIndices = cps?.selectedIndices ?? cs.selectedIndices;

    return (
        <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="modal-content animate-slide-up" style={{ maxWidth: 750 }}>
                <h2 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 700, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconTrash size={"calc(var(--fs) * 2.44)"} color="var(--gold)" /> 精算 — {playerName(targetPid)}
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
                                    ...(selected ? { borderColor: 'var(--red)', boxShadow: '0 0 15px var(--red-30)' } : {}),
                                }}>
                                <div style={{ fontWeight: 700, fontSize: 'var(--fs-xl2)' }}>{cName(c.defId)}</div>
                                {!isConsumable(c) && <div style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-dim)' }}>C{getCardDef(c.defId).cost}/{getCardDef(c.defId).vp}VP</div>}
                                <TagBadges defId={c.defId} />
                                {selected && <div style={{ color: 'var(--red)', fontSize: 'var(--fs-xl)', marginTop: 3, fontWeight: 700 }}>✓ 捨てる</div>}
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
    // defIdでグループ化（コスト順ソート）
    const groups: Record<string, { defId: string; count: number }> = {};
    for (const c of discard) {
        if (!groups[c.defId]) groups[c.defId] = { defId: c.defId, count: 0 };
        groups[c.defId].count++;
    }
    const entries = Object.values(groups).sort((a, b) => {
        const da = getCardDef(a.defId), db = getCardDef(b.defId);
        return da.cost - db.cost || da.name.localeCompare(db.name);
    });
    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 99999 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <h2 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 700, color: 'var(--orange)', marginBottom: 'var(--sp-4)', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexShrink: 0 }}>
                    <IconDiscard size={"calc(var(--fs) * 2.22)"} color="var(--orange)" /> 捨て札（{discard.length}枚）
                </h2>
                {entries.length === 0 ? <p style={{ color: 'var(--text-dim)' }}>なし</p> : (
                    <div className="discard-grid">
                        {entries.map(({ defId, count }) => {
                            const def = getCardDef(defId);
                            const imgSrc = def.image ? `${import.meta.env.BASE_URL}${def.image.replace(/^\//, '')}` : null;
                            return (
                                <div key={defId} className="discard-grid-card">
                                    {count > 1 && <div className="discard-count-badge">×{count}</div>}
                                    <div className="discard-card-image">
                                        {imgSrc ? <img src={imgSrc} alt={def.name} /> : (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 'var(--fs-3xl)' }}>🃏</div>
                                        )}
                                    </div>
                                    <div className="discard-card-info">
                                        <div className="discard-card-name">{def.name}</div>
                                        <div className="discard-card-stats">
                                            <span>C<b style={{ color: 'var(--gold-light)' }}>{def.cost}</b></span>
                                            <span><b style={{ color: 'var(--gold-light)' }}>{def.vp}</b>VP</span>
                                        </div>
                                        {def.effectText && (
                                            <div className="discard-card-effect">
                                                {renderEffectText(def.effectText)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                <button onClick={() => { soundManager.playSFX('click'); onClose(); }} className="btn-ghost" style={{ marginTop: 'var(--sp-4)', flexShrink: 0 }}>閉じる</button>
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
    const playerName = (pid: string | number) => getPlayerDisplayName(G.playerNames, pid);
    useEffect(() => {
        soundManager.playSFX('win');
    }, []);

    if (!G.finalScores) return null;
    return (
        <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="modal-content animate-slide-up" style={{ maxWidth: 700 }}>
                <h1 className="trophy-glow" style={{ textAlign: 'center', fontSize: 'var(--fs-4xl)', fontWeight: 900, color: 'var(--gold)', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                    <IconTrophy size={"calc(var(--fs) * 5.33)"} color="var(--gold)" /> ゲーム終了！
                </h1>
                {G.finalScores.map((s, i) => {
                    const isExpanded = expandedPlayer === s.playerIndex;
                    const isDebtExpanded = expandedDebt === s.playerIndex;
                    return (
                        <div key={s.playerIndex} className="glass-card" style={{
                            marginBottom: 12, padding: 16,
                            ...(i === 0 ? { borderColor: 'var(--gold-40)', boxShadow: 'var(--glow-gold)' } : {}),
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span style={{ fontSize: 'var(--fs-4xl)' }}>{['🥇', '🥈', '🥉'][i] || `${i + 1}位`}</span>
                                    <span style={{ fontWeight: 700, fontSize: 'var(--fs-4xl)' }} title={playerName(s.playerIndex)}>{playerName(s.playerIndex)}</span>
                                </div>
                                <span style={{ fontSize: 'var(--fs-4xl)', fontWeight: 900, color: 'var(--gold)' }}>{s.breakdown.total}VP</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
                                <div className="glass-card" style={{ padding: 10 }}>
                                    <div style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-dim)' }}>建物合計</div>
                                    <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 'var(--fs-3xl)' }}>{s.breakdown.buildingVP + s.breakdown.bonusVP}VP</div>
                                    <button onClick={() => { soundManager.playSFX('click'); setExpandedPlayer(isExpanded ? null : s.playerIndex); }} className="btn-ghost" style={{ fontSize: 'var(--fs-base)', marginTop: 4, padding: '1px 6px' }}>
                                        {isExpanded ? '▲ 閉じる' : '▼ 内訳'}
                                    </button>
                                </div>
                                <div className="glass-card" style={{ padding: 10 }}>
                                    <div style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-dim)' }}>所持金</div>
                                    <div style={{ fontWeight: 700, color: 'var(--gold-light)', fontSize: 'var(--fs-3xl)' }}>{s.breakdown.moneyVP}VP</div>
                                </div>
                                <div className="glass-card" style={{ padding: 10 }}>
                                    <div style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-dim)' }}>未払い賃金</div>
                                    <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: 'var(--fs-3xl)' }}>{s.breakdown.debtVP}VP</div>
                                    {s.breakdown.rawDebts > 0 && (
                                        <button onClick={() => { soundManager.playSFX('click'); setExpandedDebt(isDebtExpanded ? null : s.playerIndex); }} className="btn-ghost" style={{ fontSize: 'var(--fs-base)', marginTop: 4, padding: '1px 6px' }}>
                                            {isDebtExpanded ? '▲ 閉じる' : '▼ 内訳'}
                                        </button>
                                    )}
                                </div>
                            </div>
                            {isExpanded && s.breakdown.buildingDetails && (
                                <div className="glass-card" style={{ marginTop: 8, padding: 12 }}>
                                    <div style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-dim)', marginBottom: 6 }}>📋 建物VP内訳:</div>
                                    {s.breakdown.buildingDetails.map((bd, bdi) => (
                                        <div key={bdi} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{ fontSize: 'var(--fs-xl2)' }}>{bd.name}</span>
                                            <span style={{ fontSize: 'var(--fs-xl2)', color: 'var(--green)', fontWeight: 600 }}>
                                                {bd.bonusVP > 0 ? `${bd.baseVP} + ${bd.bonusVP}` : `${bd.baseVP}`}VP
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {isDebtExpanded && s.breakdown.rawDebts > 0 && (
                                <div className="glass-card" style={{ marginTop: 8, padding: 12 }}>
                                    <div style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-dim)', marginBottom: 6 }}>📋 未払い賃金内訳:</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 'var(--fs-xl2)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <span>未払い賃金カード</span>
                                        <span style={{ color: 'var(--red)' }}>{s.breakdown.rawDebts}枚 × -3 = {s.breakdown.rawDebts * -3}VP</span>
                                    </div>
                                    {s.breakdown.hasLawOffice && s.breakdown.exemptedDebts > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 'var(--fs-xl2)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span>法律事務所による免除</span>
                                            <span style={{ color: 'var(--green)' }}>+{s.breakdown.exemptedDebts * 3}VP（{s.breakdown.exemptedDebts}枚免除）</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', marginTop: 4, fontWeight: 700, fontSize: 'var(--fs-xl2)' }}>
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
                    <button onClick={() => { soundManager.playSFX('click'); window.location.reload(); }} className="btn-primary" style={{ padding: '10px 28px', fontSize: 'var(--fs-3xl)' }}>
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
