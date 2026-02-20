// ============================================================
// App.tsx  –  ナショナルエコノミー（プレミアムUI + CPU対戦 + P2Pオンライン）
// ============================================================
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Client } from 'boardgame.io/react';
import { Client as BGClient } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Ctx } from 'boardgame.io';
import { NationalEconomy } from './game';
import { Board } from './Board';
import type { AIDifficulty } from './bots';
import type { GameVersion, GameState } from './types';
import { soundManager } from './SoundManager';
import { LogoFactory, IconRobot, IconPlayer, IconHammer, IconTrophy } from './components/Icons';

// ============================================================
// 型定義
// ============================================================
export type CPUConfig = {
    /** CPU対戦有効 */
    enabled: boolean;
    /** CPUプレイヤーのID一覧（例: ["1"] = P2がCPU） */
    cpuPlayers: string[];
    difficulty: AIDifficulty;
    moveDelay: number;
};

type GameMode = 'local' | 'online';
type Screen = 'menu' | 'online_menu' | 'host' | 'join' | 'playing';

// ============================================================
// ICE設定（STUN + TURNサーバー設定でNAT越え対応）
// ============================================================
const iceConfig = {
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject',
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject',
            },
        ],
    },
};

// ============================================================
// スタート通知オーバーレイ（P2P用）
// ============================================================
function StartNotification({ playerNum, startPlayer, onDismiss }: { playerNum: number; startPlayer: number; onDismiss: () => void }) {
    useEffect(() => {
        const t = setTimeout(onDismiss, 3000);
        return () => clearTimeout(t);
    }, [onDismiss]);

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }} onClick={onDismiss}>
            <div className="glass-card animate-slide-up" style={{ padding: 32, maxWidth: 400, textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎲</div>
                <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--gold)', marginBottom: 8 }}>ゲーム開始！</h2>
                <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--teal)', marginBottom: 8 }}>あなたは P{playerNum + 1} です</p>
                <p style={{ color: 'var(--text-secondary)' }}>P{startPlayer + 1} からスタートします</p>
                <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 16 }}>（クリックまたは3秒後に閉じます）</p>
            </div>
        </div>
    );
}

