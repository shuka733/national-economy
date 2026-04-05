export const PAPER_FULL_CARD_GRID = {
  left: 5,
  top: 6,
  stepX: 217,
  stepY: 352,
  width: 218,
  height: 304,
  outputWidth: 640,
  outputHeight: 890,
};

const DEFAULT_VERTICAL_EXPAND_BY_ROW = {
  0: { expandTop: 6, expandBottom: 12 },
  1: { expandTop: 6, expandBottom: 12 },
  2: { expandTop: 6, expandBottom: 18 },
};

const PUBLIC_TITLE_MAP = {
  mine: '鉱山',
  quarry: '採石場',
  school: '学校',
  carpenter: '大工',
  stall: '露店',
  market: '市場',
  highschool: '高校',
  supermarket: 'スーパーマーケット',
  university: '大学',
  department_store: '百貨店',
  vocational_school: '専門学校',
  world_expo: '万博',
};

const PROGRESS_TITLE_MAP = {
  farm: '農場',
  slash_burn: '焼畑',
  coffee_shop: '珈琲店',
  design_office: '設計事務所',
  factory: '工場',
  construction_co: '建設会社',
  warehouse: '倉庫',
  law_office: '法律事務所',
  orchard: '果樹園',
  company_housing: '社宅',
  real_estate: '不動産屋',
  pioneer: '開拓民',
  restaurant: 'レストラン',
  large_farm: '大農園',
  general_contractor: 'ゼネコン',
  steel_mill: '製鉄所',
  mansion: '邸宅',
  labor_union: '労働組合',
  auto_factory: '自動車工場',
  headquarters: '本社ビル',
  dual_construction: '二胡市建設',
  railroad: '鉄道',
};

const GLORY_TITLE_MAP = {
  gl_relic: '遺物',
  gl_village: '農村',
  gl_colonist: '植民団',
  gl_studio: '工房',
  gl_steam_factory: '蒸気工場',
  gl_poultry_farm: '養鶏場',
  gl_skyscraper: '摩天建設',
  gl_game_cafe: 'ゲームカフェ',
  gl_cotton_farm: '綿花農場',
  gl_museum: '美術館',
  gl_monument: '記念碑',
  gl_consumers_coop: '消費者組合',
  gl_automaton: '機械人形',
  gl_coal_mine: '炭鉱',
  gl_modernism_construction: 'モダニズム建設',
  gl_theater: '劇場',
  gl_guild_hall: 'ギルドホール',
  gl_ivory_tower: '象牙の塔',
  gl_refinery: '精錬所',
  gl_teleporter: '転送装置',
  gl_revolution_square: '革命広場',
  gl_harvest_festival: '収穫祭',
  gl_tech_exhibition: '技術展示会',
  gl_greenhouse: '温室',
  gl_temple_of_purification: '浄火の神殿',
  gl_locomotive_factory: '機関車工場',
};

const MISSING_IMPLEMENTED = [];

