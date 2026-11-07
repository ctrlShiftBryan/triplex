/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../cli";
import { createProject, fixtureFiles } from "./project";

const THREE_D_FILES = [
  "src/barrel-scene.tsx",
  "src/box.tsx",
  "src/hook.tsx",
  "src/multi.tsx",
  "src/parts/frame.tsx",
  "src/parts/stage.tsx",
  "src/scene.tsx",
];

describe("ba-triplex-mark", () => {
  let root: string;
  let output: string[];

  beforeEach(() => {
    root = createProject(fixtureFiles);
    output = [];
    const capture = (...args: unknown[]) => {
      output.push(args.join(" "));
    };
    vi.spyOn(console, "log").mockImplementation(capture);
    vi.spyOn(console, "error").mockImplementation(capture);
    vi.spyOn(process, "cwd").mockReturnValue(root);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const read = (path: string) => readFileSync(join(root, path), "utf8");
  const src = () => join(root, "src");

  it("--check exits 1 and lists each 3D file missing the marker", () => {
    expect(main(["--check", src()])).toBe(1);

    const listed = output
      .filter((line) => line.startsWith("  "))
      .map((line) => line.trim());

    expect(listed).toEqual(THREE_D_FILES);
  });

  it("--write adds the marker to 3D files only, then --check passes", () => {
    expect(main(["--write", src()])).toBe(0);

    for (const file of THREE_D_FILES) {
      expect(read(file).startsWith("// @triplex-viewer\n")).toBe(true);
    }

    expect(read("src/dom.tsx")).toBe(fixtureFiles["src/dom.tsx"]);
    expect(read("src/canvas-app.tsx")).toBe(fixtureFiles["src/canvas-app.tsx"]);

    expect(main(["--check", src()])).toBe(0);
  });

  it("--write is idempotent", () => {
    main(["--write", src()]);
    const once = read("src/box.tsx");

    main(["--write", src()]);

    expect(read("src/box.tsx")).toBe(once);
    expect(output.at(-1)).toContain("marked 0 file(s)");
  });

  it("never removes a hand-written marker from a non-3D file", () => {
    writeFileSync(
      join(root, "src/dom.tsx"),
      "// @triplex-viewer\n" + fixtureFiles["src/dom.tsx"],
    );

    main(["--write", src()]);

    expect(read("src/dom.tsx").startsWith("// @triplex-viewer\n")).toBe(true);
  });

  it("skips files with the ignore comment", () => {
    const ignored = "// @triplex-viewer-ignore\n" + fixtureFiles["src/box.tsx"];
    writeFileSync(join(root, "src/box.tsx"), ignored);

    main(["--write", src()]);

    expect(read("src/box.tsx")).toBe(ignored);
    expect(main(["--check", join(root, "src/box.tsx")])).toBe(0);
  });

  it("reports a file that fails to parse without failing the check", () => {
    writeFileSync(join(root, "src/broken.tsx"), "export function Broken( {");

    expect(main(["--check", join(root, "src/broken.tsx")])).toBe(0);
    expect(output.join("\n")).toContain("skipped src/broken.tsx");
  });

  it("exits 2 on bad usage", () => {
    expect(main([])).toBe(2);
    expect(main(["--check", "--write", src()])).toBe(2);
    expect(main(["--check"])).toBe(2);
    expect(main(["--bogus", src()])).toBe(2);
  });
});
