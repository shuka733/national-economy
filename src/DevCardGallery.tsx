// ============================================================
// DevCardGallery.tsx  –  開発者用カードギャラリー画面
// カードの見た目を一覧で確認するためのデバッグツール
// ============================================================
import React, { useState } from 'react';
import { BASE_CARD_DEFS } from './base_cards';
import { GLORY_CARD_DEFS } from './glory_cards';
import type { CardDef } from './types';

// ============================================================
// カードIDから画像パスへのマッピング
// Viteのbase設定（/national-economy/）に対応するため、
// import.meta.env.BASE_URLを使って動的にパスを解決する
// ============================================================

/** ベースセットのカードID → 画像ファイル名（public/cards/progress/ 配下） */
const BASE_IMAGE_FILES: Record<string, string> = {
    farm: 'progress/prog_farm.png',
    slash_burn: 'progress/prog_slash_burn.png',
    coffee_shop: 'progress/prog_coffee_shop.png',
    design_office: 'progress/prog_design_office.png',
    factory: 'progress/prog_factory.png',
    construction_co: 'progress/prog_construction_co.png',
    warehouse: 'progress/prog_warehouse.png',
    law_office: 'progress/prog_law_office.png',
    orchard: 'progress/prog_orchard.png',
    company_housing: 'progress/prog_company_housing.png',
    real_estate: 'progress/prog_real_estate.png',
    pioneer: 'progress/prog_pioneer.png',
    restaurant: 'progress/prog_restaurant.png',
    large_farm: 'progress/prog_large_farm.png',
    agri_coop: 'progress/prog_agri_coop.png',
    general_contractor: 'progress/prog_general_contractor.png',
    steel_mill: 'progress/prog_steel_mill.png',
    mansion: 'progress/prog_mansion.png',
    chemical_plant: 'progress/prog_chemical_plant.png',
    labor_union: 'progress/prog_labor_union.png',
    auto_factory: 'progress/prog_auto_factory.png',
    headquarters: 'progress/prog_headquarters.png',
    dual_construction: 'progress/prog_dual_construction.png',
    railroad: 'progress/prog_railroad.png',
};

/** GloryセットのカードID → 画像ファイル名（public/cards/glory/ 配下） */
const GLORY_IMAGE_FILES: Record<string, string> = {
    gl_relic: 'glory/relic.png',
    gl_village: 'glory/rural_village.png',
    gl_colonist: 'glory/colonial_group.png',
    gl_studio: 'glory/workshop.png',
    gl_steam_factory: 'glory/steam_factory.png',
    gl_poultry_farm: 'glory/poultry_farm.png',
    gl_skyscraper: 'glory/skyscraper_construction.png',
    gl_game_cafe: 'glory/game_cafe.png',
    gl_cotton_farm: 'glory/cotton_plantation.png',
    gl_museum: 'glory/art_museum.png',
    gl_monument: 'glory/monument.png',
    gl_consumers_coop: 'glory/consumer_union.png',
    gl_automaton: 'glory/automaton.png',
    gl_coal_mine: 'glory/coal_mine.png',
    gl_modernism_construction: 'glory/modernism_construction.png',
    gl_theater: 'glory/theater.png',
    gl_guild_hall: 'glory/guild_hall.png',
    gl_ivory_tower: 'glory/ivory_tower.png',
    gl_refinery: 'glory/smelter.png',
    gl_teleporter: 'glory/transfer_device.png',
    gl_revolution_square: 'glory/revolution_square.png',
    gl_harvest_festival: 'glory/harvest_festival.png',
    gl_tech_exhibition: 'glory/technical_exhibition.png',
    gl_greenhouse: 'glory/greenhouse.png',
    gl_temple_of_purification: 'glory/temple_of_purification.png',
    gl_locomotive_factory: 'glory/locomotive_factory.png',
};

/** カードIDから画像パスを取得。Viteのbase設定を考慮したURLを返す。 */
function getImagePath(card: CardDef): string | undefined {
    // import.meta.env.BASE_URL は末尾スラッシュ付きで返る（例: '/national-economy/'）
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const file = BASE_IMAGE_FILES[card.id] ?? GLORY_IMAGE_FILES[card.id];
    if (!file) return undefined;
    return `${base}/cards/${file}`;
}

// ============================================================
// タグ表示用バッジ
// ============================================================
function TagBadge({ tag }: { tag: string }) {
    const colorMap: Record<string, { bg: string; color: string }> = {
        farm: { bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80' },
        factory: { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' },
    };
    const style = colorMap[tag] ?? { bg: 'rgba(148, 163, 184, 0.1)', color: 'var(--text-dim)' };
    return (
        <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
            background: style.bg, color: style.color, border: `1px solid ${style.color}40`,
            textTransform: 'uppercase' as const, letterSpacing: '0.5px',
        }}>
            {tag}
        </span>
    );
}

