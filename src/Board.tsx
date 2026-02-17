// ============================================================
// Board.tsx  –  メインUI (v5: ゲームログ追加)
// ============================================================
import React, { useState, useRef, useEffect } from 'react';
import type { Ctx } from 'boardgame.io';
import type { GameState, Card } from './types';
import { getCardDef, CONSUMABLE_DEF_ID } from './cards';

// Board用の汎用Props（boardgame.io Client経由でも直接渡しでも使える）
interface GameBoardProps {
    G: GameState;
    ctx: Ctx;
    moves: Record<string, (...args: any[]) => void>;
    playerID?: string | null;
}

const isConsumable = (c: Card) => c.defId === CONSUMABLE_DEF_ID;
const isHidden = (c: Card) => c.defId === 'HIDDEN';
const cName = (defId: string) => {
    if (defId === 'HIDDEN') return '???';
    if (defId === CONSUMABLE_DEF_ID) return '消費財';
    return getCardDef(defId).name;
};
const cTags = (defId: string) => {
    if (defId === CONSUMABLE_DEF_ID || defId === 'HIDDEN') return '';
    const d = getCardDef(defId);
    const t: string[] = [];
    if (d.tags.includes('farm')) t.push('※農園');
    if (d.tags.includes('factory')) t.push('※工場');
    if (d.unsellable) t.push('🔒');
    return t.join(' ');
};
const cEffect = (defId: string) => {
    if (defId === CONSUMABLE_DEF_ID || defId === 'HIDDEN') return '';
    return getCardDef(defId).effectText;
};

function getWagePerWorker(r: number): number {
    if (r <= 2) return 2;
    if (r <= 5) return 3;
    if (r <= 7) return 4;
    return 5;
}

// ============================================================
// キャンセルボタン
// ============================================================
function CancelButton({ onClick }: { onClick: () => void }) {
    return (
        <button onClick={onClick}
            className="absolute top-3 right-3 bg-gray-600 hover:bg-gray-500 text-gray-200 px-3 py-1.5 rounded-lg text-sm font-medium transition shadow-md hover:shadow-lg flex items-center gap-1">
            ✕ キャンセル
        </button>
    );
}

