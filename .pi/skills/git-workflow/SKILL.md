---
name: git-workflow
description: "Branch management, PR creation, rebase, and merge workflows. Use when the user asks to create a branch, open a PR, rebase, squash, cherry-pick, or manage git workflow steps."
version: 1.0.0
task_type: git
---

# Git Workflow

Automates multi-step git operations so you execute them in one shot instead of sequencing individual commands.

## Rules

1. Always run commands, never just print them.
2. Follow Conventional Commits for all commit messages.
3. Use the repo's PR template (`.github/pull_request_template.md`) when creating PRs.
4. Push directly without asking for confirmation.
5. Force-push to existing branches to update PRs in place.
6. Never close PRs unless explicitly told to.

## Procedures

### Create feature branch and start work

```bash
git checkout main && git pull --rebase origin main
git checkout -b <type>/<short-description>
```

### Open a PR

```bash
# Ensure branch is pushed
git push -u origin HEAD

# Create PR using repo template
gh pr create --fill --title "<type>(scope): description" --body-file .github/pull_request_template.md
```

If no template exists, use `--fill` only.

### Rebase on main

```bash
git fetch origin main
git rebase origin/main
# If conflicts, resolve then:
git rebase --continue
git push --force-with-lease
```

### Squash branch into single commit

```bash
git reset --soft origin/main
git commit -m "<type>(scope): description"
git push --force-with-lease
```

### Update PR (amend + force push)

```bash
git add -A
git commit --amend --no-edit
git push --force-with-lease
```

### Cherry-pick a commit to another branch

```bash
git checkout <target-branch>
git cherry-pick <commit-sha>
git push
```

### Clean up merged branches

```bash
git checkout main && git pull
git branch --merged main | grep -v "main\|master\|\*" | xargs -r git branch -d
```

### Stash and switch context

```bash
git stash push -m "wip: <context>"
git checkout <other-branch>
# ... do work ...
git checkout <original-branch>
git stash pop
```

## PR Creation Checklist

1. Check for `.github/pull_request_template.md`
2. Fill every section of the template
3. Use conventional commit style for the PR title
4. Push and create in one flow
5. Do not leave inline review comments
