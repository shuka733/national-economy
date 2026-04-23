const TOUCH_UI_SHORT_SIDE_MAX = 1024;
const TOUCH_UI_LONG_SIDE_MAX = 1366;
const INTERACTION_MODE_QUERIES = [
    '(pointer: coarse)',
    '(any-pointer: coarse)',
    '(hover: none)',
    '(any-hover: none)',
    '(pointer: fine)',
    '(any-pointer: fine)',
    '(hover: hover)',
    '(any-hover: hover)',
] as const;

function matchesMediaQuery(query: string): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
}

function getViewportSize(): { width: number; height: number } {
    if (typeof window === 'undefined') return { width: 0, height: 0 };
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth ?? 0;
    const height = viewport?.height ?? window.innerHeight ?? 0;
    return {
        width: Math.max(0, Math.round(width)),
        height: Math.max(0, Math.round(height)),
    };
}

export function isLikelyIOSBrowser(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const maxTouchPoints = navigator.maxTouchPoints || 0;
    return /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function isLikelyIPhoneBrowser(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    return /iPhone|iPod/i.test(ua) || /iPhone|iPod/i.test(platform);
}

export function isStandaloneDisplayMode(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
    return Boolean(
        standaloneNavigator.standalone ||
        matchesMediaQuery('(display-mode: standalone)') ||
        matchesMediaQuery('(display-mode: fullscreen)')
    );
}

export function canUseHoverInteractions(): boolean {
    const hasHover = matchesMediaQuery('(hover: hover)') || matchesMediaQuery('(any-hover: hover)');
    const hasFinePointer = matchesMediaQuery('(pointer: fine)') || matchesMediaQuery('(any-pointer: fine)');
    return hasHover && hasFinePointer;
}

export function matchesTouchOptimizedUi(): boolean {
    const { width, height } = getViewportSize();
    if (width <= 0 || height <= 0) return false;

    const shortestSide = Math.min(width, height);
    const longestSide = Math.max(width, height);
    const withinTabletBounds = shortestSide <= TOUCH_UI_SHORT_SIDE_MAX && longestSide <= TOUCH_UI_LONG_SIDE_MAX;
    const hasCoarsePointer = matchesMediaQuery('(pointer: coarse)') || matchesMediaQuery('(any-pointer: coarse)');
    const hasNoHover = matchesMediaQuery('(hover: none)') || matchesMediaQuery('(any-hover: none)');

    return withinTabletBounds && hasCoarsePointer && hasNoHover && !canUseHoverInteractions();
}

export function watchInteractionModeChanges(onChange: () => void): () => void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => { };

    const cleanups: Array<() => void> = [];
    const mediaLists = INTERACTION_MODE_QUERIES.map(query => window.matchMedia(query));

    const handleViewportChange = () => onChange();
    window.addEventListener('resize', handleViewportChange, { passive: true });
    cleanups.push(() => window.removeEventListener('resize', handleViewportChange));

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleViewportChange);
        cleanups.push(() => window.visualViewport?.removeEventListener('resize', handleViewportChange));
    }

    for (const media of mediaLists) {
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', handleViewportChange);
            cleanups.push(() => media.removeEventListener('change', handleViewportChange));
        } else {
            media.addListener(handleViewportChange);
            cleanups.push(() => media.removeListener(handleViewportChange));
        }
    }

    return () => {
        for (const cleanup of cleanups) cleanup();
    };
}

export function getFullscreenFallbackMessage(): string {
    return 'iPhoneではSafariタブ内の全画面表示に対応していません。共有ボタンから「ホーム画面に追加」し、ホーム画面のアイコンから起動すると全画面に近い表示で遊べます。';
}
