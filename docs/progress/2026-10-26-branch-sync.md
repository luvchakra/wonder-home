# Branch sync: why squash merges kept conflicting, and the fix

Date: 2026-10-26

## What went wrong (2026-10-25)

All three problems came from one session reusing a single branch, `ccr-266c89d0-wilu3l`, after its PRs squash-merged.

1. **Work pushed after a merge was left out.** PR #341 auto-merged within minutes. Two more commits (the folded checklist and Responsibilities group-by) were pushed to the same branch afterwards. A squash merge takes only what was on the branch when it merged, so those commits had no PR and never reached `main`. The owner saw no change.
2. **A merge conflict blocked auto-merge.** PR #343 was built on that branch. It still carried the pre-squash commits, which are not ancestors of `main`, and a later commit changed the same lines. GitHub marked the PR `dirty` (conflicting), so auto-merge never fired. Nothing reported this.
3. **`git merge origin/main`, as CLAUDE.md startup step 0 said, causes the conflict.** It merges against the branch's old merge base, so every commit main already has as a squash is replayed again.

## The fix

- **`scripts/branch-sync.sh`** never merges:
  - When the branch has nothing that main lacks (its PR merged), it moves the branch to main (`reset --keep`, so uncommitted work is kept).
  - Otherwise it rebases onto main. That drops the commits main already has, because each replays as an empty change.
  - It says when a PR from the branch merged, so a new PR is opened.
  - On a real conflict it aborts and changes nothing.
  - It rewrites history, so it is only for branches the session owns. Push with `--force-with-lease`.
- **CLAUDE.md:** startup step 0 now runs the script instead of `git merge origin/main`. "Opening and merging pull requests" says to run it before every push and to open a new PR when it reports a merged one.

## Verified

A scratch repo reproduced the case: a squash-merged first commit, then a follow-up on the same line, plus an unrelated commit on main.
- `git merge origin/main` conflicted.
- The script rebased cleanly, kept only the follow-up, and reported the merged PR.
- After the follow-up was also squash-merged, the script moved the branch to main and kept an uncommitted file.

## Open

- Turning on GitHub's "Automatically delete head branches" (Settings → General) would make a reused branch name start fresh on GitHub's side too. It is a repository setting for the owner.
