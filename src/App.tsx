// ============================================================
// App.tsx  –  ナショナルエコノミー（プレミアムUI + CPU対戦 + P2Pオンライン）
// v9: 導線改善 + P2P Glory対応 + CPU埋め機能
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
import { LogoFactory, IconRobot, IconPlayer, IconHammer, IconTrophy, IconGamepad, IconGlobe, IconWrench, IconHome, IconLink, IconDice, IconRocket, IconClipboard, IconGear, IconWave, IconCheck } from './components/Icons';
import { DevCardGallery } from './DevCardGallery';

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

type Screen = 'menu' | 'local_setup' | 'online_menu' | 'host' | 'join' | 'playing' | 'dev_gallery';

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
// 共通ボタンスタイル
// ============================================================
const btnStyle = (active: boolean, color: string, glowColor?: string) => ({
    flex: 1,
    background: active ? `rgba(${color}, 0.2)` : 'transparent',
    border: active ? `1px solid rgba(${color}, 0.6)` : '1px solid rgba(255,255,255,0.1)',
    color: active ? `rgb(${color})` : 'var(--text-dim)',
    padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 'var(--fs-xl2)', fontWeight: 600 as const,
    display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6,
    transition: 'all 0.2s',
    boxShadow: active && glowColor ? `0 0 10px ${glowColor}` : 'none',
});

