/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createResolver } from "../resolve";
import { createProject } from "./project";

const component = "export function Thing() { return <mesh />; }\n";

describe("resolver", () => {
  it("resolves relative paths with explicit, missing and .js extensions", () => {
    const root = createProject({
      "src/a.tsx": component,
      "src/b/index.ts": "",
    });
    const resolve = createResolver();
    const from = join(root, "src/main.tsx");

    expect(resolve(from, "./a.tsx")).toBe(join(root, "src/a.tsx"));
    expect(resolve(from, "./a")).toBe(join(root, "src/a.tsx"));
    expect(resolve(from, "./a.js")).toBe(join(root, "src/a.tsx"));
    expect(resolve(from, "./b")).toBe(join(root, "src/b/index.ts"));
  });

  it("resolves package.json imports, skipping the types condition", () => {
    const root = createProject({
      "package.json": JSON.stringify({
        imports: {
          "#cond": { default: "./src/a.tsx", types: "./src/a.d.ts" },
          "#lib/*": "./src/lib/*",
        },
      }),
      "src/a.d.ts": "",
      "src/a.tsx": component,
      "src/lib/x.tsx": component,
    });
    const resolve = createResolver();
    const from = join(root, "src/main.tsx");

    expect(resolve(from, "#cond")).toBe(join(root, "src/a.tsx"));
    expect(resolve(from, "#lib/x.tsx")).toBe(join(root, "src/lib/x.tsx"));
  });

  it("resolves tsconfig paths against a baseUrl inherited through an extensionless extends", () => {
    const root = createProject({
      "app/tsconfig.json": JSON.stringify({
        compilerOptions: { paths: { "@/*": ["src/*"] } },
        extends: "../tsconfig.base",
      }),
      "src/a.tsx": component,
      "tsconfig.base.json": JSON.stringify({
        compilerOptions: { baseUrl: "." },
      }),
    });

    expect(createResolver()(join(root, "app/main.tsx"), "@/a")).toBe(
      join(root, "src/a.tsx"),
    );
  });

  it("resolves paths from an extends array and from baseUrl alone", () => {
    const root = createProject({
      "base-a.json": JSON.stringify({
        compilerOptions: { paths: { "~/*": ["./x/*"] } },
      }),
      "base-b.json": JSON.stringify({
        compilerOptions: { paths: { "~/*": ["./src/*"] } },
      }),
      "src/a.tsx": component,
      "tsconfig.json": JSON.stringify({
        extends: ["./base-a.json", "./base-b.json"],
      }),
    });
    const baseUrlOnly = createProject({
      "src/a.tsx": component,
      "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: "src" } }),
    });

    expect(createResolver()(join(root, "main.tsx"), "~/a")).toBe(
      join(root, "src/a.tsx"),
    );
    expect(createResolver()(join(baseUrlOnly, "main.tsx"), "a")).toBe(
      join(baseUrlOnly, "src/a.tsx"),
    );
  });

  it("resolves paths from a referenced tsconfig", () => {
    const root = createProject({
      "src/a.tsx": component,
      "tsconfig.app.json": JSON.stringify({
        compilerOptions: { paths: { "@/*": ["./src/*"] } },
      }),
      "tsconfig.json": JSON.stringify({
        files: [],
        references: [{ path: "./tsconfig.app.json" }],
      }),
    });

    expect(createResolver()(join(root, "src/main.tsx"), "@/a")).toBe(
      join(root, "src/a.tsx"),
    );
  });

  it("resolves a root-absolute path from the project root", () => {
    const root = createProject({
      "package.json": "{}",
      "src/a.tsx": component,
    });

    expect(createResolver()(join(root, "src/deep/main.tsx"), "/src/a")).toBe(
      join(root, "src/a.tsx"),
    );
  });

  it("follows a linked workspace package but not an installed one", () => {
    const root = createProject({
      "node_modules/installed/index.js": "",
      "node_modules/installed/package.json": JSON.stringify({
        main: "index.js",
      }),
      "package.json": "{}",
      "packages/ui/package.json": JSON.stringify({
        main: "src/index.tsx",
        name: "ui",
      }),
      "packages/ui/src/index.tsx": component,
    });
    mkdirSync(join(root, "node_modules"), { recursive: true });
    symlinkSync(join(root, "packages/ui"), join(root, "node_modules/ui"));
    const resolve = createResolver();
    const from = join(root, "src/main.tsx");

    expect(resolve(from, "ui")).toMatch(/packages\/ui\/src\/index\.tsx$/);
    expect(resolve(from, "installed")).toBeUndefined();
  });
});
