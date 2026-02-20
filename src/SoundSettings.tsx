import React, { useState, useEffect } from 'react';
import { soundManager } from './SoundManager';

export function SoundSettings({ onClose }: { onClose: () => void }) {
    const [settings, setSettings] = useState(soundManager.getSettings());

    const handleMuteToggle = () => {
        soundManager.toggleMute();
        setSettings(soundManager.getSettings());
        soundManager.playSFX('click');
    };

    const handleBgmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        soundManager.setVolumes(val, settings.sfxVolume);
        setSettings(soundManager.getSettings());
    };

    const handleSfxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        soundManager.setVolumes(settings.bgmVolume, val);
        setSettings(soundManager.getSettings());
    };

    const handleSfxRelease = () => {
        soundManager.playSFX('click');
    };

    return (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 9999 }}>
            <div className="modal-content animate-slide-up" style={{ width: 320, padding: 24, textAlign: 'center' }}>
                <h3 style={{ margin: '0 0 20px', color: 'var(--gold)', fontSize: 18 }}>🔊 音量設定</h3>

                {/* Mute Toggle */}
                <div style={{ marginBottom: 24 }}>
                    <button onClick={handleMuteToggle} className="btn-primary" style={{ width: '100%', background: settings.isMuted ? 'var(--bg-elevated)' : 'var(--teal)', borderColor: settings.isMuted ? '#444' : 'var(--teal)' }}>
                        {settings.isMuted ? '🔇 ミュート中 (Click to Unmute)' : '🔊 音声 ON'}
                    </button>
                </div>

                {/* BGM Slider */}
                <div style={{ marginBottom: 20, textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--text-dim)' }}>
                        <span>🎼 BGM</span>
                        <span>{Math.round(settings.bgmVolume * 100)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0" max="1" step="0.01"
                        value={settings.bgmVolume}
                        onChange={handleBgmChange}
                        disabled={settings.isMuted}
                        style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--gold)' }}
                    />
                </div>

                {/* SFX Slider */}
                <div style={{ marginBottom: 24, textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--text-dim)' }}>
                        <span>🔔 効果音</span>
                        <span>{Math.round(settings.sfxVolume * 100)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0" max="1" step="0.01"
                        value={settings.sfxVolume}
                        onChange={handleSfxChange}
                        onMouseUp={handleSfxRelease}
                        onTouchEnd={handleSfxRelease}
                        disabled={settings.isMuted}
                        style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--teal)' }}
                    />
                </div>


                <button onClick={() => { soundManager.playSFX('click'); onClose(); }} className="btn-ghost" style={{ width: '100%' }}>
                    完了
                </button>
            </div>
        </div>
    );
}
