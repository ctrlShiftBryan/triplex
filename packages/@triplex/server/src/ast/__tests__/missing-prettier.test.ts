/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */
import { copyFileSync, rmSync } from "node:fs";
import { join } from "@triplex/lib/path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createProject } from "../project";

Object.assign(process, { send: () => {} });
vi.mock(require.resolve("prettier", { paths: [process.cwd()] }), () => ({
  default: undefined,
}));

// Saving writes to disk, so work on a copy of the shared fixture.
const fixturePath = join(
  __dirname,
  "__mocks__",
  "box.missing-prettier.tmp.tsx",
);
beforeAll(() =>
  copyFileSync(join(__dirname, "__mocks__", "box.tsx"), fixturePath),
);
afterAll(() => rmSync(fixturePath, { force: true }));

it("should gracefully handle throws when prettier is missing", async () => {
  const consoleSpy = vi.spyOn(console, "error");
  const project = createProject({
    cwd: process.cwd(),
    templates: { newElements: "" },
    tsConfigFilePath: join(__dirname, "__mocks__", "tsconfig.json"),
  });
  const sourceFile = project.getSourceFile(fixturePath);
  sourceFile.open("default");
  await sourceFile.edit((source) => {
    source.addFunction({ name: "foo" });
  });

  await sourceFile.save();

  expect(consoleSpy).toHaveBeenCalled();
});
