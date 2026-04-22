import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TIMING } from '../constants';

interface RippleAnimation {
    id: number;
    x: number;
    y: number;
    startTime: number;
    label: string;
    color: string;
}

interface MeepleFlightAnimation {
    id: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    size: number;
    duration: number;
    src: string;
}

interface FlyingCard {
    id: number;
    source: 'building' | 'consumable';
    faceSrc?: string | null;
    phase: 'deck-out';
    delay: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    cardWidth: number;
    cardHeight: number;
}

const DRAW_TIMING = {
    deckOut: TIMING.DECK_OUT_MS,
    handIn: TIMING.HAND_IN_MS,
    stagger: TIMING.STAGGER_DELAY_MS,
    phaseGap: 10,
    postDrawWait: TIMING.POST_DRAW_WAIT_MS,
};

function RippleEffect({ ripple }: { ripple: RippleAnimation }) {
    const [opacity, setOpacity] = useState(1);

    useEffect(() => {
        const timer = setTimeout(() => setOpacity(0), 50);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div style={{
            position: 'fixed',
            left: ripple.x - 40,
            top: ripple.y - 40,
            width: 80,
            height: 80,
            pointerEvents: 'none',
            zIndex: 99,
        }}>
            <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: `2px solid ${ripple.color}`,
                animation: 'ripple-expand 0.6s ease-out forwards',
                opacity,
            }} />
            <div style={{
                position: 'absolute',
                inset: '30%',
                borderRadius: '50%',
                background: ripple.color,
                animation: 'ripple-flash 0.3s ease-out forwards',
            }} />
            {ripple.label && (
                <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: -10,
                    transform: 'translateX(-50%)',
                    fontSize: 'var(--fs-2xl)',
                    fontWeight: 900,
                    color: ripple.color,
                    textShadow: `0 0 8px ${ripple.color}`,
                    animation: 'resource-float 0.8s ease-out forwards',
                    whiteSpace: 'nowrap',
                }}>
                    {ripple.label}
                </div>
            )}
        </div>
    );
}

function FlyingMeepleEffect({
    flight,
    onComplete,
}: {
    flight: MeepleFlightAnimation;
    onComplete: (id: number) => void;
}) {
    const elemRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const elem = elemRef.current;
        if (!elem) return;

        const animation = elem.animate([
            {
                transform: `translate(${flight.fromX}px, ${flight.fromY}px) scale(0.72)`,
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                opacity: 0.96,
            },
            {
                transform: `translate(${flight.toX}px, ${flight.toY}px) scale(1.08)`,
                filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.5))',
                opacity: 1,
            },
        ], {
            duration: flight.duration,
            easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            fill: 'forwards',
        });

        animation.onfinish = () => onComplete(flight.id);
        return () => animation.cancel();
    }, [flight, onComplete]);

    return (
        <img
            ref={elemRef}
            src={flight.src}
            alt=""
            style={{
                position: 'fixed',
                left: 0,
                top: 0,
                width: flight.size,
                height: flight.size,
                zIndex: 300,
                pointerEvents: 'none',
                borderRadius: '50%',
                transform: `translate(${flight.fromX}px, ${flight.fromY}px) scale(0.72)`,
                willChange: 'transform, filter, opacity',
            }}
        />
    );
}

function FlyingCardElement({ card, onComplete }: { card: FlyingCard; onComplete: (id: number) => void }) {
    const elemRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const elem = elemRef.current;
        if (!elem) return;

        const deltaX = card.toX - card.fromX;
        const deltaY = card.toY - card.fromY;
        const animation = elem.animate([
            { transform: 'translate3d(0, 0, 0)', opacity: 1 },
            { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)`, opacity: 1, offset: 0.85 },
            { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)`, opacity: 0 },
        ], {
            duration: DRAW_TIMING.deckOut,
            delay: card.delay,
            easing: 'cubic-bezier(0.55, 0.085, 0.68, 0.53)',
            fill: 'forwards',
        });

        animation.onfinish = () => onComplete(card.id);
        return () => animation.cancel();
    }, [card, onComplete]);

    const bg = card.source === 'building'
        ? 'linear-gradient(160deg, #1e2440 0%, #2a3058 50%, #1e2440 100%)'
        : 'linear-gradient(160deg, #3d3820 0%, #2d2a10 100%)';
    const borderColor = card.source === 'building'
        ? 'rgba(96, 165, 250, 0.3)'
        : 'rgba(212, 168, 83, 0.4)';
    const label = card.source === 'building' ? '建物デッキ' : '消費財';
    const assetUrl = card.faceSrc
        ? `${import.meta.env.BASE_URL}${card.faceSrc.replace(/^\//, '')}`
        : null;

    return (
        <div
            ref={elemRef}
            style={{
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
                transform: 'translate3d(0, 0, 0)',
                willChange: 'transform, opacity',
            }}
        >
            {assetUrl ? (
                <img
                    src={assetUrl}
                    alt=""
                    loading="eager"
                    decoding="async"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        pointerEvents: 'none',
                        userSelect: 'none',
                    }}
                />
            ) : (
                <span style={{
                    fontSize: 'var(--fs-2xl)',
                    fontWeight: 700,
                    color: 'var(--text-dim)',
                    textAlign: 'center',
                }}>
                    {label}
                </span>
            )}
        </div>
    );
}

