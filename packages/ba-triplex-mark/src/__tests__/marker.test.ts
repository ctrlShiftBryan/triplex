/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */
import { describe, expect, it } from "vitest";
import {
  addMarker,
  hasIgnoreMarker,
  hasMarker,
  leadingLineComments,
} from "../marker";

describe("leading comments", () => {
  it("finds the marker on the first line", () => {
    expect(hasMarker(`// @triplex-viewer\nimport { a } from "a";\n`)).toBe(
      true,
    );
  });

  it("finds the marker below a license header and a directive", () => {
    const code = `/**\n * Copyright\n */\n"use client";\n// @triplex-viewer\nimport { a } from "a";\n`;

    expect(hasMarker(code)).toBe(true);
  });

  it("finds the marker after a shebang", () => {
    expect(hasMarker(`#!/usr/bin/env node\n// @triplex-viewer\n`)).toBe(true);
  });

  it("ignores a marker after the first import", () => {
    const code = `import { a } from "a";\n// @triplex-viewer\n`;

    expect(hasMarker(code)).toBe(false);
  });

  it("ignores a marker inside a block comment or trailing text", () => {
    expect(hasMarker(`/* @triplex-viewer */\n`)).toBe(false);
    expect(hasMarker(`// @triplex-viewer please\n`)).toBe(false);
  });

  it("tells the ignore comment apart from the marker", () => {
    const code = `// @triplex-viewer-ignore\nexport function A() {}\n`;

    expect(hasMarker(code)).toBe(false);
    expect(hasIgnoreMarker(code)).toBe(true);
  });

  it("lists every leading line comment", () => {
    expect(
      leadingLineComments(`// one\n/* skip */\n//two\nconst x = 1; // three\n`),
    ).toEqual(["one", "two"]);
  });
});

describe("add marker", () => {
  it("adds the marker as line 1", () => {
    expect(addMarker(`import { a } from "a";\n`)).toBe(
      `// @triplex-viewer\nimport { a } from "a";\n`,
    );
  });

  it("adds it above a license header", () => {
    expect(addMarker(`/** License */\nimport "a";\n`)).toBe(
      `// @triplex-viewer\n/** License */\nimport "a";\n`,
    );
  });

  it("keeps a shebang first", () => {
    expect(addMarker(`#!/usr/bin/env node\nimport "a";\n`)).toBe(
      `#!/usr/bin/env node\n// @triplex-viewer\nimport "a";\n`,
    );
  });

  it("keeps CRLF line endings", () => {
    expect(addMarker(`import "a";\r\n`)).toBe(
      `// @triplex-viewer\r\nimport "a";\r\n`,
    );
  });

  it("is idempotent", () => {
    const once = addMarker(`import "a";\n`);

    expect(addMarker(once)).toBe(once);
  });
});
