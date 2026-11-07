/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */

/** Opens the file in the Triplex viewer when BA Toggle - Triplex is on. */
export const MARKER = "@triplex-viewer";
/** Keeps a 3D file out of the viewer; ba-triplex-mark --check stays green. */
export const IGNORE_MARKER = "@triplex-viewer-ignore";

/**
 * The text of each `//` comment at the top of a file, before the first
 * statement. A shebang, block comments and directive prologues ("use client")
 * are skipped over, so a marker below a license header or directive still
 * counts.
 */
export function leadingLineComments(code: string): string[] {
  const comments: string[] = [];
  let i = code.startsWith("#!") ? lineEnd(code, 0) : 0;

  while (i < code.length) {
    const char = code[i];

    if (/\s/.test(char)) {
      i++;
    } else if (code.startsWith("//", i)) {
      const end = lineEnd(code, i);
      comments.push(code.slice(i + 2, end).trim());
      i = end;
    } else if (code.startsWith("/*", i)) {
      const end = code.indexOf("*/", i + 2);
      if (end === -1) {
        break;
      }
      i = end + 2;
    } else if (char === '"' || char === "'") {
      const directive = new RegExp(`^${char}[^${char}\\n]*${char};?`).exec(
        code.slice(i),
      );
      if (!directive) {
        break;
      }
      i += directive[0].length;
    } else {
      break;
    }
  }

  return comments;
}

function lineEnd(code: string, from: number): number {
  const end = code.indexOf("\n", from);
  return end === -1 ? code.length : end;
}

export function hasMarker(code: string): boolean {
  return leadingLineComments(code).includes(MARKER);
}

export function hasIgnoreMarker(code: string): boolean {
  return leadingLineComments(code).includes(IGNORE_MARKER);
}

/** Adds `// @triplex-viewer` as the first line (after a shebang). Idempotent. */
export function addMarker(code: string): string {
  if (hasMarker(code)) {
    return code;
  }

  const eol = code.includes("\r\n") ? "\r\n" : "\n";
  const line = `// ${MARKER}${eol}`;

  if (code.startsWith("#!")) {
    const end = lineEnd(code, 0);
    const shebang = end === code.length ? code + eol : code.slice(0, end + 1);
    return shebang + line + code.slice(end + 1);
  }

  return line + code;
}
