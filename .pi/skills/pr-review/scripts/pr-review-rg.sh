#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Hari Srinivasan <harisrini21@gmail.com>
# SPDX-License-Identifier: AGPL-3.0-only
#
# pr-review-rg.sh: Scan a PR diff with ripgrep for semantic violations.
# Usage: ./pr-review-rg.sh <PR_NUMBER> [--deeper]

set -euo pipefail

PR_NUMBER="${1:-}"
DEEPER="${2:-}"

if [[ -z "$PR_NUMBER" ]]; then
  echo "Usage: pr-review-rg.sh <PR_NUMBER> [--deeper]"
  exit 1
fi

DIFF_FILE=$(mktemp /tmp/pr-diff-XXXXXX.patch)
RESULTS_FILE=$(mktemp /tmp/pr-review-XXXXXX.txt)

trap 'rm -f "$DIFF_FILE" "$RESULTS_FILE"' EXIT

# ─── Fetch diff ───────────────────────────────────────────────────────────────

echo "Fetching diff for PR #${PR_NUMBER}..."
gh pr diff "$PR_NUMBER" > "$DIFF_FILE" 2>&1 || {
  echo "ERROR: Failed to fetch PR diff. Is 'gh' authenticated and is #${PR_NUMBER} valid?"
  exit 1
}

if [[ ! -s "$DIFF_FILE" ]]; then
  echo "ERROR: PR diff is empty."
  exit 1
fi

BLOCKERS=0
NITS=0

report() {
  local severity="$1" location="$2" msg="$3"
  printf "%-7s | %-40s | %s\n" "$severity" "$location" "$msg" >> "$RESULTS_FILE"
  if [[ "$severity" == "BLOCKER" ]]; then
    ((BLOCKERS++))
  else
    ((NITS++))
  fi
}

# ─── NIT: Em-dashes and double-dashes ────────────────────────────────────────

echo "Scanning for em-dashes and double-dashes..."
while IFS= read -r match; do
  file=$(echo "$match" | cut -d: -f1)
  line=$(echo "$match" | cut -d: -f2)
  report "NIT" "${file}:${line}" "Em-dash or double-dash found (use comma, colon, or rewrite)"
done < <(rg --line-number '—|──|--' "$DIFF_FILE" \
  | grep '^\+' \
  | grep -v '^\+\+\+' \
  | grep -v '#!' \
  | grep -v 'set -' \
  | grep -v -- '--[a-z]' \
  | head -20 2>/dev/null || true)

# Better approach: parse the diff for added lines only
echo "Scanning added lines for em-dashes..."
while IFS= read -r line; do
  lineno=$(echo "$line" | cut -d: -f1)
  report "NIT" "diff:${lineno}" "Em-dash or en-dash in added line"
done < <(grep -n '^+' "$DIFF_FILE" \
  | grep -v '^[0-9]*:+++' \
  | grep -E '—|–' \
  | head -20 2>/dev/null || true)

# ─── BLOCKER: Mid-function imports (added lines with import inside indented block)

echo "Scanning for mid-function imports..."
while IFS= read -r line; do
  lineno=$(echo "$line" | cut -d: -f1)
  content=$(echo "$line" | cut -d: -f2-)
  report "BLOCKER" "diff:${lineno}" "Mid-function import: ${content:0:80}"
done < <(grep -n '^+' "$DIFF_FILE" \
  | grep -v '^[0-9]*:+++' \
  | grep -E '^\+[[:space:]]+(import |from .+ import )' \
  | grep -E '^\+[[:space:]]{4,}' \
  | head -20 2>/dev/null || true)

# ─── BLOCKER: Broad excepts ──────────────────────────────────────────────────

echo "Scanning for broad excepts..."
while IFS= read -r line; do
  lineno=$(echo "$line" | cut -d: -f1)
  content=$(echo "$line" | cut -d: -f2-)
  report "BLOCKER" "diff:${lineno}" "Broad except: ${content:0:80}"
done < <(grep -n '^+' "$DIFF_FILE" \
  | grep -v '^[0-9]*:+++' \
  | grep -E '^\+[[:space:]]*(except|except Exception|except BaseException)[[:space:]]*:' \
  | head -20 2>/dev/null || true)

# ─── BLOCKER: Bare print() in library code ───────────────────────────────────

echo "Scanning for print() statements..."
while IFS= read -r line; do
  lineno=$(echo "$line" | cut -d: -f1)
  content=$(echo "$line" | cut -d: -f2-)
  # Skip test files and scripts
  report "BLOCKER" "diff:${lineno}" "print() in non-test code: ${content:0:80}"
done < <(grep -n '^+' "$DIFF_FILE" \
  | grep -v '^[0-9]*:+++' \
  | grep -E '^\+[[:space:]]*print\(' \
  | grep -v 'test_' \
  | grep -v '# debug' \
  | head -20 2>/dev/null || true)

# ─── BLOCKER: CI check failures ─────────────────────────────────────────────

echo "Checking CI status..."
CI_OUTPUT=$(gh pr checks "$PR_NUMBER" 2>/dev/null || echo "")
if [[ -n "$CI_OUTPUT" ]]; then
  while IFS= read -r check; do
    check_name=$(echo "$check" | awk '{print $1}')
    report "BLOCKER" "CI" "Failing check: ${check_name}"
  done < <(echo "$CI_OUTPUT" | grep -i "fail\|X\|error" | head -10 2>/dev/null || true)
fi

# ─── Output ──────────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo "  PR #${PR_NUMBER} Review Results"
echo "════════════════════════════════════════════════════════════════════════"
echo ""

if [[ -s "$RESULTS_FILE" ]]; then
  cat "$RESULTS_FILE"
else
  echo "  No issues found by static scan."
fi

echo ""
echo "────────────────────────────────────────────────────────────────────────"
printf "  Summary: %d BLOCKER(s), %d NIT(s)\n" "$BLOCKERS" "$NITS"
echo ""

if [[ "$BLOCKERS" -gt 0 ]]; then
  echo "  Recommendation: REQUEST CHANGES"
elif [[ "$NITS" -gt 3 ]]; then
  echo "  Recommendation: APPROVE with nits"
else
  echo "  Recommendation: APPROVE"
fi

echo "────────────────────────────────────────────────────────────────────────"

# ─── Deeper mode ─────────────────────────────────────────────────────────────

if [[ "$DEEPER" == "--deeper" ]]; then
  echo ""
  echo "════════════════════════════════════════════════════════════════════════"
  echo "  DEEPER ANALYSIS (AI-powered)"
  echo "════════════════════════════════════════════════════════════════════════"
  echo ""
  echo "Diff saved to: $DIFF_FILE"
  echo ""
  echo "AI_REVIEW_REQUESTED=true"
  echo "DIFF_PATH=$DIFF_FILE"
  # The calling agent reads these env-style markers and performs AI review
  # on the diff content. The script exits here; the agent takes over.
fi
