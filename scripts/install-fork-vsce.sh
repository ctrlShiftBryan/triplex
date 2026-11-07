#!/usr/bin/env bash
# Builds the fork's VS Code extension from HEAD and installs it into the
# VS Code server on this machine (Remote-SSH), replacing the marketplace build.
#
# The release steps delete src/ folders and rewrite package.json files, so the
# build runs in a separate worktree and leaves this checkout untouched.
set -euo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
BUILD="${TRIPLEX_BUILD_DIR:-$ROOT/../triplex-worktrees/vsix-build}"
PUBLIC_ID="trytriplex.triplex-vsce"
SHA="$(git -C "$ROOT" rev-parse HEAD)"

if [ -d "$BUILD/.git" ] || [ -f "$BUILD/.git" ]; then
  git -C "$BUILD" checkout --force --detach "$SHA"
  git -C "$BUILD" clean -fdx -e node_modules
else
  mkdir -p "$(dirname "$BUILD")"
  git -C "$ROOT" worktree add --detach "$BUILD" "$SHA"
fi

cd "$BUILD"
echo "Building triplex-vsce at ${SHA:0:8} in $BUILD"

# Same steps as .github/workflows/release-vscode.yml.
pnpm i --force --public-hoist-pattern='*' --node-linker=hoisted
pnpm build
pnpm clean:drop-folders
pnpm --filter triplex-vsce run prepack
pnpm --filter triplex-vsce run pack

VSIX="$(find apps/vscode/out -maxdepth 1 -name '*.vsix' -print -quit)"
[ -n "$VSIX" ] || { echo "No .vsix produced" >&2; exit 1; }
VSIX="$BUILD/$VSIX"
echo "Built $VSIX"

# Newest VS Code server on this machine; extensions are shared across versions.
SERVER="$(ls -td "$HOME"/.vscode-server/cli/servers/Stable-*/server/bin/code-server 2>/dev/null | head -n1 || true)"
if [ -n "$SERVER" ]; then
  "$SERVER" --install-extension "$VSIX" --force
  if "$SERVER" --list-extensions | grep -qx "$PUBLIC_ID"; then
    "$SERVER" --uninstall-extension "$PUBLIC_ID"
  fi
else
  echo "No VS Code server found under ~/.vscode-server; install $VSIX by hand." >&2
fi

echo "Done. Run 'Developer: Reload Window' in VS Code."
