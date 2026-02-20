// ============================================================
// cards.ts  –  カード定義統合ローダー
// ============================================================
import type { CardDef, GameVersion } from './types';
import { BASE_CARD_DEFS } from './base_cards';
import { GLORY_CARD_DEFS } from './glory_cards';

/** 消費財のダミーカード定義ID */
export const CONSUMABLE_DEF_ID = '__consumable__';
/** 消費財のカード名 */
export const CONSUMABLE_NAME = '消費財';

// 全カード定義の統合マップ (ID -> Def)
const ALL_CARDS_MAP = new Map<string, CardDef>();

function registerCards(defs: CardDef[]) {
    for (const d of defs) {
        if (ALL_CARDS_MAP.has(d.id)) {
            console.warn(`Duplicate card ID detected: ${d.id}`);
        }
        ALL_CARDS_MAP.set(d.id, d);
    }
}

// 初期化: 全カードを登録
registerCards(BASE_CARD_DEFS);
registerCards(GLORY_CARD_DEFS);

/** カードIDからカード定義を取得 */
export function getCardDef(defId: string): CardDef {
    if (defId === CONSUMABLE_DEF_ID) {
        // 消費財のダミー定義を返す
        return {
            id: CONSUMABLE_DEF_ID,
            name: CONSUMABLE_NAME,
            cost: 0,
            vp: 0,
            copies: 0,
            tags: [],
            unsellable: false,
            consumeOnUse: true,
            effectText: '消費財',
        };
    }
    const def = ALL_CARDS_MAP.get(defId);
    if (!def) throw new Error(`Unknown card defId: ${defId}`);
    return def;
}

/** バージョンに応じたデッキ構築用カード定義リストを取得 */
export function getDeckDefs(version: GameVersion): CardDef[] {
    if (version === 'glory') {
        return GLORY_CARD_DEFS;
    }
    return BASE_CARD_DEFS;
}

// 互換性のためにデフォルトエクスポートも維持
export const CARD_DEFS = BASE_CARD_DEFS;
