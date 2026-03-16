// ============================================================
// BGMSelector.tsx  –  BGM選択モーダル（カテゴリタブ付きミュージック一覧）
// ============================================================
import React, { useState, useMemo, useEffect } from 'react';
import { soundManager } from './SoundManager';

/** カテゴリ別のアイコン */
const categoryIcons: Record<string, string> = {
    'オリジナル': '🎼',
    '赤緑/FRLG': '🔴',
    '金銀/HGSS': '🥇',
    'RSE/ORAS': '💎',
    'DP/BDSP': '💠',
    'BW': '⚫',
};

/** カテゴリの表示順 */
const categoryOrder = ['オリジナル', '赤緑/FRLG', '金銀/HGSS', 'RSE/ORAS', 'DP/BDSP', 'BW'];

export function BGMSelector({ onClose }: { onClose: () => void }) {
    const [currentIndex, setCurrentIndex] = useState(soundManager.getCurrentBGMIndex());
    const [activeCategory, setActiveCategory] = useState<string>('all');

    // ポケモンBGMの自動遷移時にUIを更新
    useEffect(() => {
        return soundManager.onTrackChange((newIndex) => {
            setCurrentIndex(newIndex);
        });
    }, []);

    // カテゴリでグループ化されたトラック
    const categories = useMemo(() => {
        const cats = new Map<string, { track: typeof soundManager.bgmTracks[0]; index: number }[]>();
        soundManager.bgmTracks.forEach((track, index) => {
            const cat = track.category || 'オリジナル';
            if (!cats.has(cat)) cats.set(cat, []);
            cats.get(cat)!.push({ track, index });
        });
        return cats;
    }, []);

    // 表示するトラック
    const displayTracks = useMemo(() => {
        if (activeCategory === 'all') {
            return soundManager.bgmTracks.map((track, index) => ({ track, index }));
        }
        return categories.get(activeCategory) || [];
    }, [activeCategory, categories]);

    const handleSelect = (index: number) => {
        soundManager.playSFX('click');
        soundManager.playBGM(index);
        setCurrentIndex(index);
    };

    const handleRandom = () => {
        soundManager.playSFX('click');
        const idx = soundManager.playRandomBGM();
        setCurrentIndex(idx);
    };

    return (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 9999 }}>
            <div className="modal-content animate-slide-up" style={{ width: 420, maxWidth: '95vw', padding: 24, textAlign: 'center' }}>
                <h3 style={{ margin: '0 0 16px', color: 'var(--gold)', fontSize: 'var(--fs-4xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    🎵 ミュージック
                    <span style={{ fontSize: 'var(--fs-xl)', color: 'var(--text-dim)', fontWeight: 400 }}>
                        ({soundManager.bgmTracks.length}曲)
                    </span>
                </h3>

                {/* カテゴリタブ */}
                <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12, justifyContent: 'center'
                }}>
                    <button
                        onClick={() => setActiveCategory('all')}
                        className={`bgm-category-tab ${activeCategory === 'all' ? 'bgm-category-active' : ''}`}
                    >
                        🎵 全て
                    </button>
                    {categoryOrder.map(cat => {
                        const icon = categoryIcons[cat] || '🎵';
                        const count = categories.get(cat)?.length || 0;
                        if (count === 0) return null;
                        return (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`bgm-category-tab ${activeCategory === cat ? 'bgm-category-active' : ''}`}
                            >
                                {icon} {cat} ({count})
                            </button>
                        );
                    })}
                </div>

                {/* トラックリスト（スクロール対応） */}
                <div style={{
                    display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16,
                    maxHeight: '45vh', overflowY: 'auto',
                    paddingRight: 4,
                }}>
                    {displayTracks.map(({ track, index }) => {
                        const isActive = index === currentIndex;
                        const icon = categoryIcons[track.category || 'オリジナル'] || '🎵';
                        return (
                            <button
                                key={track.id}
                                onClick={() => handleSelect(index)}
                                className={`bgm-track-item ${isActive ? 'bgm-track-active' : ''}`}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                    <span style={{ fontSize: 'var(--fs-3xl)', flexShrink: 0 }}>{icon}</span>
                                    <div style={{ textAlign: 'left', minWidth: 0 }}>
                                        <div style={{
                                            fontWeight: 700, fontSize: 'var(--fs-xl2)',
                                            color: isActive ? 'var(--gold)' : 'var(--text-primary)',
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        }}>
                                            {track.name}
                                        </div>
                                        {activeCategory === 'all' && (
                                            <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-dim)', marginTop: 1 }}>
                                                {track.category}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {/* 再生中インジケーター */}
                                {isActive && (
                                    <div className="bgm-playing-indicator">
                                        <span className="bgm-bar" style={{ animationDelay: '0s' }} />
                                        <span className="bgm-bar" style={{ animationDelay: '0.15s' }} />
                                        <span className="bgm-bar" style={{ animationDelay: '0.3s' }} />
                                        <span className="bgm-bar" style={{ animationDelay: '0.45s' }} />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* シャッフルボタン */}
                <button onClick={handleRandom} className="btn-ghost" style={{ width: '100%', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    🔀 ランダム再生
                </button>

                {/* 閉じるボタン */}
                <button onClick={() => { soundManager.playSFX('click'); onClose(); }} className="btn-ghost" style={{ width: '100%' }}>
                    閉じる
                </button>
            </div>
        </div>
    );
}
