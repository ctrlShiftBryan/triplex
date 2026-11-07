# triplex-vsce

This package contains the code for the VS Code extension. It's separated into multiple folders.

To start in VS Code:

```
Run and Debug > Run VS Code command
```

## Notes

- This package contains the Node.js command that bootstraps everything and the editor UI.
- Want to modify the scene renderer? See [@triplex/renderer](../../packages/@triplex/renderer/README.md) package.
- Want to modify the scene backend? See [@triplex/server](../../packages/@triplex/client/README.md) package.
- Want to modify the server? See [@triplex/server](../../packages/@triplex/server/README.md) package.

## Installing the fork

`scripts/install-fork-vsce.sh` builds the fork from `HEAD` in `../triplex-worktrees/vsix-build` and installs on this machine:

- the `ba-triplex-mark` CLI as `~/.local/bin/ba-triplex-mark`, always;
- the extension into the newest VS Code server under `~/.vscode-server` (Remote-SSH), else through the local `code` CLI, else it skips the extension with a note. It uninstalls the marketplace `trytriplex.triplex-vsce`. The fork publishes as `ctrlshiftbryan.triplex-vsce`, so marketplace updates never replace it.

Commit first, then run the script and reload the VS Code window. It re-runs itself on Node 22, which packaging needs.

## Opening files in the viewer

- **BA Toggle - Triplex** flips the `baTriplex.openInViewer` setting (default off). When it is on, a newly opened `.tsx`/`.jsx` tab whose leading comments hold `// @triplex-viewer` opens in the Triplex viewer in place of the source tab, showing the default export, else the last named export. Flipping it swaps the open marked tabs (unsaved ones stay put) and forgets per-file choices.
- **BA: Show Source** and **BA: Show Triplex Viewer** swap the current tab. The choice holds for that file until VS Code restarts. Go To Definition from the viewer records "source" for its file.
- The title-bar button and **Open File in Triplex** show on files with an exported component.

## Marking 3D files

`ba-triplex-mark` (`packages/ba-triplex-mark`) adds the marker to the files Triplex classifies as react-three-fiber. It runs Triplex's babel plugin and follows components that inherit their root from a child into the child's file.

```sh
ba-triplex-mark --check src   # exit 1 and list 3D files missing the marker
ba-triplex-mark --write src   # add // @triplex-viewer as line 1; never removes one
```

Add `// @triplex-viewer-ignore` to a file's leading comments to keep it out. A project that uses Triplex can run `--check` in its own checks.
