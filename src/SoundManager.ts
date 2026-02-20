// ============================================================
// SoundManager.ts  –  音声管理ユーティリティ
// ============================================================

/** Viteのベースパスを取得（GitHub Pages対応） */
const BASE = import.meta.env.BASE_URL || '/';

/** 効果音の種類 */
export type SFXType =
    'click' | 'place' | 'build' | 'payday' | 'win' | 'discard' |
    'draw' | 'coin_get' | 'coin_pay' | 'marker' | 'error' | 'cancel' |
    'round_start' | 'sell' | 'debt' | 'build_heavy' | 'click_heavy';

class SoundManager {
    private bgm: HTMLAudioElement | null = null;
    private sfxVolume: number = 0.5;
    private bgmVolume: number = 0.12;
    private cpuMoveDelay: number = 500; // デフォルト 0.5秒
    private isMuted: boolean = false;

    constructor() {
        // LocalStorageから設定をロード
        const savedMute = localStorage.getItem('ne_muted');
        if (savedMute !== null) this.isMuted = savedMute === 'true';

        const savedSfxVol = localStorage.getItem('ne_sfx_vol');
        if (savedSfxVol !== null) this.sfxVolume = parseFloat(savedSfxVol);

        const savedBgmVol = localStorage.getItem('ne_bgm_vol');
        if (savedBgmVol !== null) this.bgmVolume = parseFloat(savedBgmVol);

        const savedCpuDelay = localStorage.getItem('ne_cpu_delay');
        if (savedCpuDelay !== null) this.cpuMoveDelay = parseInt(savedCpuDelay);
    }

    /** BGMトラック定義 */
    public readonly bgmTracks = [
        { id: 'relax', name: 'Relaxing (Default)', src: `${BASE}audio/bgm_relax.mp3` },
        { id: 'fast', name: 'Fast Paced', src: `${BASE}audio/bgm_fast.mp3` },
        { id: 'upbeat', name: 'Upbeat', src: `${BASE}audio/bgm_upbeat.mp3` },
        { id: 'jazz', name: 'Jazz Lounge', src: `${BASE}audio/bgm_jazz.mp3` },
    ];

    private currentBgmIndex: number = 0; // Default to relax

    /** BGMの再生開始 */
    playBGM(index?: number) {
        if (index !== undefined) {
            this.currentBgmIndex = index;
        }

        const track = this.bgmTracks[this.currentBgmIndex];
        const src = track.src;

        if (this.bgm) {
            // 同じ曲なら再開しない（ループ継続）
            if (this.bgm.src.endsWith(src) && !this.bgm.paused) return;
            this.bgm.pause();
        }

        this.bgm = new Audio(src);
        this.bgm.loop = true;

        // 音量が0のときはplayしない（ブラウザポリシー対策）
        if (!this.isMuted && this.bgmVolume > 0) {
            this.bgm.volume = this.bgmVolume;
            this.bgm.play().catch(e => console.log('BGM autoplay blocked:', e));
        }
    }

    /** ランダムにBGMを再生 */
    playRandomBGM() {
        const idx = Math.floor(Math.random() * this.bgmTracks.length);
        this.playBGM(idx);
        return idx;
    }

    /** 現在のBGMインデックスを取得 */
    getCurrentBGMIndex() {
        return this.currentBgmIndex;
    }

    /** 効果音の再生 */
    playSFX(type: SFXType) {
        if (this.isMuted) return;

        // パスを決定（Viteのベースパスを使用）
        const src = `${BASE}audio/sfx_${type}.mp3`;
        const audio = new Audio(src);
        audio.volume = this.sfxVolume;
        audio.play().catch(e => {
            // ファイルがない場合はエラーを無視（またはシンセサイザー音で代用）
            // console.warn(`SFX file not found: ${src}`);
            this.playFallbackBeep(type);
        });
    }

    /** 音声ファイルがない場合の仮の音（Web Audio API） */
    private playFallbackBeep(type: SFXType) {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            let freq = 440;
            let duration = 0.1;

            switch (type) {
                case 'click': freq = 880; duration = 0.05; break;
                case 'place': freq = 330; duration = 0.15; break;
                case 'build': freq = 220; duration = 0.3; break;
                case 'payday': freq = 660; duration = 0.2; break;
                case 'win': freq = 554; duration = 0.5; break;
                case 'discard': freq = 110; duration = 0.1; break;

                // 新しいSEのフォールバック
                case 'draw': freq = 1200; duration = 0.05; break;
                case 'coin_get': freq = 1500; duration = 0.1; break; // 高音
                case 'coin_pay': freq = 1000; duration = 0.2; break; // 少し低い
                case 'marker': freq = 400; duration = 0.05; break; // コツン
                case 'error': freq = 150; duration = 0.3; break; // ブッ
                case 'cancel': freq = 600; duration = 0.05; break; // ピッ
                case 'round_start': freq = 440; duration = 0.5; break; // ピー
                case 'sell': freq = 1200; duration = 0.3; break; // レジ
                case 'debt': freq = 100; duration = 0.5; break; // ガーン
                case 'build_heavy': freq = 180; duration = 0.8; break; // 重い音
                case 'click_heavy': freq = 700; duration = 0.1; break;
            }

            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(this.sfxVolume * 0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch (e) {
            // AudioContextも使えない場合は諦める
        }
    }

    /** ミュート切り替え */
    toggleMute(): boolean {
        this.isMuted = !this.isMuted;
        localStorage.setItem('ne_muted', String(this.isMuted));

        if (this.bgm) {
            this.bgm.volume = this.isMuted ? 0 : this.bgmVolume;
        }
        return this.isMuted;
    }

    /** ボリューム変更 */
    setVolumes(bgm: number, sfx: number) {
        this.bgmVolume = bgm;
        this.sfxVolume = sfx;
        localStorage.setItem('ne_bgm_vol', String(bgm));
        localStorage.setItem('ne_sfx_vol', String(sfx));

        if (this.bgm) {
            this.bgm.volume = this.isMuted ? 0 : this.bgmVolume;
        }
    }

    /** CPU思考遅延の設定 */
    setCPUMoveDelay(ms: number) {
        this.cpuMoveDelay = ms;
        localStorage.setItem('ne_cpu_delay', String(ms));
    }

    getSettings() {
        return {
            isMuted: this.isMuted,
            bgmVolume: this.bgmVolume,
            sfxVolume: this.sfxVolume,
            cpuMoveDelay: this.cpuMoveDelay
        };
    }
}

export const soundManager = new SoundManager();
