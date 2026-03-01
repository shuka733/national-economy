// ============================================================
// glory_cards.ts  –  ナショナルエコノミー・グローリー 建物カード定義 (全71枚)
// ============================================================
import type { CardDef } from './types';

export const GLORY_CARD_DEFS: CardDef[] = [
    // ============================================================
    // コスト 0 (計3枚)
    // ============================================================
    {
        id: 'gl_relic',
        name: '遺物',
        cost: 0,
        vp: 0,
        copies: 3,
        tags: [],
        unsellable: true,
        consumeOnUse: false,
        effectText: 'VPトークン2枚を得る',
        image: '/cards/glory/relic.png',
    },

    // ============================================================
    // コスト 1 (計16枚)
    // ============================================================
    {
        id: 'gl_village',
        name: '農村',
        cost: 1,
        vp: 6,
        copies: 6,
        tags: ['farm'],
        unsellable: false,
        consumeOnUse: false,
        effectText: '消費財2枚引く OR 消費財2枚捨てて建物カード3枚引く',
        image: '/cards/glory/rural_village.png',
    },
    {
        id: 'gl_colonist',
        name: '植民団',
        cost: 1,
        vp: 6,
        copies: 5,
        tags: [],
        unsellable: false,
        consumeOnUse: false,
        effectText: '建物を1つ建てる。その後、消費財1枚引く',
        image: '/cards/glory/colonial_group.png',
    },
    {
        id: 'gl_studio',
        name: '工房',
        cost: 1,
        vp: 8,
        copies: 5,
        tags: ['factory'],
        unsellable: false,
        consumeOnUse: false,
        effectText: '建物カード1枚引く＋VPトークン1枚を得る',
        image: '/cards/glory/workshop.png',
    },

    // ============================================================
    // コスト 2 (計18枚)
    // ============================================================
    {
        id: 'gl_steam_factory',
        name: '蒸気工場',
        cost: 2,
        vp: 10,
        copies: 8,
        tags: ['factory'],
        unsellable: false,
        consumeOnUse: false,
        effectText: '手札2枚捨て→建物カード4枚引く',
        variableCostType: 'vp_token',
        variableCostParam: 2, // VPトークン2枚以上でコスト-1
        image: '/cards/glory/steam_factory.png',
    },
    {
        id: 'gl_poultry_farm',
        name: '養鶏場',
        cost: 2,
        vp: 12,
        copies: 4,
        tags: ['farm'],
        unsellable: false,
        consumeOnUse: false,
        effectText: '消費財2枚引く（手札枚数が奇数なら3枚引く）',
        variableCostType: 'hand_odd', // 変動コストに使用するフィールドだが条件分岐用にも流用可能か？ -> effectTextで処理する
        image: '/cards/glory/poultry_farm.png',
    },
    {
        id: 'gl_skyscraper',
        name: '摩天建設',
        cost: 2,
        vp: 10,
        copies: 3,
        tags: [],
        unsellable: false,
        consumeOnUse: false,
        effectText: '建物を1つ建てる（その後手札が0枚なら建物カード2枚引く）',
        image: '/cards/glory/skyscraper_construction.png',
    },
    {
        id: 'gl_game_cafe', // Game Cafe
        name: 'ゲームカフェ',
        cost: 2,
        vp: 10,
        copies: 3,
        tags: [], // 商業
        unsellable: false,
        consumeOnUse: false,
        effectText: '家計から$5得る（ラウンド最後の行動なら$10得る）',
        image: '/cards/glory/game_cafe.png',
    },

    // ============================================================
    // コスト 3 (計8枚)
    // ============================================================
    {
        id: 'gl_cotton_farm',
        name: '綿花農場',
        cost: 3,
        vp: 14,
        copies: 3,
        tags: ['farm'],
        unsellable: false,
        consumeOnUse: false,
        effectText: '消費財5枚引く（コスト: 労働者2体）',
        workerReq: 2,
        image: '/cards/glory/cotton_plantation.png',
    },
    {
        id: 'gl_museum',
        name: '美術館',
        cost: 3,
        vp: 14,
        copies: 2,
        tags: [], // 商業
        unsellable: false,
        consumeOnUse: false,
        effectText: '家計から$7得る（手札がちょうど5枚なら$14得る）',
        image: '/cards/glory/art_museum.png',
    },
    {
        id: 'gl_monument',
        name: '記念碑',
        cost: 3,
        vp: 24,
        copies: 2,
        tags: [],
        unsellable: true,
        consumeOnUse: false,
        effectText: '効果なし（高得点）',
        image: '/cards/glory/monument.png',
    },
    {
        id: 'gl_consumers_coop',
        name: '消費者組合',
        cost: 3,
        vp: 18,
        copies: 1,
        tags: [],
        unsellable: true,
        consumeOnUse: false,
        effectText: '終了時、「農業」の資産価値合計が20以上で+18点',
        image: '/cards/glory/consumer_union.png',
    },

    // ============================================================
    // コスト 4 (計13枚)
    // ============================================================
    {
        id: 'gl_automaton', // "機械人形" -> Automaton / Robot
        name: '機械人形',
        cost: 4,
        vp: 2,
        copies: 5,
        tags: [],
        unsellable: true,
        consumeOnUse: false,
        effectText: '機械人形コマを1つ得る',
        image: '/cards/glory/automaton.png',
    },
    {
        id: 'gl_coal_mine',
        name: '炭鉱',
        cost: 4,
        vp: 20,
        copies: 2,
        tags: [], // 鉱業
        unsellable: false,
        consumeOnUse: false,
        effectText: '建物カード5枚引く（コスト: 労働者2体）',
        workerReq: 2,
        image: '/cards/glory/coal_mine.png',
    },
    {
        id: 'gl_modernism_construction',
        name: 'モダニズム建設',
        cost: 4,
        vp: 18,
        copies: 2,
        tags: [],
        unsellable: false,
        consumeOnUse: false,
        effectText: '建物を1つ建てる（この建設で消費財は2枚分のコストになる）',
        image: '/cards/glory/modernism_construction.png',
    },
    {
        id: 'gl_theater',
        name: '劇場',
        cost: 4,
        vp: 20,
        copies: 2,
        tags: [], // 商業
        unsellable: false,
        consumeOnUse: false,
        effectText: '手札2枚捨てて、家計から$20得る',
        image: '/cards/glory/theater.png',
    },
    {
        id: 'gl_guild_hall',
        name: 'ギルドホール',
        cost: 4,
        vp: 20,
        copies: 1,
        tags: [],
        unsellable: true,
        consumeOnUse: false,
        effectText: '終了時、「農業」と「工業」両方所持で+20点',
        image: '/cards/glory/guild_hall.png',
    },
    {
        id: 'gl_ivory_tower',
        name: '象牙の塔',
        cost: 4,
        vp: 22,
        copies: 1,
        tags: [],
        unsellable: true,
        consumeOnUse: false,
        effectText: '終了時、VPトークン7枚以上所持で+22点',
        image: '/cards/glory/ivory_tower.png',
    },

    // ============================================================
    // コスト 5 (計8枚)
    // ============================================================
    {
        id: 'gl_refinery',
        name: '精錬所',
        cost: 5,
        vp: 16,
        copies: 3,
        tags: ['factory'], // 工業
        unsellable: false,
        consumeOnUse: false,
        effectText: '建物カード3枚引く',
        variableCostType: 'vp_token',
        variableCostParam: 3, // VPトークン3枚以上でコスト-2
        image: '/cards/glory/smelter.png',
    },
    {
        id: 'gl_teleporter',
        name: '転送装置',
        cost: 5,
        vp: 22,
        copies: 2,
        tags: [],
        unsellable: false,
        consumeOnUse: false,
        effectText: '建物を1つコスト無視(無料)で建てる（コスト: 労働者2体）',
        workerReq: 2,
        image: '/cards/glory/transfer_device.png',
    },
    {
        id: 'gl_revolution_square',
        name: '革命広場',
        cost: 5,
        vp: 18,
        copies: 1,
        tags: [],
        unsellable: true,
        consumeOnUse: false,
        effectText: '終了時、人間の労働者が5人で+18点',
        image: '/cards/glory/revolution_square.png',
    },
    {
        id: 'gl_harvest_festival',
        name: '収穫祭',
        cost: 5,
        vp: 26,
        copies: 1,
        tags: [],
        unsellable: true,
        consumeOnUse: false,
        effectText: '終了時、手札に消費財が4枚以上あれば+26点',
        image: '/cards/glory/harvest_festival.png',
    },
    {
        id: 'gl_tech_exhibition',
        name: '技術展示会',
        cost: 5,
        vp: 24,
        copies: 1,
        tags: [],
        unsellable: true,
        consumeOnUse: false,
        effectText: '終了時、「工業」の資産価値合計が30以上で+24点',
        image: '/cards/glory/technical_exhibition.png',
    },

    // ============================================================
    // コスト 6 (計3枚)
    // ============================================================
    {
        id: 'gl_greenhouse',
        name: '温室',
        cost: 6,
        vp: 18,
        copies: 2,
        tags: ['farm'], // 農業
        unsellable: false,
        consumeOnUse: false,
        effectText: '消費財4枚引く',
        variableCostType: 'vp_token',
        variableCostParam: 4, // VPトークン4枚以上でコスト-2
        image: '/cards/glory/greenhouse.png',
    },
    {
        id: 'gl_temple_of_purification',
        name: '浄火の神殿',
        cost: 6,
        vp: 30,
        copies: 1,
        tags: [],
        unsellable: true,
        consumeOnUse: false,
        effectText: '終了時、これが唯一の「売却不可」カードなら+30点',
        image: '/cards/glory/temple_of_purification.png',
    },

    // ============================================================
    // コスト 7 (計2枚)
    // ============================================================
    {
        id: 'gl_locomotive_factory',
        name: '機関車工場',
        cost: 7,
        vp: 24,
        copies: 2,
        tags: ['factory'], // 工業
        unsellable: false,
        consumeOnUse: false,
        effectText: '手札3枚捨て→建物カード7枚引く',
        variableCostType: 'vp_token',
        variableCostParam: 5, // VPトークン5枚以上でコスト-3
        image: '/cards/glory/locomotive_factory.png',
    },
];
