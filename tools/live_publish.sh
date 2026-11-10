#!/usr/bin/env bash
# Publish one file as score.json on the one-commit 'live-data' branch (force-pushed, so it never grows).
# Used by the "Live scoreboard" workflow. Needs GH_TOKEN and GITHUB_REPOSITORY (both set by GitHub Actions).
set -euo pipefail
src="$1"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp "$src" "$work/score.json"
cd "$work"
git init -q -b live-data
git config user.name "dynasty-puck-bot"
git config user.email "dynasty-puck-bot@users.noreply.github.com"
printf 'Live scoreboard data for the Dynasty Puck site.\nRewritten every few minutes on game nights by .github/workflows/live-score.yml on main. Do not edit.\n' > README.md
git add score.json README.md
git commit -q -m "Live scoreboard $(date -u +%Y-%m-%dT%H:%MZ)"
git push -q -f "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" live-data
