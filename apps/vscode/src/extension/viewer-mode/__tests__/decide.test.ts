/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */
import { describe, expect, it } from "vitest";
import {
  FileChoices,
  shouldOpenInViewer,
  tabsToSwap,
  type FileChoice,
} from "../decide";

describe("shouldOpenInViewer", () => {
  const choices: (FileChoice | undefined)[] = [undefined, "source", "viewer"];

  // setting × per-file choice × marker × new vs. existing tab
  const table = [true, false].flatMap((enabled) =>
    choices.flatMap((choice) =>
      [true, false].flatMap((marked) =>
        [true, false].map((newTab) => ({ choice, enabled, marked, newTab })),
      ),
    ),
  );

  it.each(table)("%o", (event) => {
    const expected =
      event.newTab &&
      event.enabled &&
      (event.choice ? event.choice === "viewer" : event.marked);

    expect(shouldOpenInViewer(event)).toBe(expected);
  });

  it("opens a new marked tab when the mode is on", () => {
    expect(
      shouldOpenInViewer({
        choice: undefined,
        enabled: true,
        marked: true,
        newTab: true,
      }),
    ).toBe(true);
  });

  it("never acts on switching to an existing tab", () => {
    expect(
      shouldOpenInViewer({
        choice: "viewer",
        enabled: true,
        marked: true,
        newTab: false,
      }),
    ).toBe(false);
  });

  it("keeps a file as source after Go To Definition records it", () => {
    const fileChoices = new FileChoices();
    fileChoices.set("/project/scene.tsx", "source");

    expect(
      shouldOpenInViewer({
        choice: fileChoices.get("/project/scene.tsx"),
        enabled: true,
        marked: true,
        newTab: true,
      }),
    ).toBe(false);
  });

  it("opens an unmarked file chosen with Show Triplex Viewer", () => {
    expect(
      shouldOpenInViewer({
        choice: "viewer",
        enabled: true,
        marked: false,
        newTab: true,
      }),
    ).toBe(true);
  });

  it("does nothing with the mode off, whatever the choice", () => {
    expect(
      shouldOpenInViewer({
        choice: "viewer",
        enabled: false,
        marked: true,
        newTab: true,
      }),
    ).toBe(false);
  });
});

describe("tabsToSwap", () => {
  const tabs = [
    { dirty: false, kind: "source", marked: true, path: "a" },
    { dirty: true, kind: "source", marked: true, path: "b" },
    { dirty: false, kind: "source", marked: false, path: "c" },
    { dirty: false, kind: "viewer", marked: true, path: "d" },
    { dirty: true, kind: "viewer", marked: true, path: "e" },
    { dirty: false, kind: "viewer", marked: false, path: "f" },
  ] as const;

  it("moves clean marked source tabs to the viewer when turned on", () => {
    expect(tabsToSwap([...tabs], true).map((tab) => tab.path)).toEqual(["a"]);
  });

  it("moves clean marked viewer tabs to source when turned off", () => {
    expect(tabsToSwap([...tabs], false).map((tab) => tab.path)).toEqual(["d"]);
  });
});

describe("FileChoices", () => {
  it("forgets every choice when cleared", () => {
    const fileChoices = new FileChoices();
    fileChoices.set("a", "viewer");
    fileChoices.clear();

    expect(fileChoices.get("a")).toBeUndefined();
  });
});
