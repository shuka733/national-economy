export function isLikelyIOSBrowser(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const maxTouchPoints = navigator.maxTouchPoints || 0;
    return /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function getFullscreenFallbackMessage(): string {
    return 'このブラウザではフルスクリーン API が使えません。iPhone では「ホーム画面に追加」で全画面に近い表示にできます。';
}
