// ============================================================
// themeUtils.ts - テーマ別の画像パス解決ヘルパー
// ============================================================
import type { ThemeName } from './App';
import { CONSUMABLE_DEF_ID, getCardDef } from './cards';
import type { GameVersion } from './types';

/** テーマ別画像を持つテーマ一覧（これらはテーマ別サブフォルダにカード画像を持つ） */
const THEMED_IMAGE_THEMES: ThemeName[] = ['paper', 'japanese', 'watercolor'];
const ALL_THEMES: ThemeName[] = ['default', 'paper', 'steampunk', 'japanese', 'watercolor'];

export const THEME_STORAGE_KEY = 'ne-theme';
export const LEGACY_DEFAULT_THEME_MIGRATION_KEY = 'ne-theme-default-migrated';

export const DEFAULT_CARD_ASPECT_RATIO = 63 / 88;
export const PAPER_CARD_ASPECT_RATIO = 57 / 88;

const PAPER_AUTOMATON_DEF_ID = 'gl_automaton';
const PAPER_AUTOMATON_VARIANTS = ['01', '02', '03', '04', '05'] as const;
const PAPER_RENDER_ASSET_FORMAT = 'png' as const;
const PAPER_ASSET_DIRECTORY = PAPER_RENDER_ASSET_FORMAT === 'png' ? 'paper_png' : 'paper';
const PAPER_ASSET_EXTENSION = PAPER_RENDER_ASSET_FORMAT;

export type ThemedCardImageRef = {
    defId: string;
    paperVariant?: string | null;
};

export type PaperAutomatonVariantCardSource = {
    uid: string;
    defId: string;
};

export type PaperAutomatonSoldWorkplaceSource = {
    id: string;
    fromBuildingDefId?: string;
};

export type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type DeckFaceKind = 'building' | 'consumable';

export type AssetPreloadMode = 'load' | 'decode';

type PreloadedAssetEntry = {
    loadPromise?: Promise<void>;
    decodePromise?: Promise<void>;
    loaded?: boolean;
    decoded?: boolean;
};

type PreloadAssetImagesOptions = {
    mode?: AssetPreloadMode;
};

const preloadedAssetUrls = new Map<string, PreloadedAssetEntry>();

function isThemeName(value: string | null): value is ThemeName {
    return !!value && ALL_THEMES.includes(value as ThemeName);
}

export function resolveInitialTheme(storage: ThemeStorage): ThemeName {
    const saved = storage.getItem(THEME_STORAGE_KEY);
    const migratedLegacyDefault = storage.getItem(LEGACY_DEFAULT_THEME_MIGRATION_KEY) === '1';

    if (saved === 'default' && !migratedLegacyDefault) {
        storage.setItem(THEME_STORAGE_KEY, 'paper');
        storage.setItem(LEGACY_DEFAULT_THEME_MIGRATION_KEY, '1');
        return 'paper';
    }
    if (isThemeName(saved)) return saved;
    return 'paper';
}

