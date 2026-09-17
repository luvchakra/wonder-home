#!/usr/bin/env bash
#
# Vercel ignore command. Exit 0 to SKIP the build, exit 1 to BUILD.
#
# A large share of this repository's commits touch only the backlog, the
# trackers, the threat model or a README — none of which can change what the
# deployed app does. Building for those spends a deployment from a finite daily
# allowance and produces a byte-identical result.
#
# The rule is deliberately conservative: anything it cannot confidently classify
# as documentation-only causes a build. Skipping a build that was needed is a
# much worse failure than running one that was not.

set -uo pipefail

# Paths that cannot affect the built application.
DOCS_ONLY_PATHS=(
  "backlogs/"
  "tracking/"
  "design/"
  "security/"
  "architecture/"
  "database/"
  "README.md"
  "CLAUDE.md"
  "BACKLOG-INDEX.md"
  "TECH-STACK-AND-NFR.md"
)

build() { echo "Building: $1"; exit 1; }
skip()  { echo "Skipping build: $1"; exit 0; }

# No parent commit to compare against (first commit, or a clone too shallow to
# have one): build, because we cannot tell what changed.
if ! git rev-parse --verify --quiet HEAD^ >/dev/null 2>&1; then
  build "no parent commit to compare against"
fi

changed="$(git diff --name-only HEAD^ HEAD 2>/dev/null)"
if [ -z "$changed" ]; then
  build "could not determine what changed"
fi

while IFS= read -r file; do
  [ -z "$file" ] && continue

  is_docs=false
  for prefix in "${DOCS_ONLY_PATHS[@]}"; do
    case "$file" in
      "$prefix"*) is_docs=true; break ;;
    esac
  done

  if [ "$is_docs" = false ]; then
    build "$file changed"
  fi
done <<< "$changed"

skip "only documentation and tracking files changed"
