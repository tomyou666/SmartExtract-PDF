# Tagベース自動デプロイ手順（GitHub Actions + Vercel）

この手順では、`v*` タグ（例: `v1.0.0`）を push したときに、GitHub Actions から Vercel へ自動デプロイします。

- `client`（Frontend）と`server`（Backend）をそれぞれ別Vercel Projectとしてデプロイ
- 本番デプロイは `vercel deploy --prod` を利用
- タグを作ったときだけ動作

---

## 1. 前提

以下が完了していることを前提にします。

- GitHubリポジトリが存在する
- Vercelに `client` 用 / `server` 用の2プロジェクトを作成済み
- `server` 側がVercelで起動できる構成（`vercel.json` / ASGIエントリポイント等）になっている
- Vercelプロジェクトに必要な環境変数を設定済み
  - Frontend: `VITE_API_URL`
  - Backend: `DATABASE_URL`, `AUTH_SECRET`, `STORAGE_BACKEND=s3`, `S3_*`, `AWS_*`, `CORS_ORIGINS` など

---

## 1.1 BackendをVercelで起動する最小構成

`server` をVercel Projectとして運用する場合、最低限以下を用意します。

### A. ASGIエントリポイントを作成

`server/api/index.py` を作成し、FastAPIアプリを export します。

```python
from app.main import app
```

### B. `vercel.json` を作成

`server/vercel.json` を作成し、`/api/*` をPython関数にルーティングします。

```json
{
  "version": 2,
  "functions": {
    "api/index.py": {
      "runtime": "python3.13"
    }
  },
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/index.py"
    }
  ]
}
```

### C. Vercel側のRoot Directoryを `server` に設定

このドキュメントのGitHub Actionsは `working-directory: server` 前提です。  
Vercel Project側も `server` をRootに揃えてください。

### D. 初回デプロイ前チェック

- `app.main:app` が import エラーなく起動できる
- DB（Supabase）へ接続できる `DATABASE_URL` が設定済み
- 永続ファイル保存を使わないよう `STORAGE_BACKEND=s3` になっている
- OCRを使う場合はフロント側でCOOP/COEPヘッダを本番でも付与する

---

## 2. Vercel側で取得する値

Vercelダッシュボードで以下を取得します。

- `VERCEL_TOKEN`  
  - Vercel `Settings` -> `Tokens` で作成
- `VERCEL_ORG_ID`  
  - Team/Account の ID
- `VERCEL_PROJECT_ID_CLIENT`  
  - `client` プロジェクトの ID
- `VERCEL_PROJECT_ID_SERVER`  
  - `server` プロジェクトの ID

---

## 2.1 Frontend（Root=`client`）の設定

Frontend ProjectはVercelで以下の設定にします。

- Root Directory: `client`
- Build:
  - Install Command: `bun install`
  - Build Command: `bun run build`
  - Output Directory: `dist`

### 環境変数

- `VITE_API_URL=https://<backend-domain>`

### 本番ヘッダ設定（OCR用）

フロント配信に以下ヘッダを付与します。

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

この2つがない場合、SharedArrayBufferを使う処理（OCR関連）が本番で動作しない可能性があります。
設定の再現性のため、Vercelダッシュボードではなく `client/vercel.json` で管理することを推奨します。

`client/vercel.json` 例:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

---

## 2.2 Backend（Root=`server`）の設定

Backend ProjectはVercelで以下の設定にします。

- Root Directory: `server`
- Build:
  - Install Command: （未指定で可。VercelのPythonビルドに任せる）
  - Build Command: （未指定で可）
  - Output Directory: （不要）

### 必須ファイル

- `server/api/index.py`（ASGIエントリポイント）
- `server/vercel.json`（`/api/*` ルーティング）

### 環境変数

- `DATABASE_URL`（Supabase接続文字列）
- `CORS_ORIGINS=["https://<frontend-domain>"]`
- `AUTH_SECRET=<十分に長いランダム文字列>`
- `AUTH_TOKEN_LIFETIME_SECONDS=86400`（任意）
- `STORAGE_BACKEND=s3`
- `S3_BUCKET`
- `S3_PREFIX`（任意）
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_ENDPOINT_URL`（S3互換ストレージ時）

### 初回デプロイ前チェック

- Supabaseに `schema.sql` を適用済み
- `server/vercel.json` の route が `/api/*` を `api/index.py` に向けている
- Vercelデプロイ後に `GET /api/pdfs` などAPIヘルス確認を実施

---

## 3. GitHub Secrets を登録

GitHubリポジトリの `Settings` -> `Secrets and variables` -> `Actions` で以下を登録します。

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID_CLIENT`
- `VERCEL_PROJECT_ID_SERVER`

---

## 4. Workflowファイルを作成

`.github/workflows/deploy-on-tag.yml` を作成し、次を貼り付けます。

```yaml
name: Deploy to Vercel on Tag

on:
  push:
    tags:
      - "v*"

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  deploy-client:
    name: Deploy Client (prod)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: client
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install Vercel CLI
        run: bun add -g vercel

      - name: Pull Vercel env (production)
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID_CLIENT }}

      - name: Build client
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID_CLIENT }}

      - name: Deploy client
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID_CLIENT }}

  deploy-server:
    name: Deploy Server (prod)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: server
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install Vercel CLI
        run: bun add -g vercel

      - name: Pull Vercel env (production)
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID_SERVER }}

      - name: Build server
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID_SERVER }}

      - name: Deploy server
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID_SERVER }}
```

---

## 5. タグ作成とデプロイ実行

例: `v1.0.0` で本番デプロイする場合

```bash
git tag v1.0.0
git push origin v1.0.0
```

これでGitHub Actionsが起動し、`client` と `server` の本番デプロイが走ります。

---

## 6. 運用ルール（推奨）

- 本番デプロイは `vX.Y.Z` のみ許可
- 通常の `main` push では本番デプロイしない
- 事前にPRでPreview確認してからタグを打つ
- 失敗時はGitHub Actionsログ -> Vercelログの順で確認

---

## 7. よくあるハマりどころ

- `Project ID` の取り違え（`client` と `server`）
- Backend側の環境変数不足（`DATABASE_URL` / `S3`系）
- VercelのPython Runtime要件とプロジェクト要件（Pythonバージョン等）の不一致
- OCR利用時のヘッダ不足（COOP/COEP）

---

## 8. 追加オプション（必要なら）

### A. プレリリースタグを除外

`v*` 以外（例: `beta-*`）を使う、または条件分岐を入れて制御できます。

### B. 手動実行も許可

`workflow_dispatch` を `on:` に追加すると、タグなしでも手動デプロイ可能です。

### C. Backend成功後にFrontendをデプロイ

依存関係を持たせたい場合は、`deploy-client` に `needs: deploy-server` を追加してください。
