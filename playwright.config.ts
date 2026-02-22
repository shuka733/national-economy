import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './src',
    testMatch: /acceptance\.test\.ts$/,
    /* ヘッドレス（画面なし）で高速実行 */
    use: {
        headless: true,
        baseURL: 'http://localhost:5173/national-economy/',
        /* スクリーンショットは失敗時のみ保存 */
        screenshot: 'only-on-failure',
        /* タイムアウト5秒 */
        actionTimeout: 5000,
    },
    /* テスト全体のタイムアウト60秒 */
    timeout: 60000,
    /* 開発サーバーを自動起動 */
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173/national-economy/',
        reuseExistingServer: true, // 既に起動中なら再利用
        timeout: 30000,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    /* テスト結果レポート */
    reporter: [['list']],
});
