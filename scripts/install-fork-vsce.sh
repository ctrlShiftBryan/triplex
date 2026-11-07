#!/usr/bin/env bash
# Builds the fork from HEAD and installs, on this machine:
#   - the ba-triplex-mark CLI as ~/.local/bin/ba-triplex-mark, always;
#   - the VS Code extension into the newest VS Code server (Remote-SSH), else
#     the local `code` CLI, else skips with a note; it replaces the
#     marketplace build.
#
# The release steps delete src/ folders and rewrite package.json files, so the
# build runs in a separate worktree and leaves this checkout untouched.
set -euo pipefail

# The packaging deps break on Node 26 (SlowBuffer was removed); use Node 22
# as pinned by package.json "volta".
if [ -z "${TRIPLEX_NODE_SWITCHED:-}" ] && ! node -v | grep -q '^v22\.'; then
  exec env TRIPLEX_NODE_SWITCHED=1 mise exec node@22 -- "$0" "$@"
fi

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

# The marker CLI is one bundled file; install it before the extension steps.
pnpm --filter ba-triplex-mark build
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
install -m 755 packages/ba-triplex-mark/dist/ba-triplex-mark.cjs "$BIN_DIR/ba-triplex-mark"
echo "Installed $BIN_DIR/ba-triplex-mark"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Note: $BIN_DIR is not on PATH; add it to run ba-triplex-mark." >&2 ;;
esac

# rimraf's move-remove renames into TMPDIR, which must be on the same disk.
mkdir -p "$BUILD.tmp"
TMPDIR="$BUILD.tmp" pnpm clean:drop-folders
pnpm --filter triplex-vsce run prepack
pnpm --filter triplex-vsce run pack

VSIX="$(find apps/vscode/out -maxdepth 1 -name '*.vsix' -print -quit)"
[ -n "$VSIX" ] || { echo "No .vsix produced" >&2; exit 1; }
VSIX="$BUILD/$VSIX"
echo "Built $VSIX"

# Newest VS Code server on this machine (Remote-SSH), else the local code CLI;
# extensions are shared across server versions.
CODE="$(ls -td "$HOME"/.vscode-server/cli/servers/Stable-*/server/bin/code-server 2>/dev/null | head -n1 || true)"
[ -n "$CODE" ] || CODE="$(command -v code || true)"
if [ -z "$CODE" ]; then
  echo "No VS Code server under ~/.vscode-server and no code CLI; skipped the extension. Install $VSIX by hand." >&2
  exit 0
fi

"$CODE" --install-extension "$VSIX" --force
if "$CODE" --list-extensions | grep -qx "$PUBLIC_ID"; then
  "$CODE" --uninstall-extension "$PUBLIC_ID"
fi

echo "Done. Run 'Developer: Reload Window' in VS Code."