function normalizeCardsPath(basePath: string, theme: ThemeName): string {
    const normalized = basePath.replace(/^\//, '');
    if (!normalized.startsWith('cards/')) return basePath;
    const afterCards = normalized.slice('cards/'.length);
    return `/cards/${theme}/${afterCards}`;
}

function replacePaperAssetExtension(path: string): string {
    return path.replace(/\.(png|svg)$/i, `.${PAPER_ASSET_EXTENSION}`);
}

function getPaperNamedAssetPath(relativePath: string): string {
    const trimmed = relativePath
        .replace(/^\/+/, '')
        .replace(/^cards\/(?:paper|paper_png)\//, '');
    return `/cards/${PAPER_ASSET_DIRECTORY}/${replacePaperAssetExtension(trimmed)}`;
}

function getPaperAssetPath(basePath: string): string {
    const normalized = basePath.replace(/^\//, '');
    if (!normalized.startsWith('cards/')) return basePath;
    const afterCards = normalized.slice('cards/'.length);
    return getPaperNamedAssetPath(afterCards);
}

export function getSoldWorkplaceCardUid(workplaceId: string): string | null {
    if (!workplaceId.startsWith('sold_')) return null;
    const uid = workplaceId.slice('sold_'.length);
    return uid || null;
}

export function buildPaperAutomatonVariantMap(
    cards: readonly PaperAutomatonVariantCardSource[],
    soldWorkplaces: readonly PaperAutomatonSoldWorkplaceSource[] = [],
): Record<string, string> {
    const automatonUids = new Set<string>();

    for (const card of cards) {
        if (card.defId === PAPER_AUTOMATON_DEF_ID) automatonUids.add(card.uid);
    }
    for (const workplace of soldWorkplaces) {
        if (workplace.fromBuildingDefId !== PAPER_AUTOMATON_DEF_ID) continue;
        const uid = getSoldWorkplaceCardUid(workplace.id);
        if (uid) automatonUids.add(uid);
    }

    return Object.fromEntries(
        [...automatonUids].sort().map((uid, index) => [
            uid,
            PAPER_AUTOMATON_VARIANTS[index] ?? PAPER_AUTOMATON_VARIANTS[index % PAPER_AUTOMATON_VARIANTS.length],
        ]),
    );
}

function getPaperCardImagePath(card?: ThemedCardImageRef | null, basePath?: string): string | null {
    if (card?.defId === CONSUMABLE_DEF_ID) {
        return getPaperNamedAssetPath('consumable.png');
    }
    if (card?.defId === PAPER_AUTOMATON_DEF_ID) {
        return getPaperNamedAssetPath(`glory/automaton_${card.paperVariant ?? '01'}.png`);
    }

    const resolvedBasePath = basePath ?? (
        card && card.defId !== CONSUMABLE_DEF_ID
            ? getCardDef(card.defId).image
            : undefined
    );
    if (!resolvedBasePath) return null;
    return getPaperAssetPath(resolvedBasePath);
}

/**
 * 現在のテーマを取得する（CSS の data-theme 属性から読み取る）
 * CSS 変数は data-theme で切り替わるが、画像パスの解決にも同じ値が必要。
 */
export function getCurrentTheme(): ThemeName {
    if (typeof document === 'undefined') return 'default';
    const themeAttr = document.documentElement?.dataset?.theme;
    if (themeAttr && THEMED_IMAGE_THEMES.includes(themeAttr as ThemeName)) {
        return themeAttr as ThemeName;
    }
    // steampunk は default と同じ画像を使用するためここでは 'default' 扱い
    return 'default';
}

export function isPaperTheme(theme: ThemeName = getCurrentTheme()): boolean {
    return theme === 'paper';
}

export function getThemeCardAspectRatio(theme: ThemeName = getCurrentTheme()): number {
    return isPaperTheme(theme) ? PAPER_CARD_ASPECT_RATIO : DEFAULT_CARD_ASPECT_RATIO;
}

/**
 * テーマに応じたカード画像パスを解決する
 * - default / steampunk: 既存パス (例: /cards/progress/prog_farm.png)
 * - paper: /cards/paper もしくは /cards/paper_png 以下
 * - japanese / watercolor: /cards/{theme}/.../*.png
 */
export function getThemedCardImagePath(
    basePath: string,
    card?: ThemedCardImageRef | null,
    theme: ThemeName = getCurrentTheme(),
): string {
    if (theme === 'default') return basePath;
    if (theme === 'paper') {
        return getPaperCardImagePath(card, basePath) ?? basePath;
    }
    return normalizeCardsPath(basePath, theme);
}

export function getThemedCardImagePathForCard(
    card: ThemedCardImageRef,
    theme: ThemeName = getCurrentTheme(),
): string | null {
    if (theme === 'paper') {
        return getPaperCardImagePath(card);
    }
    if (card.defId === CONSUMABLE_DEF_ID) return null;
    const def = getCardDef(card.defId);
    return def.image ? getThemedCardImagePath(def.image, card, theme) : null;
}

export function getThemedDeckFaceAssetPath(
    deckKind: DeckFaceKind,
    version: GameVersion,
    theme: ThemeName = getCurrentTheme(),
): string | null {
    if (theme !== 'paper') return null;
    if (deckKind === 'consumable') return '/cards/paper/common/消費財.svg';
    return version === 'glory'
        ? '/cards/paper/common/glory_back.svg'
        : '/cards/paper/common/progress_back.svg';
}

/**
 * テーマに応じた公共職場画像パスを解決する（Board.tsx 用）
 * 引数は BASE_URL 抜きの raw パス (例: 'cards/quarry.png')
 */
function toAssetUrl(path: string): string {
    if (/^(?:https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
        return path;
    }
    return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

function preloadAssetUrl(url: string, mode: AssetPreloadMode): Promise<void> {
    const entry = preloadedAssetUrls.get(url) ?? {};
    if (typeof window === 'undefined' || typeof Image === 'undefined') return Promise.resolve();

    const img = new Image();
    img.decoding = 'async';

    if (mode === 'load') {
        if (entry.loaded || entry.decoded) return Promise.resolve();
        if (entry.loadPromise) return entry.loadPromise;

        entry.loadPromise = new Promise<void>((resolve) => {
            const finish = (loaded: boolean) => {
                entry.loaded = loaded || entry.loaded;
                resolve();
            };
            img.onload = () => finish(true);
            img.onerror = () => finish(false);
            img.src = url;
            if (img.complete) finish(true);
        });
        preloadedAssetUrls.set(url, entry);
        return entry.loadPromise;
    }

    if (entry.decoded) return Promise.resolve();
    if (entry.decodePromise) return entry.decodePromise;

    entry.decodePromise = new Promise<void>((resolve) => {
        let settled = false;
        const finish = (loaded: boolean, decoded: boolean) => {
            if (settled) return;
            settled = true;
            entry.loaded = loaded || entry.loaded;
            entry.decoded = decoded || entry.decoded;
            resolve();
        };
        const finishAfterDecode = () => {
            if (typeof img.decode === 'function') {
                img.decode().catch(() => undefined).finally(() => finish(true, true));
                return;
            }
            finish(true, true);
        };

        img.onload = finishAfterDecode;
        img.onerror = () => finish(false, false);
        img.src = url;
        if (img.complete) finishAfterDecode();
    });

    preloadedAssetUrls.set(url, entry);
    return entry.decodePromise;
}

export function preloadAssetImages(
    paths: readonly (string | null | undefined)[],
    options: PreloadAssetImagesOptions = {},
): void {
    if (typeof window === 'undefined' || typeof Image === 'undefined') return;

    const mode = options.mode ?? 'decode';
    const normalizedUrls = new Set<string>();
    for (const path of paths) {
        const trimmed = path?.trim();
        if (!trimmed) continue;
        normalizedUrls.add(toAssetUrl(trimmed));
    }
    for (const url of normalizedUrls) {
        void preloadAssetUrl(url, mode);
    }
}

export function getThemedWorkplaceImagePath(rawPath: string, theme: ThemeName = getCurrentTheme()): string {
    if (theme === 'default') return rawPath;
    if (!rawPath.startsWith('cards/')) return rawPath;
    if (theme === 'paper') {
        const afterCards = rawPath.slice('cards/'.length).replace(/\.png$/i, '.svg');
        return `cards/paper/${afterCards}`;
    }
    const afterCards = rawPath.slice('cards/'.length);
    return `cards/${theme}/${afterCards}`;
}

/**
 * テーマに応じた背景/ロゴ画像パスを解決する
 * @param filename ファイル名 (例: 'bg_title.png', 'bg_game.png', 'logo.png')
 * @returns テーマに応じたパス (例: 'japanese_bg_title.png')
 */
export function getThemedAssetPath(filename: string, theme: ThemeName = getCurrentTheme()): string {
    if (theme === 'default') return filename;
    return `${theme}_${filename}`;
}

export function getResolvedDeckFaceAssetPath(
    deckKind: DeckFaceKind,
    version: GameVersion,
    theme: ThemeName = getCurrentTheme(),
): string | null {
    if (theme !== 'paper') return getThemedDeckFaceAssetPath(deckKind, version, theme);
    if (deckKind === 'consumable') return getPaperNamedAssetPath('common/消費財.png');
    return version === 'glory'
        ? getPaperNamedAssetPath('common/glory_back.png')
        : getPaperNamedAssetPath('common/progress_back.png');
}

export function getResolvedWorkplaceImagePath(rawPath: string, theme: ThemeName = getCurrentTheme()): string {
    if (theme === 'paper') {
        if (!rawPath.startsWith('cards/')) return rawPath;
        const afterCards = rawPath.slice('cards/'.length);
        return getPaperNamedAssetPath(afterCards).replace(/^\//, '');
    }
    return getThemedWorkplaceImagePath(rawPath, theme);
}
