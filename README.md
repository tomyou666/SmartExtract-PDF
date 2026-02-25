# PDF × LLM チャット Web アプリ

PDF を閲覧しながら、AIと効率よくチャットできる Web アプリです。

![1](assets/image/1.jpg)

### できること

- **PDF**: アップロード、一覧、表示。ページ送り・ズーム・全画面・ダウンロード
- **画像取得**: 複雑なpdfでも読み取りが簡単。矩形で順番に選択操作をしてあげることで、どんな形式のpdfでも正確にAIに情報を伝えて会話をスタートできます。
- **チャット**: AIとPDFの内容をもとに会話可能。AIはプロパイダーとAPIキーを指定することで会話できます。

## 構成

- **クライアント**: Vite (Rolldown) + React 19 + TypeScript, Tailwind v4, shadcn/ui, Vercel AI SDK, Streamdown, Zustand, wouter
- **サーバー**: FastAPI, SQLAlchemy, LiteLLM, PostgreSQL
- **DB**: PostgreSQL

## 開発

### 必要な環境

devcontainerで開いてあげるとpython + node + postgreSQL環境が立ち上がります。

- **Python**: uv 利用。バージョンは `.python-version` で 3.13
- **Node**: proto + bun。クライアントは `client/.prototools` で bun を指定

### データベース

devcontainer で開くと PostgreSQL が起動し、初回に `schema.sql` が実行されます。既存の volume を使っている場合は、スキーマを変えたときだけ DB を再作成してください。

### サーバーの起動

```bash
cd server
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

devcontainer 内では DB は `pdf-viewer-db:5432` です。ホストから接続するときなどは、環境変数 `DATABASE_URL` で接続先を変えてください。

### クライアントの起動

```bash
cd client
bun install
bun run dev
```

`/api` は Vite のプロキシで `http://localhost:8000` に飛びます。API を別オリジンにしたいときは `VITE_API_URL` を設定してください。

## ライセンス

MIT
