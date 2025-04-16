# GitHub Task Monitor & Reminder

GitHub リポジトリの状況を自動的にモニタリングし、GPT-4o を活用した哲学的かつ詩的なリマインドとアクション提案を生成・通知するシステムです。GitHub Actions を使用して毎時実行され、進捗管理を効率化します。

## 機能

- **日次タスク状況 Issue の管理**: 日付ごとのタスク状況 Issue を自動的に作成・更新
- **哲学的で詩的なリマインド**: GPT-4o を活用し、現在のタスク状況を哲学的かつ詩的に要約
- **根拠に基づくアクション提案**: 収集データに基づき、次のアクションを理由・背景知識とともに提案
- **ドラフトからの子 Issue 自動生成**: 「メモ・下書き」セクションから子 Issue を自動作成（承認プロセス付き）

## 仕組み

1. **情報収集**: GitHub リポジトリから最新の Issue・PR 情報を収集
2. **AI 分析**: GPT-4o で情報を分析し、リマインドとアクション提案を生成
3. **通知**: 日次 Issue にコメントとして投稿
4. **フォローアップ**: ドラフトを検出し、承認を得て子 Issue として作成

## セットアップ方法

### GitHub Actions で使用する場合

1. このリポジトリのファイルを `.github/workflows` ディレクトリと `scripts` ディレクトリに配置
2. GitHub Secrets に `OPENAI_API_KEY` を設定（OpenAI API キー）
3. 必要に応じて、ワークフローファイル `.github/workflows/task_monitor.yml` のスケジュール設定を調整

> **注**: GitHub Actions では、`GITHUB_TOKEN` は自動的に提供されるため、通常は追加設定不要です。

### ローカルで実行する場合（開発・テスト用）

1. 依存関係をインストール:

   ```bash
   npm install
   ```

2. `.env.example` を `.env` にコピーし、必要な環境変数を設定:

   ```bash
   cp .env.example .env
   # .envファイルを編集して環境変数を設定
   ```

3. スクリプトを実行:
   ```bash
   node scripts/main.js
   ```

## カスタマイズ

- **実行スケジュール**: `.github/workflows/task_monitor.yml` の `cron` 式を編集
- **GPT モデル/温度**: 環境変数 `GPT_MODEL` と `GPT_TEMPERATURE` を設定
- **メッセージ形式**: `scripts/generate_reminder.js` のプロンプトを編集
- **Issue 形式**: `scripts/manage_issues.js` のテンプレートを編集

## 環境変数

| 変数名              | 説明                    | デフォルト               |
| ------------------- | ----------------------- | ------------------------ |
| `GITHUB_TOKEN`      | GitHub API トークン     | GitHubActions で自動提供 |
| `OPENAI_API_KEY`    | OpenAI API キー         | -                        |
| `TARGET_REPO_OWNER` | 対象リポジトリの所有者  | 現在のリポジトリ         |
| `TARGET_REPO_NAME`  | 対象リポジトリ名        | 現在のリポジトリ         |
| `GPT_MODEL`         | 使用する GPT モデル     | `gpt-4o`                 |
| `GPT_TEMPERATURE`   | 生成の多様性 (0.0〜1.0) | `0.2`                    |

## 注意事項

- このシステムは定期的に API を呼び出すため、レート制限や使用量に注意してください
- OpenAI API の利用料金が発生します。予算に応じて実行頻度を調整してください
- GitHub API の制限を考慮し、大規模リポジトリでは取得項目数を適切に制限しています

## ライセンス

MIT License