const sanitizeFilename = (value) =>
  value.replace(/[\\/:*?"<>|]/g, '・').replace(/\s+/g, ' ').trim();

function defaultCropAdjust(row) {
  return DEFAULT_VERTICAL_EXPAND_BY_ROW[row] ?? { expandTop: 0, expandBottom: 0 };
}

function cropRect(row, col, adjust = {}) {
  const { expandTop, expandBottom } = {
    ...defaultCropAdjust(row),
    ...adjust,
  };
  return {
    row,
    col,
    left: PAPER_FULL_CARD_GRID.left + col * PAPER_FULL_CARD_GRID.stepX,
    top: PAPER_FULL_CARD_GRID.top + row * PAPER_FULL_CARD_GRID.stepY - expandTop,
    width: PAPER_FULL_CARD_GRID.width,
    height: PAPER_FULL_CARD_GRID.height + expandTop + expandBottom,
    expandTop,
    expandBottom,
  };
}

function implementedTitle(group, id) {
  if (group === 'public') return PUBLIC_TITLE_MAP[id];
  if (group === 'progress') return PROGRESS_TITLE_MAP[id];
  return GLORY_TITLE_MAP[id];
}

function makeImplementedEntry({ id, group, sheet, row, col, output, titleJa, adjust }) {
  return {
    id,
    titleJa: titleJa ?? implementedTitle(group, id),
    group,
    isImplemented: true,
    sheet,
    output,
    cropRect: cropRect(row, col, adjust),
  };
}

function makeTitlePath(group, titleJa, sheet, row, col, duplicateSafe = false) {
  const base = sanitizeFilename(titleJa);
  const suffix = duplicateSafe ? `__s${sheet}_r${row}_c${col}` : '';
  return `${group}/${base}${suffix}.png`;
}

const implementedEntries = [
  makeImplementedEntry({ id: 'mine', group: 'public', sheet: '01', row: 2, col: 3, output: 'public/mine.png' }),
  makeImplementedEntry({ id: 'quarry', group: 'public', sheet: '01', row: 2, col: 4, output: 'public/quarry.png' }),
  makeImplementedEntry({ id: 'school', group: 'public', sheet: '01', row: 2, col: 5, output: 'public/school.png' }),
  makeImplementedEntry({ id: 'carpenter', group: 'public', sheet: '01', row: 2, col: 6, output: 'public/carpenter.png' }),
  makeImplementedEntry({ id: 'ruins', group: 'public', sheet: '06', row: 2, col: 0, output: 'public/ruins.png' }),
  makeImplementedEntry({ id: 'stall', group: 'public', sheet: '03', row: 0, col: 6, output: 'public/stall.png' }),
  makeImplementedEntry({ id: 'market', group: 'public', sheet: '03', row: 0, col: 5, output: 'public/market.png' }),
  makeImplementedEntry({ id: 'highschool', group: 'public', sheet: '03', row: 0, col: 4, output: 'public/highschool.png' }),
  makeImplementedEntry({ id: 'supermarket', group: 'public', sheet: '03', row: 0, col: 3, output: 'public/supermarket.png' }),
  makeImplementedEntry({ id: 'university', group: 'public', sheet: '03', row: 0, col: 2, output: 'public/university.png' }),
  makeImplementedEntry({ id: 'department_store', group: 'public', sheet: '03', row: 0, col: 1, output: 'public/department_store.png' }),
  makeImplementedEntry({ id: 'vocational_school', group: 'public', sheet: '03', row: 0, col: 0, output: 'public/vocational_school.png' }),
  makeImplementedEntry({ id: 'world_expo', group: 'public', sheet: '03', row: 1, col: 6, output: 'public/world_expo.png' }),

  makeImplementedEntry({ id: 'design_office', group: 'progress', sheet: '02', row: 1, col: 0, output: 'progress/prog_design_office.png' }),
  makeImplementedEntry({ id: 'coffee_shop', group: 'progress', sheet: '02', row: 1, col: 1, output: 'progress/prog_coffee_shop.png' }),
  makeImplementedEntry({ id: 'construction_co', group: 'progress', sheet: '02', row: 1, col: 2, output: 'progress/prog_construction_co.png' }),
  makeImplementedEntry({ id: 'pioneer', group: 'progress', sheet: '02', row: 1, col: 3, output: 'progress/prog_pioneer.png' }),
  makeImplementedEntry({ id: 'agri_coop', group: 'progress', sheet: '02', row: 1, col: 4, output: 'progress/prog_agri_coop.png' }),
  makeImplementedEntry({ id: 'labor_union', group: 'progress', sheet: '02', row: 2, col: 0, output: 'progress/prog_labor_union.png' }),
  makeImplementedEntry({ id: 'railroad', group: 'progress', sheet: '02', row: 2, col: 1, output: 'progress/prog_railroad.png' }),
  makeImplementedEntry({ id: 'restaurant', group: 'progress', sheet: '02', row: 2, col: 2, output: 'progress/prog_restaurant.png' }),
  makeImplementedEntry({ id: 'chemical_plant', group: 'progress', sheet: '02', row: 2, col: 3, output: 'progress/prog_chemical_plant.png' }),
  makeImplementedEntry({ id: 'auto_factory', group: 'progress', sheet: '02', row: 2, col: 4, output: 'progress/prog_auto_factory.png' }),
  makeImplementedEntry({ id: 'slash_burn', group: 'progress', sheet: '02', row: 2, col: 5, output: 'progress/prog_slash_burn.png' }),
  makeImplementedEntry({ id: 'headquarters', group: 'progress', sheet: '02', row: 2, col: 6, output: 'progress/prog_headquarters.png' }),
  makeImplementedEntry({ id: 'law_office', group: 'progress', sheet: '03', row: 1, col: 0, output: 'progress/prog_law_office.png' }),
  makeImplementedEntry({ id: 'company_housing', group: 'progress', sheet: '03', row: 1, col: 1, output: 'progress/prog_company_housing.png' }),
  makeImplementedEntry({ id: 'steel_mill', group: 'progress', sheet: '03', row: 2, col: 0, output: 'progress/prog_steel_mill.png' }),
  makeImplementedEntry({ id: 'large_farm', group: 'progress', sheet: '03', row: 2, col: 1, output: 'progress/prog_large_farm.png' }),
  makeImplementedEntry({ id: 'farm', group: 'progress', sheet: '03', row: 2, col: 2, output: 'progress/prog_farm.png' }),
  makeImplementedEntry({ id: 'warehouse', group: 'progress', sheet: '03', row: 2, col: 3, output: 'progress/prog_warehouse.png' }),
  makeImplementedEntry({ id: 'orchard', group: 'progress', sheet: '03', row: 2, col: 4, output: 'progress/prog_orchard.png' }),
  makeImplementedEntry({ id: 'factory', group: 'progress', sheet: '03', row: 2, col: 5, output: 'progress/prog_factory.png' }),
  makeImplementedEntry({ id: 'real_estate', group: 'progress', sheet: '03', row: 2, col: 6, output: 'progress/prog_real_estate.png' }),
  makeImplementedEntry({ id: 'general_contractor', group: 'progress', sheet: '04', row: 0, col: 4, output: 'progress/prog_general_contractor.png' }),
  makeImplementedEntry({ id: 'dual_construction', group: 'progress', sheet: '04', row: 0, col: 5, output: 'progress/prog_dual_construction.png' }),
  makeImplementedEntry({ id: 'mansion', group: 'progress', sheet: '04', row: 0, col: 6, output: 'progress/prog_mansion.png' }),

  makeImplementedEntry({ id: 'gl_poultry_farm', group: 'glory', sheet: '06', row: 0, col: 0, output: 'glory/poultry_farm.png' }),
  makeImplementedEntry({ id: 'gl_relic', group: 'glory', sheet: '06', row: 0, col: 1, output: 'glory/relic.png' }),
  makeImplementedEntry({ id: 'gl_consumers_coop', group: 'glory', sheet: '06', row: 0, col: 2, output: 'glory/consumer_union.png' }),
  makeImplementedEntry({ id: 'gl_revolution_square', group: 'glory', sheet: '06', row: 0, col: 3, output: 'glory/revolution_square.png' }),
  makeImplementedEntry({ id: 'gl_theater', group: 'glory', sheet: '06', row: 0, col: 4, output: 'glory/theater.png' }),
  makeImplementedEntry({ id: 'gl_tech_exhibition', group: 'glory', sheet: '06', row: 0, col: 5, output: 'glory/technical_exhibition.png' }),
  makeImplementedEntry({ id: 'gl_colonist', group: 'glory', sheet: '06', row: 0, col: 6, output: 'glory/colonial_group.png' }),
  makeImplementedEntry({ id: 'gl_locomotive_factory', group: 'glory', sheet: '06', row: 1, col: 0, output: 'glory/locomotive_factory.png' }),
  makeImplementedEntry({ id: 'gl_cotton_farm', group: 'glory', sheet: '06', row: 1, col: 1, output: 'glory/cotton_plantation.png' }),
  makeImplementedEntry({ id: 'gl_greenhouse', group: 'glory', sheet: '06', row: 1, col: 2, output: 'glory/greenhouse.png' }),
  makeImplementedEntry({ id: 'gl_game_cafe', group: 'glory', sheet: '06', row: 1, col: 3, output: 'glory/game_cafe.png' }),
  makeImplementedEntry({ id: 'gl_museum', group: 'glory', sheet: '06', row: 1, col: 4, output: 'glory/art_museum.png' }),
  makeImplementedEntry({ id: 'gl_refinery', group: 'glory', sheet: '06', row: 1, col: 5, output: 'glory/smelter.png' }),
  makeImplementedEntry({ id: 'gl_studio', group: 'glory', sheet: '06', row: 1, col: 6, output: 'glory/workshop.png' }),
  makeImplementedEntry({ id: 'gl_automaton', group: 'glory', sheet: '06', row: 2, col: 1, output: 'glory/automaton.png' }),
  makeImplementedEntry({ id: 'gl_monument', group: 'glory', sheet: '06', row: 2, col: 6, output: 'glory/monument.png' }),
  makeImplementedEntry({ id: 'gl_ivory_tower', group: 'glory', sheet: '05', row: 1, col: 0, output: 'glory/ivory_tower.png' }),
  makeImplementedEntry({ id: 'gl_harvest_festival', group: 'glory', sheet: '05', row: 1, col: 1, output: 'glory/harvest_festival.png' }),
  makeImplementedEntry({ id: 'gl_coal_mine', group: 'glory', sheet: '05', row: 1, col: 2, output: 'glory/coal_mine.png' }),
  makeImplementedEntry({ id: 'gl_village', group: 'glory', sheet: '05', row: 2, col: 0, output: 'glory/rural_village.png' }),
  makeImplementedEntry({ id: 'gl_steam_factory', group: 'glory', sheet: '05', row: 2, col: 1, output: 'glory/steam_factory.png' }),
  makeImplementedEntry({ id: 'gl_skyscraper', group: 'glory', sheet: '05', row: 2, col: 2, output: 'glory/skyscraper_construction.png' }),
  makeImplementedEntry({ id: 'gl_teleporter', group: 'glory', sheet: '05', row: 2, col: 3, output: 'glory/transfer_device.png' }),
  makeImplementedEntry({ id: 'gl_modernism_construction', group: 'glory', sheet: '05', row: 2, col: 4, output: 'glory/modernism_construction.png' }),
  makeImplementedEntry({ id: 'gl_temple_of_purification', group: 'glory', sheet: '05', row: 2, col: 5, output: 'glory/temple_of_purification.png' }),
  makeImplementedEntry({ id: 'gl_guild_hall', group: 'glory', sheet: '05', row: 2, col: 6, output: 'glory/guild_hall.png' }),
];

const mecenatEntries = [
  ['04', 0, 0, '大聖堂'],
  ['04', 0, 1, '工業団地'],
  ['04', 0, 2, '芋畑'],
  ['04', 1, 0, '観光牧場'],
  ['04', 1, 1, '宝くじ'],
  ['04', 1, 2, 'プレハブ工務店'],
  ['04', 1, 3, '食堂'],
  ['04', 1, 4, '旧市街'],
  ['04', 1, 5, '地球建設'],
  ['04', 1, 6, '養殖場'],
  ['04', 2, 0, '墓地'],
  ['04', 2, 1, '醸造所'],
  ['04', 2, 2, '会計事務所'],
  ['04', 2, 3, '投資銀行'],
  ['04', 2, 4, '石油コンビナート'],
  ['04', 2, 5, '遊園地'],
  ['04', 2, 6, '建築会社'],
  ['05', 0, 0, '造船所'],
  ['05', 0, 1, '輸出港'],
  ['05', 0, 2, '博物館'],
  ['05', 0, 3, '研究所'],
  ['05', 0, 4, '宮大工'],
  ['05', 0, 5, '鉄道駅'],
  ['05', 0, 6, '菜園'],
  ['05', 1, 4, '食品工場'],
  ['05', 1, 5, '鉄工所'],
  ['05', 1, 6, '植物園'],
].map(([sheet, row, col, titleJa]) => ({
  id: `mecenat_${sheet}_${row}_${col}`,
  titleJa,
  group: 'mecenat',
  isImplemented: false,
  sheet,
  output: makeTitlePath('mecenat', titleJa, sheet, row, col, false),
  cropRect: cropRect(row, col),
}));

const consumableEntries = [
  ['01', 0, 0],
  ['01', 0, 1],
  ['01', 0, 2],
  ['01', 0, 3],
  ['01', 0, 4],
  ['01', 0, 5],
  ['01', 0, 6],
  ['01', 1, 1],
  ['01', 1, 2],
  ['01', 1, 3],
  ['01', 1, 4],
  ['01', 1, 5],
  ['01', 1, 6],
].map(([sheet, row, col]) => ({
  id: `consumable_${sheet}_${row}_${col}`,
  titleJa: '消費財',
  group: 'consumable',
  isImplemented: false,
  sheet,
  output: makeTitlePath('consumable', '消費財', sheet, row, col, true),
  cropRect: cropRect(row, col),
}));

export const PAPER_FULL_CARD_MISSING_IMPLEMENTED = MISSING_IMPLEMENTED;

export const PAPER_FULL_CARD_MANIFEST = [
  ...implementedEntries,
  ...mecenatEntries,
  ...consumableEntries,
];

export const PAPER_FULL_CARD_COUNTS = PAPER_FULL_CARD_MANIFEST.reduce(
  (acc, entry) => {
    acc[entry.group] = (acc[entry.group] ?? 0) + 1;
    acc.total += 1;
    return acc;
  },
  { public: 0, progress: 0, glory: 0, mecenat: 0, consumable: 0, total: 0 },
);