// ============================================================
// 1枚のカードプレビュー
// ============================================================
function CardPreview({ card, showImage }: { card: CardDef; showImage: boolean }) {
    const imagePath = getImagePath(card);
    const hasImage = !!imagePath;

    return (
        <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column' as const,
            transition: 'transform 0.15s, border-color 0.15s',
            cursor: 'default',
        }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(252, 194, 0, 0.4)';
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.1)';
            }}
        >
            {/* 画像エリア */}
            {showImage && (
                <div style={{
                    width: '100%',
                    aspectRatio: '2/3',
                    background: hasImage ? 'transparent' : 'rgba(255,255,255,0.03)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                    {hasImage ? (
                        <img
                            src={imagePath}
                            alt={card.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={e => {
                                // 画像が見つからない場合は代替テキスト表示
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                                const parent = (e.currentTarget as HTMLImageElement).parentElement;
                                if (parent) {
                                    parent.innerHTML = `<span style="color:rgba(255,255,255,0.2);font-size:10px;padding:8px;text-align:center">${card.id}<br/>⚠️ 画像なし</span>`;
                                }
                            }}
                        />
                    ) : (
                        <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 10, textAlign: 'center', padding: 8 }}>
                            {card.id}<br />⚠️ 画像未設定
                        </span>
                    )}
                </div>
            )}

            {/* カード情報 */}
            <div style={{ padding: '10px 10px 12px', flex: 1 }}>
                {/* カード名 */}
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.2 }}>
                    {card.name}
                </div>

                {/* コスト・VP */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <span style={{
                        fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(252, 194, 0, 0.15)', color: 'var(--gold)',
                    }}>
                        💰 {card.cost}
                    </span>
                    <span style={{
                        fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8',
                    }}>
                        🏆 {card.vp}VP
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                        ×{card.copies}
                    </span>
                </div>

                {/* タグ */}
                {card.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginBottom: 6 }}>
                        {card.tags.map(t => <TagBadge key={t} tag={t} />)}
                    </div>
                )}

                {/* 特殊フラグ */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginBottom: 6 }}>
                    {card.unsellable && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            売却不可
                        </span>
                    )}
                    {card.consumeOnUse && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(251, 146, 60, 0.1)', color: '#fb923c', border: '1px solid rgba(251, 146, 60, 0.3)' }}>
                            使い捨て
                        </span>
                    )}
                </div>

                {/* 効果テキスト */}
                <div style={{
                    fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4,
                    borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6, marginTop: 4,
                }}>
                    {card.effectText}
                </div>

                {/* カードID（開発者用） */}
                <div style={{ marginTop: 6, fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
                    ID: {card.id}
                </div>
            </div>
        </div>
    );
}

// ============================================================
// DevCardGallery メイン
// ============================================================

/** 表示対象フィルター */
type Filter = 'all' | 'base' | 'glory';

