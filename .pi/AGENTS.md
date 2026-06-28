# User Agent Instructions

## Tool preference

Always prefer skills and CLI tools (bash, gh, etc.) over MCP tools. Only search for or invoke MCP tools if no skill or CLI equivalent exists.

## Failure handling

Never use silent fallback behavior. Fail loudly and openly: surface errors,
state what failed, and do not swallow exceptions or hide broken integrations.

## Hard migrations

When the user asks for a migration or hard migration, migrate cleanly. Do not
create legacy fallback paths, compatibility shims, adapters, or speculative
abstractions unless explicitly requested.

## Clarify before implementing

For non-trivial or ambiguous tasks, never go ahead with implementation without
clarifying as much as possible first. Ask concrete questions about goals, scope,
tradeoffs, constraints, and done criteria before starting.

## Pull Requests

Always use the repo's PR template when creating pull requests. Look for it at
`.github/pull_request_template.md` (or `PULL_REQUEST_TEMPLATE.md`) and populate
every section. Do not leave placeholder text or skip sections silently.

Never edit a repo's PR template just to make it easier to fill out. Treat
checklists as applicable gates: leave items unchecked when they do not apply, and
explain applicability in the relevant section instead of changing template text.
For UI screenshots or recordings, do not capture or attach them unless the user
explicitly asks. If screenshots are needed, state that the user will add them.

Do not leave inline review comments on PRs unless the user explicitly asks. When
creating PRs, submit clean without annotations. Push directly without asking for
confirmation.

Never close a PR unless explicitly told to. If a branch needs to be updated,
force-push to the existing branch so the PR updates in place.

## SPDX headers

Always use this exact SPDX copyright header on any new file created in this repo:

```
# SPDX-FileCopyrightText: 2026 Hari Srinivasan <harisrini21@gmail.com>
# SPDX-License-Identifier: AGPL-3.0-only
```

For files that use HTML/XML comments (e.g. `.md`, `.html`):

```
<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan <harisrini21@gmail.com> -->
<!-- SPDX-License-Identifier: AGPL-3.0-only -->
```

Never copy SPDX headers from other files in the repo.

## Writing style

Never use em dashes or double dashes in any written output: comments, PR bodies, commit messages, or responses. Use a comma, colon, or rewrite the sentence instead.

## Commit hygiene

All commit messages MUST follow Conventional Commits 1.0.0:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
Use `!` after the type/scope or a `BREAKING CHANGE:` footer for breaking changes.

Never create fixup or lint-fix commits. If linting, formatting, or any
post-edit cleanup produces changes after the main commit has already been made,
amend the previous commit (`git commit --amend --no-edit`) rather than adding a
new one. Keep history clean and intentional.

## Inspect before proposing

When uncertain about implementation details, inspect actual files before
proposing a solution. Never guess at configs, credentials, or API shapes.

## Scope control

Do not add unrequested features, extra commits, or out-of-scope details without
explicit direction.

## Context canary

Begin every final response with the exact text `[CTX-OK]` unless the user asks
for raw code, JSON, patches, commits, or another exact output format.

## Context hygiene

Never load LOG files directly into input context. Use targeted tools such as
`tail`, `rg`, `awk`, or small scripts to extract only the relevant lines or
summaries.

## Database migrations

Never make database migration changes with hand-written SQL queries. Use the
project's migration tool, such as Alembic, Prisma Migrate, Rails migrations,
Django migrations, or the equivalent for that stack, then inspect the generated
migration before applying it.

## Verification

Always verify that configuration changes, skill registrations, and integrations
are actually working before declaring completion. Run a smoke test or
confirmation step appropriate to what was built.

## MCP Servers

- **sentrux**

## Skills

- **playwright-cli**
- **pr-review**
- **git-workflow**
- **ruff-fix**