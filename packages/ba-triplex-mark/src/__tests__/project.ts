/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Writes a throwaway project and returns its root. */
export function createProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "ba-triplex-mark-"));

  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }

  return root;
}

/**
 * A small project covering the shapes the classifier meets: three.js tags, R3F
 * hooks, DOM components, a <Canvas> shell, multi-export files, and 3D rendered
 * through wrapper components in other files, reached by package.json "imports",
 * tsconfig paths, a barrel and explicit extensions.
 */
export const fixtureFiles: Record<string, string> = {
  "package.json": JSON.stringify({
    imports: { "#parts/*": "./src/parts/*", "#ui": "./src/ui/index.ts" },
    name: "fixture",
  }),
  "src/barrel-scene.tsx": `
    import { Shell } from "#ui";
    export function BarrelScene() {
      return <Shell />;
    }
  `,
  "src/box.tsx": `
    export default function Box() {
      return (
        <mesh>
          <boxGeometry />
        </mesh>
      );
    }
  `,
  "src/canvas-app.tsx": `
    import { Canvas } from "@react-three/fiber";
    export function App() {
      return (
        <Canvas>
          <mesh />
        </Canvas>
      );
    }
  `,
  "src/cycle-a.tsx": `
    import { B } from "./cycle-b";
    export function A() {
      return <B />;
    }
  `,
  "src/cycle-b.tsx": `
    import { A } from "./cycle-a";
    export function B() {
      return <A />;
    }
  `,
  "src/dom-default.tsx": `
    export function Model() {
      return <mesh />;
    }
    export default function Page() {
      return <section />;
    }
  `,
  "src/dom.tsx": `
    export function Panel() {
      return <div>hello</div>;
    }
  `,
  "src/hook.tsx": `
    import { useFrame } from "@react-three/fiber";
    export function Spinner() {
      useFrame(() => {});
      return null;
    }
  `,
  "src/multi.tsx": `
    export function Legend() {
      return <div />;
    }
    export function Model() {
      return <group />;
    }
  `,
  "src/no-export.tsx": `
    function Hidden() {
      return <mesh />;
    }
  `,
  "src/parts/frame.tsx": `
    export function Frame() {
      return <group name="frame" />;
    }
  `,
  "src/parts/stage.tsx": `
    import { Frame } from "@/parts/frame";
    export function Stage() {
      return <Frame />;
    }
  `,
  "src/scene.tsx": `
    import { Stage } from "#parts/stage.tsx";
    export default function Scene() {
      return <Stage />;
    }
  `,
  "src/ui/Shell.tsx": `
    import { Stage } from "../parts/stage.js";
    function ShellRoot() {
      return <Stage />;
    }
    export { ShellRoot as Shell };
  `,
  "src/ui/index.ts": `
    export * from "./Shell.tsx";
  `,
  "src/wrapped-dom.tsx": `
    import { Panel } from "./dom";
    export function Wrapped() {
      return <Panel />;
    }
  `,
  "tsconfig.json": `{
    // JSONC, as tsconfig allows
    "compilerOptions": { "paths": { "@/*": ["./src/*"] }, },
  }`,
};
