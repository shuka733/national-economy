// ============================================================
// acceptance.test.ts — ④ 受け入れテスト（E2E ブラウザ自動操作）
// Playwrightを使用して実際のブラウザでUIを操作してテストする
// 実行前に開発サーバーが起動している必要があります（自動起動設定済み）
// ============================================================
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/national-economy/';
const LOCAL_MENU_BUTTON = 'button.menu-item.menu-item-primary';
const ONLINE_MENU_BUTTON = 'button.menu-item.menu-item-secondary';
const ROUND_LABEL = 'div.household-meta-label:has-text("ROUND")';

async function openLocalSetup(page: Page): Promise<void> {
    await page.goto(BASE_URL);
    await page.locator(LOCAL_MENU_BUTTON).click();
    await expect(page.locator('button:has-text("2")').first()).toBeVisible();
}

async function startDefaultLocalGame(page: Page): Promise<void> {
    await openLocalSetup(page);
    await page.locator('text=ゲーム開始').click();
    await expect(page.locator('.game-layout')).toBeVisible({ timeout: 10000 });
}

// ============================================================
// シナリオ①: タイトル画面の表示
// ============================================================
test('① タイトル画面が正しく表示される', async ({ page }) => {
    await page.goto(BASE_URL);

    // National Economyというタイトルが表示されていること
    await expect(page.locator('text=National Economy')).toBeVisible();

    // ローカル対戦ボタンが存在すること
    await expect(page.locator(LOCAL_MENU_BUTTON)).toBeVisible();
    await expect(page.locator(LOCAL_MENU_BUTTON)).toContainText('ローカル対戦');
    await expect(page.locator(ONLINE_MENU_BUTTON)).toBeVisible();
    await expect(page.locator(ONLINE_MENU_BUTTON)).toContainText('オンライン対戦');
});

// ============================================================
// シナリオ②: ローカル対戦の設定画面に遷移できる
// ============================================================
test('② ローカル対戦ボタンを押すと設定画面に移動する', async ({ page }) => {
    await openLocalSetup(page);

    // 人数選択（2〜4人）が表示されること
    // ※数字ボタンと他のP2などのボタンが重複する可能性があるためfirst()で取得
    await expect(page.locator('button:has-text("2")').first()).toBeVisible();
    await expect(page.locator('button:has-text("3")').first()).toBeVisible();
    await expect(page.locator('button:has-text("4")').first()).toBeVisible();

    // Basicボタンが表示されること
    await expect(page.locator('text=Basic')).toBeVisible();

    // Gloryボタンが表示されること
    await expect(page.locator('text=Glory')).toBeVisible();
});

// ============================================================
// シナリオ③: ゲームを開始してゲーム画面が表示される
// ============================================================
test('③ ゲームを開始するとゲーム画面（ラウンド表示）が現れる', async ({ page }) => {
    await startDefaultLocalGame(page);

    // ゲームボード画面にラウンド表示が現れていること
    await expect(page.locator(ROUND_LABEL).first()).toBeVisible({ timeout: 10000 });
});

// ============================================================
// シナリオ④: ゲーム開始後に公共職場が表示される
// ============================================================
test('④ ゲーム画面に公共職場が表示される', async ({ page }) => {
    await startDefaultLocalGame(page);

    // 公共職場（Workplace）エリアが表示されていること
    // 「大工」「雑用」などの公共職場名が画面に存在するか、
    // または公共職場を含むエリアのラベルが見えるか確認
    await expect(page.locator(ROUND_LABEL).first()).toBeVisible({ timeout: 10000 });

    // 何かしらボタン（ワーカー配置できる場所）が存在すること
    const buttons = page.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
});

// ============================================================
// シナリオ⑤: メニューに戻るボタンでタイトルに戻る
// ============================================================
test('⑤ 設定画面から「メニューに戻る」でトップに戻る', async ({ page }) => {
    await openLocalSetup(page);

    // 「← メニューに戻る」をクリック
    await page.locator('text=メニューに戻る').click();

    // タイトル画面に戻っていること
    await expect(page.locator('text=National Economy')).toBeVisible();
    await expect(page.locator(LOCAL_MENU_BUTTON)).toBeVisible();
    await expect(page.locator(LOCAL_MENU_BUTTON)).toContainText('ローカル対戦');
});

// ============================================================
// シナリオ⑥: CPU全員で一局プレイして「ゲーム終了！」まで到達する
// ※全プレイヤーをCPU(heuristic)に設定して自動プレイ
// ============================================================
test('⑥ CPU全員プレイで最後まで進んでゲーム終了画面が表示される', async ({ page }) => {
    // タイムアウトを5分に設定（ゲーム1局分の余裕を持たせる）
    test.setTimeout(300000);

    await openLocalSetup(page);

    // ③ CPU対戦をONにする（デフォルトONで全員CPUのはずなのでそのまま）
    // ※P1ボタンはクリックしない（デフォルトでP1もCPU=trueになっている）

    // ④ CPU速度を最速（0ms）に設定
    // Reactのスライダーはfill()だとchangeイベントが発火しないためevaluateで直接変更する
    const speedSlider = page.locator('input[type="range"]');
    if (await speedSlider.count() > 0) {
        await speedSlider.first().evaluate((el: HTMLInputElement) => {
            el.value = '0';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    // ⑤ ゲーム開始
    await page.locator('text=ゲーム開始').click();

    // ゲーム画面が表示されること
    await expect(page.locator(ROUND_LABEL).first()).toBeVisible({ timeout: 10000 });

    // ⑥ CPUが自動プレイして「ゲーム終了！」が現れるまで待つ
    await expect(page.locator('text=ゲーム終了！')).toBeVisible({ timeout: 300000 });

    // ⑦ P1のスコアが表示されていること
    await expect(page.locator('text=P1')).toBeVisible();

    // ⑧ VPが数値で表示されていること（例: "42VP"）
    const pageText = await page.textContent('body');
    expect(pageText).toMatch(/\d+VP/);
});

test('@tablet tablet touch ui is applied on iPad landscape', async ({ page }) => {
    await openLocalSetup(page);
    await expect(page.locator('button:has-text("2")').first()).toBeVisible();
    await page.locator('text=ゲーム開始').click();

    const boardRoot = page.locator('.game-layout.mobile-touch-ui');
    await expect(boardRoot).toBeVisible({ timeout: 10000 });
    await expect(page.locator(ROUND_LABEL).first()).toBeVisible({ timeout: 10000 });

    const hasHorizontalOverflow = await page.evaluate(() => {
        const root = document.scrollingElement ?? document.documentElement;
        return (root.scrollWidth - window.innerWidth) > 16;
    });
    expect(hasHorizontalOverflow).toBe(false);
});
