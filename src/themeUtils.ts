// ============================================================
// themeUtils.ts — テーマ別の画像パス解決ヘルパー
// ============================================================
import type { ThemeName } from './App';

/** テーマ別画像を持つテーマ一覧（これらはテーマ別サブフォルダにカード画像を持つ） */
const THEMED_IMAGE_THEMES: ThemeName[] = ['japanese', 'watercolor'];

/**
 * 現在のテーマを取得する（CSSのdata-theme属性から読み取る）
 * CSS変数はdata-themeで切り替わるが、画像パスの解決にも必要
 */
export function getCurrentTheme(): ThemeName {
    const themeAttr = document.documentElement.dataset.theme;
    if (themeAttr && THEMED_IMAGE_THEMES.includes(themeAttr as ThemeName)) {
        return themeAttr as ThemeName;
    }
    // steampunk は default と同じ画像を使用するためここでは 'default' 扱い
    return 'default';
}

/**
 * テーマに応じたカード画像パスを解決する
 * - default / steampunk: 既存パス (例: /cards/progress/prog_farm.png)
 * - japanese / fantasy / watercolor: テーマ別サブフォルダ (例: /cards/japanese/progress/prog_farm.png)
 *
 * @param basePath 既存の画像パス (例: '/cards/progress/prog_farm.png')
 * @returns テーマに応じた画像パス
 */
export function getThemedCardImagePath(basePath: string): string {
    const theme = getCurrentTheme();
    if (theme === 'default') return basePath;

    // basePath: '/cards/progress/xxx.png' or '/cards/glory/xxx.png' or 'cards/xxx.png'
    // テーマ別: '/cards/{theme}/progress/xxx.png' or '/cards/{theme}/glory/xxx.png' etc.
    const normalized = basePath.replace(/^\//, '');
    if (normalized.startsWith('cards/')) {
        const afterCards = normalized.slice('cards/'.length);
        return `/cards/${theme}/${afterCards}`;
    }
    return basePath;
}

/**
 * テーマに応じた職場画像パスを解決する（Board.tsx用）
 * 引数はBASE_URL付きでないraw パス (例: 'cards/quarry.png')
 */
export function getThemedWorkplaceImagePath(rawPath: string): string {
    const theme = getCurrentTheme();
    if (theme === 'default') return rawPath;

    // rawPath: 'cards/xxx.png' → 'cards/{theme}/xxx.png'
    if (rawPath.startsWith('cards/')) {
        const afterCards = rawPath.slice('cards/'.length);
        return `cards/${theme}/${afterCards}`;
    }
    return rawPath;
}

/**
 * テーマに応じた背景/ロゴ画像パスを解決する
 * @param filename ファイル名 (例: 'bg_title.png', 'bg_game.png', 'logo.png')
 * @returns テーマに応じたパス (例: 'japanese_bg_title.png')
 */
export function getThemedAssetPath(filename: string): string {
    const theme = getCurrentTheme();
    if (theme === 'default') return filename;
    return `${theme}_${filename}`;
}
