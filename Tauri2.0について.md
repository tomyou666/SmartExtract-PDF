# Tauri2.0について

### [フレームワークテンプレートの設定](https://v2.tauri.app/start/create-project/#using-create-tauri-app)

```zsh
cargo create-tauri-app

✔ Project name · smartextract-pdf
✔ Identifier · smartextract-pdf
✔ Choose which language to use for your frontend · TypeScript / JavaScript - (pnpm, yarn, npm, deno, bun)
✔ Choose your package manager · npm
✔ Choose your UI template · React - (https://react.dev/)
✔ Choose your UI flavor · TypeScript
```

### [開発サーバーの起動方法](https://v2.tauri.app/start/create-project/#start-the-development-server)

```zsh
# 1. プロジェクトフォルダに移動
cd smartextract-pdf

# 2. フロントエンド（Reactなど）のライブラリをインストール
npm install

# 3. 開発モードでアプリを起動（初回は Rust のビルドで数分かかります）
npm run tauri dev
```

### ディレクトリ構造

```zsh
smartexttract-pdf/
    public/
        # 静止画像
    src/
        assets/
            # UIパーツ等の画像
        # フロントエンドのファイル等
        App.css
        App.tsx
        main.tsx
    src-tauri/
        capabilities/
            default.json # HTTP Clientの情報
        gen/
            schemas/
                acl-manifests.json
                capabilities.json
                desktop-schema.json
                MacOS-schema.json
        icons/
            # いろんな大きさの加増
        src/
            lib.rs
            main.rs #Rust のエントリポイント
    .gitignore # gitのトラッキング対象外にするもの
    index.html # HTMLファイル
    package-lock.json # パッケージの依存関係を記載したファイル
    package.json # 現在のプロジェクトの情報を保存するファイル
    README.md # セットアップ方法
    tsconfig.json # TypeScriptをJavaScriptにしたもの
    tsconfig.node.json
    vite.config.ts # Viteのconfigファイルの型補完するもの
```

[HTTP Clientの情報](https://v2.tauri.app/ja/plugin/http-client)