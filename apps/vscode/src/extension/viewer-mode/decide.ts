/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */

/**
 * How a file was last shown by hand this session: BA: Show Source / Show
 * Triplex Viewer.
 */
export type FileChoice = "source" | "viewer";

export interface OpenEvent {
  /** The file's per-file choice this session, if any. */
  choice: FileChoice | undefined;
  /** The baTriplex.openInViewer setting. */
  enabled: boolean;
  /** The file's leading comments contain // @triplex-viewer. */
  marked: boolean;
  /** A tab was just opened; switching to an existing tab is not a new tab. */
  newTab: boolean;
}

/** Whether a source tab should be swapped for the Triplex viewer. */
export function shouldOpenInViewer(event: OpenEvent): boolean {
  if (!event.newTab || !event.enabled) {
    return false;
  }

  if (event.choice) {
    return event.choice === "viewer";
  }

  return event.marked;
}

export interface OpenTab {
  dirty: boolean;
  kind: "source" | "viewer";
  marked: boolean;
  path: string;
}

/**
 * The tabs to swap after BA Toggle - Triplex flips the mode: marked source tabs
 * move to the viewer when it turns on, marked viewer tabs back to source when
 * it turns off. Tabs with unsaved changes stay as they are.
 */
export function tabsToSwap<T extends OpenTab>(
  tabs: T[],
  enabled: boolean,
): T[] {
  const from = enabled ? "source" : "viewer";
  return tabs.filter((tab) => tab.kind === from && tab.marked && !tab.dirty);
}

/** Per-file choices, kept in memory until VS Code restarts or the mode flips. */
export class FileChoices {
  private readonly choices = new Map<string, FileChoice>();

  clear() {
    this.choices.clear();
  }

  get(path: string): FileChoice | undefined {
    return this.choices.get(path);
  }

  set(path: string, choice: FileChoice) {
    this.choices.set(path, choice);
  }
}
