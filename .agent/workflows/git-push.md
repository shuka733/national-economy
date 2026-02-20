---
description: ローカル変更をGitHubにプッシュする手順
---

# Git Push ワークフロー

ローカルの変更をGitHubリポジトリに反映し、GitHub Pagesへの自動デプロイをトリガーする手順です。

## 手順

// turbo-all

1. 変更の確認
```
git status
```

2. 全変更をステージング
```
git add -A
```

3. コミット（メッセージは適宜変更）
```
git commit -m "変更内容の要約"
```

4. GitHubにプッシュ
```
git push origin main
```

## 注意事項

- プッシュにはGitHub Personal Access Token (PAT) が必要です
- リモートURLは `https://<PAT>@github.com/shuka733/national-economy.git` 形式に設定済み
- プッシュ後、GitHub Actionsが自動でビルド＆デプロイを実行します
- デプロイ状況は https://github.com/shuka733/national-economy/actions で確認できます
