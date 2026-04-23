import React, { useCallback, useEffect, useState } from 'react';
import { soundManager } from '../SoundManager';
import { IconFullscreen, IconFullscreenExit } from './Icons';
import { getFullscreenFallbackMessage, isLikelyIPhoneBrowser, isStandaloneDisplayMode } from '../browserPlatform';

type FullscreenCapableDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitFullscreenEnabled?: boolean;
    webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenCapableElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
};

export function FullscreenToggleButton({
    targetRef,
    className,
    style,
}: {
    targetRef?: React.RefObject<HTMLElement | null>;
    className?: string;
    style?: React.CSSProperties;
}) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isFullscreenSupported, setIsFullscreenSupported] = useState(false);
    const [showFallbackButton, setShowFallbackButton] = useState(false);

    const syncFullscreenState = useCallback(() => {
        if (typeof document === 'undefined') return;
        const doc = document as FullscreenCapableDocument;
        const target = (targetRef?.current ?? document.documentElement) as FullscreenCapableElement | null;
        const shouldUseIPhoneFallback = isLikelyIPhoneBrowser() && !isStandaloneDisplayMode();
        setIsFullscreen(Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement));
        setIsFullscreenSupported(Boolean(
            !shouldUseIPhoneFallback && (
                doc.fullscreenEnabled ||
                doc.webkitFullscreenEnabled ||
                target?.requestFullscreen ||
                target?.webkitRequestFullscreen
            )
        ));
        setShowFallbackButton(shouldUseIPhoneFallback);
    }, [targetRef]);

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const update = () => syncFullscreenState();
        update();
        document.addEventListener('fullscreenchange', update);
        document.addEventListener('webkitfullscreenchange', update as EventListener);
        return () => {
            document.removeEventListener('fullscreenchange', update);
            document.removeEventListener('webkitfullscreenchange', update as EventListener);
        };
    }, [syncFullscreenState]);

    const toggleFullscreen = useCallback(async () => {
        if (typeof document === 'undefined') return;
        const doc = document as FullscreenCapableDocument;
        const target = (targetRef?.current ?? document.documentElement) as FullscreenCapableElement | null;
        if (!target) return;
        soundManager.playSFX('click');
        try {
            if (showFallbackButton && typeof window !== 'undefined') {
                window.alert(getFullscreenFallbackMessage());
                return;
            }
            if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
                if (doc.exitFullscreen) {
                    await doc.exitFullscreen();
                } else if (doc.webkitExitFullscreen) {
                    await doc.webkitExitFullscreen();
                }
                return;
            }
            if (target.requestFullscreen) {
                try {
                    await target.requestFullscreen({ navigationUI: 'hide' });
                } catch {
                    await target.requestFullscreen();
                }
                return;
            }
            if (target.webkitRequestFullscreen) {
                await target.webkitRequestFullscreen();
                return;
            }
            if (showFallbackButton && typeof window !== 'undefined') {
                window.alert(getFullscreenFallbackMessage());
            }
        } catch (error) {
            console.warn('Failed to toggle fullscreen mode.', error);
            if (showFallbackButton && typeof window !== 'undefined') {
                window.alert(getFullscreenFallbackMessage());
            }
        }
    }, [showFallbackButton, targetRef]);

    if (!isFullscreenSupported && !showFallbackButton) return null;

    return (
        <button
            type="button"
            onClick={toggleFullscreen}
            className={['fullscreen-toggle-button', className].filter(Boolean).join(' ')}
            style={style}
            title={isFullscreen ? '全画面表示を解除' : '全画面表示'}
            aria-label={isFullscreen ? '全画面表示を解除' : '全画面表示'}
        >
            {isFullscreen
                ? <IconFullscreenExit size={"calc(var(--fs) * 1.44)"} />
                : <IconFullscreen size={"calc(var(--fs) * 1.44)"} />}
        </button>
    );
}
