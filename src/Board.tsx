// ============================================================
// Board.tsx  –  メインUI (v7: プレミアムUI + CPU対戦)
// ============================================================
import React, { useState, useRef, useEffect } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import type { GameState, Card, PlayerState } from './types';
import { getCardDef, CONSUMABLE_DEF_ID } from './cards';
import { getConstructionCost } from './game';
import { decideCPUMove } from './bots';
import type { CPUConfig } from './App';
import { soundManager } from './SoundManager';
import { SoundSettings } from './SoundSettings';
import { CPUSettings } from './CPUSettings';
import {
    IconMoney, IconWorker, IconHouse, IconDeck, IconDiscard, IconLog,
    IconHammer, IconRobot, IconPlayer, IconSearch, IconTrash, IconPayment,
    IconTrophy, IconSoundOn, IconSoundOff, TagFarm, TagFactory, TagLock
} from './components/Icons';

const isConsumable = (c: Card) => c.defId === CONSUMABLE_DEF_ID;
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

/** タグバッジ JSX */
function TagBadges({ defId }: { defId: string }) {
    if (defId === CONSUMABLE_DEF_ID) return null;
    const d = getCardDef(defId);
    return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {d.tags.includes('farm') && <span className="tag-badge tag-farm"><TagFarm size={10} /> 農園</span>}
            {d.tags.includes('factory') && <span className="tag-badge tag-factory"><TagFactory size={10} /> 工場</span>}
            {d.unsellable && <span className="tag-badge tag-lock"><TagLock size={10} /> 売却不可</span>}
        </div>
    );
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

function getWagePerWorker(r: number): number {
    if (r <= 2) return 2;
    if (r <= 5) return 3;
    if (r <= 7) return 4;
    return 5;
}

