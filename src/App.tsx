// ============================================================
// App.tsx  –  P2Pオンライン対戦 + ホットシート (v7: バグ修正版)
// ============================================================
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Client as BGClient } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Ctx } from 'boardgame.io';
import { NationalEconomy } from './game';
import { Board } from './Board';
import type { GameState } from './types';

// ============================================================
// メインメニュー
// ============================================================
function MainMenu({ onSelect }: { onSelect: (mode: 'hotseat' | 'online') => void }) {
    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
            <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
                <h1 className="text-3xl font-bold text-amber-400 mb-2">🏭 ナショナルエコノミー</h1>
                <p className="text-gray-400 mb-6">プレイモードを選択してください</p>
                <div className="flex flex-col gap-4">
                    <button onClick={() => onSelect('hotseat')}
                        className="bg-teal-700 hover:bg-teal-600 text-white text-xl font-bold px-8 py-4 rounded-xl transition hover:scale-105 shadow-lg">
                        🎮 ホットシート（1台で対戦）
                    </button>
                    <button onClick={() => onSelect('online')}
                        className="bg-indigo-700 hover:bg-indigo-600 text-white text-xl font-bold px-8 py-4 rounded-xl transition hover:scale-105 shadow-lg">
                        🌐 オンライン対戦（P2P）
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// オンラインメニュー（ホスト/ゲスト選択）
// ============================================================
function OnlineMenu({ onHost, onJoin, onBack }: { onHost: () => void; onJoin: () => void; onBack: () => void }) {
    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
            <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
                <h1 className="text-3xl font-bold text-amber-400 mb-2">🌐 オンライン対戦</h1>
                <p className="text-gray-400 mb-6">ホストかゲストかを選択してください</p>
                <div className="flex flex-col gap-4 mb-4">
                    <button onClick={onHost}
                        className="bg-amber-700 hover:bg-amber-600 text-white text-lg font-bold px-8 py-4 rounded-xl transition shadow-lg">
                        🏠 ゲームを作成（ホスト）
                    </button>
                    <button onClick={onJoin}
                        className="bg-cyan-700 hover:bg-cyan-600 text-white text-lg font-bold px-8 py-4 rounded-xl transition shadow-lg">
                        🔗 ゲームに参加
                    </button>
                </div>
                <button onClick={onBack} className="text-gray-400 hover:text-gray-200 text-sm">← 戻る</button>
            </div>
        </div>
    );
}

// ============================================================
// プレイヤー人数選択（ホットシート用）
// ============================================================
function PlayerCountSelect({ onSelect, onBack }: { onSelect: (n: number) => void; onBack: () => void }) {
    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
            <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
                <h1 className="text-2xl font-bold text-amber-400 mb-4">🎮 プレイヤー人数</h1>
                <div className="flex gap-4 justify-center mb-4">
                    {[2, 3, 4].map(n => (
                        <button key={n} onClick={() => onSelect(n)}
                            className="bg-teal-700 hover:bg-teal-600 text-white text-3xl font-bold w-20 h-20 rounded-xl transition hover:scale-110 shadow-lg">
                            {n}人
                        </button>
                    ))}
                </div>
                <button onClick={onBack} className="text-gray-400 hover:text-gray-200 text-sm">← 戻る</button>
            </div>
        </div>
    );
}

// ============================================================
// スタート通知オーバーレイ
// ============================================================
function StartNotification({ playerNum, startPlayer, onDismiss }: { playerNum: number; startPlayer: number; onDismiss: () => void }) {
    // 3秒後に自動で消える
    useEffect(() => {
        const t = setTimeout(onDismiss, 3000);
        return () => clearTimeout(t);
    }, [onDismiss]);

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onDismiss}>
            <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center animate-bounce-in">
                <div className="text-6xl mb-4">🎲</div>
                <h2 className="text-2xl font-bold text-amber-400 mb-2">ゲーム開始！</h2>
                <p className="text-3xl font-bold text-cyan-400 mb-2">あなたは P{playerNum + 1} です</p>
                <p className="text-gray-400">P{startPlayer + 1} からスタートします</p>
                <p className="text-gray-500 text-sm mt-4">（クリックまたは3秒後に閉じます）</p>
            </div>
        </div>
    );
}

