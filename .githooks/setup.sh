#!/bin/bash
#
# Sets up git hooks for the web-dashboard repository.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Setting up git hooks..."

cd "$REPO_ROOT"
git config core.hooksPath .githooks

echo ""
echo "Git hooks configured!"
echo ""
echo "Active hooks:"
echo "  - commit-msg: Validates conventional commit format"
echo "  - pre-push: Blocks direct pushes to main + runs lint/build"
echo ""