export function Board({ G, ctx, moves, playerID }: GameBoardProps) {
    const [showDiscard, setShowDiscard] = useState(false);
    const [showLog, setShowLog] = useState(false);
    const curPid = ctx.currentPlayer;
    const curIdx = parseInt(curPid);
    const wage = getWagePerWorker(G.round);
    // オンライン: playerIDがあれば自分のID、なければホットシート（currentPlayer）
    const myPid = playerID ?? curPid;
    const isOnline = playerID !== null && playerID !== undefined;

    // モーダルフェーズ中は G.activePlayer が操作者
    const modalPhases = ['payday', 'cleanup', 'discard', 'build', 'designOffice', 'dualConstruction'];
    const isModalPhase = modalPhases.includes(G.phase);
    const effectivePlayer = isModalPhase ? String(G.activePlayer) : curPid;
    const isMyTurn = effectivePlayer === myPid;

    // ゲーム終了
    if (G.phase === 'gameEnd' && G.finalScores) return <GameOver G={G} />;

    // P2Pモード: 自分のターンでない場合のモーダル系は「待機中」表示にする
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
            <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
                <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
                    <div className="text-4xl mb-4 animate-pulse">⏳</div>
                    <h2 className="text-xl font-bold text-amber-400 mb-2">P{G.activePlayer + 1} が操作中...</h2>
                    <p className="text-gray-400">{phaseLabels[G.phase] || G.phase}を行っています</p>
                    <p className="text-gray-500 text-sm mt-4">しばらくお待ちください</p>
                </div>
            </div>
        );
    }

    // 給料日モーダル
    if (G.phase === 'payday' && G.paydayState) return <PaydayUI G={G} moves={moves} />;

    // 精算（手札捨て）
    if (G.phase === 'cleanup' && G.cleanupState) return <CleanupUI G={G} moves={moves} />;

    // 捨てカード選択モーダル
    if (G.phase === 'discard' && G.discardState) return <DiscardUI G={G} moves={moves} pid={curPid} />;

    // 設計事務所モーダル
    if (G.phase === 'designOffice' && G.designOfficeState) return <DesignOfficeUI G={G} moves={moves} />;

    // 二胡市建設モーダル
    if (G.phase === 'dualConstruction' && G.dualConstructionState) return <DualConstructionUI G={G} moves={moves} pid={curPid} />;

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-3 text-sm">
            {/* ヘッダー */}
            <div className="flex items-center justify-between mb-3 bg-gray-800 p-2 rounded-lg">
                <h1 className="text-xl font-bold text-amber-400">🏭 ナショナルエコノミー</h1>
                <div className="flex gap-2 text-xs">
                    <span className="bg-blue-900 px-2 py-1 rounded">R<b className="text-blue-300 text-base ml-0.5">{G.round}</b>/9</span>
                    <span className="bg-cyan-900 px-2 py-1 rounded">💰賃金<b className="text-cyan-300 text-base ml-0.5">${wage}</b>/人</span>
                    <span className="bg-green-900 px-2 py-1 rounded">家計<b className="text-green-300 text-base ml-0.5">${G.household}</b></span>
                    <span className="bg-purple-900 px-2 py-1 rounded">山札<b className="text-purple-300 text-base ml-0.5">{G.deck.length}</b></span>
                    <button onClick={() => setShowDiscard(!showDiscard)} className="bg-orange-900 px-2 py-1 rounded hover:bg-orange-800 cursor-pointer">
                        捨札<b className="text-orange-300 text-base ml-0.5">{G.discard.length}</b>
                    </button>
                    <button onClick={() => setShowLog(!showLog)} className="bg-indigo-900 px-2 py-1 rounded hover:bg-indigo-800 cursor-pointer">
                        📜ログ<b className="text-indigo-300 text-base ml-0.5">{G.log.length}</b>
                    </button>
                </div>
            </div>

            {/* 捨て札モーダル */}
            {showDiscard && <DiscardPileModal discard={G.discard} onClose={() => setShowDiscard(false)} />}

            {/* ログモーダル */}
            {showLog && <LogModal log={G.log} onClose={() => setShowLog(false)} />}

            {/* ターン表示 */}
            <div className="bg-indigo-900/80 p-2 rounded mb-3 text-center">
                👤 <b className="text-yellow-300">P{curIdx + 1}</b> のターン
                {G.phase === 'build' && <span className="ml-3 bg-red-700 px-2 py-0.5 rounded text-xs">🔨 建設するカードを選択</span>}
            </div>

            {/* 建設フェーズのキャンセルボタン */}
            {G.phase === 'build' && G.buildState && (
                <div className="flex justify-end mb-2">
                    <button onClick={() => moves.cancelAction()}
                        className="bg-gray-600 hover:bg-gray-500 text-gray-200 px-3 py-1 rounded text-xs font-medium transition">
                        ✕ 建設をキャンセル
                    </button>
                </div>
            )}

            {/* 公共職場 */}
            <Section title="📋 公共職場">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
                    {G.publicWorkplaces.map(wp => {
                        const ok = G.phase === 'work' && isMyTurn && canPlacePublic(G, curPid, wp);
                        return (
                            <div key={wp.id} onClick={() => ok && moves.placeWorker(wp.id)}
                                className={`border rounded p-1.5 cursor-pointer transition ${ok ? 'border-teal-500 bg-teal-900/40 hover:bg-teal-800/60' : 'border-gray-700 bg-gray-800/40 opacity-50 cursor-not-allowed'} ${wp.fromBuilding ? 'border-l-4 border-l-emerald-500' : ''}`}>
                                <div className="font-bold text-teal-300 text-xs">{wp.name}</div>
                                <div className="text-[10px] text-gray-400">{wp.effectText}</div>
                                {wp.multipleAllowed && <div className="text-[9px] text-purple-400">∞複数可</div>}
                                {wp.workers.length > 0 && <div className="mt-0.5 flex gap-0.5 flex-wrap">{wp.workers.map((w, i) => <span key={i} className="bg-blue-700 text-white px-1 rounded text-[9px]">P{w + 1}</span>)}</div>}
                            </div>
                        );
                    })}
                </div>
            </Section>

            {/* プレイヤーエリア */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
                {Array.from({ length: ctx.numPlayers }, (_, i) => {
                    const pid = String(i);
                    const p = G.players[pid];
                    const active = pid === curPid;
                    const isMe = pid === myPid;
                    return (
                        <div key={pid} className={`rounded-lg p-2 ${active ? 'bg-gray-700 ring-2 ring-yellow-400' : 'bg-gray-800 opacity-70'} ${isMe && isOnline ? 'ring-2 ring-cyan-500' : ''}`}>
                            <div className="flex items-center justify-between mb-1">
                                <h3 className={`font-bold ${active ? 'text-yellow-400' : 'text-gray-400'}`}>
                                    P{i + 1}{isMe && isOnline && <span className="ml-1 text-cyan-400 text-xs">（あなた）</span>}{i === G.startPlayer && <span className="ml-1 text-orange-400 text-xs">⭐</span>}
                                </h3>
                                <div className="flex gap-1.5 text-[10px]">
                                    <span className="bg-yellow-800 px-1.5 py-0.5 rounded">💰${p.money}</span>
                                    <span className="bg-blue-800 px-1.5 py-0.5 rounded">👷{p.availableWorkers}/{p.workers}</span>
                                    <span className="bg-gray-600 px-1.5 py-0.5 rounded">🃏{p.hand.length}/{p.maxHandSize}</span>
                                    {p.unpaidDebts > 0 && <span className="bg-red-800 px-1.5 py-0.5 rounded">⚠{p.unpaidDebts}</span>}
                                </div>
                            </div>
                            {/* 建設済み建物（自分の場＝個人職場） */}
                            {p.buildings.length > 0 && (
                                <div className="mb-1">
                                    <span className="text-[10px] text-gray-400">🏗️ 自分の場:</span>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                        {p.buildings.map(b => {
                                            const def = getCardDef(b.card.defId);
                                            const lockBlocked = def.unsellable && b.card.defId !== 'slash_burn';
                                            const canPlace = active && isMyTurn && G.phase === 'work' && !b.workerPlaced && p.availableWorkers > 0 && !lockBlocked;
                                            const effectBlocked = canPlace && !canPlaceOnBuilding(G, p, b.card.defId);
                                            const isActive = canPlace && !effectBlocked;
                                            return (
                                                <div key={b.card.uid} onClick={() => isActive && moves.placeWorkerOnBuilding(b.card.uid)}
                                                    className={`px-1.5 py-0.5 rounded text-[10px] border ${b.workerPlaced ? 'bg-blue-900 border-blue-600 text-blue-300' : isActive ? 'bg-emerald-900 border-emerald-500 text-emerald-200 cursor-pointer hover:bg-emerald-800' : 'bg-gray-700 border-gray-600 text-gray-400 opacity-50 cursor-not-allowed'}`}
                                                    title={`${def.name} (${def.vp}VP) ${def.effectText}`}>
                                                    {def.name} {def.vp}VP {cTags(b.card.defId)} {b.workerPlaced ? '👷' : ''}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {/* 手札 */}
                            {(() => {
                                // 自分の手札は常に表示、他プレイヤーはカード裏面または枚数のみ
                                const showFullHand = isMe || (!isOnline && active);
                                const isHiddenHand = p.hand.length > 0 && p.hand[0]?.defId === 'HIDDEN';
                                if (showFullHand && !isHiddenHand) {
                                    return (
                                        <div>
                                            <span className="text-[10px] text-gray-400">🃏 手札:</span>
                                            <div className="flex flex-wrap gap-1 mt-0.5">
                                                {p.hand.map((c, ci) => {
                                                    const isCons = isConsumable(c);
                                                    const isBuildPhase = G.phase === 'build' && G.buildState;
                                                    let canClick = false;
                                                    let highlight = '';
                                                    if (active && isMyTurn && isBuildPhase && !isCons) {
                                                        const def = getCardDef(c.defId);
                                                        const bs = G.buildState!;
                                                        if (bs.action === 'pioneer') {
                                                            canClick = def.tags.includes('farm');
                                                        } else {
                                                            const cost = Math.max(0, def.cost - bs.costReduction);
                                                            canClick = p.hand.length - 1 >= cost;
                                                        }
                                                        if (canClick) highlight = 'ring-2 ring-amber-400';
                                                    }
                                                    const effectText = cEffect(c.defId);
                                                    return (
                                                        <div key={c.uid} onClick={() => canClick && moves.selectBuildCard(ci)}
                                                            className={`border rounded p-1 text-[10px] min-w-[90px] ${isCons ? 'bg-stone-800 border-stone-600' : 'bg-gray-700 border-gray-500'} ${canClick ? 'cursor-pointer hover:border-amber-400' : ''} ${highlight}`}>
                                                            <div className="font-bold">{cName(c.defId)}</div>
                                                            {!isCons && <>
                                                                <div className="text-gray-400">C{getCardDef(c.defId).cost}/{getCardDef(c.defId).vp}VP</div>
                                                                {cTags(c.defId) && <div className="text-amber-400">{cTags(c.defId)}</div>}
                                                                {effectText && <div className="text-gray-500 text-[9px] mt-0.5 leading-tight">{effectText}</div>}
                                                            </>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                }
                                // 他プレイヤーの手札: カード裏面表示
                                if (p.hand.length > 0) {
                                    return (
                                        <div>
                                            <span className="text-[10px] text-gray-400">🃏 手札 ({p.hand.length}枚):</span>
                                            <div className="flex flex-wrap gap-1 mt-0.5">
                                                {p.hand.map((c, ci) => (
                                                    <div key={ci} className="border rounded p-1 text-[10px] min-w-[50px] bg-indigo-900/60 border-indigo-700">
                                                        <div className="font-bold text-indigo-400 text-center">🂠</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }
                                return <div className="text-[10px] text-gray-500">手札0枚</div>;
                            })()}
                        </div>
                    );
                })}
            </div>

            {/* インラインログ（最新5件） */}
            <div className="mt-3 bg-gray-800 rounded-lg p-2">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400 font-bold">📜 最新ログ</span>
                    <button onClick={() => setShowLog(true)} className="text-[10px] text-cyan-400 hover:text-cyan-300">
                        全件表示 ({G.log.length})
                    </button>
                </div>
                <div className="space-y-0.5">
                    {G.log.slice(-5).reverse().map((entry, i) => (
                        <div key={G.log.length - i} className={`text-[10px] leading-tight ${entry.text.startsWith('===') ? 'text-amber-400 font-bold' : entry.text.startsWith('---') ? 'text-cyan-400' : 'text-gray-300'}`}>
                            {entry.text}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================================================
// セクションヘルパー
// ============================================================
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return <div className="mb-3"><h2 className="text-sm font-bold text-teal-400 border-b border-teal-800 pb-0.5 mb-1">{title}</h2>{children}</div>;
}

// ============================================================
// ゲームログモーダル
// ============================================================
function LogModal({ log, onClose }: { log: GameState['log']; onClose: () => void }) {
    const bottomRef = useRef<HTMLDivElement>(null);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, []);

    // ラウンドごとにグループ化
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-800 rounded-xl p-5 max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-indigo-400">📜 ゲームログ</h2>
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm">閉じる</button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {roundGroups.map((group, gi) => (
                        <div key={gi}>
                            {group.entries.map((entry, ei) => (
                                <div key={`${gi}-${ei}`}
                                    className={`text-xs leading-relaxed py-0.5 ${entry.text.startsWith('===') ? 'text-amber-400 font-bold mt-2 border-t border-gray-700 pt-2' : entry.text.startsWith('---') ? 'text-cyan-400 font-semibold' : 'text-gray-300 pl-2'}`}>
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
        <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-xl p-6 max-w-3xl w-full relative">
                <CancelButton onClick={() => moves.cancelAction()} />
                <h2 className="text-xl font-bold text-amber-400 mb-2">🔍 設計事務所</h2>
                <p className="text-gray-300 mb-3">山札から<b className="text-cyan-400">{dos.revealedCards.length}枚</b>公開しました。<b className="text-amber-400">1枚</b>を選んでください。残りは捨て札になります。</p>
                <div className="flex flex-wrap gap-3 mb-4">
                    {dos.revealedCards.map((c, ci) => {
                        const isCons = isConsumable(c);
                        const def = isCons ? null : getCardDef(c.defId);
                        return (
                            <div key={c.uid} onClick={() => moves.selectDesignOfficeCard(ci)}
                                className="border border-cyan-500 bg-cyan-900/30 rounded p-3 min-w-[120px] cursor-pointer hover:bg-cyan-800/50 hover:ring-2 hover:ring-cyan-400 transition">
                                <div className="font-bold text-sm">{cName(c.defId)}</div>
                                {def && <>
                                    <div className="text-xs text-gray-400">C{def.cost}/{def.vp}VP</div>
                                    <div className="text-[10px] text-gray-400 mt-1">{def.effectText}</div>
                                    {cTags(c.defId) && <div className="text-[10px] text-amber-400 mt-0.5">{cTags(c.defId)}</div>}
                                </>}
                                {isCons && <div className="text-xs text-gray-400">消費財</div>}
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
        <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-xl p-6 max-w-3xl w-full relative">
                <CancelButton onClick={() => moves.cancelAction()} />
                <h2 className="text-xl font-bold text-amber-400 mb-2">🏗️ 二胡市建設</h2>
                <p className="text-gray-300 mb-3">同じコストの建物カードを<b className="text-amber-400">2枚</b>選択してください（コストは1つ分のみ支払い）</p>
                <p className="text-xs text-gray-400 mb-3">選択中: {ds.selectedCardIndices.length}/2枚</p>
                <div className="flex flex-wrap gap-2 mb-4">
                    {p.hand.map((c, ci) => {
                        const isCons = isConsumable(c);
                        if (isCons) return (
                            <div key={c.uid} className="border rounded p-2 min-w-[100px] border-gray-600 bg-gray-700 opacity-40 cursor-not-allowed">
                                <div className="font-bold text-sm">消費財</div>
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
                            <div key={c.uid} onClick={() => selectable && moves.toggleDualCard(ci)}
                                className={`border rounded p-2 min-w-[100px] transition ${selected ? 'border-amber-500 bg-amber-900/40 ring-2 ring-amber-500' : selectable ? 'border-gray-500 bg-gray-700 cursor-pointer hover:border-amber-400' : 'border-gray-600 bg-gray-700 opacity-40 cursor-not-allowed'}`}>
                                <div className="font-bold text-sm">{def.name}</div>
                                <div className="text-[10px] text-gray-400">C{def.cost}/{def.vp}VP</div>
                                {cTags(c.defId) && <div className="text-[10px] text-amber-400">{cTags(c.defId)}</div>}
                                {selected && <div className="text-amber-400 text-xs mt-1">✓ 選択中</div>}
                            </div>
                        );
                    })}
                </div>
                <button onClick={() => moves.confirmDualConstruction()}
                    disabled={!canConfirm}
                    className={`px-6 py-2 rounded font-bold ${canConfirm ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>
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
        <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-xl p-6 max-w-3xl w-full relative">
                <CancelButton onClick={() => moves.cancelAction()} />
                <h2 className="text-xl font-bold text-amber-400 mb-2">🃏 カードを捨てる</h2>
                <p className="text-gray-300 mb-3">{ds.reason} — <b className="text-red-400">{ds.count}枚</b>選択してください（選択中: {ds.selectedIndices.length}枚）</p>
                <div className="flex flex-wrap gap-2 mb-4">
                    {p.hand.map((c, ci) => {
                        const excluded = excludeUids.has(c.uid);
                        const selected = ds.selectedIndices.includes(ci);
                        const isCons = isConsumable(c);
                        return (
                            <div key={c.uid}
                                onClick={() => !excluded && moves.toggleDiscard(ci)}
                                className={`border rounded p-2 min-w-[100px] cursor-pointer transition ${excluded ? 'border-amber-500 bg-amber-900/30 opacity-60 cursor-not-allowed' : selected ? 'border-red-500 bg-red-900/40 ring-2 ring-red-500' : 'border-gray-500 bg-gray-700 hover:border-gray-300'}`}>
                                <div className="font-bold text-sm">{cName(c.defId)}</div>
                                {excluded && <div className="text-[10px] text-amber-400">建設対象</div>}
                                {!isCons && !excluded && !isHidden(c) && <div className="text-[10px] text-gray-400">C{getCardDef(c.defId).cost}/{getCardDef(c.defId).vp}VP</div>}
                                {cTags(c.defId) && <div className="text-[10px] text-amber-400">{cTags(c.defId)}</div>}
                                {selected && <div className="text-red-400 text-xs mt-1">✓ 捨てる</div>}
                            </div>
                        );
                    })}
                </div>
                <button onClick={() => moves.confirmDiscard()}
                    disabled={ds.selectedIndices.length !== ds.count}
                    className={`px-6 py-2 rounded font-bold ${ds.selectedIndices.length === ds.count ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>
                    ✅ 確定（{ds.selectedIndices.length}/{ds.count}）
                </button>
            </div>
        </div>
    );
}

// ============================================================
// 給料日UI
// ============================================================
function PaydayUI({ G, moves }: { G: GameState; moves: any }) {
    const ps = G.paydayState!;
    const p = G.players[String(ps.currentPlayerIndex)];
    const shortage = ps.totalWage - p.money;

    const selectedVPs = ps.selectedBuildingIndices.map(bi => getCardDef(p.buildings[bi].card.defId).vp);
    const sellTotal = selectedVPs.reduce((sum, vp) => sum + vp, 0);
    const totalFunds = p.money + sellTotal;
    const canAfford = totalFunds >= ps.totalWage;

    const allSellableCount = p.buildings.filter(b => !getCardDef(b.card.defId).unsellable).length;
    const allSellableSelected = ps.selectedBuildingIndices.length === allSellableCount;

    // 過剰売却判定:
    // 「選択中の建物のうち最もVPの低い建物を1つ除いても賃金を支払える」場合は過剰
    // ※全選択でも、1つ除いて払えるなら過剰（全選択で"ギリギリ"や"不足"の場合のみ許可）
    let isExcessive = false;
    if (selectedVPs.length > 0) {
        const minVP = Math.min(...selectedVPs);
        const fundsWithoutMin = totalFunds - minVP;
        if (fundsWithoutMin >= ps.totalWage) {
            isExcessive = true;
        }
    }

    // ボタン活性条件:
    // - 過剰売却でないこと
    // - かつ、賃金を支払えるか、全売却可能建物を選択済み（負債覚悟）であること
    // - 何も選択していない状態では不可（所持金だけで足りないのでこの画面が出ている）
    const hasSelection = ps.selectedBuildingIndices.length > 0;
    const canConfirm = !isExcessive && (canAfford || allSellableSelected) && (hasSelection || p.money >= ps.totalWage);

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-xl p-6 max-w-2xl w-full">
                <h2 className="text-xl font-bold text-amber-400 mb-2">💰 給料日 — P{ps.currentPlayerIndex + 1}</h2>
                <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                    <div className="bg-gray-700 p-2 rounded">賃金: <b>${ps.wagePerWorker}</b>/人 × {p.workers}人 = <b className="text-red-400">${ps.totalWage}</b></div>
                    <div className="bg-gray-700 p-2 rounded">所持金: <b className="text-yellow-400">${p.money}</b> + 売却: <b className="text-green-400">${sellTotal}</b> = <b className={totalFunds >= ps.totalWage ? 'text-green-400' : 'text-red-400'}>${totalFunds}</b></div>
                </div>
                {shortage > 0 && <p className="text-red-400 mb-3">⚠️ 不足: ${shortage} — 建物を売却してください（1VP=$1）</p>}
                {p.buildings.length > 0 && (
                    <div className="mb-3">
                        <span className="text-xs text-gray-400 mb-1 block">🏗️ 建物（クリックで売却選択/解除）:</span>
                        <div className="flex flex-wrap gap-2">
                            {p.buildings.map((b, bi) => {
                                const def = getCardDef(b.card.defId);
                                const selected = ps.selectedBuildingIndices.includes(bi);
                                const disabled = def.unsellable;
                                return (
                                    <div key={b.card.uid} onClick={() => !disabled && moves.togglePaydaySell(bi)}
                                        className={`border rounded p-2 text-left text-xs transition ${disabled ? 'border-gray-600 bg-gray-700 opacity-40 cursor-not-allowed' : selected ? 'border-yellow-500 bg-yellow-900/50 ring-2 ring-yellow-500 cursor-pointer' : 'border-yellow-600 bg-yellow-900/30 hover:bg-yellow-800/50 cursor-pointer'}`}>
                                        <div className="font-bold">{def.name}</div>
                                        <div className="text-gray-400">{def.vp}VP = <b className="text-yellow-400">${def.vp}</b></div>
                                        {disabled && <div className="text-red-400">売却不可</div>}
                                        {selected && <div className="text-yellow-400 mt-1">✓ 売却</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {/* 過剰売却メッセージ */}
                {isExcessive && (
                    <div className="bg-orange-900/50 border border-orange-500 rounded-lg p-3 mb-3">
                        <p className="text-orange-400 font-bold text-sm">⚠️ 余分に建物を売ることはできません</p>
                        <p className="text-orange-300 text-xs mt-1">最もVPの低い建物を除いても賃金を支払えます。不要な建物の選択を解除してください。</p>
                    </div>
                )}
                <button onClick={() => moves.confirmPaydaySell()}
                    disabled={!canConfirm}
                    className={`px-6 py-2 rounded font-bold transition ${canConfirm ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>
                    💳 支払い確定{!canAfford && allSellableSelected ? `（不足$${ps.totalWage - totalFunds}は負債）` : ''}
                </button>
            </div>
        </div>
    );
}

// ============================================================
// 精算UI
// ============================================================
function CleanupUI({ G, moves }: { G: GameState; moves: any }) {
    const cs = G.cleanupState!;
    const p = G.players[String(cs.currentPlayerIndex)];
    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-xl p-6 max-w-3xl w-full">
                <h2 className="text-xl font-bold text-amber-400 mb-2">🗑️ 精算 — P{cs.currentPlayerIndex + 1}</h2>
                <p className="text-gray-300 mb-3">手札上限 {p.maxHandSize}枚を超えています。<b className="text-red-400">{cs.excessCount}枚</b>捨ててください（選択中: {cs.selectedIndices.length}枚）</p>
                <div className="flex flex-wrap gap-2 mb-4">
                    {p.hand.map((c, ci) => {
                        const selected = cs.selectedIndices.includes(ci);
                        return (
                            <div key={c.uid} onClick={() => moves.toggleDiscard(ci)}
                                className={`border rounded p-2 min-w-[90px] cursor-pointer transition ${selected ? 'border-red-500 bg-red-900/40 ring-2 ring-red-500' : 'border-gray-500 bg-gray-700 hover:border-gray-300'}`}>
                                <div className="font-bold text-sm">{cName(c.defId)}</div>
                                {!isConsumable(c) && !isHidden(c) && <div className="text-[10px] text-gray-400">C{getCardDef(c.defId).cost}/{getCardDef(c.defId).vp}VP {cTags(c.defId)}</div>}
                                {selected && <div className="text-red-400 text-xs mt-1">✓ 捨てる</div>}
                            </div>
                        );
                    })}
                </div>
                <button onClick={() => moves.confirmDiscard()}
                    disabled={cs.selectedIndices.length !== cs.excessCount}
                    className={`px-6 py-2 rounded font-bold ${cs.selectedIndices.length === cs.excessCount ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>
                    ✅ 確定（{cs.selectedIndices.length}/{cs.excessCount}）
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-800 rounded-xl p-5 max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h2 className="text-lg font-bold text-orange-400 mb-3">🗃️ 捨て札（{discard.length}枚）</h2>
                {entries.length === 0 ? <p className="text-gray-400">なし</p> : (
                    <table className="w-full text-sm">
                        <thead><tr className="border-b border-gray-600"><th className="text-left py-1">カード名</th><th className="text-right py-1">枚数</th></tr></thead>
                        <tbody>{entries.map(([name, count]) => <tr key={name} className="border-b border-gray-700"><td className="py-1">{name}</td><td className="text-right py-1 text-orange-300">{count}</td></tr>)}</tbody>
                    </table>
                )}
                <button onClick={onClose} className="mt-3 bg-gray-600 hover:bg-gray-500 text-white px-4 py-1 rounded text-sm">閉じる</button>
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
    if (!G.finalScores) return null;
    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-2xl p-8 max-w-3xl w-full">
                <h1 className="text-3xl font-bold text-center text-amber-400 mb-6">🏆 ゲーム終了！</h1>
                {G.finalScores.map((s, i) => {
                    const isExpanded = expandedPlayer === s.playerIndex;
                    const isDebtExpanded = expandedDebt === s.playerIndex;
                    return (
                        <div key={s.playerIndex} className={`mb-3 rounded-lg p-4 ${i === 0 ? 'bg-amber-900/30 ring-2 ring-amber-500' : 'bg-gray-700'}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{['🥇', '🥈', '🥉'][i] || `${i + 1}位`}</span>
                                    <span className="font-bold text-lg">P{s.playerIndex + 1}</span>
                                </div>
                                <span className="text-3xl font-bold text-amber-300">{s.breakdown.total}VP</span>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                                <div className="bg-gray-800 rounded p-2">
                                    <div className="text-gray-400 text-xs">建物合計</div>
                                    <div className="text-green-400 font-bold">{s.breakdown.buildingVP + s.breakdown.bonusVP}VP</div>
                                    <button onClick={() => setExpandedPlayer(isExpanded ? null : s.playerIndex)}
                                        className="text-[10px] text-cyan-400 hover:text-cyan-300 mt-1">
                                        {isExpanded ? '▲ 閉じる' : '▼ 内訳を見る'}
                                    </button>
                                </div>
                                <div className="bg-gray-800 rounded p-2">
                                    <div className="text-gray-400 text-xs">所持金</div>
                                    <div className="text-yellow-400 font-bold">{s.breakdown.moneyVP}VP</div>
                                </div>
                                <div className="bg-gray-800 rounded p-2">
                                    <div className="text-gray-400 text-xs">未払い賃金</div>
                                    <div className="text-red-400 font-bold">{s.breakdown.debtVP}VP</div>
                                    {s.breakdown.rawDebts > 0 && (
                                        <button onClick={() => setExpandedDebt(isDebtExpanded ? null : s.playerIndex)}
                                            className="text-[10px] text-cyan-400 hover:text-cyan-300 mt-1">
                                            {isDebtExpanded ? '▲ 閉じる' : '▼ 内訳を見る'}
                                        </button>
                                    )}
                                </div>
                            </div>
                            {isExpanded && s.breakdown.buildingDetails && (
                                <div className="mt-2 bg-gray-800 rounded p-3 text-sm">
                                    <div className="text-gray-400 text-xs mb-1">📋 建物VP内訳:</div>
                                    {s.breakdown.buildingDetails.map((bd, bdi) => (
                                        <div key={bdi} className="flex justify-between py-0.5 border-b border-gray-700 last:border-b-0">
                                            <span className="text-gray-300">{bd.name}</span>
                                            <span className="text-green-400">
                                                {bd.bonusVP > 0 ? `${bd.baseVP} + ${bd.bonusVP}` : `${bd.baseVP}`}VP
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {isDebtExpanded && s.breakdown.rawDebts > 0 && (
                                <div className="mt-2 bg-gray-800 rounded p-3 text-sm">
                                    <div className="text-gray-400 text-xs mb-1">📋 未払い賃金内訳:</div>
                                    <div className="flex justify-between py-0.5 border-b border-gray-700">
                                        <span className="text-gray-300">未払い賃金カード</span>
                                        <span className="text-red-400">{s.breakdown.rawDebts}枚 × -3 = {s.breakdown.rawDebts * -3}VP</span>
                                    </div>
                                    {s.breakdown.hasLawOffice && s.breakdown.exemptedDebts > 0 && (
                                        <div className="flex justify-between py-0.5 border-b border-gray-700">
                                            <span className="text-gray-300">法律事務所による免除</span>
                                            <span className="text-green-400">+{s.breakdown.exemptedDebts * 3}VP（{s.breakdown.exemptedDebts}枚免除）</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between py-0.5 mt-1 font-bold">
                                        <span className="text-gray-200">合計</span>
                                        <span className="text-red-400">{s.breakdown.debtVP}VP</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
                <div className="text-center mt-4 flex gap-4 justify-center">
                    <button onClick={() => setShowFinalLog(!showFinalLog)}
                        className="bg-indigo-700 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg text-sm font-bold">
                        📜 ゲームログ
                    </button>
                    <button onClick={() => window.location.reload()} className="bg-amber-600 hover:bg-amber-500 text-white px-8 py-3 rounded-lg text-lg font-bold">🔄 もう一度</button>
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
        if (isConsumable(card) || isHidden(card)) continue;
        const def = getCardDef(card.defId);
        const cost = Math.max(0, def.cost - costReduction);
        if (p.hand.length - 1 >= cost) return true;
    }
    return false;
}

function canBuildFarmFree(p: GameState['players'][string]): boolean {
    return p.hand.some(c => !isConsumable(c) && !isHidden(c) && getCardDef(c.defId).tags.includes('farm'));
}

function canDualConstruct(p: GameState['players'][string]): boolean {
    const costGroups: Record<number, number> = {};
    for (const c of p.hand) {
        if (!isConsumable(c) && !isHidden(c)) {
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
