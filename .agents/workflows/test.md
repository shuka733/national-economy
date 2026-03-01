---
description: テストを実行する（単体・結合・システム・受け入れ）
---

## テスト実行手順

// turbo-all

1. 単体テスト（①）を実行する
```
cmd.exe /c "npx vitest run src/unit.test.ts 2>&1"
```
作業ディレクトリ: `c:\Users\rrr20\Documents\kaihatu\national-economy`

2. 結合テスト（②）を実行する
```
cmd.exe /c "npx vitest run src/integration.test.ts 2>&1"
```
作業ディレクトリ: `c:\Users\rrr20\Documents\kaihatu\national-economy`

3. システムテスト（③・CPUシミュレーション200ゲーム）を実行する
   ※時間がかかります（最大120秒）。必要なときだけ実行してください。
```
cmd.exe /c "npx vitest run src/batch-test.test.ts 2>&1"
```
作業ディレクトリ: `c:\Users\rrr20\Documents\kaihatu\national-economy`

4. 受け入れテスト（④・Playwrightブラウザ自動操作）を実行する
   ※開発サーバーは自動起動されます
```
cmd.exe /c "npx playwright test --config=playwright.config.ts 2>&1"
```
作業ディレクトリ: `c:\Users\rrr20\Documents\kaihatu\national-economy`

5. 実行結果をユーザーに報告する
   - ✅ 全テストパスなら「全テストグリーン！」と報告
   - ❌ 失敗があれば「どのテストが失敗したか」と「エラー内容」を日本語で報告
