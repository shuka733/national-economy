// ============================================================
// AnimationLayer.tsx — ゲームエフェクト用オーバーレイレイヤー
// - ワーカー配置リップルエフェクト
// - ポケポケ風カードドローエフェクト（デッキ→画面外→手札）
// ============================================================
import React, { useState, useCallback, useEffect, useRef } from 'react';

// --- 型定義 ---
interface RippleAnimation {
    id: number;
    x: number;
    y: number;
    startTime: number;
    label: string;
    color: string;
}

// --- 定数 ---
const DECK_OUT_DURATION = 300;   // ドロー1_下: デッキ→画面外の移動時間(ms)
const HAND_IN_DURATION = 400;    // ドロー2_上: 画面外→手札への移動時間(ms)
const STAGGER_DELAY = 100;       // 複数枚時のスタッガー間隔(ms)
const PHASE_GAP = 10;            // ドロー1_下→ドロー2_上の待機(ms)
const POST_DRAW_WAIT = 300;      // 全完了後の待機(ms)

// ============================================================
// ワーカー配置リップルエフェクト
// ============================================================
function RippleEffect({ ripple }: { ripple: RippleAnimation }) {
    const [opacity, setOpacity] = useState(1);
    useEffect(() => {
        const timer = setTimeout(() => setOpacity(0), 50);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div style={{
            position: 'fixed', left: ripple.x - 40, top: ripple.y - 40,
            width: 80, height: 80, pointerEvents: 'none', zIndex: 99,
        }}>
            <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: `2px solid ${ripple.color}`,
                animation: 'ripple-expand 0.6s ease-out forwards', opacity,
            }} />
            <div style={{
                position: 'absolute', inset: '30%', borderRadius: '50%',
                background: ripple.color,
                animation: 'ripple-flash 0.3s ease-out forwards',
            }} />
            {ripple.label && (
                <div style={{
                    position: 'absolute', left: '50%', top: -10,
                    transform: 'translateX(-50%)', fontSize: 14, fontWeight: 900,
                    color: ripple.color, textShadow: `0 0 8px ${ripple.color}`,
                    animation: 'resource-float 0.8s ease-out forwards', whiteSpace: 'nowrap',
                }}>{ripple.label}</div>
            )}
        </div>
    );
}

// ============================================================
// フライングカード: JSでアニメーション制御（CSSアニメーションと競合しない）
// ============================================================
interface FlyingCard {
    id: number;
    source: 'building' | 'consumable';
    phase: 'deck-out';
    delay: number;        // スタッガー遅延(ms)
    // 開始座標
    fromX: number;
    fromY: number;
    // 終了座標
    toX: number;
    toY: number;
    cardWidth: number;
    cardHeight: number;
}

function FlyingCardElement({ card, onComplete }: { card: FlyingCard; onComplete: (id: number) => void }) {
    const elemRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // スタッガー遅延後にアニメーション開始
        const delayTimer = setTimeout(() => {
            setVisible(true);
            const duration = DECK_OUT_DURATION;

            // requestAnimationFrameでスムーズなアニメーション
            const startTime = performance.now();
            const animate = (now: number) => {
                const elapsed = now - startTime;
                const t = Math.min(elapsed / duration, 1);

                // イージング: ease-in（加速、終端速度が最高速）
                const eased = t * t;

                const x = card.fromX + (card.toX - card.fromX) * eased;
                const y = card.fromY + (card.toY - card.fromY) * eased;

                // deck-outの終盤でフェードアウト（85%以降で開始）
                let opacity = 1;
                if (t > 0.85) {
                    opacity = 1 - (t - 0.85) / 0.15;
                }

                if (elemRef.current) {
                    elemRef.current.style.left = `${x}px`;
                    elemRef.current.style.top = `${y}px`;
                    elemRef.current.style.opacity = `${opacity}`;
                }

                if (t < 1) {
                    requestAnimationFrame(animate);
                }
                // t=1到達後: opacity=0で不可視。
                // triggerDraw内のsetFlyingCards([])で一括削除を待つ
                // ※個別削除するとflyingCards変更→AnimationOverlay再生成→
                //   全FlyingCardElementがアンマウント・リマウントされ
                //   後続カードのアニメーションがリセットされてしまう
            };
            requestAnimationFrame(animate);
        }, card.delay);

        return () => clearTimeout(delayTimer);
    }, [card, onComplete]);

    if (!visible) return null;

    const bg = card.source === 'building'
        ? 'linear-gradient(160deg, #1e2440 0%, #2a3058 50%, #1e2440 100%)'
        : 'linear-gradient(160deg, #3d3820 0%, #2d2a10 100%)';
    const borderColor = card.source === 'building'
        ? 'rgba(96, 165, 250, 0.3)' : 'rgba(212, 168, 83, 0.4)';
    const label = card.source === 'building' ? '建物デッキ' : '消費財';

    return (
        <div ref={elemRef} style={{
            position: 'fixed',
            left: card.fromX,
            top: card.fromY,
            width: card.cardWidth,
            height: card.cardHeight,
            zIndex: 60,
            pointerEvents: 'none',
            borderRadius: 5,
            border: `1.5px solid ${borderColor}`,
            background: bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            opacity: 0,
        }}>
            <span style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text-dim)',
                textAlign: 'center',
            }}>
                {label}
            </span>
        </div>
    );
}

