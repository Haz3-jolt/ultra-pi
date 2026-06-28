---
name: ruff-fix
description: "Run ruff linter and formatter, auto-fix what it can, and report only unfixable issues. Use when the user asks to lint, format, or fix Python code style."
version: 1.0.0
task_type: lint
---

# Ruff Fix

Run ruff to lint and format Python code. Auto-fixes everything fixable, then reports only what remains.

## Rules

1. Always run commands, never just print them.
2. Never create separate lint-fix commits. If changes result from ruff, amend the previous commit.
3. Run from the project root (where `pyproject.toml` or `ruff.toml` lives).
4. Use `--fix` to auto-apply safe fixes.
5. Only show the user unfixable issues that need manual intervention.

## Procedures

### Full lint + fix (default)

```bash
# Auto-fix all safe fixes
ruff check --fix .

# Format
ruff format .

# Show remaining issues (unfixable only)
ruff check . 2>&1 | head -50
```

If everything passes, report "clean, no issues."

### Check only (no changes)

```bash
ruff check .
ruff format --check .
```

### Fix specific file

```bash
ruff check --fix <file>
ruff format <file>
```

### Fix and amend (post-commit cleanup)

When ruff fixes are needed after a commit has already been made:

```bash
ruff check --fix .
ruff format .
git add -A
git commit --amend --no-edit
```

### Show fixable vs unfixable breakdown

```bash
ruff check . --statistics
```

### Fix specific rule categories

```bash
# Fix only import sorting
ruff check --fix --select I .

# Fix only unused imports
ruff check --fix --select F401 .

# Fix only formatting issues
ruff format .
```

## Output Interpretation

- If `ruff check` exits 0: all clean
- If `ruff check --fix` still shows errors: those need manual fixes, show them to the user
- Common unfixable issues: complexity (C901), type errors, ambiguous variable names

## Integration with workflow

After any Python file edit:
1. Run `ruff check --fix .` and `ruff format .`
2. If changes were made and a commit already exists, `git add -A && git commit --amend --no-edit`
3. Only report to the user if unfixable issues remain
