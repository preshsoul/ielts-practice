#!/bin/bash
# Install git hooks from scripts/git-hooks/ into .git/hooks/
set -e
HOOKS_DIR="$(dirname "$0")/git-hooks"
TARGET_DIR="$(dirname "$0")/../.git/hooks"

if [ ! -d "$TARGET_DIR" ]; then
  echo "Not a git repository. Run: git init"
  exit 1
fi

for hook in "$HOOKS_DIR"/*; do
  name="$(basename "$hook")"
  cp "$hook" "$TARGET_DIR/$name"
  chmod +x "$TARGET_DIR/$name"
  echo "Installed: $name"
done

echo "Hooks installed."
