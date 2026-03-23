# デプロイ手順（GitHub Actions + Vercel）

`v*` タグ（例: `v1.0.0`）を push したときに、GitHub Actions から Vercel へ本番デプロイします。

- `client`（Frontend）と `server`（Backend）をそれぞれ別 Vercel Project としてデプロイ
- 本番は `vercel deploy --prod`（ワークフロー内で実行）
- タグ push 時のみ動作

---

## 1. 前提

- GitHub リポジトリが存在する
- Vercel に `client` 用 / `server` 用の 2 プロジェクトを作成済み
- `server` の Vercel 向け構成（`vercel.json`、ASGI エントリなど）はリポジトリ内の `server/` を参照
- 各プロジェクトの環境変数は Vercel に設定済み（必要な変数名・例はリポジトリ内の `.env` 例やアプリ設定を参照）

---

## 2. Vercel 側で取得する値

Vercel ダッシュボードで以下を取得し、GitHub Secrets に登録します。

- `VERCEL_TOKEN` — `Settings` → `Tokens`
- `VERCEL_ORG_ID` — Team / Account の ID
- `VERCEL_PROJECT_ID_CLIENT` — `client` プロジェクトの ID
- `VERCEL_PROJECT_ID_SERVER` — `server` プロジェクトの ID

---

## 2.1 Frontend（Root = `client`）

Vercel プロジェクト設定の目安:

- Root Directory: `client`
- Install: `bun install`、Build: `bun run build`、Output: `dist`
- 本番 API 向けに `VITE_API_URL` を設定
- OCR（SharedArrayBuffer）利用時は COOP / COEP ヘッダが必要。具体はリポジトリ内の `client/vercel.json` 等を参照

---

## 2.2 Backend（Root = `server`）

- Root Directory: `server`（GitHub Actions の `working-directory` と揃える）
- ルーティング・Python ランタイム等の具体はリポジトリ内の `server/vercel.json` と `server/api/` を参照
- 環境変数はアプリ要件に合わせて Vercel に設定（DB・認証・S3・CORS など）

---

## 3. GitHub Secrets

リポジトリの `Settings` → `Secrets and variables` → `Actions` に以下を登録します。

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID_CLIENT`
- `VERCEL_PROJECT_ID_SERVER`

---

## 4. Workflow

デプロイ用ワークフローは `.github/workflows/deploy-on-tag.yml` に定義済みです。ジョブ構成・コマンドはそのファイルを参照してください。

---

## 5. タグ作成とデプロイ実行

例: `v1.0.0` で本番デプロイする場合

```bash
git tag v1.0.0
git push origin v1.0.0
```

これで GitHub Actions が起動し、`client` と `server` の本番デプロイが走ります。

---

## 6. 運用ルール（推奨）

- 本番デプロイは `vX.Y.Z` のみ許可
- 通常の `main` push では本番デプロイしない
- 事前に PR で Preview 確認してからタグを打つ
- 失敗時は GitHub Actions ログ → Vercel ログの順で確認

---

## 7. よくあるハマりどころ

- `Project ID` の取り違え（`client` と `server`）
- Backend 側の環境変数不足（DB / S3 / CORS など）
- Vercel の Python ランタイムとプロジェクト要件の不一致
- OCR 利用時の COOP / COEP ヘッダ不足

---

## 8. 追加オプション（必要なら）

- プレリリースタグを除外する: `on.push.tags` のパターンを変更する、または条件分岐を追加
- 手動実行: `workflow_dispatch` を `on:` に追加
- Backend 成功後に Frontend: `deploy-client` に `needs: deploy-server` を追加