export function DevCardGallery({ onBack }: { onBack: () => void }) {
    const [filter, setFilter] = useState<Filter>('all');
    const [showImage, setShowImage] = useState(true);
    const [sortByCost, setSortByCost] = useState(true);
    const [searchText, setSearchText] = useState('');

    // フィルター・検索・ソートを適用してカード一覧を生成
    const cards: (CardDef & { _set: 'base' | 'glory' })[] = (() => {
        const base = BASE_CARD_DEFS.map(c => ({ ...c, _set: 'base' as const }));
        const glory = GLORY_CARD_DEFS.map(c => ({ ...c, _set: 'glory' as const }));

        let result =
            filter === 'base' ? base :
                filter === 'glory' ? glory :
                    [...base, ...glory];

        // テキスト検索（名前・ID・効果テキスト）
        if (searchText.trim()) {
            const q = searchText.trim().toLowerCase();
            result = result.filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.id.toLowerCase().includes(q) ||
                c.effectText.toLowerCase().includes(q)
            );
        }

        // ソート
        if (sortByCost) {
            result = [...result].sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
        }

        return result;
    })();

    const tabStyle = (active: boolean, color: string) => ({
        padding: '6px 16px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700 as const,
        cursor: 'pointer' as const,
        border: active ? `1px solid ${color}80` : '1px solid rgba(255,255,255,0.1)',
        background: active ? `${color}20` : 'transparent',
        color: active ? color : 'var(--text-dim)',
        transition: 'all 0.15s',
    });

    return (
        <div className="game-bg" style={{ minHeight: '100vh', padding: 16, overflowY: 'auto' }}>
            {/* ヘッダー */}
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={onBack} style={{
                            background: 'none', border: '1px solid rgba(255,255,255,0.15)',
                            color: 'var(--text-dim)', cursor: 'pointer',
                            fontSize: 12, padding: '5px 12px', borderRadius: 8,
                            transition: 'all 0.15s',
                        }}>
                            ← 戻る
                        </button>
                        <div>
                            <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--gold)', margin: 0 }}>
                                🛠️ DEV — カードギャラリー
                            </h1>
                            <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: '2px 0 0' }}>
                                開発者ビュー / {cards.length} 枚表示中
                            </p>
                        </div>
                    </div>

                    {/* オプショントグル */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => setShowImage(!showImage)} style={{
                            ...tabStyle(showImage, '#60a5fa'),
                            fontSize: 11,
                        }}>
                            {showImage ? '🖼️ 画像ON' : '🖼️ 画像OFF'}
                        </button>
                        <button onClick={() => setSortByCost(!sortByCost)} style={{
                            ...tabStyle(sortByCost, '#a78bfa'),
                            fontSize: 11,
                        }}>
                            {sortByCost ? '⬆️ コスト順' : '📋 元順'}
                        </button>
                    </div>
                </div>

                {/* フィルタータブ + 検索 */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setFilter('all')} style={tabStyle(filter === 'all', 'var(--gold)')}>
                            全て ({BASE_CARD_DEFS.length + GLORY_CARD_DEFS.length})
                        </button>
                        <button onClick={() => setFilter('base')} style={tabStyle(filter === 'base', '#94a3b8')}>
                            Base ({BASE_CARD_DEFS.length})
                        </button>
                        <button onClick={() => setFilter('glory')} style={tabStyle(filter === 'glory', 'var(--gold)')}>
                            ✨ Glory ({GLORY_CARD_DEFS.length})
                        </button>
                    </div>
                    {/* テキスト検索 */}
                    <input
                        type="text"
                        placeholder="🔍 名前・効果で検索..."
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        style={{
                            flex: 1, minWidth: 180, maxWidth: 300,
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 8, color: 'var(--text-primary)',
                            padding: '6px 12px', fontSize: 12,
                            outline: 'none',
                        }}
                    />
                </div>

                {/* セクション区切り（コスト別） */}
                {sortByCost ? (
                    // コスト別グループ表示
                    (() => {
                        const grouped = new Map<number, typeof cards>();
                        for (const c of cards) {
                            if (!grouped.has(c.cost)) grouped.set(c.cost, []);
                            grouped.get(c.cost)!.push(c);
                        }
                        return Array.from(grouped.entries())
                            .sort(([a], [b]) => a - b)
                            .map(([cost, group]) => (
                                <div key={cost} style={{ marginBottom: 32 }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        marginBottom: 12,
                                    }}>
                                        <span style={{
                                            fontSize: 16, fontWeight: 900,
                                            color: 'var(--gold)',
                                            background: 'rgba(252,194,0,0.1)',
                                            border: '1px solid rgba(252,194,0,0.3)',
                                            padding: '2px 12px', borderRadius: 8,
                                        }}>
                                            💰 コスト {cost}
                                        </span>
                                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                                            {group.length}枚
                                        </span>
                                    </div>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: showImage
                                            ? 'repeat(auto-fill, minmax(160px, 1fr))'
                                            : 'repeat(auto-fill, minmax(220px, 1fr))',
                                        gap: 12,
                                    }}>
                                        {group.map(card => (
                                            <CardPreview key={card.id} card={card} showImage={showImage} />
                                        ))}
                                    </div>
                                </div>
                            ));
                    })()
                ) : (
                    // フラットグリッド表示
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: showImage
                            ? 'repeat(auto-fill, minmax(160px, 1fr))'
                            : 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: 12,
                    }}>
                        {cards.map(card => (
                            <CardPreview key={card.id} card={card} showImage={showImage} />
                        ))}
                    </div>
                )}

                {/* 検索結果ゼロ */}
                {cards.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                        <p>「{searchText}」に一致するカードが見つかりませんでした</p>
                    </div>
                )}

                {/* フッター */}
                <div style={{ textAlign: 'center', marginTop: 40, paddingBottom: 32 }}>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)' }}>
                        🛠️ Developer Only — このメニューはプロダクションビルドでも表示されます（必要に応じて非表示化してください）
                    </p>
                </div>
            </div>
        </div>
    );
}
