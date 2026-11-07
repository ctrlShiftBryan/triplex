/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */
/* eslint-disable no-console */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { createClassifier } from "./classify";
import { addMarker, hasIgnoreMarker, hasMarker, MARKER } from "./marker";

const USAGE = `Usage: ba-triplex-mark (--check | --write) <paths...>

Finds 3D component files (.tsx/.jsx) whose export Triplex would open, the
default export or else the last named one, renders react-three-fiber, and
checks them for the // ${MARKER} marker that BA Triplex auto-opens.

  --check   list each 3D file missing the marker; exit 1 when any is missing
  --write   add the marker as the first line of each; never removes one
  --help    show this help

A file with // ${MARKER}-ignore in its leading comments is skipped.`;

const SOURCE_EXTENSIONS = new Set([".tsx", ".jsx"]);

export interface RunResult {
  /** Files that failed to parse. */
  errors: { file: string; message: string }[];
  /** 3D files that were missing the marker (and, with --write, now have it). */
  missing: string[];
}

/**
 * Collects .tsx/.jsx files under the paths, skipping node_modules and dot
 * folders.
 */
export function collectFiles(paths: string[]): string[] {
  const files = new Set<string>();

  function walk(path: string) {
    const stat = statSync(path);

    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) {
        if (entry !== "node_modules" && !entry.startsWith(".")) {
          walk(join(path, entry));
        }
      }
    } else if (SOURCE_EXTENSIONS.has(extname(path))) {
      files.add(path);
    }
  }

  for (const path of paths) {
    walk(resolve(path));
  }

  return [...files].sort();
}

export function run(paths: string[], { write }: { write: boolean }): RunResult {
  const classify = createClassifier();
  const result: RunResult = { errors: [], missing: [] };

  for (const file of collectFiles(paths)) {
    const code = readFileSync(file, "utf8");

    if (hasMarker(code) || hasIgnoreMarker(code)) {
      continue;
    }

    try {
      if (classify(file).root !== "react-three-fiber") {
        continue;
      }
    } catch (error) {
      result.errors.push({
        file,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    result.missing.push(file);

    if (write) {
      writeFileSync(file, addMarker(code));
    }
  }

  return result;
}

export function main(argv: string[]): number {
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const paths = argv.filter((arg) => !arg.startsWith("--"));
  const unknown = flags.filter(
    (flag) => !["--check", "--write", "--help"].includes(flag),
  );

  if (flags.includes("--help")) {
    console.log(USAGE);
    return 0;
  }

  const check = flags.includes("--check");
  const write = flags.includes("--write");

  if (unknown.length || check === write || paths.length === 0) {
    console.error(
      unknown.length ? `Unknown option: ${unknown.join(", ")}\n` : "",
    );
    console.error(USAGE);
    return 2;
  }

  let result: RunResult;
  try {
    result = run(paths, { write });
  } catch (error) {
    console.error(
      `ba-triplex-mark: ${error instanceof Error ? error.message : error}`,
    );
    return 2;
  }

  const show = (file: string) => relative(process.cwd(), file);

  for (const { file, message } of result.errors) {
    console.error(`ba-triplex-mark: skipped ${show(file)}: ${message}`);
  }

  if (write) {
    for (const file of result.missing) {
      console.log(`marked ${show(file)}`);
    }
    console.log(
      `ba-triplex-mark: marked ${result.missing.length} file(s) with // ${MARKER}.`,
    );
    return 0;
  }

  if (result.missing.length) {
    console.error(
      `ba-triplex-mark: ${result.missing.length} 3D component file(s) missing // ${MARKER}:`,
    );
    for (const file of result.missing) {
      console.error(`  ${show(file)}`);
    }
    console.error(
      `Run "ba-triplex-mark --write ${paths.join(" ")}" to add the marker, or add // ${MARKER}-ignore to a file's leading comments to keep it out.`,
    );
    return 1;
  }

  console.log("ba-triplex-mark: every 3D component file is marked.");
  return 0;
}
