// Board.tsx内のハードコード色をCSS変数に置き換えるスクリプト
const fs = require('fs');

const file = 'c:/Users/rrr20/Documents/kaihatu/national-economy/src/Board.tsx';
let c = fs.readFileSync(file, 'utf8');
const orig = c;

// テーマ対応の置き換えテーブル
const replacements = [
    // teal系 → CSS変数（steampunkテーマでゴールドに自動切替）
    ["'rgba(45, 212, 191, 0.6)'", "'var(--teal-60)'"],
    ["'rgba(45, 212, 191, 0.4)'", "'var(--teal-40)'"],
    ["'rgba(45, 212, 191, 0.2)'", "'var(--teal-15)'"],
    ["'rgba(45, 212, 191, 0.15)'", "'var(--teal-15)'"],
    ["'rgba(45, 212, 191, 0.12)'", "'var(--teal-15)'"],
    ["rgba(45, 212, 191, 0.12)", "var(--teal-15)"],  // template literal内用
    ["rgba(45, 212, 191, 0.2)", "var(--teal-15)"],
    ["rgba(45, 212, 191, 0.4)", "var(--teal-40)"],
    ["rgba(45,212,191,0.2)", "var(--teal-15)"],
    ["rgba(45,212,191,0.25)", "var(--teal-15)"],

    // gold系 → CSS変数
    ["'rgba(212, 168, 83, 0.6)'", "'var(--gold-60)'"],
    ["'rgba(212, 168, 83, 0.4)'", "'var(--gold-40)'"],
    ["'rgba(212, 168, 83, 0.3)'", "'var(--gold-40)'"],
    ["'rgba(212, 168, 83, 0.08)'", "'var(--gold-15)'"],

    // red系 → CSS変数
    ["'rgba(248, 113, 113, 0.3)'", "'var(--red-30)'"],
    ["'rgba(248,113,113,0.3)'", "'var(--red-30)'"],
    ["'rgba(248,113,113,0.3)", "var(--red-30)"],
    ["rgba(248, 113, 113, 0.3)", "var(--red-30)"],
    ["rgba(248, 113, 113, 0.2)", "var(--red-30)"],

    // white rgba → glass-border変数
    ["'rgba(255, 255, 255, 0.12)'", "'var(--glass-border)'"],
    ["'rgba(255, 255, 255, 0.1)'", "'var(--glass-border)'"],
    ["'rgba(255, 255, 255, 0.05)'", "'var(--glass-bg)'"],
    ["rgba(255, 255, 255, 0.12)", "var(--glass-border)"],
    ["rgba(255, 255, 255, 0.1)", "var(--glass-border)"],

    // NPC手札表示時の背景色
    ["'linear-gradient(135deg, rgba(45,212,191,0.2), rgba(30,30,40,0.9))'", "'linear-gradient(135deg, var(--teal-15), var(--bg-secondary))'"],
    ["'linear-gradient(135deg, rgba(251,146,60,0.25), rgba(30,30,40,0.9))'", "'linear-gradient(135deg, rgba(251,146,60,0.25), var(--bg-secondary))'"],

    // CPU表示バッジの背景
    ["'linear-gradient(135deg, rgba(45, 212, 191, 0.12), rgba(96, 165, 250, 0.08))'", "'linear-gradient(135deg, var(--teal-15), rgba(96, 165, 250, 0.08))'"],
    ["'1px solid rgba(45, 212, 191, 0.2)'", "'1px solid var(--teal-15)'"],

    // blue系（blue枠は59,130,246やrgba(96,165,250)）
    ["rgba(96, 165, 250, 0.15)", "var(--glass-border)"],
    ["rgba(59,130,246,0.4)", "var(--teal-40)"],

    // 公共エリア枠
    ["'1px solid rgba(255, 255, 255, 0.12)'", "'1px solid var(--glass-border)'"],
];

let count = 0;
for (const [from, to] of replacements) {
    while (c.includes(from)) {
        c = c.replace(from, to);
        count++;
    }
}

if (count > 0) {
    fs.writeFileSync(file, c);
    console.log(`Done: ${count} replacements made`);
} else {
    console.log('No replacements needed');
}
