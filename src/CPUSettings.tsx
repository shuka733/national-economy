import React, { useState } from 'react';
import { soundManager } from './SoundManager';

export function CPUSettings({ onClose }: { onClose: () => void }) {
    const [delay, setDelay] = useState(soundManager.getSettings().cpuMoveDelay);

    const handleClose = () => {
        soundManager.setCPUMoveDelay(delay);
        soundManager.playSFX('click');
        onClose();
    };

    return (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 9999 }}>
            <div className="modal-content animate-slide-up" style={{ width: 320, padding: 24, textAlign: 'center' }}>
                <h3 style={{ margin: '0 0 20px', color: 'var(--gold)', fontSize: 'var(--fs-4xl)' }}>🤖 CPU設定</h3>

                {/* CPU Speed Slider */}
                <div style={{ marginBottom: 24, textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 'var(--fs-xl2)', color: 'var(--text-dim)' }}>
                        <span>思考スピード (遅延)</span>
                        <span>{delay}ms</span>
                    </div>
                    <input
                        type="range"
                        min="0" max="2000" step="50"
                        value={delay}
                        onChange={(e) => setDelay(parseInt(e.target.value))}
                        style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--gold-dim)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-base)', color: 'var(--text-dim)', marginTop: 2 }}>
                        <span>速 (0ms)</span>
                        <span>遅 (2000ms)</span>
                    </div>
                </div>

                <div style={{ fontSize: 'var(--fs-xl)', color: 'var(--text-dim)', marginBottom: 20, textAlign: 'left', lineHeight: 1.5 }}>
                    ※ 0msにするとCPUは即座に行動します。<br />
                    ※ 値が大きいほど、CPUが考え込むような演出になります。
                </div>

                <button onClick={handleClose} className="btn-ghost" style={{ width: '100%' }}>
                    保存して閉じる
                </button>
            </div>
        </div>
    );
}