// ============================================================
// ゲーム設定コンポーネント（ローカル/P2Pホストで共用）
// ============================================================
function GameSettingsPanel({
    numPlayers, setNumPlayers,
    version, setVersion,
    cpuEnabled, setCpuEnabled,
    difficulty, setDifficulty,
    cpuMoveDelay, setCpuMoveDelay,
    cpuPlayerFlags, toggleCpuPlayer,
    showNumPlayers = true,
    showCpuSettings = true,
}: {
    numPlayers: number;
    setNumPlayers: (n: number) => void;
    version: GameVersion;
    setVersion: (v: GameVersion) => void;
    cpuEnabled?: boolean;
    setCpuEnabled?: (v: boolean) => void;
    difficulty?: AIDifficulty;
    setDifficulty?: (d: AIDifficulty) => void;
    cpuMoveDelay?: number;
    setCpuMoveDelay?: (v: number) => void;
    cpuPlayerFlags?: boolean[];
    toggleCpuPlayer?: (idx: number) => void;
    showNumPlayers?: boolean;
    showCpuSettings?: boolean;
}) {
    return (
        <>
            {/* 人数選択 */}
            {showNumPlayers && (
                <div style={{ marginBottom: 20 }}>
                    <p style={{ color: 'var(--text-dim)', textAlign: 'center', marginBottom: 12, fontSize: 'var(--fs-xl2)', fontWeight: 600, letterSpacing: '1px' }}>
                        プレイヤー数
                    </p>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                        {[2, 3, 4].map(n => (
                            <button key={n} onClick={() => { soundManager.playSFX('click'); setNumPlayers(n); }}
                                style={{
                                    background: numPlayers === n ? 'var(--gold)' : 'rgba(255,255,255,0.05)',
                                    border: numPlayers === n ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                    color: numPlayers === n ? '#000' : 'var(--text-dim)',
                                    fontSize: 'var(--fs-4xl)', fontWeight: 700, width: 60, height: 60, borderRadius: 12,
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    boxShadow: numPlayers === n ? '0 0 20px var(--gold-glow)' : 'none',
                                    transform: numPlayers === n ? 'scale(1.1)' : 'scale(1)',
                                }}>
                                {n}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* バージョン選択 */}
            <div className="animate-fade-in" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20, marginBottom: 20 }}>
                <p style={{ color: 'var(--text-dim)', textAlign: 'center', marginBottom: 12, fontSize: 'var(--fs-xl2)', fontWeight: 600, letterSpacing: '1px' }}>
                    ゲームバージョン
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
                        <IconHammer size={"calc(var(--fs) * 2.67)"} color={version === 'base' ? '#fff' : 'var(--text-dim)'} />
                        <span style={{ fontSize: 'var(--fs-xl3)', fontWeight: 700 }}>Basic</span>
                        <span style={{ fontSize: 'var(--fs-lg)', opacity: 0.7 }}>基本セット</span>
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
                        <IconTrophy size={"calc(var(--fs) * 2.67)"} color={version === 'glory' ? 'var(--gold)' : 'var(--text-dim)'} />
                        <span style={{ fontSize: 'var(--fs-xl3)', fontWeight: 700 }}>Glory</span>
                        <span style={{ fontSize: 'var(--fs-lg)', opacity: 0.7 }}>拡張セット</span>
                    </button>
                </div>
            </div>

            {/* CPU設定（showCpuSettings=falseの場合は非表示） */}
            {showCpuSettings && setCpuEnabled && cpuPlayerFlags && toggleCpuPlayer && setCpuMoveDelay && setDifficulty && <div className="animate-fade-in" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ color: 'var(--text-primary)', fontSize: 'var(--fs-2xl)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <IconRobot size={"calc(var(--fs) * 2.0)"} color="var(--teal)" /> CPU Opponent
                    </span>
                    <button onClick={() => { soundManager.playSFX('click'); setCpuEnabled(!cpuEnabled); }} style={{
                        background: cpuEnabled ? 'var(--teal)' : 'rgba(255,255,255,0.1)',
                        color: cpuEnabled ? '#000' : 'var(--text-dim)',
                        border: 'none', padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
                        fontSize: 'var(--fs-xl)', fontWeight: 700, transition: 'all 0.2s',
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
                                    style={btnStyle(difficulty === 'random', '45, 122, 247')}>
                                    Standard
                                </button>
                                <button onClick={() => { soundManager.playSFX('click'); setDifficulty('heuristic'); }}
                                    style={btnStyle(difficulty === 'heuristic', '255, 42, 109')}>
                                    Hard
                                </button>
                            </div>
                        </div>

                        {/* CPUスピード */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span style={{ fontSize: 'var(--fs-xl)', color: 'var(--text-secondary)' }}>CPU Speed</span>
                                <span style={{ fontSize: 'var(--fs-xl)', color: 'var(--gold)' }}>{cpuMoveDelay}ms</span>
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
                            <span style={{ fontSize: 'var(--fs-xl)', color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Assignments</span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {Array.from({ length: numPlayers }, (_, i) => (
                                    <button key={i} onClick={() => { soundManager.playSFX('click'); toggleCpuPlayer(i); }}
                                        style={{
                                            flex: 1,
                                            background: cpuPlayerFlags[i] ? 'rgba(252, 194, 0, 0.1)' : 'rgba(45, 122, 247, 0.1)',
                                            border: cpuPlayerFlags[i] ? '1px solid var(--gold-dim)' : '1px solid rgba(45, 122, 247, 0.3)',
                                            color: cpuPlayerFlags[i] ? 'var(--gold)' : 'var(--blue)',
                                            padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 'var(--fs-xl)', fontWeight: 600,
                                            display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4,
                                        }}>
                                        <span style={{ opacity: 0.7 }}>P{i + 1}</span>
                                        {cpuPlayerFlags[i] ? <IconRobot size={"calc(var(--fs) * 1.78)"} /> : <IconPlayer size={"calc(var(--fs) * 1.78)"} />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>}
        </>
    );
}

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
                <div style={{ marginBottom: 16 }}><IconDice size={'var(--fs-icon)'} color="var(--gold)" /></div>
                <h2 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 900, color: 'var(--gold)', marginBottom: 8 }}>ゲーム開始！</h2>
                <p style={{ fontSize: 'var(--fs-4xl)', fontWeight: 700, color: 'var(--teal)', marginBottom: 8 }}>あなたは P{playerNum + 1} です</p>
                <p style={{ color: 'var(--text-secondary)' }}>P{startPlayer + 1} からスタートします</p>
                <p style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-xl)', marginTop: 16 }}>（クリックまたは3秒後に閉じます）</p>
            </div>
        </div>
    );
}

// ============================================================
// メインメニュー：モード選択のみ
// ============================================================
function MainMenuScreen({ onLocal, onOnline, onDevGallery, theme, onToggleTheme }: {
    onLocal: () => void;
    onOnline: () => void;
    onDevGallery: () => void;
    theme: 'default' | 'steampunk';
    onToggleTheme: () => void;
}) {
    const isSteampunk = theme === 'steampunk';
    return (
        <div className="game-bg" style={{ position: 'relative', display: 'flex', flexDirection: 'column' as const, height: '100vh', padding: 0, overflow: 'hidden' }}>

            {/* ロゴエリア: 画面上部より（黄金比付近） */}
            <div className="animate-slide-up" style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', marginTop: 'calc(var(--fs) * -4)' }}>
                    {isSteampunk ? (
                        <div style={{
                            width: 'calc(var(--fs) * 28)', maxWidth: 420,
                            aspectRatio: '1', margin: '0 auto',
                            backgroundImage: `url(${import.meta.env.BASE_URL}logo.png)`,
                            backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
                        }} />
                    ) : (
                        <>
                            <div style={{ marginBottom: 16 }}>
                                <LogoFactory size={"calc(var(--fs) * 8.89)"} color="var(--gold)" />
                            </div>
                            <h1 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '2px', marginBottom: 4, textTransform: 'uppercase' as const }}>
                                National Economy
                            </h1>
                            <p style={{ color: 'var(--gold)', fontSize: 'var(--fs-xl2)', letterSpacing: '4px', fontWeight: 600 }}>
                                PROGRESS EDITION
                            </p>
                        </>
                    )}
                </div>
            </div>

            {/* メニューエリア: 画面下部 */}
            <nav className="animate-slide-up" style={{ paddingBottom: 'calc(var(--fs) * 8)', display: 'flex', flexDirection: 'column' as const, alignItems: 'center' }}>
                <button onClick={() => { soundManager.playSFX('click'); onLocal(); }} className="menu-item menu-item-primary">
                    <span className="menu-icon"><IconGamepad size={'1.2em'} /></span>
                    <span className="menu-label">ローカル対戦</span>
                </button>

                <button onClick={() => { soundManager.playSFX('click'); onOnline(); }} className="menu-item menu-item-secondary">
                    <span className="menu-icon"><IconGlobe size={'1.2em'} /></span>
                    <span className="menu-label">オンライン対戦</span>
                </button>

                <button onClick={() => { soundManager.playSFX('click'); onDevGallery(); }} className="menu-item menu-item-dev">
                    <span className="menu-icon"><IconWrench size={'1.2em'} /></span>
                    <span className="menu-label">カードギャラリー</span>
                </button>
            </nav>

            {/* フッター: 画面最下部に控えめに */}
            <div style={{ position: 'absolute', bottom: 'calc(var(--fs) * 1.5)', left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <button onClick={() => { soundManager.playSFX('click'); onToggleTheme(); }} style={{
                    background: 'none', border: 'none',
                    color: 'var(--text-dim)', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 'var(--fs-xl)', fontWeight: 500, transition: 'color 0.2s',
                    opacity: 0.5,
                }}>
                    {isSteampunk ? <><IconGear size={'1em'} /> Steampunk</> : <><IconWave size={'1em'} /> Classic</>}
                </button>
                <span style={{ color: 'var(--text-dim)', opacity: 0.2, fontSize: 'var(--fs-lg)' }}>•</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-lg)', opacity: 0.35 }}>v9.0</span>
            </div>
        </div>
    );
}

// ============================================================
// ローカル対戦設定画面（人数 + バージョン + CPU設定）
// ============================================================
function LocalSetupScreen({ onStart, onBack }: {
    onStart: (n: number, version: GameVersion, cpuConfig: CPUConfig) => void;
    onBack: () => void;
}) {
    const [numPlayers, setNumPlayers] = useState<number>(2);
    const [version, setVersion] = useState<GameVersion>('base');
    const [cpuEnabled, setCpuEnabled] = useState(true);
    const [difficulty, setDifficulty] = useState<AIDifficulty>('heuristic');
    const [cpuMoveDelay, setCpuMoveDelay] = useState(soundManager.getSettings().cpuMoveDelay);
    const [cpuPlayerFlags, setCpuPlayerFlags] = useState<boolean[]>([true, true, true, true]);

    const handleStart = () => {
        soundManager.playSFX('click');
        soundManager.playRandomBGM();

        const cpuPlayers: string[] = [];
        if (cpuEnabled) {
            for (let i = 0; i < numPlayers; i++) {
                if (cpuPlayerFlags[i]) cpuPlayers.push(String(i));
            }
        }
        soundManager.setCPUMoveDelay(cpuMoveDelay);
        onStart(numPlayers, version, { enabled: cpuEnabled, cpuPlayers, difficulty, moveDelay: cpuMoveDelay });
    };

    const toggleCpuPlayer = (idx: number) => {
        const next = [...cpuPlayerFlags];
        next[idx] = !next[idx];
        setCpuPlayerFlags(next);
    };

    return (
        <div className="game-bg" style={{ display: 'flex', flexDirection: 'column' as const, height: '100vh', overflow: 'auto' }}>
            {/* 上部: 戻るボタン + タイトル */}
            <div className="animate-slide-up" style={{ textAlign: 'center', paddingTop: 'calc(var(--fs) * 3)', paddingBottom: 'calc(var(--fs) * 1.5)' }}>
                <h1 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <IconGamepad size={'1em'} /> ローカル対戦
                </h1>
            </div>

            {/* 設定エリア: 中央 */}
            <div className="animate-slide-up" style={{ flex: '1 1 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '0 16px' }}>
                <div style={{ maxWidth: 460, width: '100%', background: 'rgba(10,6,2,0.6)', borderRadius: 16, padding: '24px 28px' }}>
                    <GameSettingsPanel
                        numPlayers={numPlayers} setNumPlayers={setNumPlayers}
                        version={version} setVersion={setVersion}
                        cpuEnabled={cpuEnabled} setCpuEnabled={setCpuEnabled}
                        difficulty={difficulty} setDifficulty={setDifficulty}
                        cpuMoveDelay={cpuMoveDelay} setCpuMoveDelay={setCpuMoveDelay}
                        cpuPlayerFlags={cpuPlayerFlags} toggleCpuPlayer={toggleCpuPlayer}
                    />
                </div>
            </div>

            {/* 下部: ゲーム開始 + 戻る */}
            <div className="animate-slide-up" style={{ padding: 'calc(var(--fs) * 2) 16px calc(var(--fs) * 3)', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8 }}>
                <button onClick={handleStart} className="menu-item menu-item-primary" style={{ maxWidth: 460 }}>
                    <span className="menu-icon"><IconRocket size={'1.2em'} /></span>
                    <span className="menu-label">ゲーム開始</span>
                </button>
                <button onClick={() => { soundManager.playSFX('click'); onBack(); }} style={{
                    background: 'none', border: 'none', color: 'var(--text-dim)',
                    cursor: 'pointer', fontSize: 'var(--fs-xl2)', padding: '8px 16px',
                    opacity: 0.6, transition: 'opacity 0.2s',
                }}>
                    ← メニューに戻る
                </button>
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
                    <LogoFactory size={"calc(var(--fs) * 6.67)"} color="var(--gold)" />
                    <h1 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 900, color: 'var(--text-primary)', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><IconGlobe size={'1em'} /> オンライン対戦</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-xl2)', marginTop: 4 }}>PeerJS P2P接続</p>
                </div>
                <div className="glass-card" style={{ padding: 24, display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                    <button onClick={onHost} className="btn-primary" style={{ width: '100%', fontSize: 'var(--fs-3xl)', padding: '14px 0' }}>
                        <IconHome size={'1em'} /> ゲームを作成（ホスト）
                    </button>
                    <button onClick={onJoin} style={{
                        width: '100%', fontSize: 'var(--fs-3xl)', padding: '14px 0',
                        background: 'rgba(0, 188, 212, 0.15)', border: '1px solid rgba(0, 188, 212, 0.4)',
                        color: 'var(--teal)', borderRadius: 12, cursor: 'pointer', fontWeight: 600,
                        transition: 'all 0.2s',
                    }}>
                        <IconLink size={'1em'} /> ゲームに参加
                    </button>
                    <button onClick={onBack} style={{
                        background: 'none', border: 'none', color: 'var(--text-dim)',
                        cursor: 'pointer', fontSize: 'var(--fs-xl2)', marginTop: 8,
                    }}>
                        ← メニューに戻る
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// ホストロビー（P2P）— ゲーム設定統合 + Glory対応
// ============================================================
function HostLobby({ onBack }: { onBack: () => void }) {
    const [peerID, setPeerID] = useState<string>('');
    const [status, setStatus] = useState('PeerJS初期化中...');
    // ゲーム設定
    const [numPlayers, setNumPlayers] = useState(2);
    const [version, setVersion] = useState<GameVersion>('base');
    // ホスト自身のオートプレイ
    const [autoPlay, setAutoPlay] = useState(false);
    const [difficulty, setDifficulty] = useState<AIDifficulty>('heuristic');
    const [cpuMoveDelay, setCpuMoveDelay] = useState(soundManager.getSettings().cpuMoveDelay);


    const [connectedPlayers, setConnectedPlayers] = useState<string[]>([]);
    const [gameStarted, setGameStarted] = useState(false);
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
                        // P2P同時操作対応: payday/cleanupでは送信元のplayerIDのclientからMoveを発行
                        const phase = state?.G?.phase;
                        const isSimultaneous = phase === 'payday' || phase === 'cleanup';
                        const targetPid = isSimultaneous && data.playerID !== undefined
                            ? parseInt(data.playerID)
                            : parseInt(state?.ctx?.currentPlayer ?? '0');
                        const client = clientsRef.current[targetPid];
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
        // Glory対応: setupDataにversionを渡すためのラッパー
        const gameWithVersion = {
            ...NationalEconomy,
            setup: (ctx: any) => NationalEconomy.setup!(ctx, { version, isOnline: true }),
        };

        const localMP = Local();
        const clients: any[] = [];

        for (let i = 0; i < numPlayers; i++) {
            const client = BGClient({
                game: gameWithVersion,
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

        // ゲーム開始を全クライアントに通知（バージョン情報も送信）
        for (const [, conn] of connectionsRef.current) {
            conn.send({ type: 'gameStart', numPlayers, version });
        }

        soundManager.playRandomBGM();
        setGameStarted(true);
        setShowStartNotification(true);
    }, [numPlayers, version]);



    // ホストのmoves（プロキシ）
    // 常にctx.currentPlayerのclientからmoveを発行
    // endTurnでctx.currentPlayerがcurrentPlayerIndexと同期されるため、常に正しいclientを選択
    const hostMoves = useMemo(() => {
        if (!gameStarted || !clientsRef.current[0]) return {};
        return new Proxy({}, {
            get: (_target, name: string) => {
                return (...args: any[]) => {
                    const state = clientsRef.current[0]?.getState();
                    if (!state) return;
                    // P2P同時操作対応: payday/cleanupではホスト自身のclient(0)からMoveを発行
                    const phase = state?.G?.phase;
                    const isSimultaneous = phase === 'payday' || phase === 'cleanup';
                    const targetIdx = isSimultaneous ? 0 : parseInt(state?.ctx?.currentPlayer ?? '0');
                    const client = clientsRef.current[targetIdx];
                    if (client?.moves[name]) client.moves[name](...args);
                };
            },
        });
    }, [gameStarted]);

    // ゲーム画面
    if (gameStarted && hostState) {
        // ホストオートプレイ: ホスト自身をCPUとして扱う
        const cpuConf = autoPlay
            ? { enabled: true, cpuPlayers: ['0'], difficulty, moveDelay: cpuMoveDelay }
            : undefined;
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

    // 開始条件: 全人数揃ったら
    const humanSlots = connectedPlayers.length + 1; // +1 はホスト
    const canStart = humanSlots >= numPlayers;
    const missingCount = numPlayers - humanSlots;

    return (
        <div className="game-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 16, overflowY: 'auto' }}>
            <div className="animate-slide-up" style={{ maxWidth: 480, width: '100%' }}>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <LogoFactory size={"calc(var(--fs) * 6.67)"} color="var(--gold)" />
                    <h1 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 900, color: 'var(--text-primary)', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><IconHome size={'1em'} /> ホストロビー</h1>
                </div>

                <div className="glass-card" style={{ padding: 24, marginBottom: 16 }}>
                    {/* ステータスとPeer ID */}
                    <div style={{ marginBottom: 16 }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-xl2)' }}>ステータス: </span>
                        <span style={{ color: 'var(--teal)', fontSize: 'var(--fs-xl3)', fontWeight: 600 }}>{status}</span>
                    </div>

                    {peerID && (
                        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                            <div style={{ color: 'var(--text-dim)', fontSize: 'var(--fs-xl)', marginBottom: 6 }}>あなたのID（友達に共有）:</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <code style={{ color: 'var(--gold)', fontSize: 'var(--fs-xl2)', fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' as const }}>{peerID}</code>
                                <button onClick={() => navigator.clipboard.writeText(peerID)} style={{
                                    background: 'var(--teal)', color: '#000', border: 'none',
                                    padding: '4px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 'var(--fs-xl)', fontWeight: 700,
                                }}>
                                    <IconClipboard size={'1em'} />コピー
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 接続状況 */}
                    <div style={{ marginBottom: 16 }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-xl2)' }}>接続中: </span>
                        <span style={{ color: 'var(--teal)', fontWeight: 700 }}>{humanSlots}/{numPlayers}人</span>
                        <div style={{ fontSize: 'var(--fs-xl)', color: 'var(--text-dim)', marginTop: 4 }}>
                            P1: あなた（ホスト） {autoPlay && <IconRobot size={'1em'} />}
                            {Array.from({ length: numPlayers - 1 }, (_, i) => {
                                const pid = String(i + 1);
                                const isConnected = connectedPlayers.includes(pid);
                                return (
                                    <div key={pid}>
                                        P{i + 2}: {isConnected ? '接続済み ✅' : '待機中...'}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ゲーム設定（ホットシートと同一のUI、CPU設定は非表示） */}
                <div className="glass-card" style={{ padding: 24, marginBottom: 16 }}>
                    <h2 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><IconGear size={'1em'} /> ゲーム設定</h2>
                    <GameSettingsPanel
                        numPlayers={numPlayers} setNumPlayers={setNumPlayers}
                        version={version} setVersion={setVersion}
                        showCpuSettings={false}
                    />
                </div>

                {/* ホストオートプレイ */}
                <div className="glass-card" style={{ padding: 24, marginBottom: 16 }}>
                    <h2 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><IconRobot size={'1em'} /> ホスト設定</h2>
                    <div>
                        <button onClick={() => setAutoPlay(!autoPlay)} style={{
                            width: '100%', padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 'var(--fs-xl3)',
                            background: autoPlay ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.05)',
                            color: autoPlay ? '#a78bfa' : 'var(--text-dim)',
                            border: autoPlay ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(255,255,255,0.1)',
                            cursor: 'pointer', transition: 'all 0.2s',
                        }}>
                            {autoPlay ? <><IconRobot size={'1em'} /> ホスト自動プレイ: ON</> : <><IconRobot size={'1em'} /> ホスト自動プレイ: OFF</>}
                        </button>
                        {autoPlay && <div style={{ fontSize: 'var(--fs-lg)', color: '#a78bfa', marginTop: 4 }}>自分の手番をCPUが自動操作します</div>}
                    </div>
                </div>

                {/* ゲーム開始ボタン */}
                <button onClick={startGame} disabled={!canStart} style={{
                    width: '100%', padding: '14px', borderRadius: 12, fontWeight: 700, fontSize: 'var(--fs-3xl)',
                    background: canStart ? 'var(--teal)' : 'rgba(255,255,255,0.05)',
                    color: canStart ? '#000' : 'var(--text-dim)',
                    border: 'none', cursor: canStart ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                    boxShadow: canStart ? '0 0 15px var(--teal-glow)' : 'none',
                    marginBottom: 12,
                }}>
                    {canStart
                        ? <><IconRocket size={'1em'} /> ゲーム開始！</>
                        : `あと${missingCount}人の接続を待っています...`}
                </button>

                <button onClick={onBack} style={{
                    background: 'none', border: 'none', color: 'var(--text-dim)',
                    cursor: 'pointer', fontSize: 'var(--fs-xl2)', display: 'block', margin: '0 auto 24px',
                }}>
                    ← 戻る
                </button>
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
                    <h1 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 900, color: 'var(--gold)', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><IconLink size={'1em'} /> ゲームに参加</h1>

                    <div style={{ marginBottom: 16 }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-xl2)' }}>ステータス: </span>
                        <span style={{ color: 'var(--teal)', fontSize: 'var(--fs-xl3)', fontWeight: 600 }}>{status}</span>
                    </div>

                    <input
                        type="text"
                        value={hostID}
                        onChange={e => setHostID(e.target.value)}
                        placeholder="ホストのIDをペースト"
                        style={{
                            width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)',
                            borderRadius: 12, padding: '12px 16px', color: 'var(--text-primary)',
                            textAlign: 'center', fontFamily: 'monospace', fontSize: 'var(--fs-2xl)',
                            marginBottom: 12, outline: 'none',
                        }}
                    />

                    {/* CPUオートプレイ切替（接続前のみ表示） */}
                    {!connected && (
                        <div style={{ marginBottom: 12 }}>
                            <button onClick={() => setAutoPlay(!autoPlay)} style={{
                                width: '100%', padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 'var(--fs-xl3)',
                                background: autoPlay ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.05)',
                                color: autoPlay ? '#a78bfa' : 'var(--text-dim)',
                                border: autoPlay ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(255,255,255,0.1)',
                                cursor: 'pointer', transition: 'all 0.2s',
                            }}>
                                {autoPlay ? <><IconRobot size={'1em'} /> CPUオートプレイ: ON</> : <><IconRobot size={'1em'} /> CPUオートプレイ: OFF</>}
                            </button>
                            {autoPlay && <div style={{ fontSize: 'var(--fs-lg)', color: '#a78bfa', marginTop: 4 }}>自分の手番をCPUが自動操作します</div>}
                        </div>
                    )}

                    <button onClick={() => { setConnected(true); connect(); }} disabled={!hostID.trim() || connected} style={{
                        width: '100%', padding: '12px', borderRadius: 12, fontWeight: 700, fontSize: 'var(--fs-3xl)',
                        background: (hostID.trim() && !connected) ? 'var(--teal)' : 'rgba(255,255,255,0.05)',
                        color: (hostID.trim() && !connected) ? '#000' : 'var(--text-dim)',
                        border: 'none', cursor: (hostID.trim() && !connected) ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s',
                    }}>
                        {connected ? <><IconCheck size={'1em'} /> 接続済み</> : <><IconLink size={'1em'} /> 接続する</>}
                    </button>

                    <button onClick={onBack} style={{
                        background: 'none', border: 'none', color: 'var(--text-dim)',
                        cursor: 'pointer', fontSize: 'var(--fs-xl2)', marginTop: 12,
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

    // テーマ切り替え（localStorage永続化）
    const [theme, setTheme] = useState<'default' | 'steampunk'>(() => {
        const saved = localStorage.getItem('ne-theme');
        return saved === 'steampunk' ? 'steampunk' : 'default';
    });
    useEffect(() => {
        if (theme === 'steampunk') {
            document.documentElement.dataset.theme = 'steampunk';
        } else {
            delete document.documentElement.dataset.theme;
        }
        localStorage.setItem('ne-theme', theme);
    }, [theme]);
    const toggleTheme = () => setTheme(prev => prev === 'default' ? 'steampunk' : 'default');

    // ローカルゲーム開始
    const handleStartLocal = (numPlayers: number, version: GameVersion, cpuConfig: CPUConfig) => {
        setConfig({ numPlayers, version, cpuConfig });
        setScreen('playing');
    };

    // 画面ルーティング
    switch (screen) {
        case 'menu':
            return <MainMenuScreen onLocal={() => setScreen('local_setup')} onOnline={() => setScreen('online_menu')} onDevGallery={() => setScreen('dev_gallery')} theme={theme} onToggleTheme={toggleTheme} />;
        case 'dev_gallery':
            return <DevCardGallery onBack={() => setScreen('menu')} />;
        case 'local_setup':
            return <LocalSetupScreen onStart={handleStartLocal} onBack={() => setScreen('menu')} />;
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
