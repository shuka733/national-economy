// ============================================================
// BgImageOverlay.tsx — カード/職場背景画像の共通コンポーネント
// CardBgImage と WorkplaceBgImage で共通の
// 「position: absolute + img + multiply overlay」パターンを統合
// ============================================================
import React from 'react';

/** 背景画像 + 半透明オーバーレイの汎用コンポーネント */
export function BgImageOverlay({ src }: { src: string }) {
    return (
        <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            overflow: 'hidden',
            zIndex: 0,
            pointerEvents: 'none',
        }}>
            <img src={src} alt="" style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: 0.7,
            }} />
            {/* ベース色統一オーバーレイ: 画像の明るい部分を暗い青緑に抑える */}
            <div style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'var(--card-image-overlay)',
                mixBlendMode: 'multiply',
                pointerEvents: 'none',
            }} />
        </div>
    );
}
