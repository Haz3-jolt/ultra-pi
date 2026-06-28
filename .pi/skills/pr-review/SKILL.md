---
name: pr-review-rg
description: "Review a PR diff with ripgrep for semantic violations (em-dashes, PEP8, broad excepts, CI failures). Classifies as BLOCKER or NIT. Pass --deeper for AI-powered scrutiny."
version: 1.0.0
task_type: code-review
---

# PR Review (ripgrep)

Automated PR review that scans diffs with ripgrep for semantic violations, then optionally invokes AI for deeper analysis.

## Usage

```
/skill:pr-review-rg 42
/skill:pr-review-rg 42 --deeper
```

## What it checks

### NITs
- **Em-dashes / double-dashes** in comments, strings, commit messages

### BLOCKERs
- **Mid-function imports** (PEP8 E402 pattern: import/from inside function bodies)
- **Broad excepts** (`except:` or `except Exception:` without re-raise)
- **CI failures** (queries `gh pr checks` for failing status checks)
- **Bare `raise` in broad except without logging** (swallowed errors)
- **`print()` statements** in library code (should use logging)

## Output format

```
BLOCKER | file:line | description
NIT     | file:line | description
```

Ends with a summary: total blockers, total nits, and a merge recommendation (APPROVE / REQUEST CHANGES).

## --deeper mode

When `--deeper` is passed, the full diff is piped to the AI agent for line-by-line scrutiny covering:
- Logic errors and off-by-one bugs
- Race conditions or missing locks
- Security issues (SQL injection, path traversal, secret leaks)
- Missing error handling
- API contract violations
- Test coverage gaps