/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createClassifier } from "../classify";
import { createProject, fixtureFiles } from "./project";

describe("classifier", () => {
  let root: string;
  let classify: ReturnType<typeof createClassifier>;

  beforeAll(() => {
    root = createProject(fixtureFiles);
    classify = createClassifier();
  });

  const classifyFixture = (path: string) => classify(join(root, path));

  it("classifies three.js tags as react-three-fiber", () => {
    expect(classifyFixture("src/box.tsx")).toEqual({
      exportName: "default",
      root: "react-three-fiber",
    });
  });

  it("classifies a component using an R3F hook as react-three-fiber", () => {
    expect(classifyFixture("src/hook.tsx").root).toBe("react-three-fiber");
  });

  it("classifies a DOM component as react", () => {
    expect(classifyFixture("src/dom.tsx").root).toBe("react");
  });

  it("classifies a component rendering <Canvas> as react", () => {
    expect(classifyFixture("src/canvas-app.tsx").root).toBe("react");
  });

  it("classifies the last named export of a multi-export file", () => {
    expect(classifyFixture("src/multi.tsx")).toEqual({
      exportName: "Model",
      root: "react-three-fiber",
    });
  });

  it("prefers the default export over named ones", () => {
    expect(classifyFixture("src/dom-default.tsx")).toEqual({
      exportName: "default",
      root: "react",
    });
  });

  it("follows a chain of two wrapper components across files", () => {
    expect(classifyFixture("src/scene.tsx").root).toBe("react-three-fiber");
    expect(classifyFixture("src/parts/stage.tsx").root).toBe(
      "react-three-fiber",
    );
  });

  it("follows a barrel re-export and a renamed export", () => {
    expect(classifyFixture("src/barrel-scene.tsx").root).toBe(
      "react-three-fiber",
    );
  });

  it("follows a wrapper of a DOM component to react", () => {
    expect(classifyFixture("src/wrapped-dom.tsx").root).toBe("react");
  });

  it("stops at an import cycle", () => {
    expect(classifyFixture("src/cycle-a.tsx")).toEqual({
      exportName: "CycleA",
      root: undefined,
    });
  });

  it("returns no export for a file without exported components", () => {
    expect(classifyFixture("src/no-export.tsx")).toEqual({
      exportName: undefined,
      root: undefined,
    });
  });
});

describe("classifier across a cycle with a host element", () => {
  // RingA renders <RingB /> and a <mesh />; RingB renders <RingA />. At
  // runtime either file is 3D: the first assignment sees no triplexMeta on
  // the other component yet and falls back to its own host element.
  const files = {
    "package.json": "{}",
    "ring-a.tsx": `
      import { RingB } from "./ring-b";
      export function RingA() {
        return (
          <>
            <RingB />
            <mesh />
          </>
        );
      }
    `,
    "ring-b.tsx": `
      import { RingA } from "./ring-a";
      export function RingB() {
        return <RingA />;
      }
    `,
  };

  it.each([
    ["ring-a.tsx", "ring-b.tsx"],
    ["ring-b.tsx", "ring-a.tsx"],
  ])("classifies both files as 3D in order %s, %s", (first, second) => {
    const root = createProject(files);
    const classify = createClassifier();

    expect(classify(join(root, first)).root).toBe("react-three-fiber");
    expect(classify(join(root, second)).root).toBe("react-three-fiber");
  });
});
