#!/usr/bin/env bash
# Brings the current branch up to date with origin/main without the
# conflicts squash merges cause (docs/progress/2026-10-26-branch-sync.md).
#
# A squash merge puts a branch's work on main as one new commit, so the
# branch's own commits never become ancestors of main. Merging main back
# in then replays both against an old merge base and conflicts wherever a
# later commit touched the same lines. This script never merges:
#   - nothing on the branch that main lacks -> move the branch to main;
#   - otherwise -> rebase onto main, which drops commits main already has.
# Uncommitted changes are kept (`reset --keep`, `rebase --autostash`).
# Only for branches this session owns: it rewrites history, so push after
# it with `git push --force-with-lease`.
set -euo pipefail

branch=$(git branch --show-current)
if [ -z "$branch" ] || [ "$branch" = "main" ]; then
  echo "branch-sync: on '${branch:-detached HEAD}'; nothing to do." >&2
  exit 0
fi

git fetch -q origin main

if git diff --quiet origin/main HEAD; then
  if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
    echo "branch-sync: $branch is main."
  else
    git reset -q --keep origin/main
    echo "branch-sync: everything on $branch is already on main (its PR merged). Moved it to main."
    echo "branch-sync: the next change needs a NEW pull request; push with --force-with-lease."
  fi
  exit 0
fi

before=$(git rev-list --count origin/main..HEAD)
if ! git -c advice.skippedCherryPicks=false rebase -q --autostash origin/main; then
  git rebase --abort
  echo "branch-sync: rebasing $branch onto main conflicts; nothing changed. Resolve by hand." >&2
  exit 1
fi
after=$(git rev-list --count origin/main..HEAD)

echo "branch-sync: $branch rebased onto main ($after commit(s) main lacks)."
if [ "$after" -lt "$before" ]; then
  echo "branch-sync: $((before - after)) commit(s) were already on main: a PR from this branch merged."
  echo "branch-sync: if no PR is open for $branch, open a NEW one after pushing."
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "@{u}" 2>/dev/null || echo none)" ]; then
  echo "branch-sync: push with: git push --force-with-lease -u origin $branch"
fi
