---
name: git-commit-en
description: Generates Conventional Commits messages in English from session context and staged git diff. Use when writing commit messages, especially when the user asks to summarize staged changes with commit style rules.
disable-model-invocation: true
---

# Git Commit EN

## Instructions

Create a commit message in English by combining:

- What was discussed in the current session.
- The staged diff preview from this exact command:
  - `git diff --staged | cut -c 1-2000`

## Workflow

1. Read the session context and identify intent (why the change exists).
2. Run `git diff --staged | cut -c 1-2000` and extract key change points.
3. Pick an appropriate Conventional Commits type (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, etc.).
4. Write the message in this format:

```text
type(scope): short summary

line 1 explaining why/impact
line 2 optional
line 3 optional
```

## Output Rules

- Follow Conventional Commits.
- Title must be a single concise line.
- Body must be at most 3 lines total.
- Keep the body focused on purpose/impact, not noisy implementation detail.
- If scope is unclear, omit scope rather than guessing.
