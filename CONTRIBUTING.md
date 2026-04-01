# Contributing to SmartExtract PDF

SmartExtract PDF へのコントリビュートに興味を持っていただきありがとうございます。

## Development Setup

### Recommended: VS Code / Cursor + Dev Container

このプロジェクトは、**VS Code または Cursor で Dev Container を起動する開発フロー**を推奨しています。  
ツールや依存関係の差分を減らし、同じ環境で開発できます。

1. リポジトリを clone します。

   ```bash
   git clone <repo-url>
   cd <repo-dir>
   ```

2. Dev Container を起動します。  
   VS Code / Cursor でこのリポジトリを開いたら、次のいずれかの方法で `Reopen in Container` を実行してください。
   - 右下に表示される通知から **Reopen in Container** をクリック
   - コマンドパレット（`Ctrl+Shift+P` / `Cmd+Shift+P`）を開き、`Dev Containers: Reopen in Container` を実行
   
   初回はイメージのビルドに数分かかる場合があります。  
   コンテナ起動後、ターミナルの作業ディレクトリが `/workspace` になっていることを確認してください。
3. コンテナ内で、次の順に依存関係をセットアップします。

   ```bash
   cd /workspace/client
   proto install

   cd /workspace/server
   uv sync

   cd /workspace/client
   bun install
   ```

このセットアップで、クライアントとサーバーの開発に必要なツールと依存関係が揃います。

### Start Development Servers

必要に応じて 2 つのターミナルを使って、サーバーとフロントエンドを起動してください。  
フロントエンドは **React Scan を使うかどうか** でコマンドを分けます。

```bash
# Terminal 1: FastAPI
cd /workspace/server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Vite
cd /workspace/client

# React Scan を有効にしてレンダリング性能を確認する場合
bun run dev --host 0.0.0.0 --port 5173

# React Scan を無効化して通常開発する場合
bun run dev:no-scan --host 0.0.0.0 --port 5173
```

- Client: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8000`

## Development Commands

### Client

```bash
cd /workspace/client
# React Scan 有効
bun run dev

# React Scan 無効（通常はこちら）
bun run dev:no-scan

bun run build
bun run lint
bun run format
```

### Server

```bash
cd /workspace/server
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
uv run ruff check .
uv run mypy app
```

## Project Structure

```text
/
├── client/              # React + TypeScript (Vite) フロントエンド
├── server/              # FastAPI バックエンド
├── .devcontainer/       # Dev Container 定義
├── compose.yml          # ローカル起動用 compose 設定
└── README.md            # プロジェクト概要
```

## Code Style

- **Client**: Biome を使用（`bun run lint`, `bun run format`）
- **Server**: Ruff / mypy を使用（`uv run ruff check .`, `uv run mypy app`）
- 大きな変更の前後で、最低限 lint を通すことを推奨します。

## Pull Requests

1. Fork またはブランチ作成（例: `feat/your-feature`）
2. 変更を実装
3. フォーマット・lint を実行
4. 変更内容がわかるコミットメッセージでコミット
5. Pull Request を作成

## License

コントリビュートされたコードは、本プロジェクトのライセンス方針に従います。  
詳細は `README.md` のライセンス節を確認してください。