// ============================================================
// メインメニュー：人数 + バージョン + モード選択
// ============================================================
function MainMenuScreen({ onStartLocal, onOnline }: {
    onStartLocal: (n: number, version: GameVersion, cpuConfig: CPUConfig) => void;
    onOnline: () => void;
}) {
    const [numPlayers, setNumPlayers] = useState<number | null>(null);
    const [version, setVersion] = useState<GameVersion>('base');
    const [cpuEnabled, setCpuEnabled] = useState(true);
    const [difficulty, setDifficulty] = useState<AIDifficulty>('heuristic');
    const [cpuMoveDelay, setCpuMoveDelay] = useState(soundManager.getSettings().cpuMoveDelay);
    const [cpuPlayerFlags, setCpuPlayerFlags] = useState<boolean[]>([true, true, true, true]);

    const handleStart = () => {
        if (!numPlayers) return;
        soundManager.playSFX('click');
        soundManager.playRandomBGM();

        const cpuPlayers: string[] = [];
        if (cpuEnabled) {
            for (let i = 0; i < numPlayers; i++) {
                if (cpuPlayerFlags[i]) cpuPlayers.push(String(i));
            }
        }
        soundManager.setCPUMoveDelay(cpuMoveDelay);
        onStartLocal(numPlayers, version, { enabled: cpuEnabled, cpuPlayers, difficulty, moveDelay: cpuMoveDelay });
    };

    const toggleCpuPlayer = (idx: number) => {
        const next = [...cpuPlayerFlags];
        next[idx] = !next[idx];
        setCpuPlayerFlags(next);
    };

    return (
        <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 16 }}>
            <div className="animate-slide-up" style={{ maxWidth: 480, width: '100%' }}>
                {/* ロゴ */}
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <div style={{ marginBottom: 16 }}>
                        <LogoFactory size={80} color="var(--gold)" />
                    </div>
                    <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '2px', marginBottom: 4, textTransform: 'uppercase' as const }}>
                        National Economy
                    </h1>
                    <p style={{ color: 'var(--gold)', fontSize: 12, letterSpacing: '4px', fontWeight: 600 }}>
                        PROGRESS EDITION
                    </p>
                </div>

                {/* メインカード */}
                <div className="glass-card" style={{ padding: 32 }}>
                    {/* 人数選択 */}
                    <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 20, fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '1px' }}>
                        Select Players
                    </p>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 30 }}>
                        {[2, 3, 4].map(n => (
                            <button key={n} onClick={() => { soundManager.playSFX('click'); setNumPlayers(n); }}
                                style={{
                                    background: numPlayers === n ? 'var(--gold)' : 'rgba(255,255,255,0.05)',
                                    border: numPlayers === n ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                    color: numPlayers === n ? '#000' : 'var(--text-dim)',
                                    fontSize: 18, fontWeight: 700, width: 60, height: 60, borderRadius: 12,
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    boxShadow: numPlayers === n ? '0 0 20px var(--gold-glow)' : 'none',
                                    transform: numPlayers === n ? 'scale(1.1)' : 'scale(1)',
                                }}>
                                {n}
                            </button>
                        ))}
                    </div>

                    {/* バージョン選択 */}
                    {numPlayers && (
                        <div className="animate-fade-in" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 20, marginBottom: 20 }}>
                            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 12, fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '1px' }}>
                                Game Version
                            </p>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                <button onClick={() => { soundManager.playSFX('click'); setVersion('base'); }}
                                    style={{
                                        flex: 1, maxWidth: 140,
                                        background: version === 'base' ? 'rgba(75, 85, 99, 0.3)' : 'transparent',
                                        border: version === 'base' ? '1px solid var(--text-dim)' : '1px solid rgba(255,255,255,0.1)',
                                        color: version === 'base' ? '#fff' : 'var(--text-dim)',
                                        padding: '12px', borderRadius: 12, cursor: 'pointer',
                                        display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4,
                                        transition: 'all 0.2s',
                                        transform: version === 'base' ? 'scale(1.05)' : 'scale(1)',
                                    }}>
                                    <IconHammer size={24} color={version === 'base' ? '#fff' : 'var(--text-dim)'} />
                                    <span style={{ fontSize: 13, fontWeight: 700 }}>Basic</span>
                                    <span style={{ fontSize: 10, opacity: 0.7 }}>基本セット</span>
                                </button>
                                <button onClick={() => { soundManager.playSFX('click'); setVersion('glory'); }}
                                    style={{
                                        flex: 1, maxWidth: 140,
                                        background: version === 'glory' ? 'rgba(217, 119, 6, 0.2)' : 'transparent',
                                        border: version === 'glory' ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.1)',
                                        color: version === 'glory' ? 'var(--gold)' : 'var(--text-dim)',
                                        padding: '12px', borderRadius: 12, cursor: 'pointer',
                                        display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4,
                                        transition: 'all 0.2s',
                                        transform: version === 'glory' ? 'scale(1.05)' : 'scale(1)',
                                        boxShadow: version === 'glory' ? 'var(--glow-gold)' : 'none',
                                    }}>
                                    <IconTrophy size={24} color={version === 'glory' ? 'var(--gold)' : 'var(--text-dim)'} />
                                    <span style={{ fontSize: 13, fontWeight: 700 }}>Glory</span>
                                    <span style={{ fontSize: 10, opacity: 0.7 }}>拡張セット</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* CPU設定 */}
                    {numPlayers && (
                        <div className="animate-fade-in" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <span style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <IconRobot size={18} color="var(--teal)" /> CPU Opponent
                                </span>
                                <button onClick={() => { soundManager.playSFX('click'); setCpuEnabled(!cpuEnabled); }} style={{
                                    background: cpuEnabled ? 'var(--teal)' : 'rgba(255,255,255,0.1)',
                                    color: cpuEnabled ? '#000' : 'var(--text-dim)',
                                    border: 'none', padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
                                    fontSize: 11, fontWeight: 700, transition: 'all 0.2s',
                                    boxShadow: cpuEnabled ? '0 0 10px var(--teal-glow)' : 'none',
                                }}>
                                    {cpuEnabled ? 'ON' : 'OFF'}
                                </button>
                            </div>

                            {cpuEnabled && (
                                <div className="animate-fade-in">
                                    {/* 難易度 */}
                                    <div style={{ marginBottom: 20 }}>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button onClick={() => { soundManager.playSFX('click'); setDifficulty('random'); }}
                                                style={{
                                                    flex: 1,
                                                    background: difficulty === 'random' ? 'rgba(45, 122, 247, 0.2)' : 'transparent',
                                                    border: difficulty === 'random' ? '1px solid var(--blue)' : '1px solid rgba(255,255,255,0.1)',
                                                    color: difficulty === 'random' ? 'var(--blue)' : 'var(--text-dim)',
                                                    padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                }}>
                                                Standard
                                            </button>
                                            <button onClick={() => { soundManager.playSFX('click'); setDifficulty('heuristic'); }}
                                                style={{
                                                    flex: 1,
                                                    background: difficulty === 'heuristic' ? 'rgba(255, 42, 109, 0.2)' : 'transparent',
                                                    border: difficulty === 'heuristic' ? '1px solid var(--red)' : '1px solid rgba(255,255,255,0.1)',
                                                    color: difficulty === 'heuristic' ? 'var(--red)' : 'var(--text-dim)',
                                                    padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                }}>
                                                Hard
                                            </button>
                                        </div>
                                    </div>

                                    {/* CPUスピード */}
                                    <div style={{ marginBottom: 20 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>CPU Speed</span>
                                            <span style={{ fontSize: 11, color: 'var(--gold)' }}>{cpuMoveDelay}ms</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0" max="2000" step="50"
                                            value={cpuMoveDelay}
                                            onChange={(e) => setCpuMoveDelay(parseInt(e.target.value))}
                                            style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--gold)' }}
                                        />
                                    </div>

                                    {/* プレイヤー割当 */}
                                    <div>
                                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Assignments</span>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            {Array.from({ length: numPlayers }, (_, i) => (
                                                <button key={i} onClick={() => { soundManager.playSFX('click'); toggleCpuPlayer(i); }}
                                                    style={{
                                                        flex: 1,
                                                        background: cpuPlayerFlags[i] ? 'rgba(252, 194, 0, 0.1)' : 'rgba(45, 122, 247, 0.1)',
                                                        border: cpuPlayerFlags[i] ? '1px solid var(--gold-dim)' : '1px solid rgba(45, 122, 247, 0.3)',
                                                        color: cpuPlayerFlags[i] ? 'var(--gold)' : 'var(--blue)',
                                                        padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                                        display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4,
                                                    }}>
                                                    <span style={{ opacity: 0.7 }}>P{i + 1}</span>
                                                    {cpuPlayerFlags[i] ? <IconRobot size={16} /> : <IconPlayer size={16} />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* スタート＆オンラインボタン */}
                    {numPlayers && (
                        <div className="animate-fade-in" style={{ marginTop: 24, display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                            <button onClick={handleStart} className="btn-primary animate-pulse-gold" style={{ width: '100%', fontSize: 16, padding: '12px 0' }}>
                                🎮 ゲーム開始
                            </button>
                            <button onClick={() => { soundManager.playSFX('click'); onOnline(); }} style={{
                                width: '100%', fontSize: 14, padding: '10px 0',
                                background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.4)',
                                color: '#818cf8', borderRadius: 12, cursor: 'pointer', fontWeight: 600,
                                transition: 'all 0.2s',
                            }}>
                                🌐 オンライン対戦（P2P）
                            </button>
                        </div>
                    )}
                </div>

                {/* フッター */}
                <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 10, marginTop: 32, opacity: 0.5 }}>
                    v8.0 • Round 9 / 64 Buildings • P2P Online
                </p>
            </div>
        </div>
    );
}

// ============================================================
// オンラインメニュー（ホスト/ゲスト選択）
// ============================================================
function OnlineMenuScreen({ onHost, onJoin, onBack }: { onHost: () => void; onJoin: () => void; onBack: () => void }) {
    return (
        <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 16 }}>
            <div className="animate-slide-up" style={{ maxWidth: 420, width: '100%' }}>
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <LogoFactory size={60} color="var(--gold)" />
                    <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', marginTop: 12 }}>🌐 オンライン対戦</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>PeerJS P2P接続</p>
                </div>
                <div className="glass-card" style={{ padding: 24, display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                    <button onClick={onHost} className="btn-primary" style={{ width: '100%', fontSize: 15, padding: '14px 0' }}>
                        🏠 ゲームを作成（ホスト）
                    </button>
                    <button onClick={onJoin} style={{
                        width: '100%', fontSize: 15, padding: '14px 0',
                        background: 'rgba(0, 188, 212, 0.15)', border: '1px solid rgba(0, 188, 212, 0.4)',
                        color: 'var(--teal)', borderRadius: 12, cursor: 'pointer', fontWeight: 600,
                        transition: 'all 0.2s',
                    }}>
                        🔗 ゲームに参加
                    </button>
                    <button onClick={onBack} style={{
                        background: 'none', border: 'none', color: 'var(--text-dim)',
                        cursor: 'pointer', fontSize: 12, marginTop: 8,
                    }}>
                        ← メニューに戻る
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// ホストロビー（P2P）
// ============================================================
function HostLobby({ onBack }: { onBack: () => void }) {
    const [peerID, setPeerID] = useState<string>('');
    const [status, setStatus] = useState('PeerJS初期化中...');
    const [numPlayers, setNumPlayers] = useState(2);
    const [connectedPlayers, setConnectedPlayers] = useState<string[]>([]);
    const [gameStarted, setGameStarted] = useState(false);
    const [autoPlay, setAutoPlay] = useState(false);
    const [hostState, setHostState] = useState<{ G: GameState; ctx: Ctx } | null>(null);
    const [showStartNotification, setShowStartNotification] = useState(false);
    const peerRef = useRef<Peer | null>(null);
    const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
    const clientsRef = useRef<any[]>([]);

    useEffect(() => {
        const peer = new Peer(iceConfig);
        peerRef.current = peer;

        peer.on('open', (id) => {
            setPeerID(id);
            setStatus('接続待機中');
        });

        peer.on('error', (err) => {
            setStatus(`エラー: ${err.type}`);
        });

        peer.on('connection', (conn) => {
            conn.on('open', () => {
                const playerIndex = connectionsRef.current.size + 1;
                const pid = String(playerIndex);
                connectionsRef.current.set(pid, conn);
                setConnectedPlayers(prev => [...prev, pid]);
                conn.send({ type: 'assigned', playerID: pid });

                conn.on('data', (data: any) => {
                    if (data.type === 'move') {
                        const hostClient = clientsRef.current[0];
                        const state = hostClient?.getState();
                        const currentPlayer = state?.ctx?.currentPlayer ?? '0';
                        const client = clientsRef.current[parseInt(currentPlayer)];
                        if (client?.moves[data.name]) {
                            client.moves[data.name](...(data.args || []));
                        }
                    }
                });

                conn.on('close', () => {
                    connectionsRef.current.delete(pid);
                    setConnectedPlayers(prev => prev.filter(p => p !== pid));
                });
            });
        });

        return () => { peer.destroy(); };
    }, []);

    // ゲーム開始
    const startGame = useCallback(() => {
        const localMP = Local();
        const clients: any[] = [];

        for (let i = 0; i < numPlayers; i++) {
            const client = BGClient({
                game: NationalEconomy,
                numPlayers,
                playerID: String(i),
                multiplayer: localMP,
                debug: false,
            });
            client.start();
            clients.push(client);
        }

        clientsRef.current = clients;

        // 状態変更の購読
        for (let i = 0; i < numPlayers; i++) {
            clients[i].subscribe((state: any) => {
                if (!state) return;
                if (i === 0) {
                    setHostState({ G: state.G, ctx: state.ctx });
                }
                const conn = connectionsRef.current.get(String(i));
                if (conn && conn.open) {
                    conn.send({ type: 'state', G: state.G, ctx: state.ctx });
                }
            });
        }

        // ゲーム開始を全クライアントに通知
        for (const [, conn] of connectionsRef.current) {
            conn.send({ type: 'gameStart', numPlayers });
        }

        setGameStarted(true);
        setShowStartNotification(true);
    }, [numPlayers]);

    // ホストのmoves（プロキシ）
    const hostMoves = useMemo(() => {
        if (!gameStarted || !clientsRef.current[0]) return {};
        return new Proxy({}, {
            get: (_target, name: string) => {
                return (...args: any[]) => {
                    const state = clientsRef.current[0]?.getState();
                    const cp = state?.ctx?.currentPlayer ?? '0';
                    const client = clientsRef.current[parseInt(cp)];
                    if (client?.moves[name]) client.moves[name](...args);
                };
            },
        });
    }, [gameStarted]);

    // ゲーム画面
    if (gameStarted && hostState) {
        const cpuConf = autoPlay ? { enabled: true, cpuPlayers: ['0'], difficulty: 'heuristic' as const, moveDelay: 500 } : undefined;
        return (
            <>
                {showStartNotification && (
                    <StartNotification
                        playerNum={0}
                        startPlayer={hostState.G.startPlayer}
                        onDismiss={() => setShowStartNotification(false)}
                    />
                )}
                <Board {...{ G: hostState.G, ctx: hostState.ctx, moves: hostMoves, playerID: '0', cpuConfig: cpuConf } as any} />
            </>
        );
    }

    // ロビー画面
    const canStart = connectedPlayers.length >= numPlayers - 1;

    return (
        <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 16 }}>
            <div className="animate-slide-up" style={{ maxWidth: 420, width: '100%' }}>
                <div className="glass-card" style={{ padding: 24 }}>
                    <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--gold)', textAlign: 'center', marginBottom: 20 }}>🏠 ホストロビー</h1>

                    <div style={{ marginBottom: 16 }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>ステータス: </span>
                        <span style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 600 }}>{status}</span>
                    </div>

                    {peerID && (
                        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                            <div style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 6 }}>あなたのID（友達に共有）:</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <code style={{ color: 'var(--gold)', fontSize: 12, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' as const }}>{peerID}</code>
                                <button onClick={() => navigator.clipboard.writeText(peerID)} style={{
                                    background: 'var(--teal)', color: '#000', border: 'none',
                                    padding: '4px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                                }}>
                                    📋コピー
                                </button>
                            </div>
                        </div>
                    )}

                    <div style={{ marginBottom: 16 }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12, display: 'block', marginBottom: 8 }}>プレイヤー人数:</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {[2, 3, 4].map(n => (
                                <button key={n} onClick={() => setNumPlayers(n)} style={{
                                    flex: 1, padding: '8px', borderRadius: 8, fontWeight: 700, fontSize: 14,
                                    background: n === numPlayers ? 'var(--gold)' : 'rgba(255,255,255,0.05)',
                                    color: n === numPlayers ? '#000' : 'var(--text-dim)',
                                    border: n === numPlayers ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                }}>
                                    {n}人
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>接続中: </span>
                        <span style={{ color: 'var(--teal)', fontWeight: 700 }}>{connectedPlayers.length + 1}/{numPlayers}人</span>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                            P1: あなた（ホスト）
                            {connectedPlayers.map(pid => (
                                <div key={pid}>P{parseInt(pid) + 1}: 接続済み ✅</div>
                            ))}
                        </div>
                    </div>

                    {/* CPUオートプレイ切替 */}
                    <div style={{ marginBottom: 16 }}>
                        <button onClick={() => setAutoPlay(!autoPlay)} style={{
                            width: '100%', padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                            background: autoPlay ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.05)',
                            color: autoPlay ? '#a78bfa' : 'var(--text-dim)',
                            border: autoPlay ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(255,255,255,0.1)',
                            cursor: 'pointer', transition: 'all 0.2s',
                        }}>
                            {autoPlay ? '🤖 CPUオートプレイ: ON' : '🤖 CPUオートプレイ: OFF'}
                        </button>
                        {autoPlay && <div style={{ fontSize: 10, color: '#a78bfa', marginTop: 4 }}>自分の手番をCPUが自動操作します</div>}
                    </div>

                    <button onClick={startGame} disabled={!canStart} style={{
                        width: '100%', padding: '12px', borderRadius: 12, fontWeight: 700, fontSize: 15,
                        background: canStart ? 'var(--teal)' : 'rgba(255,255,255,0.05)',
                        color: canStart ? '#000' : 'var(--text-dim)',
                        border: 'none', cursor: canStart ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s',
                        boxShadow: canStart ? '0 0 15px var(--teal-glow)' : 'none',
                    }}>
                        {canStart ? '🚀 ゲーム開始！' : `あと${numPlayers - 1 - connectedPlayers.length}人の接続を待っています...`}
                    </button>

                    <button onClick={onBack} style={{
                        background: 'none', border: 'none', color: 'var(--text-dim)',
                        cursor: 'pointer', fontSize: 12, display: 'block', margin: '12px auto 0',
                    }}>
                        ← 戻る
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// ゲスト参加ロビー（P2P）
// ============================================================
function JoinLobby({ onBack }: { onBack: () => void }) {
    const [hostID, setHostID] = useState('');
    const [status, setStatus] = useState('接続準備中...');
    const [playerID, setPlayerID] = useState<string | null>(null);
    const [gameStarted, setGameStarted] = useState(false);
    const [gameState, setGameState] = useState<{ G: GameState; ctx: Ctx } | null>(null);
    const [showStartNotification, setShowStartNotification] = useState(false);
    const [autoPlay, setAutoPlay] = useState(false);
    const [connected, setConnected] = useState(false);
    const peerRef = useRef<Peer | null>(null);
    const connRef = useRef<DataConnection | null>(null);

    useEffect(() => {
        const peer = new Peer(iceConfig);
        peerRef.current = peer;
        peer.on('open', () => setStatus('接続準備完了'));
        peer.on('error', (err) => setStatus(`エラー: ${err.type}`));
        return () => { peer.destroy(); };
    }, []);

    const connect = useCallback(() => {
        if (!peerRef.current || !hostID.trim()) return;
        setStatus('ホストに接続中...');

        const conn = peerRef.current.connect(hostID.trim());
        connRef.current = conn;

        conn.on('open', () => {
            setStatus('接続完了、ゲーム開始を待機中...');
        });

        conn.on('data', (data: any) => {
            switch (data.type) {
                case 'assigned':
                    setPlayerID(data.playerID);
                    setStatus(`P${parseInt(data.playerID) + 1}として接続完了。ゲーム開始を待機中...`);
                    break;
                case 'gameStart':
                    setGameStarted(true);
                    setShowStartNotification(true);
                    break;
                case 'state':
                    setGameState({ G: data.G, ctx: data.ctx });
                    break;
            }
        });

        conn.on('close', () => {
            setStatus('ホストとの接続が切断されました');
            setGameStarted(false);
        });

        conn.on('error', (err) => {
            setStatus(`接続エラー: ${err.type}`);
        });
    }, [hostID]);

    // ゲスト側のmovesプロキシ（ホストへ転送）
    const remoteMoves = useMemo(() => {
        if (!connRef.current || !playerID) return {};
        return new Proxy({}, {
            get: (_target, name: string) => {
                return (...args: any[]) => {
                    connRef.current?.send({
                        type: 'move',
                        playerID,
                        name,
                        args,
                    });
                };
            },
        });
    }, [playerID]);

    // ゲーム画面
    if (gameStarted && gameState && playerID) {
        const cpuConf = autoPlay ? { enabled: true, cpuPlayers: [playerID], difficulty: 'heuristic' as const, moveDelay: 500 } : undefined;
        return (
            <>
                {showStartNotification && (
                    <StartNotification
                        playerNum={parseInt(playerID)}
                        startPlayer={gameState.G.startPlayer}
                        onDismiss={() => setShowStartNotification(false)}
                    />
                )}
                <Board {...{ G: gameState.G, ctx: gameState.ctx, moves: remoteMoves, playerID, cpuConfig: cpuConf } as any} />
            </>
        );
    }

    // 参加画面
    return (
        <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 16 }}>
            <div className="animate-slide-up" style={{ maxWidth: 420, width: '100%' }}>
                <div className="glass-card" style={{ padding: 24, textAlign: 'center' }}>
                    <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--gold)', marginBottom: 20 }}>🔗 ゲームに参加</h1>

                    <div style={{ marginBottom: 16 }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>ステータス: </span>
                        <span style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 600 }}>{status}</span>
                    </div>

                    <input
                        type="text"
                        value={hostID}
                        onChange={e => setHostID(e.target.value)}
                        placeholder="ホストのIDをペースト"
                        style={{
                            width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)',
                            borderRadius: 12, padding: '12px 16px', color: 'var(--text-primary)',
                            textAlign: 'center', fontFamily: 'monospace', fontSize: 14,
                            marginBottom: 12, outline: 'none',
                        }}
                    />

                    {/* CPUオートプレイ切替（接続前のみ表示） */}
                    {!connected && (
                        <div style={{ marginBottom: 12 }}>
                            <button onClick={() => setAutoPlay(!autoPlay)} style={{
                                width: '100%', padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                                background: autoPlay ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.05)',
                                color: autoPlay ? '#a78bfa' : 'var(--text-dim)',
                                border: autoPlay ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(255,255,255,0.1)',
                                cursor: 'pointer', transition: 'all 0.2s',
                            }}>
                                {autoPlay ? '🤖 CPUオートプレイ: ON' : '🤖 CPUオートプレイ: OFF'}
                            </button>
                            {autoPlay && <div style={{ fontSize: 10, color: '#a78bfa', marginTop: 4 }}>自分の手番をCPUが自動操作します</div>}
                        </div>
                    )}

                    <button onClick={() => { setConnected(true); connect(); }} disabled={!hostID.trim() || connected} style={{
                        width: '100%', padding: '12px', borderRadius: 12, fontWeight: 700, fontSize: 15,
                        background: (hostID.trim() && !connected) ? 'var(--teal)' : 'rgba(255,255,255,0.05)',
                        color: (hostID.trim() && !connected) ? '#000' : 'var(--text-dim)',
                        border: 'none', cursor: (hostID.trim() && !connected) ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s',
                    }}>
                        {connected ? '✅ 接続済み' : '🔗 接続する'}
                    </button>

                    <button onClick={onBack} style={{
                        background: 'none', border: 'none', color: 'var(--text-dim)',
                        cursor: 'pointer', fontSize: 12, marginTop: 12,
                    }}>
                        ← 戻る
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// App メイン
// ============================================================
export default function App() {
    const [screen, setScreen] = useState<Screen>('menu');
    const [config, setConfig] = useState<{ numPlayers: number; version: GameVersion; cpuConfig: CPUConfig } | null>(null);

    // ローカルゲーム開始
    const handleStartLocal = (numPlayers: number, version: GameVersion, cpuConfig: CPUConfig) => {
        setConfig({ numPlayers, version, cpuConfig });
        setScreen('playing');
    };

    // 画面ルーティング
    switch (screen) {
        case 'menu':
            return <MainMenuScreen onStartLocal={handleStartLocal} onOnline={() => setScreen('online_menu')} />;
        case 'online_menu':
            return <OnlineMenuScreen onHost={() => setScreen('host')} onJoin={() => setScreen('join')} onBack={() => setScreen('menu')} />;
        case 'host':
            return <HostLobby onBack={() => setScreen('online_menu')} />;
        case 'join':
            return <JoinLobby onBack={() => setScreen('online_menu')} />;
        case 'playing': {
            if (!config) return null;
            const BoardWithCPU = (props: any) => <Board {...props} cpuConfig={config.cpuConfig} />;

            // ゲーム初期化時にversionを渡すためのラッパー
            const gameWithVersion = {
                ...NationalEconomy,
                setup: (ctx: any) => NationalEconomy.setup!(ctx, { version: config!.version }),
            };

            const NationalEconomyClient = Client({
                game: gameWithVersion,
                board: BoardWithCPU,
                numPlayers: config.numPlayers,
                debug: false,
            });

            return <NationalEconomyClient />;
        }
    }
}