export function useAnimations() {
    const [ripples, setRipples] = useState<RippleAnimation[]>([]);
    const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([]);
    const [meepleFlights, setMeepleFlights] = useState<MeepleFlightAnimation[]>([]);
    const nextId = useRef(0);
    const drawResolveRef = useRef<(() => void) | null>(null);
    const meepleResolveMapRef = useRef(new Map<number, () => void>());

    const triggerRipple = useCallback((x: number, y: number, label: string = '', color: string = 'var(--teal)') => {
        const id = nextId.current++;
        setRipples(prev => [...prev, { id, x, y, startTime: Date.now(), label, color }]);
        setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 1000);
    }, []);

    const triggerMeepleFlight = useCallback((
        fromRect: DOMRect,
        toRect: DOMRect,
        src: string,
        options?: { size?: number; duration?: number },
    ): Promise<void> => {
        const id = nextId.current++;
        const size = options?.size ?? 32;
        const duration = options?.duration ?? 600;

        return new Promise((resolve) => {
            meepleResolveMapRef.current.set(id, resolve);
            setMeepleFlights(prev => [
                ...prev,
                {
                    id,
                    fromX: fromRect.left + fromRect.width / 2 - size / 2,
                    fromY: fromRect.top + fromRect.height / 2 - size / 2,
                    toX: toRect.left + toRect.width / 2 - size / 2,
                    toY: toRect.top + toRect.height / 2 - size / 2,
                    size,
                    duration,
                    src,
                },
            ]);
        });
    }, []);

    const onFlyingComplete = useCallback((id: number) => {
        setFlyingCards(prev => prev.filter(c => c.id !== id));
    }, []);

    const onMeepleFlightComplete = useCallback((id: number) => {
        setMeepleFlights(prev => prev.filter(f => f.id !== id));
        const resolve = meepleResolveMapRef.current.get(id);
        if (resolve) {
            meepleResolveMapRef.current.delete(id);
            resolve();
        }
    }, []);

    const triggerDraw = useCallback((
        source: 'building' | 'consumable',
        count: number,
        deckRect: DOMRect,
        options?: {
            faceSrc?: string | null;
            onHandInStart?: () => void;
        },
    ): Promise<void> => {
        return new Promise((resolve) => {
            drawResolveRef.current = resolve;
            const cardW = deckRect.width;
            const cardH = deckRect.height;
            const startX = deckRect.left;
            const startY = deckRect.top;
            const offScreenY = window.innerHeight + cardH;

            const deckOutCards: FlyingCard[] = [];
            for (let i = 0; i < count; i++) {
                deckOutCards.push({
                    id: nextId.current++,
                    source,
                    faceSrc: options?.faceSrc ?? null,
                    phase: 'deck-out',
                    delay: i * DRAW_TIMING.stagger,
                    fromX: startX,
                    fromY: startY,
                    toX: startX,
                    toY: offScreenY,
                    cardWidth: cardW,
                    cardHeight: cardH,
                });
            }
            setFlyingCards(prev => [...prev, ...deckOutCards]);

            const deckOutTotalTime = DRAW_TIMING.deckOut + (count - 1) * DRAW_TIMING.stagger;

            setTimeout(() => {
                setFlyingCards([]);
                options?.onHandInStart?.();

                setTimeout(() => {
                    drawResolveRef.current?.();
                    drawResolveRef.current = null;
                }, DRAW_TIMING.handIn + DRAW_TIMING.postDrawWait);
            }, deckOutTotalTime + DRAW_TIMING.phaseGap);
        });
    }, []);

    const isDrawAnimating = flyingCards.length > 0 || drawResolveRef.current !== null;

    const AnimationOverlay = useCallback(() => (
        <>
            {ripples.map(r => <RippleEffect key={r.id} ripple={r} />)}
            {meepleFlights.map(f => (
                <FlyingMeepleEffect key={f.id} flight={f} onComplete={onMeepleFlightComplete} />
            ))}
            {flyingCards.map(c => (
                <FlyingCardElement key={c.id} card={c} onComplete={onFlyingComplete} />
            ))}
        </>
    ), [ripples, meepleFlights, flyingCards, onMeepleFlightComplete, onFlyingComplete]);

    return { triggerRipple, triggerMeepleFlight, triggerDraw, isDrawAnimating, AnimationOverlay };
}