// ============================================================
// メインBoard
// ============================================================
export function Board({ G, ctx, moves, playerID, cpuConfig }: BoardProps<GameState> & { cpuConfig?: CPUConfig }) {
    const [showDiscard, setShowDiscard] = useState(false);
    const [showLog, setShowLog] = useState(false);
    const [muted, setMuted] = useState(soundManager.getSettings().isMuted);
    const [showSettings, setShowSettings] = useState(false);
    const [showCpuSettings, setShowCpuSettings] = useState(false);
    const curPid = ctx.currentPlayer;
    const curIdx = parseInt(curPid);
    const wage = getWagePerWorker(G.round);

    // ====== P2P対応 ======
    // playerIDがあればP2P（オンライン）モード、なければホットシート/CPU対戦
    const myPid = playerID ?? curPid;
    const isOnline = playerID !== null && playerID !== undefined;

    // モーダルフェーズ中の操作者判定
    // payday/cleanup は同時処理対応: P2Pでは全員が自分の操作をする
    // build/discard/designOffice/dualConstruction は手番プレイヤーの操作なので ctx.currentPlayer を使用
    const modalPhases = ['payday', 'cleanup', 'discard', 'build', 'designOffice', 'dualConstruction'];
    const isModalPhase = modalPhases.includes(G.phase);

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

    // ====== CPU自動プレイ ======
    // P2P重複move防止: 同じstateに対してmoveを2回以上発行しないためのガード
    const cpuMoveSignatureRef = useRef<string>('');
    // フォールバック: signatureが一定時間変わらない場合にリセットするためのタイマー
    const cpuStuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!cpuConfig?.enabled) return;
        if (G.phase === 'gameEnd') return;
        if (showCpuSettings) return; // 設定中は停止

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
    }, [G, curPid, cpuConfig, moves, showCpuSettings, playerID]);

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

    // 給料日モーダル
    if (G.phase === 'payday' && G.paydayState) return <PaydayUI G={G} moves={moves} myPid={myPid} isOnline={isOnline} />;

    // 精算（手札捨て）
    if (G.phase === 'cleanup' && G.cleanupState) return <CleanupUI G={G} moves={moves} myPid={myPid} isOnline={isOnline} />;

    // 捨てカード選択モーダル
    if (G.phase === 'discard' && G.discardState) return <DiscardUI G={G} moves={moves} pid={curPid} />;

    // 設計事務所モーダル
    if (G.phase === 'designOffice' && G.designOfficeState) return <DesignOfficeUI G={G} moves={moves} />;

    // 二胡市建設モーダル
    if (G.phase === 'dualConstruction' && G.dualConstructionState) return <DualConstructionUI G={G} moves={moves} pid={curPid} />;

    return (
        <div className="game-bg" style={{ padding: 12 }}>
            {/* ヘッダー */}
            <div className="game-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderRadius: 12, marginBottom: 16 }}>
                <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--gold)', margin: 0, display: 'flex', alignItems: 'center', gap: 10, letterSpacing: '1px' }}>
                    <IconHammer size={20} color="var(--gold)" /> <span>NATIONAL ECONOMY</span>
                </h1>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="stat-badge" style={{ borderColor: 'rgba(96, 165, 250, 0.2)' }}>
                        <span style={{ color: 'var(--text-dim)', fontSize: 10, fontWeight: 700 }}>ROUND</span>
                        <b style={{ color: 'var(--blue)', fontSize: 16 }}>{G.round}</b>
                        <span style={{ color: 'var(--text-dim)' }}>/9</span>
                    </span>
                    <span className="stat-badge">
                        <IconMoney size={14} color="var(--teal)" />
                        <span style={{ color: 'var(--text-dim)' }}>WAGE</span>
                        <b style={{ color: 'var(--teal)', fontSize: 14 }}>${wage}</b>
                    </span>
                    <span className="stat-badge">
                        <IconHouse size={14} color="var(--green)" />
                        <span style={{ color: 'var(--text-dim)' }}>BUDGET</span>
                        <b style={{ color: 'var(--green)', fontSize: 14 }}>${G.household}</b>
                    </span>
                    <span className="stat-badge">
                        <IconDeck size={14} color="var(--purple)" />
                        <span style={{ color: 'var(--text-dim)' }}>DECK</span>
                        <b style={{ color: 'var(--purple)', fontSize: 14 }}>{G.deck.length}</b>
                    </span>
                    <button onClick={() => { soundManager.playSFX('click'); setShowDiscard(!showDiscard); }} className="stat-badge" style={{ cursor: 'pointer', border: '1px solid rgba(251, 146, 60, 0.15)' }}>
                        <IconDiscard size={14} color="var(--orange)" />
                        <span style={{ color: 'var(--text-dim)' }}>DISCARD</span>
                        <b style={{ color: 'var(--orange)', fontSize: 14 }}>{G.discard.length}</b>
                    </button>
                    <button onClick={() => { soundManager.playSFX('click'); setShowLog(!showLog); }} className="stat-badge" style={{ cursor: 'pointer', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                        <IconLog size={14} color="#818cf8" />
                        <span style={{ color: 'var(--text-dim)' }}>LOG</span>
                        <b style={{ color: '#818cf8', fontSize: 14 }}>{G.log.length}</b>
                    </button>
                    <button onClick={() => { soundManager.playSFX('click'); setShowSettings(true); }} className="stat-badge" style={{ cursor: 'pointer', padding: '6px 10px' }} title="音量設定">
                        {muted ? <IconSoundOff size={16} /> : <IconSoundOn size={16} />}
                    </button>
                    {cpuConfig?.enabled && (
                        <button onClick={() => { soundManager.playSFX('click'); setShowCpuSettings(true); }} className="stat-badge" style={{ cursor: 'pointer', padding: '6px 10px' }} title="CPU設定">
                            <IconRobot size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* 設定モーダル */}
            {showSettings && <SoundSettings onClose={() => {
                setShowSettings(false);
                setMuted(soundManager.getSettings().isMuted);
            }} />}
            {showCpuSettings && <CPUSettings onClose={() => setShowCpuSettings(false)} />}

            {/* 捨て札モーダル */}
            {showDiscard && <DiscardPileModal discard={G.discard} onClose={() => setShowDiscard(false)} />}
            {showLog && <LogModal log={G.log} onClose={() => setShowLog(false)} />}

            {/* ターン表示 */}
            <div className="turn-bar" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {cpuConfig?.enabled && cpuConfig.cpuPlayers.includes(curPid) ? <IconRobot size={18} /> : <IconPlayer size={18} />}
                <span>
                    <b style={{ color: 'var(--gold-light)' }}>P{curIdx + 1}</b> のターン
                </span>
                {cpuConfig?.enabled && cpuConfig.cpuPlayers.includes(curPid) && (
                    <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-dim)', background: 'rgba(160, 120, 48, 0.15)', padding: '2px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="animate-pulse">●</span> Thinking...
                    </span>
                )}
                {G.phase === 'build' && (
                    <span style={{ marginLeft: 12, background: 'rgba(220, 38, 38, 0.2)', border: '1px solid rgba(220, 38, 38, 0.3)', padding: '2px 10px', borderRadius: 6, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <IconHammer size={12} /> 建設するカードを選択
                    </span>
                )}
            </div>

            {/* 建設キャンセル */}
            {G.phase === 'build' && G.buildState && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                    <button onClick={() => { soundManager.playSFX('click'); moves.cancelAction(); }} className="btn-ghost">✕ 建設をキャンセル</button>
                </div>
            )}

            {/* 公共職場 */}
            <div style={{ marginBottom: 20 }}>
                <div className="section-header"><IconWorker size={14} color="var(--teal)" /> PUBLIC WORKPLACES</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                    {G.publicWorkplaces.map(wp => {
                        const ok = G.phase === 'work' && (!isOnline || isMyTurn) && canPlacePublic(G, curPid, wp);
                        return (
                            <div key={wp.id}
                                onClick={() => {
                                    if (ok) {
                                        soundManager.playSFX('click');
                                        moves.placeWorker(wp.id);
                                    }
                                }}
                                className={`workplace-card ${ok ? 'workplace-available' : 'game-card-disabled'} ${wp.fromBuilding ? 'workplace-sold' : ''}`}
                                style={{ padding: '8px 10px', borderRadius: 8 }}>
                                <div style={{ fontWeight: 700, fontSize: 12, color: ok ? 'var(--teal)' : 'var(--text-dim)' }}>{wp.name}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.3 }}>{wp.effectText}</div>
                                {wp.multipleAllowed && <div style={{ fontSize: 9, color: 'var(--purple)', marginTop: 2 }}>∞ 複数配置可</div>}
                                {wp.workers.length > 0 && (
                                    <div style={{ marginTop: 4, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                        {wp.workers.map((w, i) => <span key={i} className="worker-chip">P{w + 1}</span>)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* プレイヤーエリア */}
            <div style={{ display: 'grid', gridTemplateColumns: ctx.numPlayers <= 2 ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
                {Array.from({ length: ctx.numPlayers }, (_, i) => {
                    const pid = String(i);
                    const p = G.players[pid];
                    const active = pid === curPid;
                    return (
                        <div key={pid} className={`player-area ${active ? 'player-area-active' : 'player-area-inactive'}`}>
                            {/* プレイヤーヘッダー */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <h3 style={{ margin: 0, fontWeight: 700, fontSize: 14, color: active ? 'var(--gold)' : 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {cpuConfig?.enabled && cpuConfig.cpuPlayers.includes(pid) ? <IconRobot size={16} /> : <IconPlayer size={16} />}
                                    P{i + 1}{i === G.startPlayer && <span style={{ marginLeft: 2, color: 'var(--orange)', fontSize: 10 }}>★</span>}
                                </h3>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <span className="stat-badge" style={{ fontSize: 10, padding: '2px 8px' }}>
                                        <IconMoney size={10} color="var(--gold-light)" />
                                        <b style={{ color: 'var(--gold-light)' }}>${p.money}</b>
                                    </span>
                                    <span className="stat-badge" style={{ fontSize: 10, padding: '2px 8px' }}>
                                        <IconWorker size={10} color="var(--blue)" />
                                        <b style={{ color: 'var(--blue)' }}>{p.availableWorkers}/{p.workers}</b>
                                    </span>
                                    <span className="stat-badge" style={{ fontSize: 10, padding: '2px 8px' }}>
                                        <IconDeck size={10} color="var(--text-secondary)" />
                                        <b style={{ color: 'var(--text-secondary)' }}>{p.hand.length}/{p.maxHandSize}</b>
                                    </span>
                                    {p.unpaidDebts > 0 && (
                                        <span className="stat-badge" style={{ fontSize: 10, padding: '2px 8px', borderColor: 'rgba(248, 113, 113, 0.3)' }}>
                                            <b style={{ color: 'var(--red)' }}>⚠ {p.unpaidDebts}</b>
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Glory Info: VP Tokens & Robots */}
                            {(p.vpTokens > 0 || p.robotWorkers > 0) && (
                                <div style={{ display: 'flex', gap: 6, marginBottom: 8, paddingLeft: 2 }}>
                                    {p.vpTokens > 0 && (
                                        <span className="stat-badge" style={{ fontSize: 10, padding: '2px 8px', borderColor: 'var(--gold)', color: 'var(--gold)' }}>
                                            <IconTrophy size={10} color="var(--gold)" />
                                            <b>{p.vpTokens}</b>
                                        </span>
                                    )}
                                    {p.robotWorkers > 0 && (
                                        <span className="stat-badge" style={{ fontSize: 10, padding: '2px 8px', borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                                            <IconRobot size={10} color="var(--teal)" />
                                            <b>{p.robotWorkers}</b>
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* 建設済み建物 */}
                            {p.buildings.length > 0 && (
                                <div style={{ marginBottom: 12 }}>
                                    <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                        <IconHammer size={12} /> BUILDINGS
                                    </span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {p.buildings.map((b, bi) => {
                                            const def = getCardDef(b.card.defId);
                                            // 建設効果発動可能か判定
                                            const canActivate = active && G.phase === 'work' && !b.workerPlaced && (!isOnline || isMyTurn) && canPlaceOnBuilding(G, p, b.card.defId);
                                            // ボード上の建物
                                            const color = def.tags.includes('farm') ? 'var(--green)' : def.tags.includes('factory') ? 'var(--orange)' : 'var(--blue)';
                                            return (
                                                <div key={`${b.card.defId}-${bi}`}
                                                    onClick={() => {
                                                        if (canActivate) {
                                                            soundManager.playSFX('click');
                                                            moves.placeWorkerOnBuilding(b.card.uid);
                                                        }
                                                    }}
                                                    className={`building-card ${canActivate ? 'building-card-clickable' : ''} ${b.workerPlaced ? 'building-card-placed' : ''}`}
                                                    style={{
                                                        borderColor: color,
                                                        background: b.workerPlaced ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.03)',
                                                    }}
                                                    title={`${def.name} (${def.vp}VP) ${def.effectText}`}>
                                                    <span style={{ fontWeight: 700 }}>{def.name}</span>
                                                    <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>{def.vp}VP</span>
                                                    {b.workerPlaced && <span style={{ marginLeft: 4, display: 'inline-flex', verticalAlign: 'middle' }}><IconWorker size={12} color="white" /></span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 手札 */}
                            {/* 手札表示: P2Pでは自分の手札のみ詳細表示、他は裏面or枚数 */}
                            {(() => {
                                const isMyArea = pid === myPid;
                                const showHand = isMyArea || !isOnline;
                                if (!showHand) {
                                    // P2P: 他プレイヤーの手札は枚数のみ表示
                                    return (
                                        <div style={{ marginTop: 4 }}>
                                            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>手札 {p.hand.length}枚</span>
                                        </div>
                                    );
                                }
                                // P2P: 自分のエリアか非オンラインモード → 手札を詳細表示
                                const isBuildPhase = G.phase === 'build' && G.buildState;
                                const canInteract = active && (!isOnline || isMyTurn);
                                return (
                                    <div>
                                        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                            <IconDeck size={12} /> HAND
                                        </span>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                                            {p.hand.map((c, ci) => {
                                                // playerViewで隠されたカード
                                                if (isHidden(c)) {
                                                    return (
                                                        <div key={`hidden-${ci}`} className="game-card" style={{ minWidth: 70, background: 'linear-gradient(145deg, rgba(30,30,40,0.5), rgba(20,20,30,0.5))', borderColor: 'rgba(100,100,120,0.15)' }}>
                                                            <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-dim)' }}>🂠</div>
                                                        </div>
                                                    );
                                                }
                                                const isCons = isConsumable(c);
                                                const def = isCons ? null : getCardDef(c.defId);
                                                let canClick = false;

                                                if (canInteract && isBuildPhase && !isCons && def) {
                                                    const bs = G.buildState!;
                                                    if (bs.action === 'pioneer') {
                                                        canClick = def.tags.includes('farm');
                                                    } else {
                                                        const cost = getConstructionCost(p, c.defId, bs.costReduction);
                                                        canClick = p.hand.length - 1 >= cost;
                                                    }
                                                }

                                                return (
                                                    <div key={c.uid}
                                                        onClick={() => {
                                                            if (canClick) {
                                                                soundManager.playSFX('click');
                                                                moves.selectBuildCard(ci);
                                                            }
                                                        }}
                                                        className={`game-card ${canClick ? 'game-card-clickable game-card-selected' : ''}`}
                                                        style={{
                                                            minWidth: 100,
                                                            ...(isCons ? { background: 'linear-gradient(145deg, rgba(87, 83, 78, 0.3), rgba(68, 64, 60, 0.3))', borderColor: 'rgba(168, 162, 158, 0.15)' } : {}),
                                                        }}>
                                                        <div style={{ fontWeight: 700, fontSize: 11 }}>{cName(c.defId)}</div>
                                                        {def && (
                                                            <>
                                                                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                                                                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                                                                        C{isBuildPhase && !isCons ? getConstructionCost(p, c.defId, G.buildState!.costReduction) : def.cost}
                                                                    </span>
                                                                    <span style={{ fontSize: 10, color: 'var(--gold-dim)' }}>{def.vp}VP</span>
                                                                </div>
                                                                <TagBadges defId={c.defId} />
                                                                {def.effectText && <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 3, lineHeight: 1.3 }}>{def.effectText}</div>}
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    );
                })}
            </div>


            {/* インラインログ */}
            <div className="glass-card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <IconLog size={12} /> LATEST LOG
                    </span>
                    <button onClick={() => { soundManager.playSFX('click'); setShowLog(true); }} className="btn-ghost" style={{ fontSize: 10, padding: '2px 8px' }}>
                        全件表示 ({G.log.length})
                    </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {G.log.slice(-5).reverse().map((entry, i) => (
                        <div key={G.log.length - i}
                            className={`log-entry ${entry.text.startsWith('===') ? 'log-entry-round' : entry.text.startsWith('---') ? 'log-entry-phase' : 'log-entry-action'}`}>
                            {entry.text}
                        </div>
                    ))}
                </div>
            </div>
        </div>
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
function DesignOfficeUI({ G, moves }: { G: GameState; moves: any }) {
    const dos = G.designOfficeState!;
    return (
        <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="modal-content animate-slide-up" style={{ position: 'relative' }}>
                <button onClick={() => { soundManager.playSFX('click'); moves.cancelAction(); }} className="btn-ghost" style={{ position: 'absolute', top: 16, right: 16 }}>✕ キャンセル</button>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconSearch size={22} color="var(--gold)" /> 設計事務所
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
                    山札から<b style={{ color: 'var(--teal)' }}>{dos.revealedCards.length}枚</b>公開。
                    <b style={{ color: 'var(--gold)' }}>1枚</b>を選んでください。残りは捨て札になります。
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                    {dos.revealedCards.map((c, ci) => {
                        const isCons = isConsumable(c);
                        const def = isCons ? null : getCardDef(c.defId);
                        return (
                            <div key={c.uid} onClick={() => { soundManager.playSFX('click'); moves.selectDesignOfficeCard(ci); }}
                                className="game-card game-card-clickable"
                                style={{ minWidth: 120, borderColor: 'rgba(45, 212, 191, 0.2)' }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(45, 212, 191, 0.2)'}>
                                <div style={{ fontWeight: 700, fontSize: 12 }}>{cName(c.defId)}</div>
                                {def && (
                                    <>
                                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>C{def.cost}/{def.vp}VP</div>
                                        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.3 }}>{def.effectText}</div>
                                        <TagBadges defId={c.defId} />
                                    </>
                                )}
                                {isCons && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>消費財</div>}
                            </div>
                        );
                    })}
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
function DiscardUI({ G, moves, pid }: { G: GameState; moves: any; pid: string }) {
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
                <button onClick={() => { soundManager.playSFX('click'); moves.confirmDiscard(); }}
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
// 配置可能チェック（公共職場）
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

    if (wp.fromBuildingDefId) {
        const def = getCardDef(wp.fromBuildingDefId);
        if (def.unsellable && wp.fromBuildingDefId !== 'slash_burn') return false;

        switch (wp.fromBuildingDefId) {
            case 'factory': if (p.hand.length < 2) return false; break;
            case 'auto_factory': if (p.hand.length < 3) return false; break;
            case 'restaurant': if (p.hand.length < 1 || G.household < 15) return false; break;
            case 'coffee_shop': if (G.household < 5) return false; break;
            case 'construction_co': if (!canBuildAnything(p, 1)) return false; break;
            case 'pioneer': if (!canBuildFarmFree(p)) return false; break;
            case 'general_contractor': if (!canBuildAnything(p, 0)) return false; break;
            case 'dual_construction': if (!canDualConstruct(p)) return false; break;
        }
    }
    return true;
}

// ============================================================
// 個人建物に配置可能かチェック
// ============================================================
function canPlaceOnBuilding(G: GameState, p: GameState['players'][string], defId: string): boolean {
    switch (defId) {
        case 'factory': return p.hand.length >= 2;
        case 'auto_factory': return p.hand.length >= 3;
        case 'restaurant': return p.hand.length >= 1 && G.household >= 15;
        case 'coffee_shop': return G.household >= 5;
        case 'construction_co': return canBuildAnything(p, 1);
        case 'pioneer': return canBuildFarmFree(p);
        case 'general_contractor': return canBuildAnything(p, 0);
        case 'dual_construction': return canDualConstruct(p);
        default: return true;
    }
}

function canBuildAnything(p: GameState['players'][string], costReduction: number): boolean {
    for (const card of p.hand) {
        if (isConsumable(card)) continue;
        const def = getCardDef(card.defId);
        const cost = Math.max(0, def.cost - costReduction);
        if (p.hand.length - 1 >= cost) return true;
    }
    return false;
}

function canBuildFarmFree(p: GameState['players'][string]): boolean {
    return p.hand.some(c => !isConsumable(c) && getCardDef(c.defId).tags.includes('farm'));
}

function canDualConstruct(p: GameState['players'][string]): boolean {
    const costGroups: Record<number, number> = {};
    for (const c of p.hand) {
        if (!isConsumable(c)) {
            const def = getCardDef(c.defId);
            costGroups[def.cost] = (costGroups[def.cost] || 0) + 1;
        }
    }
    for (const [costStr, count] of Object.entries(costGroups)) {
        if (count >= 2) {
            const cost = parseInt(costStr);
            const remaining = p.hand.length - 2;
            if (remaining >= cost) return true;
        }
    }
    return false;
}
