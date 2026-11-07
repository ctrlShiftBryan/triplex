/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */
import { readFileSync } from "node:fs";
import { normalize } from "@triplex/lib/path";
import { inferExports } from "@triplex/server";
import { hasMarker } from "ba-triplex-mark/marker";
import * as vscode from "vscode";
import { logger } from "../../util/log/vscode";
import {
  FileChoices,
  shouldOpenInViewer,
  tabsToSwap,
  type OpenTab,
} from "./decide";

const log = logger("viewer-mode");

const VIEW_TYPE = "triplex.editor";
const SECTION = "baTriplex";
const SETTING = "openInViewer";
const HAS_COMPONENT_CONTEXT = "baTriplex.hasExportedComponent";

/** Per-file choices this session; Go To Definition records "source" here too. */
export const fileChoices = new FileChoices();

interface DescribedTab extends OpenTab {
  tab: vscode.Tab;
  uri: vscode.Uri;
}

function isComponentFile(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && /\.(jsx|tsx)$/.test(uri.fsPath);
}

/** The file's text: the open document (unsaved edits included), else the disk. */
function readSource(uri: vscode.Uri): string {
  const document = vscode.workspace.textDocuments.find(
    (doc) => doc.uri.scheme === "file" && doc.uri.fsPath === uri.fsPath,
  );

  if (document) {
    return document.getText();
  }

  try {
    return readFileSync(uri.fsPath, "utf8");
  } catch {
    return "";
  }
}

function hasExportedComponent(code: string): boolean {
  return inferExports(code).length > 0;
}

function isEnabled(): boolean {
  return vscode.workspace
    .getConfiguration(SECTION)
    .get<boolean>(SETTING, false);
}

function describeTab(tab: vscode.Tab): DescribedTab | undefined {
  const { input } = tab;
  const kind =
    input instanceof vscode.TabInputText && isComponentFile(input.uri)
      ? "source"
      : input instanceof vscode.TabInputCustom && input.viewType === VIEW_TYPE
        ? "viewer"
        : undefined;

  if (!kind) {
    return undefined;
  }

  const uri = vscode.Uri.file((input as { uri: vscode.Uri }).uri.fsPath);

  return {
    dirty: tab.isDirty,
    kind,
    marked: hasMarker(readSource(uri)),
    path: normalize(uri.fsPath),
    tab,
    uri,
  };
}

/** Swaps the source tab in the group for the viewer (the triplex.start path). */
async function openViewer(path: string, viewColumn: vscode.ViewColumn) {
  await vscode.commands.executeCommand("triplex.start", { path, viewColumn });
}

/**
 * Opens the source in the viewer's group and closes the viewer, unless it has
 * unsaved changes.
 */
async function openSource(uri: vscode.Uri, viewerTab: vscode.Tab) {
  await vscode.window.showTextDocument(uri, {
    preview: false,
    viewColumn: viewerTab.group.viewColumn,
  });

  if (!viewerTab.isDirty) {
    await vscode.window.tabGroups.close(viewerTab);
  }
}

async function toggle() {
  const config = vscode.workspace.getConfiguration(SECTION);
  const inspected = config.inspect<boolean>(SETTING);
  const enabled = !isEnabled();

  // A workspace value would override the user setting, so flip it where it is set.
  await config.update(
    SETTING,
    enabled,
    inspected?.workspaceValue === undefined
      ? vscode.ConfigurationTarget.Global
      : vscode.ConfigurationTarget.Workspace,
  );

  fileChoices.clear();
  vscode.window.showInformationMessage(
    enabled
      ? "BA Triplex: files marked // @triplex-viewer now open in the Triplex viewer."
      : "BA Triplex: files now open as source.",
  );

  const tabs = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .map(describeTab)
    .filter((tab): tab is DescribedTab => !!tab);

  for (const tab of tabsToSwap(tabs, enabled)) {
    if (!enabled) {
      await openSource(tab.uri, tab.tab);
    } else if (hasExportedComponent(readSource(tab.uri))) {
      await openViewer(tab.path, tab.tab.group.viewColumn);
    }
  }
}

async function showViewer() {
  const editor = vscode.window.activeTextEditor;

  if (!editor || !isComponentFile(editor.document.uri)) {
    return;
  }

  const path = normalize(editor.document.uri.fsPath);
  fileChoices.set(path, "viewer");
  await openViewer(path, editor.viewColumn ?? vscode.ViewColumn.Active);
}

async function showSource() {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const described = tab && describeTab(tab);

  if (!described || described.kind !== "viewer") {
    return;
  }

  fileChoices.set(described.path, "source");
  await openSource(described.uri, described.tab);
}

function updateContextKeys() {
  const document = vscode.window.activeTextEditor?.document;

  vscode.commands.executeCommand(
    "setContext",
    HAS_COMPONENT_CONTEXT,
    !!document &&
      isComponentFile(document.uri) &&
      hasExportedComponent(document.getText()),
  );
}

/** Auto-opens newly opened marked source tabs in the viewer when the mode is on. */
function onOpenedTabs(tabs: readonly vscode.Tab[]) {
  for (const tab of tabs) {
    const described = describeTab(tab);

    if (
      !described ||
      described.kind !== "source" ||
      !shouldOpenInViewer({
        choice: fileChoices.get(described.path),
        enabled: isEnabled(),
        marked: described.marked,
        newTab: true,
      }) ||
      !hasExportedComponent(readSource(described.uri))
    ) {
      continue;
    }

    openViewer(described.path, tab.group.viewColumn).catch((error) => {
      log.error(`Could not open ${described.path} in the viewer: ${error}`);
    });
  }
}

export function registerViewerMode(): vscode.Disposable {
  updateContextKeys();

  const disposables = [
    vscode.window.onDidChangeActiveTextEditor(updateContextKeys),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === vscode.window.activeTextEditor?.document) {
        updateContextKeys();
      }
    }),
    vscode.window.tabGroups.onDidChangeTabs((event) => {
      onOpenedTabs(event.opened);
    }),
    vscode.commands.registerCommand("baTriplex.toggle", toggle),
    vscode.commands.registerCommand("baTriplex.showSource", showSource),
    vscode.commands.registerCommand("baTriplex.showViewer", showViewer),
  ];

  return {
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}