// ============================================================
// ホストロビー
// ============================================================
function HostLobby({ onBack }: { onBack: () => void }) {
    const [peerID, setPeerID] = useState<string>('');
    const [status, setStatus] = useState('PeerJS初期化中...');
    const [numPlayers, setNumPlayers] = useState(2);
    const [connectedPlayers, setConnectedPlayers] = useState<string[]>([]);
    const [gameStarted, setGameStarted] = useState(false);
    const [hostState, setHostState] = useState<{ G: GameState; ctx: Ctx } | null>(null);
    const [showStartNotification, setShowStartNotification] = useState(false);
    const peerRef = useRef<Peer | null>(null);
    const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
    const clientsRef = useRef<any[]>([]);

    // PeerJS初期化（STUN + TURNサーバー設定でNAT越え対応）
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
                        // モーダルフェーズのmoveはcurrentPlayerのクライアント経由で実行
                        // （bgioはcurrentPlayerのクライアントからのmoveだけを受け付ける）
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
                // 全接続プレイヤーに状態をブロードキャスト
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
    // 常にcurrentPlayerのクライアントのmovesを使うプロキシ
    // （bgioはcurrentPlayerのクライアントからのmoveだけを受け付ける）
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
    }, [gameStarted]); // eslint-disable-line

    // ゲーム画面
    if (gameStarted && hostState) {
        return (
            <>
                {showStartNotification && (
                    <StartNotification
                        playerNum={0}
                        startPlayer={hostState.G.startPlayer}
                        onDismiss={() => setShowStartNotification(false)}
                    />
                )}
                <Board G={hostState.G} ctx={hostState.ctx} moves={hostMoves} playerID="0" />
            </>
        );
    }

    // ロビー画面
    const canStart = connectedPlayers.length >= numPlayers - 1;

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
            <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full">
                <h1 className="text-2xl font-bold text-amber-400 mb-4 text-center">🏠 ホストロビー</h1>
                <div className="mb-4">
                    <span className="text-gray-400 text-sm">ステータス: </span>
                    <span className="text-cyan-400">{status}</span>
                </div>
                {peerID && (
                    <div className="mb-4 bg-gray-700 rounded-lg p-3">
                        <div className="text-gray-400 text-xs mb-1">あなたのID（友達に共有）:</div>
                        <div className="flex gap-2">
                            <code className="text-amber-400 text-sm font-mono flex-1 break-all">{peerID}</code>
                            <button onClick={() => navigator.clipboard.writeText(peerID)}
                                className="bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-1 rounded text-xs">
                                📋コピー
                            </button>
                        </div>
                    </div>
                )}
                <div className="mb-4">
                    <label className="text-gray-400 text-sm block mb-1">プレイヤー人数:</label>
                    <div className="flex gap-2">
                        {[2, 3, 4].map(n => (
                            <button key={n} onClick={() => setNumPlayers(n)}
                                className={`px-4 py-2 rounded font-bold transition ${n === numPlayers ? 'bg-amber-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}>
                                {n}人
                            </button>
                        ))}
                    </div>
                </div>
                <div className="mb-4">
                    <span className="text-gray-400 text-sm">接続中: </span>
                    <span className="text-green-400">{connectedPlayers.length + 1}/{numPlayers}人</span>
                    <div className="text-xs text-gray-500 mt-1">
                        P1: あなた（ホスト）
                        {connectedPlayers.map(pid => (
                            <div key={pid}>P{parseInt(pid) + 1}: 接続済み ✅</div>
                        ))}
                    </div>
                </div>
                <button onClick={startGame}
                    disabled={!canStart}
                    className={`w-full py-3 rounded-xl font-bold text-lg transition ${canStart ? 'bg-green-700 hover:bg-green-600 text-white hover:scale-105 shadow-lg' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>
                    {canStart ? '🚀 ゲーム開始！' : `あと${numPlayers - 1 - connectedPlayers.length}人の接続を待っています...`}
                </button>
                <button onClick={onBack} className="text-gray-400 hover:text-gray-200 text-sm mt-4 block mx-auto">← 戻る</button>
            </div>
        </div>
    );
}

// ============================================================
// ゲスト参加ロビー
// ============================================================
function JoinLobby({ onBack }: { onBack: () => void }) {
    const [hostID, setHostID] = useState('');
    const [status, setStatus] = useState('接続準備中...');
    const [playerID, setPlayerID] = useState<string | null>(null);
    const [gameStarted, setGameStarted] = useState(false);
    const [gameState, setGameState] = useState<{ G: GameState; ctx: Ctx } | null>(null);
    const [showStartNotification, setShowStartNotification] = useState(false);
    const peerRef = useRef<Peer | null>(null);
    const connRef = useRef<DataConnection | null>(null);

    // PeerJS初期化（STUN + TURNサーバー設定でNAT越え対応）
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
        return (
            <>
                {showStartNotification && (
                    <StartNotification
                        playerNum={parseInt(playerID)}
                        startPlayer={gameState.G.startPlayer}
                        onDismiss={() => setShowStartNotification(false)}
                    />
                )}
                <Board G={gameState.G} ctx={gameState.ctx} moves={remoteMoves} playerID={playerID} />
            </>
        );
    }

    // 参加画面
    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
            <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
                <h1 className="text-2xl font-bold text-amber-400 mb-4">🔗 ゲームに参加</h1>
                <div className="mb-4">
                    <span className="text-gray-400 text-sm">ステータス: </span>
                    <span className="text-cyan-400">{status}</span>
                </div>
                <div className="mb-4">
                    <input
                        type="text"
                        value={hostID}
                        onChange={e => setHostID(e.target.value)}
                        placeholder="ホストのIDをペースト"
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white text-center font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                </div>
                <button onClick={connect}
                    disabled={!hostID.trim()}
                    className={`w-full py-3 rounded-xl font-bold text-lg transition ${hostID.trim() ? 'bg-cyan-700 hover:bg-cyan-600 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>
                    🔗 接続する
                </button>
                <button onClick={onBack} className="text-gray-400 hover:text-gray-200 text-sm mt-4 block mx-auto">← 戻る</button>
            </div>
        </div>
    );
}

// ============================================================
// ホットシート（ローカル1台対戦）
// ============================================================
function HotseatGame({ numPlayers, onBack }: { numPlayers: number; onBack: () => void }) {
    const [state, setState] = useState<{ G: GameState; ctx: Ctx } | null>(null);
    const clientRef = useRef<any>(null);

    useEffect(() => {
        const client = BGClient({
            game: NationalEconomy,
            numPlayers,
            debug: false,
        });
        client.start();
        clientRef.current = client;
        client.subscribe((s: any) => {
            if (s) setState({ G: s.G, ctx: s.ctx });
        });
        return () => { client.stop(); };
    }, [numPlayers]);

    if (!state) return <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">読み込み中...</div>;

    return <Board G={state.G} ctx={state.ctx} moves={clientRef.current?.moves || {}} />;
}

// ============================================================
// App メイン
// ============================================================
export function App() {
    const [screen, setScreen] = useState<'menu' | 'hotseatCount' | 'online' | 'host' | 'join' | 'hotseat'>('menu');
    const [numPlayers, setNumPlayers] = useState(2);

    switch (screen) {
        case 'menu':
            return <MainMenu onSelect={(mode) => setScreen(mode === 'hotseat' ? 'hotseatCount' : 'online')} />;
        case 'hotseatCount':
            return <PlayerCountSelect onSelect={(n) => { setNumPlayers(n); setScreen('hotseat'); }} onBack={() => setScreen('menu')} />;
        case 'hotseat':
            return <HotseatGame numPlayers={numPlayers} onBack={() => setScreen('menu')} />;
        case 'online':
            return <OnlineMenu onHost={() => setScreen('host')} onJoin={() => setScreen('join')} onBack={() => setScreen('menu')} />;
        case 'host':
            return <HostLobby onBack={() => setScreen('online')} />;
        case 'join':
            return <JoinLobby onBack={() => setScreen('online')} />;
    }
}
