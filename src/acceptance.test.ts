import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/national-economy/';
const LOCAL_MENU_BUTTON = 'button.menu-item.menu-item-primary';
const ONLINE_MENU_BUTTON = 'button.menu-item.menu-item-secondary';
const ROUND_LABEL = 'div.household-meta-label:has-text("ROUND")';
const LOG_TOGGLE_BUTTON = 'button.log-toggle-button';

async function openLocalSetup(page: Page): Promise<void> {
    await page.goto(BASE_URL);
    await page.locator(LOCAL_MENU_BUTTON).click();
    await expect(page.locator('button:has-text("2")').first()).toBeVisible();
}

async function startDefaultLocalGame(page: Page): Promise<void> {
    await openLocalSetup(page);
    await page.locator('text=ゲーム開始').click();
    await expect(page.locator('.game-layout')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.public-top-bar')).toBeVisible({ timeout: 10000 });
    await expect(page.locator(LOG_TOGGLE_BUTTON)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.area-opponents .inline-log')).toHaveCount(0);
}

test('① タイトル画面が正しく表示される', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('text=National Economy')).toBeVisible();
    await expect(page.locator(LOCAL_MENU_BUTTON)).toBeVisible();
    await expect(page.locator(LOCAL_MENU_BUTTON)).toContainText('ローカル対戦');
    await expect(page.locator(ONLINE_MENU_BUTTON)).toBeVisible();
    await expect(page.locator(ONLINE_MENU_BUTTON)).toContainText('オンライン対戦');
});

test('② ローカル対戦ボタンを押すと設定画面に移動する', async ({ page }) => {
    await openLocalSetup(page);

    await expect(page.locator('button:has-text("2")').first()).toBeVisible();
    await expect(page.locator('button:has-text("3")').first()).toBeVisible();
    await expect(page.locator('button:has-text("4")').first()).toBeVisible();
    await expect(page.locator('text=Basic')).toBeVisible();
    await expect(page.locator('text=Glory')).toBeVisible();
});

test('③ ゲームを開始するとゲーム画面が表示される', async ({ page }) => {
    await startDefaultLocalGame(page);
    await expect(page.locator(ROUND_LABEL).first()).toBeVisible({ timeout: 10000 });
});

test('④ ゲーム画面に公共職場が表示される', async ({ page }) => {
    await startDefaultLocalGame(page);
    await expect(page.locator(ROUND_LABEL).first()).toBeVisible({ timeout: 10000 });

    const buttons = page.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
});

test('⑤ 設定画面から「メニューに戻る」でトップに戻る', async ({ page }) => {
    await openLocalSetup(page);
    await page.locator('text=メニューに戻る').click();

    await expect(page.locator('text=National Economy')).toBeVisible();
    await expect(page.locator(LOCAL_MENU_BUTTON)).toBeVisible();
    await expect(page.locator(LOCAL_MENU_BUTTON)).toContainText('ローカル対戦');
});

test('⑥ CPU全員プレイで最後まで進んでゲーム終了画面が表示される', async ({ page }) => {
    test.setTimeout(300000);

    await openLocalSetup(page);

    const speedSlider = page.locator('input[type="range"]');
    if (await speedSlider.count() > 0) {
        await speedSlider.first().evaluate((el: HTMLInputElement) => {
            el.value = '0';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    await page.locator('text=ゲーム開始').click();
    await expect(page.locator(ROUND_LABEL).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=ゲーム終了！')).toBeVisible({ timeout: 300000 });
    await expect(page.locator('text=P1')).toBeVisible();

    const pageText = await page.textContent('body');
    expect(pageText).toMatch(/\d+VP/);
});

test('⑦ worker drag ghost matches worker token size', async ({ page }) => {
    await startDefaultLocalGame(page);

    await page.addStyleTag({
        content: '.worker-token{animation:none !important;transform:none !important;}',
    });

    const worker = page.locator('.worker-token.draggable').first();
    await expect(worker).toBeVisible({ timeout: 10000 });
    const workerBox = await worker.boundingBox();
    expect(workerBox).not.toBeNull();
    if (!workerBox) return;

    await page.mouse.move(workerBox.x + workerBox.width / 2, workerBox.y + workerBox.height / 2);
    await page.mouse.down();

    const ghost = page.locator('.worker-drag-ghost');
    await expect(ghost).toBeVisible({ timeout: 10000 });
    const ghostBox = await ghost.boundingBox();
    expect(ghostBox).not.toBeNull();
    if (!ghostBox) return;

    expect(Math.abs(ghostBox.width - workerBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(ghostBox.height - workerBox.height)).toBeLessThanOrEqual(1);

    await page.mouse.up();
});

test('@tablet tablet touch ui is applied on iPad landscape', async ({ page }) => {
    await startDefaultLocalGame(page);

    const boardRoot = page.locator('.game-layout.mobile-touch-ui');
    await expect(boardRoot).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.public-top-bar')).toBeVisible({ timeout: 10000 });
    await expect(page.locator(LOG_TOGGLE_BUTTON)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.area-opponents .inline-log')).toHaveCount(0);
    await expect(page.locator(ROUND_LABEL).first()).toBeVisible({ timeout: 10000 });

    const hasHorizontalOverflow = await page.evaluate(() => {
        const root = document.scrollingElement ?? document.documentElement;
        return (root.scrollWidth - window.innerWidth) > 16;
    });
    expect(hasHorizontalOverflow).toBe(false);
});

test('@phone phone touch ui is applied on iPhone 12', async ({ page }) => {
    await startDefaultLocalGame(page);

    const boardRoot = page.locator('.game-layout.mobile-touch-ui');
    await expect(boardRoot).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.public-top-bar')).toBeVisible({ timeout: 10000 });
    await expect(page.locator(LOG_TOGGLE_BUTTON)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.area-opponents .inline-log')).toHaveCount(0);
    await expect(page.locator(ROUND_LABEL).first()).toBeVisible({ timeout: 10000 });

    const opponentScrollTouchAction = await page.locator('.opponent-buildings-scroll').first().evaluate((el) => getComputedStyle(el).touchAction);
    expect(opponentScrollTouchAction).toContain('pan-x');

    const myBuildingsStyles = await page.locator('.my-buildings-scroll').evaluate((el) => {
        const scrollTouchAction = getComputedStyle(el).touchAction;
        const overflowX = getComputedStyle(el).overflowX;
        const probe = document.createElement('div');
        probe.className = 'hand-card building-card-in-field';
        el.appendChild(probe);
        const cardTouchAction = getComputedStyle(probe).touchAction;
        probe.remove();
        return { scrollTouchAction, overflowX, cardTouchAction };
    });
    expect(myBuildingsStyles.scrollTouchAction).toContain('pan-x');
    expect(myBuildingsStyles.overflowX).toBe('auto');
    expect(myBuildingsStyles.cardTouchAction).toContain('pan-x');

    const hasHorizontalOverflow = await page.evaluate(() => {
        const root = document.scrollingElement ?? document.documentElement;
        return (root.scrollWidth - window.innerWidth) > 16;
    });
    expect(hasHorizontalOverflow).toBe(false);
});
