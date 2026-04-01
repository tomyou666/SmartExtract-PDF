---
name: git-commit-jn
description: セッション内の議論内容とステージ済み差分からConventional Commits形式の日本語コミットメッセージを作成する。コミット文面作成やステージ差分要約を求められたときに使う。
disable-model-invocation: true
---

# Git Commit JN

## 手順

日本語のコミットメッセージを、次の2つを根拠に作成する。

- 現在のセッションで議論した内容（変更の意図・背景）。
- 以下コマンドで取得したステージ済み差分の先頭2000文字:
  - `git diff --staged | cut -c 1-2000`

## ワークフロー

1. セッション文脈から「なぜこの変更をしたか」を整理する。
2. `git diff --staged | cut -c 1-2000` を実行し、主要な変更点を抽出する。
3. Conventional Commits の type（`feat` / `fix` / `docs` / `refactor` / `test` / `chore` など）を決める。
4. 次の形式で出力する。

```text
type(scope): 要約タイトル

1行目: 変更の目的や効果
2行目: 必要なら補足
3行目: 必要なら補足
```

## 出力ルール

- Conventional Commits に従う。
- タイトルは1行で簡潔に書く。
- タイトルに続く本文は最大3行までにする。
- 本文は実装の細部より、意図と影響を優先して書く。
- scope が不明なら無理に付けず省略する。
