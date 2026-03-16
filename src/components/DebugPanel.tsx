// ============================================================
// DebugPanel.tsx — デバッグ用フィーチャーフラグ切替パネル
// ============================================================
import React from 'react';
import type { FeatureFlags } from '../constants';

/** デバッグパネルのProps */
interface DebugPanelProps {
    /** 現在のフィーチャーフラグ値 */
    features: FeatureFlags;
    /** フラグ変更コールバック */
    onFeaturesChange: (features: FeatureFlags) => void;
    /** 閉じるコールバック */
    onClose: () => void;
}

/** トグルスイッチ1行分 */
function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 0',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
            <span style={{ fontSize: 'var(--fs-xl3)', color: 'var(--text-primary)', fontWeight: 500 }}>{label}</span>
            <button
                onClick={() => onChange(!checked)}
                style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    background: checked
                        ? 'linear-gradient(135deg, rgba(45,212,191,0.8), rgba(34,197,94,0.8))'
                        : 'rgba(255,255,255,0.1)',
                    transition: 'background 0.2s',
                }}
            >
                {/* ノブ（丸）*/}
                <div style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: 3,
                    left: checked ? 23 : 3,
                    transition: 'left 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }} />
            </button>
        </div>
    );
}

/** デバッグパネル本体 */
export function DebugPanel({ features, onFeaturesChange, onClose }: DebugPanelProps) {
    const updateFlag = <K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]) => {
        onFeaturesChange({ ...features, [key]: value });
    };

    return (
        <div style={{
            position: 'fixed',
            top: 40,
            right: 8,
            width: 260,
            zIndex: 9000,
            background: 'rgba(22, 25, 40, 0.97)',
            border: '1px solid rgba(212, 168, 83, 0.25)',
            borderRadius: 12,
            padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.15s ease-out',
        }}>
            {/* ヘッダー */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: '1px solid rgba(212,168,83,0.2)',
            }}>
                <span style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.5px' }}>
                    🔧 デバッグパネル
                </span>
                <button
                    onClick={onClose}
                    style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 6,
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                        fontSize: 'var(--fs-xl2)',
                        padding: '2px 8px',
                        transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                >
                    ✕
                </button>
            </div>

            {/* トグル項目 */}
            <ToggleRow
                label="ホバープレビュー"
                checked={features.HOVER_PREVIEW}
                onChange={v => updateFlag('HOVER_PREVIEW', v)}
            />
            <ToggleRow
                label="背景暗転"
                checked={features.DARKEN_ON_PREVIEW}
                onChange={v => updateFlag('DARKEN_ON_PREVIEW', v)}
            />
            <ToggleRow
                label="クリック配置"
                checked={features.CLICK_PLACE_WORKER}
                onChange={v => updateFlag('CLICK_PLACE_WORKER', v)}
            />

            {/* 説明テキスト */}
            <div style={{
                marginTop: 8,
                fontSize: 'var(--fs-xl)',
                color: 'var(--text-dim)',
                lineHeight: 1.5,
            }}>
                ※ レビュー用設定です。リアルタイムで挙動が変わります。
            </div>
        </div>
    );
}
