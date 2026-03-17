// ============================================================
// HandScene3D.tsx — R3F 3Dシーン（手札カード + デッキビジュアル）
// Three.js + React Three Fiber でポケポケ/シャドウバース風の
// カード描画・ドラッグ操作・ドローエフェクトを実現
// テキストはR3F Text不使用（フォント依存回避）→ HTML overlay
// ============================================================
import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

// カードデータ型（Board.tsxから渡す最小限の情報）
export interface CardData3D {
    uid: string;
    name: string;
    cost: number;
    vp: number;
    effectText: string;
    tags: string[];
    isConsumable: boolean;
    isHidden: boolean;
    canPlay: boolean;
    index: number;
}

export interface DeckData3D {
    buildingCount: number;
    consumableLabel: string;
}

interface HandScene3DProps {
    cards: CardData3D[];
    deck: DeckData3D;
    onPlayCard: (index: number) => void;
    onClickCard: (index: number) => void;
}

// ============================================================
// 3D カード単体コンポーネント
// ============================================================
function Card3D({
    data,
    position,
    onPlay,
    onClick,
}: {
    data: CardData3D;
    position: [number, number, number];
    onPlay: (index: number) => void;
    onClick: (index: number) => void;
}) {
    const meshRef = useRef<THREE.Mesh>(null!);
    const glowRef = useRef<THREE.Mesh>(null!);
    const [hovered, setHovered] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState<THREE.Vector3 | null>(null);
    const [dragOffset, setDragOffset] = useState(new THREE.Vector3());

    // カードサイズ
    const cardW = 0.7;
    const cardH = 1.0;
    const cardD = 0.025;

    // ターゲット位置
    const targetPos = useRef(new THREE.Vector3(...position));

    useEffect(() => {
        targetPos.current.set(...position);
    }, [position[0], position[1], position[2]]);

    // カードカラー
    const cardColor = data.isHidden ? '#1e1e2a'
        : data.isConsumable ? '#3d3428'
            : data.tags.includes('farm') ? '#1a3320'
                : data.tags.includes('factory') ? '#33261a'
                    : '#1e2440';

    const borderColor = data.isHidden ? '#40405a'
        : data.isConsumable ? '#8a7e6a'
            : data.canPlay ? '#d4a853'
                : data.tags.includes('farm') ? '#4ade80'
                    : data.tags.includes('factory') ? '#fb923c'
                        : '#60a5fa';

    // フレーム更新: スムーズアニメーション
    useFrame((state, delta) => {
        if (!meshRef.current) return;
        const mesh = meshRef.current;
        const t = 1 - Math.pow(0.001, delta);

        if (dragging && dragStart) {
            mesh.position.lerp(
                new THREE.Vector3(
                    targetPos.current.x + dragOffset.x,
                    targetPos.current.y + dragOffset.y + 0.3,
                    targetPos.current.z + 0.5,
                ),
                t * 3,
            );
            mesh.scale.lerp(new THREE.Vector3(1.15, 1.15, 1.15), t * 2);
            const tiltX = Math.min(dragOffset.y * 0.3, 0.3);
            mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, -tiltX, t * 2);
        } else if (hovered) {
            mesh.position.lerp(
                new THREE.Vector3(targetPos.current.x, targetPos.current.y + 0.2, targetPos.current.z + 0.4),
                t * 2,
            );
            mesh.scale.lerp(new THREE.Vector3(1.12, 1.12, 1.12), t * 2);
            mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, -0.08, t * 2);
        } else {
            mesh.position.lerp(targetPos.current, t * 2);
            mesh.scale.lerp(new THREE.Vector3(1, 1, 1), t * 2);
            mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, 0.08, t);
            mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, 0, t);
        }

        // プレイ可能グロー
        if (glowRef.current && data.canPlay && !dragging) {
            const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.3 + 0.7;
            (glowRef.current.material as THREE.MeshBasicMaterial).opacity = pulse * 0.2;
        }
    });

    // PointerEvent: ドラッグ操作
    const handlePointerDown = useCallback((e: any) => {
        if (!data.canPlay) return;
        e.stopPropagation();
        setDragging(true);
        setDragStart(new THREE.Vector3(e.point.x, e.point.y, e.point.z));
        setDragOffset(new THREE.Vector3());
    }, [data.canPlay]);

    const handlePointerMove = useCallback((e: any) => {
        if (!dragging || !dragStart) return;
        e.stopPropagation();
        setDragOffset(new THREE.Vector3(e.point.x - dragStart.x, e.point.y - dragStart.y, 0));
    }, [dragging, dragStart]);

    const handlePointerUp = useCallback((e: any) => {
        if (!dragging) return;
        e.stopPropagation();
        if (dragOffset.y > 0.4) {
            onPlay(data.index);
        } else if (Math.abs(dragOffset.x) < 0.05 && Math.abs(dragOffset.y) < 0.05) {
            onClick(data.index);
        }
        setDragging(false);
        setDragStart(null);
        setDragOffset(new THREE.Vector3());
    }, [dragging, dragOffset, onPlay, onClick, data.index]);

    const inSuccessZone = dragging && dragOffset.y > 0.4;

    return (
        <group>
            <mesh
                ref={meshRef}
                position={position}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerOver={() => setHovered(true)}
                onPointerOut={() => { setHovered(false); }}
                castShadow
                receiveShadow
            >
                {/* 角丸ボックス: カードの厚み表現 */}
                <RoundedBox args={[cardW, cardH, cardD]} radius={0.04} smoothness={4}>
                    <meshStandardMaterial
                        color={cardColor}
                        roughness={0.25}
                        metalness={0.15}
                        emissive={inSuccessZone ? '#d4a853' : (data.canPlay && hovered ? '#d4a853' : '#000000')}
                        emissiveIntensity={inSuccessZone ? 0.6 : (data.canPlay && hovered ? 0.3 : 0)}
                    />
                </RoundedBox>

                {/* カード枠線（前面） */}
                <mesh position={[0, 0, cardD / 2 + 0.002]}>
                    <planeGeometry args={[cardW - 0.04, cardH - 0.04]} />
                    <meshBasicMaterial color={borderColor} transparent opacity={0.12} />
                </mesh>

                {/* カードテキスト: HTML overlay（フォント不要） */}
                <Html
                    position={[0, 0, cardD / 2 + 0.005]}
                    transform
                    distanceFactor={1.5}
                    zIndexRange={hovered ? [100, 0] : [10, 0]}
                    style={{
                        width: 80,
                        height: 110,
                        pointerEvents: 'none',
                        userSelect: 'none',
                    }}
                >
                    <div style={{
                        width: 80,
                        height: 110,
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '4px 3px',
                        fontFamily: "'Noto Sans JP', sans-serif",
                        color: '#e8e8f0',
                        overflow: 'hidden',
                    }}>
                        {data.isHidden ? (
                            <div style={{ textAlign: 'center', fontSize: 'var(--fs-4xl)', marginTop: 30, opacity: 0.5 }}>🂠</div>
                        ) : (
                            <>
                                {/* カード名 */}
                                <div style={{
                                    fontWeight: 700,
                                    fontSize: 'var(--fs-lg)',
                                    lineHeight: 1.2,
                                    color: data.isConsumable ? '#a8a29e' : '#e8e8f0',
                                    marginBottom: 2,
                                }}>{data.name}</div>
                                {/* コスト・VP */}
                                {!data.isConsumable && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-base)', marginBottom: 2 }}>
                                        <span style={{ color: '#8899aa', fontWeight: 600 }}>C{data.cost}</span>
                                        <span style={{ color: '#d4a853', fontWeight: 600 }}>{data.vp}VP</span>
                                    </div>
                                )}
                                {/* タグ */}
                                {data.tags.length > 0 && (
                                    <div style={{ fontSize: 'var(--fs-md)', color: data.tags.includes('farm') ? '#4ade80' : '#fb923c', marginBottom: 2 }}>
                                        {data.tags.includes('farm') ? '🌾農園' : '⚙工場'}
                                    </div>
                                )}
                                {/* 効果テキスト */}
                                {data.effectText && (
                                    <div style={{ fontSize: 'var(--fs-sm)', color: '#8899aa', lineHeight: 1.2, marginTop: 'auto' }}>
                                        {data.effectText}
                                    </div>
                                )}
                                {/* 消費財 */}
                                {data.isConsumable && (
                                    <div style={{ fontSize: 'var(--fs-base)', color: '#a8a29e', marginTop: 4 }}>消費財</div>
                                )}
                                {/* ドラッグヒント */}
                                {data.canPlay && (
                                    <div style={{ fontSize: 'var(--fs-sm)', color: '#d4a853', textAlign: 'center', opacity: 0.5, marginTop: 'auto' }}>↑ drag</div>
                                )}
                            </>
                        )}
                    </div>
                </Html>
            </mesh>

            {/* プレイ可能グロー */}
            {data.canPlay && (
                <mesh ref={glowRef} position={position}>
                    <planeGeometry args={[cardW + 0.1, cardH + 0.1]} />
                    <meshBasicMaterial color="#d4a853" transparent opacity={0.12} side={THREE.DoubleSide} />
                </mesh>
            )}
        </group>
    );
}

