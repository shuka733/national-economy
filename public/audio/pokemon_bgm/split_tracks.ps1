# ポケモンBGMコンピレーションを個別トラックに分割するスクリプト
$ffmpeg = 'C:\Users\rrr20\AppData\Local\Microsoft\WinGet\Packages\yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-N-123074-g4e32fb4c2a-win64-gpl\bin\ffmpeg.exe'
$inputFile = 'C:\Users\rrr20\Documents\kaihatu\national-economy\public\audio\pokemon_bgm\full_audio.mp3'
$outDir = 'C:\Users\rrr20\Documents\kaihatu\national-economy\public\audio\pokemon_bgm\tracks'

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# タイムスタンプと曲名のリスト [開始時間, ファイル名]
$tracks = @(
    @("00:00:00", "01_masara_town_rgfrlg"),
    @("00:01:39", "02_route209_dpbdsp"),
    @("00:04:18", "03_fuen_town_rseoras"),
    @("00:07:30", "04_pokemon_center_gshgss"),
    @("00:09:08", "05_route1_rgfrlg"),
    @("00:10:58", "06_raimon_city_bw"),
    @("00:13:30", "07_sky_arrow_bridge_bw"),
    @("00:15:12", "08_kotobuki_city_dpbdsp"),
    @("00:19:21", "09_naminori_rseoras"),
    @("00:22:47", "10_yoshino_city_gshgss"),
    @("00:24:56", "11_guren_town_rgfrlg"),
    @("00:26:38", "12_hiun_city_bw"),
    @("00:29:03", "13_kagome_town_bw"),
    @("00:31:01", "14_marine_tube_bw"),
    @("00:33:17", "15_mio_city_dpbdsp"),
    @("00:36:11", "16_kanazumi_city_rseoras"),
    @("00:39:26", "17_enju_city_gshgss"),
    @("00:42:08", "18_tokiwa_city_rgfrlg"),
    @("00:45:20", "19_sazanami_town_bw"),
    @("00:47:35", "20_sayonara_bw"),
    @("00:49:18", "21_hiougi_city_bw"),
    @("00:52:10", "22_nagisa_city_dpbdsp"),
    @("00:54:28", "23_mishiro_town_rseoras"),
    @("00:56:37", "24_naminori_gshgss"),
    @("01:00:40", "25_kuchiba_city_rgfrlg"),
    @("01:03:18", "26_kanoko_town_bw"),
    @("01:04:46", "27_yume_no_ato_bw"),
    @("01:08:21", "28_jitensha_bw"),
    @("01:10:27", "29_futaba_town_dpbdsp"),
    @("01:12:57", "30_kaina_city_rseoras"),
    @("01:15:21", "31_kikyou_city_gshgss"),
    @("01:18:00", "32_opening_rgfrlg"),
    @("01:20:12", "33_route10_bw"),
    @("01:23:14", "34_route12_bw"),
    @("01:25:03", "35_route1_bw"),
    @("01:26:36", "36_route2_bw"),
    @("01:28:42", "37_route201_dpbdsp"),
    @("01:30:48", "38_hiwamaki_city_rseoras"),
    @("01:32:31", "39_kogane_city_gshgss"),
    @("01:35:43", "40_tamamushi_city_rgfrlg"),
    @("01:37:25", "41_route6_bw"),
    @("01:39:20", "42_n_room_bw"),
    @("01:40:09", "43_inishie_no_uta_bw"),
    @("01:41:59", "44_friendly_shop_dpbdsp"),
    @("01:44:08", "45_touka_city_rseoras"),
    @("01:46:14", "46_ending_gshgss"),
    @("01:49:25", "47_otsukimi_yama_rgfrlg"),
    @("01:51:04", "48_shippou_city_bw"),
    @("01:53:08", "49_ryuurasen_tower_bw"),
    @("01:55:07", "50_yuruganu_omoi_bw"),
    @("01:56:54", "51_kanawa_town_bw"),
    @("01:59:24", "52_route26_gshgss"),
    @("02:01:55", "53_shion_town_rgfrlg"),
    @("02:03:19", "54_karakusa_town_bw"),
    @("02:04:55", "55_sangi_town_bw"),
    @("02:06:32", "56_souryuu_city_white_bw"),
    @("02:09:53", "57_opening_dpbdsp"),
    @("02:12:22", "58_route101_rseoras"),
    @("02:15:35", "59_kikyou_city2_gshgss"),
    @("02:18:14", "60_tachiwaki_city_bw"),
    @("02:19:57", "61_jitensha_dpbdsp"),
    @("02:22:16", "62_touka_city2_rseoras"),
    @("02:24:22", "63_hiwada_town_gshgss"),
    @("02:26:52", "64_fukiyose_city_bw"),
    @("02:30:48", "65_mizuumi_dpbdsp"),
    @("02:33:01", "66_mishiro_town2_rseoras"),
    @("02:35:10", "67_wakaba_town_gshgss"),
    @("02:37:34", "68_pokemon_lab_bw"),
    @("02:39:22", "69_hodomoe_city_bw"),
    @("02:41:38", "70_hakutai_city_dpbdsp"),
    @("02:44:10", "71_muro_town_rseoras"),
    @("02:46:52", "72_kodai_no_shiro_bw"),
    @("02:49:16", "73_masago_town_dpbdsp")
)

$total = $tracks.Count
for ($i = 0; $i -lt $total; $i++) {
    $start = $tracks[$i][0]
    $name = $tracks[$i][1]
    $outFile = Join-Path $outDir "$name.mp3"

    # 最後のトラック以外は次のトラックの開始時間まで
    if ($i -lt $total - 1) {
        $end = $tracks[$i + 1][0]
        $args = @('-i', $inputFile, '-ss', $start, '-to', $end, '-acodec', 'copy', '-y', $outFile)
    } else {
        # 最後のトラックは終わりまで
        $args = @('-i', $inputFile, '-ss', $start, '-acodec', 'copy', '-y', $outFile)
    }

    Write-Host "[$($i+1)/$total] $name ..." -NoNewline
    & $ffmpeg $args 2>$null
    Write-Host " Done"
}

Write-Host "`n=== 分割完了！ $total トラック ==="
