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

`scripts/install-fork-vsce.sh` builds the extension from `HEAD` in `../triplex-worktrees/vsix-build`, installs it into this machine's VS Code server (Remote-SSH), and uninstalls the marketplace `trytriplex.triplex-vsce`. The fork publishes as `ctrlshiftbryan.triplex-vsce`, so marketplace updates never replace it. Commit first, then run the script and reload the VS Code window.