// ============================================================
// 3D デッキスタック
// ============================================================
function DeckStack3D({
    position,
    count,
    label,
    color,
    textColor,
}: {
    position: [number, number, number];
    count: number | string;
    label: string;
    color: string;
    textColor: string;
}) {
    const groupRef = useRef<THREE.Group>(null!);

    useFrame((state) => {
        if (!groupRef.current) return;
        groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.8) * 0.015;
    });

    const cardW = 0.6;
    const cardH = 0.85;
    const cardD = 0.025;

    return (
        <group ref={groupRef} position={position}>
            {/* 積み重ね影カード */}
            {[2, 1].map(i => (
                <mesh key={i} position={[(i - 1) * 0.015, -i * 0.008, -i * 0.02]} rotation={[0, 0, (i - 1) * 0.025]}>
                    <RoundedBox args={[cardW, cardH, cardD]} radius={0.03} smoothness={4}>
                        <meshStandardMaterial color="#14182a" roughness={0.5} metalness={0.05} />
                    </RoundedBox>
                </mesh>
            ))}
            {/* トップカード */}
            <mesh position={[0, 0, 0]} castShadow>
                <RoundedBox args={[cardW, cardH, cardD * 1.5]} radius={0.03} smoothness={4}>
                    <meshStandardMaterial color={color} roughness={0.2} metalness={0.2} />
                </RoundedBox>
                {/* デッキ情報: HTML overlay */}
                <Html position={[0, 0, cardD + 0.005]} transform distanceFactor={1.5}
                    style={{ width: 60, height: 80, pointerEvents: 'none', userSelect: 'none' }}>
                    <div style={{
                        width: 60,
                        height: 80,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: "'Noto Sans JP', sans-serif",
                    }}>
                        <div style={{ fontSize: 'var(--fs-4xl)', fontWeight: 900, color: textColor, lineHeight: 1 }}>
                            {String(count)}
                        </div>
                        <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: '#8899aa', marginTop: 4 }}>
                            {label}
                        </div>
                    </div>
                </Html>
            </mesh>
        </group>
    );
}

