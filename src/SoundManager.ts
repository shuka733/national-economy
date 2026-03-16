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
        // --- オリジナルBGM ---
        { id: 'relax', name: 'Relaxing (Default)', src: `${BASE}audio/bgm_relax.mp3`, category: 'オリジナル' },
        { id: 'fast', name: 'Fast Paced', src: `${BASE}audio/bgm_fast.mp3`, category: 'オリジナル' },
        { id: 'upbeat', name: 'Upbeat', src: `${BASE}audio/bgm_upbeat.mp3`, category: 'オリジナル' },
        { id: 'jazz', name: 'Jazz Lounge', src: `${BASE}audio/bgm_jazz.mp3`, category: 'オリジナル' },
        // --- ポケモン 赤緑/FRLG ---
        { id: 'pkmn_masara', name: 'マサラタウン', src: `${BASE}audio/pokemon_bgm/tracks/01_masara_town_rgfrlg.mp3`, category: '赤緑/FRLG' },
        { id: 'pkmn_route1_rg', name: '1ばんどうろ', src: `${BASE}audio/pokemon_bgm/tracks/05_route1_rgfrlg.mp3`, category: '赤緑/FRLG' },
        { id: 'pkmn_guren', name: 'グレンタウン', src: `${BASE}audio/pokemon_bgm/tracks/11_guren_town_rgfrlg.mp3`, category: '赤緑/FRLG' },
        { id: 'pkmn_tokiwa', name: 'トキワシティ', src: `${BASE}audio/pokemon_bgm/tracks/18_tokiwa_city_rgfrlg.mp3`, category: '赤緑/FRLG' },
        { id: 'pkmn_kuchiba', name: 'クチバシティ', src: `${BASE}audio/pokemon_bgm/tracks/25_kuchiba_city_rgfrlg.mp3`, category: '赤緑/FRLG' },
        { id: 'pkmn_opening_rg', name: 'オープニング初代', src: `${BASE}audio/pokemon_bgm/tracks/32_opening_rgfrlg.mp3`, category: '赤緑/FRLG' },
        { id: 'pkmn_tamamushi', name: 'タマムシシティ', src: `${BASE}audio/pokemon_bgm/tracks/40_tamamushi_city_rgfrlg.mp3`, category: '赤緑/FRLG' },
        { id: 'pkmn_otsukimiyama', name: 'おつきみやま', src: `${BASE}audio/pokemon_bgm/tracks/47_otsukimi_yama_rgfrlg.mp3`, category: '赤緑/FRLG' },
        { id: 'pkmn_shion', name: 'シオンタウン', src: `${BASE}audio/pokemon_bgm/tracks/53_shion_town_rgfrlg.mp3`, category: '赤緑/FRLG' },
        // --- ポケモン 金銀/HGSS ---
        { id: 'pkmn_pokecen_gs', name: 'ポケモンセンター', src: `${BASE}audio/pokemon_bgm/tracks/04_pokemon_center_gshgss.mp3`, category: '金銀/HGSS' },
        { id: 'pkmn_yoshino', name: 'ヨシノシティ', src: `${BASE}audio/pokemon_bgm/tracks/10_yoshino_city_gshgss.mp3`, category: '金銀/HGSS' },
        { id: 'pkmn_enju', name: 'エンジュシティ', src: `${BASE}audio/pokemon_bgm/tracks/17_enju_city_gshgss.mp3`, category: '金銀/HGSS' },
        { id: 'pkmn_naminori_gs', name: 'なみのり', src: `${BASE}audio/pokemon_bgm/tracks/24_naminori_gshgss.mp3`, category: '金銀/HGSS' },
        { id: 'pkmn_kikyou', name: 'キキョウシティ', src: `${BASE}audio/pokemon_bgm/tracks/31_kikyou_city_gshgss.mp3`, category: '金銀/HGSS' },
        { id: 'pkmn_kogane', name: 'コガネシティ', src: `${BASE}audio/pokemon_bgm/tracks/39_kogane_city_gshgss.mp3`, category: '金銀/HGSS' },
        { id: 'pkmn_ending_gs', name: 'エンディング', src: `${BASE}audio/pokemon_bgm/tracks/46_ending_gshgss.mp3`, category: '金銀/HGSS' },
        { id: 'pkmn_route26', name: '26番道路', src: `${BASE}audio/pokemon_bgm/tracks/52_route26_gshgss.mp3`, category: '金銀/HGSS' },
        { id: 'pkmn_kikyou2', name: 'キキョウシティ (2)', src: `${BASE}audio/pokemon_bgm/tracks/59_kikyou_city2_gshgss.mp3`, category: '金銀/HGSS' },
        { id: 'pkmn_hiwada', name: 'ヒワダタウン', src: `${BASE}audio/pokemon_bgm/tracks/63_hiwada_town_gshgss.mp3`, category: '金銀/HGSS' },
        { id: 'pkmn_wakaba', name: 'ワカバタウン', src: `${BASE}audio/pokemon_bgm/tracks/67_wakaba_town_gshgss.mp3`, category: '金銀/HGSS' },
        // --- ポケモン RSE/ORAS ---
        { id: 'pkmn_fuen', name: 'フエンタウン', src: `${BASE}audio/pokemon_bgm/tracks/03_fuen_town_rseoras.mp3`, category: 'RSE/ORAS' },
        { id: 'pkmn_naminori_rse', name: 'なみのり', src: `${BASE}audio/pokemon_bgm/tracks/09_naminori_rseoras.mp3`, category: 'RSE/ORAS' },
        { id: 'pkmn_kanazumi', name: 'カナズミシティ', src: `${BASE}audio/pokemon_bgm/tracks/16_kanazumi_city_rseoras.mp3`, category: 'RSE/ORAS' },
        { id: 'pkmn_mishiro', name: 'ミシロタウン', src: `${BASE}audio/pokemon_bgm/tracks/23_mishiro_town_rseoras.mp3`, category: 'RSE/ORAS' },
        { id: 'pkmn_kaina', name: 'カイナシティ', src: `${BASE}audio/pokemon_bgm/tracks/30_kaina_city_rseoras.mp3`, category: 'RSE/ORAS' },
        { id: 'pkmn_hiwamaki', name: 'ヒワマキシティ', src: `${BASE}audio/pokemon_bgm/tracks/38_hiwamaki_city_rseoras.mp3`, category: 'RSE/ORAS' },
        { id: 'pkmn_touka', name: 'トウカシティ', src: `${BASE}audio/pokemon_bgm/tracks/45_touka_city_rseoras.mp3`, category: 'RSE/ORAS' },
        { id: 'pkmn_route101', name: '101ばんどうろ', src: `${BASE}audio/pokemon_bgm/tracks/58_route101_rseoras.mp3`, category: 'RSE/ORAS' },
        { id: 'pkmn_touka2', name: 'トウカシティ (2)', src: `${BASE}audio/pokemon_bgm/tracks/62_touka_city2_rseoras.mp3`, category: 'RSE/ORAS' },
        { id: 'pkmn_mishiro2', name: 'ミシロタウン (2)', src: `${BASE}audio/pokemon_bgm/tracks/66_mishiro_town2_rseoras.mp3`, category: 'RSE/ORAS' },
        { id: 'pkmn_muro', name: 'ムロタウン', src: `${BASE}audio/pokemon_bgm/tracks/71_muro_town_rseoras.mp3`, category: 'RSE/ORAS' },
        // --- ポケモン DP/BDSP ---
        { id: 'pkmn_route209', name: '209ばんどうろ', src: `${BASE}audio/pokemon_bgm/tracks/02_route209_dpbdsp.mp3`, category: 'DP/BDSP' },
        { id: 'pkmn_kotobuki', name: 'コトブキシティ', src: `${BASE}audio/pokemon_bgm/tracks/08_kotobuki_city_dpbdsp.mp3`, category: 'DP/BDSP' },
        { id: 'pkmn_mio', name: 'ミオシティ', src: `${BASE}audio/pokemon_bgm/tracks/15_mio_city_dpbdsp.mp3`, category: 'DP/BDSP' },
        { id: 'pkmn_nagisa', name: 'ナギサシティ', src: `${BASE}audio/pokemon_bgm/tracks/22_nagisa_city_dpbdsp.mp3`, category: 'DP/BDSP' },
        { id: 'pkmn_futaba', name: 'フタバタウン', src: `${BASE}audio/pokemon_bgm/tracks/29_futaba_town_dpbdsp.mp3`, category: 'DP/BDSP' },
        { id: 'pkmn_route201', name: '201ばんどうろ', src: `${BASE}audio/pokemon_bgm/tracks/37_route201_dpbdsp.mp3`, category: 'DP/BDSP' },
        { id: 'pkmn_friendly_shop', name: 'フレンドリィショップ', src: `${BASE}audio/pokemon_bgm/tracks/44_friendly_shop_dpbdsp.mp3`, category: 'DP/BDSP' },
        { id: 'pkmn_opening_dp', name: 'オープニング', src: `${BASE}audio/pokemon_bgm/tracks/57_opening_dpbdsp.mp3`, category: 'DP/BDSP' },
        { id: 'pkmn_jitensha_dp', name: 'じてんしゃ', src: `${BASE}audio/pokemon_bgm/tracks/61_jitensha_dpbdsp.mp3`, category: 'DP/BDSP' },
        { id: 'pkmn_mizuumi', name: 'みずうみ', src: `${BASE}audio/pokemon_bgm/tracks/65_mizuumi_dpbdsp.mp3`, category: 'DP/BDSP' },
        { id: 'pkmn_hakutai', name: 'ハクタイシティ', src: `${BASE}audio/pokemon_bgm/tracks/70_hakutai_city_dpbdsp.mp3`, category: 'DP/BDSP' },
        { id: 'pkmn_masago', name: 'マサゴタウン', src: `${BASE}audio/pokemon_bgm/tracks/73_masago_town_dpbdsp.mp3`, category: 'DP/BDSP' },
        // --- ポケモン BW ---
        { id: 'pkmn_raimon', name: 'ライモンシティ', src: `${BASE}audio/pokemon_bgm/tracks/06_raimon_city_bw.mp3`, category: 'BW' },
        { id: 'pkmn_skyarrow', name: 'スカイアローブリッジ', src: `${BASE}audio/pokemon_bgm/tracks/07_sky_arrow_bridge_bw.mp3`, category: 'BW' },
        { id: 'pkmn_hiun', name: 'ヒウンシティ', src: `${BASE}audio/pokemon_bgm/tracks/12_hiun_city_bw.mp3`, category: 'BW' },
        { id: 'pkmn_kagome', name: 'カゴメタウン', src: `${BASE}audio/pokemon_bgm/tracks/13_kagome_town_bw.mp3`, category: 'BW' },
        { id: 'pkmn_marine_tube', name: 'マリンチューブ', src: `${BASE}audio/pokemon_bgm/tracks/14_marine_tube_bw.mp3`, category: 'BW' },
        { id: 'pkmn_sazanami', name: 'サザナミタウン', src: `${BASE}audio/pokemon_bgm/tracks/19_sazanami_town_bw.mp3`, category: 'BW' },
        { id: 'pkmn_sayonara', name: 'サヨナラ', src: `${BASE}audio/pokemon_bgm/tracks/20_sayonara_bw.mp3`, category: 'BW' },
        { id: 'pkmn_hiougi', name: 'ヒオウギシティ', src: `${BASE}audio/pokemon_bgm/tracks/21_hiougi_city_bw.mp3`, category: 'BW' },
        { id: 'pkmn_kanoko', name: 'カノコタウン', src: `${BASE}audio/pokemon_bgm/tracks/26_kanoko_town_bw.mp3`, category: 'BW' },
        { id: 'pkmn_yume_no_ato', name: '夢の跡地', src: `${BASE}audio/pokemon_bgm/tracks/27_yume_no_ato_bw.mp3`, category: 'BW' },
        { id: 'pkmn_jitensha_bw', name: 'じてんしゃ', src: `${BASE}audio/pokemon_bgm/tracks/28_jitensha_bw.mp3`, category: 'BW' },
        { id: 'pkmn_route10', name: '10ばんどうろ', src: `${BASE}audio/pokemon_bgm/tracks/33_route10_bw.mp3`, category: 'BW' },
        { id: 'pkmn_route12', name: '12ばんどうろ', src: `${BASE}audio/pokemon_bgm/tracks/34_route12_bw.mp3`, category: 'BW' },
        { id: 'pkmn_route1_bw', name: '1ばんどうろ', src: `${BASE}audio/pokemon_bgm/tracks/35_route1_bw.mp3`, category: 'BW' },
        { id: 'pkmn_route2_bw', name: '2ばんどうろ', src: `${BASE}audio/pokemon_bgm/tracks/36_route2_bw.mp3`, category: 'BW' },
        { id: 'pkmn_route6', name: '6ばんどうろ', src: `${BASE}audio/pokemon_bgm/tracks/41_route6_bw.mp3`, category: 'BW' },
        { id: 'pkmn_n_room', name: 'Nの部屋', src: `${BASE}audio/pokemon_bgm/tracks/42_n_room_bw.mp3`, category: 'BW' },
        { id: 'pkmn_inishie', name: 'いにしえのうた', src: `${BASE}audio/pokemon_bgm/tracks/43_inishie_no_uta_bw.mp3`, category: 'BW' },
        { id: 'pkmn_shippou', name: 'シッポウシティ', src: `${BASE}audio/pokemon_bgm/tracks/48_shippou_city_bw.mp3`, category: 'BW' },
        { id: 'pkmn_ryuurasen', name: 'リュウラセンの塔', src: `${BASE}audio/pokemon_bgm/tracks/49_ryuurasen_tower_bw.mp3`, category: 'BW' },
        { id: 'pkmn_yuruganu', name: '揺れぬ想い', src: `${BASE}audio/pokemon_bgm/tracks/50_yuruganu_omoi_bw.mp3`, category: 'BW' },
        { id: 'pkmn_kanawa', name: 'カナワタウン', src: `${BASE}audio/pokemon_bgm/tracks/51_kanawa_town_bw.mp3`, category: 'BW' },
        { id: 'pkmn_karakusa', name: 'カラクサタウン', src: `${BASE}audio/pokemon_bgm/tracks/54_karakusa_town_bw.mp3`, category: 'BW' },
        { id: 'pkmn_sangi', name: 'サンギタウン', src: `${BASE}audio/pokemon_bgm/tracks/55_sangi_town_bw.mp3`, category: 'BW' },
        { id: 'pkmn_souryuu', name: 'ソウリュウシティ (White)', src: `${BASE}audio/pokemon_bgm/tracks/56_souryuu_city_white_bw.mp3`, category: 'BW' },
        { id: 'pkmn_tachiwaki', name: 'タチワキシティ', src: `${BASE}audio/pokemon_bgm/tracks/60_tachiwaki_city_bw.mp3`, category: 'BW' },
        { id: 'pkmn_fukiyose', name: 'フキヨセシティ', src: `${BASE}audio/pokemon_bgm/tracks/64_fukiyose_city_bw.mp3`, category: 'BW' },
        { id: 'pkmn_pokemon_lab', name: 'ポケモン研究所', src: `${BASE}audio/pokemon_bgm/tracks/68_pokemon_lab_bw.mp3`, category: 'BW' },
        { id: 'pkmn_hodomoe', name: 'ホドモエシティ', src: `${BASE}audio/pokemon_bgm/tracks/69_hodomoe_city_bw.mp3`, category: 'BW' },
        { id: 'pkmn_kodai', name: '古代の城', src: `${BASE}audio/pokemon_bgm/tracks/72_kodai_no_shiro_bw.mp3`, category: 'BW' },
    ];

    private currentBgmIndex: number = 0; // Default to relax

    /** BGM変更時のコールバック（UIの曲名表示更新用） */
    private onTrackChangeCallbacks: ((index: number) => void)[] = [];

    /** BGM変更通知の登録 */
    onTrackChange(cb: (index: number) => void) {
        this.onTrackChangeCallbacks.push(cb);
        return () => {
            this.onTrackChangeCallbacks = this.onTrackChangeCallbacks.filter(c => c !== cb);
        };
    }

    /** トラック変更を通知 */
    private notifyTrackChange(index: number) {
        this.onTrackChangeCallbacks.forEach(cb => cb(index));
    }

    /** ポケモンBGMかどうか判定 */
    private isPokemonTrack(index: number): boolean {
        return this.bgmTracks[index]?.id.startsWith('pkmn_') ?? false;
    }

    /** 同じカテゴリの次のトラックインデックスを取得 */
    private getNextTrackInCategory(currentIndex: number): number {
        const currentTrack = this.bgmTracks[currentIndex];
        if (!currentTrack) return currentIndex;

        const category = currentTrack.category;
        // 同カテゴリのトラックのインデックスを収集
        const categoryIndices = this.bgmTracks
            .map((t, i) => ({ track: t, index: i }))
            .filter(item => item.track.category === category)
            .map(item => item.index);

        // 現在位置の次を探す。最後なら先頭に戻る
        const pos = categoryIndices.indexOf(currentIndex);
        const nextPos = (pos + 1) % categoryIndices.length;
        return categoryIndices[nextPos];
    }

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

        const isPokemon = this.isPokemonTrack(this.currentBgmIndex);

        this.bgm = new Audio(src);
        // オリジナルBGM: ループ再生 / ポケモンBGM: 曲終了で次曲へ
        this.bgm.loop = !isPokemon;

        if (isPokemon) {
            // ポケモン曲が終わったら同カテゴリの次の曲へ自動遷移
            this.bgm.addEventListener('ended', () => {
                const nextIndex = this.getNextTrackInCategory(this.currentBgmIndex);
                this.currentBgmIndex = nextIndex;
                this.notifyTrackChange(nextIndex);
                this.playBGM(nextIndex);
            });
        }

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