// ============================================================
// メインエクスポート: アニメーションレイヤー
// ============================================================
export function useAnimations() {
    const [ripples, setRipples] = useState<RippleAnimation[]>([]);
    const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([]);
    const nextId = useRef(0);
    const drawResolveRef = useRef<(() => void) | null>(null);

    // ワーカー配置リップル
    const triggerRipple = useCallback((x: number, y: number, label: string = '', color: string = 'var(--teal)') => {
        const id = nextId.current++;
        setRipples(prev => [...prev, { id, x, y, startTime: Date.now(), label, color }]);
        setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 1000);
    }, []);

    // フライングカード完了（表示から削除のみ、Promise解決は行わない）
    const onFlyingComplete = useCallback((id: number) => {
        setFlyingCards(prev => prev.filter(c => c.id !== id));
    }, []);

    /**
     * ドローエフェクト発火
     * ドロー1_下（deck-out）のFlyingCardで描画。
     * ドロー2_上（hand-in）はBoard.tsx側で実カードのCSS transitionで描画。
     * @param onHandInStart deck-out完了後に呼ばれるコールバック（ドロー2_上開始通知）
     * @returns ドロー2_上完了時に解決するPromise
     */
    const triggerDraw = useCallback((
        source: 'building' | 'consumable',
        count: number,
        deckRect: DOMRect,
        onHandInStart?: () => void
    ): Promise<void> => {
        return new Promise((resolve) => {
            drawResolveRef.current = resolve;
            const cardW = deckRect.width;
            const cardH = deckRect.height;
            const startX = deckRect.left;
            const startY = deckRect.top;
            // 画面外の目標Y（画面下端 + カード高さ分で完全に消える）
            const offScreenY = window.innerHeight + cardH;

            // --- ドロー1_下: デッキ→画面外（下方向） ---
            const deckOutCards: FlyingCard[] = [];
            for (let i = 0; i < count; i++) {
                deckOutCards.push({
                    id: nextId.current++,
                    source,
                    phase: 'deck-out',
                    delay: i * STAGGER_DELAY,
                    fromX: startX,
                    fromY: startY,
                    toX: startX,
                    toY: offScreenY,
                    cardWidth: cardW,
                    cardHeight: cardH,
                });
            }
            setFlyingCards(prev => [...prev, ...deckOutCards]);

            // deck-outの最大所要時間
            const deckOutTotalTime = DECK_OUT_DURATION + (count - 1) * STAGGER_DELAY;

            // --- ドロー1_下完了 + PHASE_GAP後: ドロー2_上開始を通知 ---
            setTimeout(() => {
                // deck-outカードを削除
                setFlyingCards([]);
                // Board.tsx側にドロー2_上開始を通知
                onHandInStart?.();

                // --- ドロー2_上完了 + POST_DRAW_WAIT後: Promise解決 ---
                setTimeout(() => {
                    drawResolveRef.current?.();
                    drawResolveRef.current = null;
                }, HAND_IN_DURATION + POST_DRAW_WAIT);
            }, deckOutTotalTime + PHASE_GAP);
        });
    }, []);

    const isDrawAnimating = flyingCards.length > 0 || drawResolveRef.current !== null;

    const AnimationOverlay = useCallback(() => (
        <>
            {ripples.map(r => <RippleEffect key={r.id} ripple={r} />)}
            {flyingCards.map(c => (
                <FlyingCardElement key={c.id} card={c} onComplete={onFlyingComplete} />
            ))}
        </>
    ), [ripples, flyingCards, onFlyingComplete]);

    return { triggerRipple, triggerDraw, isDrawAnimating, AnimationOverlay };
}