// ============================================================
// ドローパーティクル（光の軌跡）
// ============================================================
function DrawParticle({ from, to, onComplete }: {
    from: [number, number, number];
    to: [number, number, number];
    onComplete: () => void;
}) {
    const meshRef = useRef<THREE.Mesh>(null!);
    const progress = useRef(0);

    useFrame((_state, delta) => {
        progress.current += delta * 2.0;
        const t = Math.min(progress.current, 1);
        const eased = 1 - Math.pow(1 - t, 3);

        if (!meshRef.current) return;

        const midX = (from[0] + to[0]) / 2;
        const midY = Math.max(from[1], to[1]) + 1.0;
        const x = bezier(eased, from[0], midX - 0.3, midX + 0.3, to[0]);
        const y = bezier(eased, from[1], midY, midY * 0.7, to[1]);
        const z = bezier(eased, from[2], from[2] + 0.5, to[2] + 0.3, to[2]);

        meshRef.current.position.set(x, y, z);
        const s = 0.06 * (1 - t * 0.6);
        meshRef.current.scale.setScalar(s);

        if (t >= 1) onComplete();
    });

    return (
        <mesh ref={meshRef} position={from}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial color="#ffd700" transparent opacity={0.9} />
        </mesh>
    );
}

function bezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

// ============================================================
// メインシーン
// ============================================================
function HandSceneContent({ cards, deck, onPlayCard, onClickCard }: HandScene3DProps) {
    const [drawParticles, setDrawParticles] = useState<{ id: number; from: [number, number, number]; to: [number, number, number] }[]>([]);
    const nextDrawId = useRef(0);
    const prevCardCount = useRef(cards.length);

    // カード配置
    const cardPositions = useMemo(() => {
        const spacing = Math.min(0.82, 5.0 / Math.max(cards.length, 1));
        const totalWidth = (cards.length - 1) * spacing;
        return cards.map((_, i) => {
            const x = -totalWidth / 2 + i * spacing;
            return [x, -0.6, 0] as [number, number, number];
        });
    }, [cards.length]);

    // ドローエフェクト
    useEffect(() => {
        const diff = cards.length - prevCardCount.current;
        if (diff > 0) {
            const p: typeof drawParticles = [];
            for (let i = 0; i < Math.min(diff, 5); i++) {
                const targetIdx = cards.length - diff + i;
                p.push({
                    id: nextDrawId.current++,
                    from: [-1.0, 0.8, 0],
                    to: cardPositions[targetIdx] || [0, -0.6, 0],
                });
            }
            setDrawParticles(prev => [...prev, ...p]);
        }
        prevCardCount.current = cards.length;
    }, [cards.length, cardPositions]);

    const handleParticleComplete = useCallback((id: number) => {
        setDrawParticles(prev => prev.filter(p => p.id !== id));
    }, []);

    return (
        <>
            {/* ライティング */}
            <ambientLight intensity={0.5} />
            <directionalLight position={[3, 4, 5]} intensity={1.0} castShadow />
            <pointLight position={[0, 2, 3]} intensity={0.4} color="#d4a853" />
            <pointLight position={[-2, 1, 2]} intensity={0.2} color="#60a5fa" />

            {/* デッキスタック */}
            <DeckStack3D position={[-1.2, 0.7, -0.3]} count={deck.buildingCount} label="建物デッキ" color="#1e2440" textColor="#60a5fa" />
            <DeckStack3D position={[1.2, 0.7, -0.3]} count="∞" label="消費財" color="#2d2820" textColor="#a8a29e" />

            {/* 手札カード */}
            {cards.map((card, i) => (
                <Card3D
                    key={card.uid}
                    data={card}
                    position={cardPositions[i] || [0, -0.6, 0]}
                    onPlay={onPlayCard}
                    onClick={onClickCard}
                />
            ))}

            {/* ドローパーティクル */}
            {drawParticles.map(p => (
                <DrawParticle key={p.id} from={p.from} to={p.to} onComplete={() => handleParticleComplete(p.id)} />
            ))}

            {/* ブルーム */}
            <EffectComposer>
                <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} intensity={0.6} />
            </EffectComposer>
        </>
    );
}

// ============================================================
// エクスポート: Canvas付きラッパー
// ============================================================
export function HandScene3D(props: HandScene3DProps) {
    return (
        <div style={{ width: '100%', height: 300, position: 'relative' }}>
            <Canvas
                camera={{ position: [0, 0.3, 3.2], fov: 50 }}
                style={{ background: 'transparent' }}
                gl={{ alpha: true, antialias: true }}
            >
                <HandSceneContent {...props} />
            </Canvas>
        </div>
    );
}
