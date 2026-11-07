/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs"];

interface PackageImports {
  dir: string;
  imports: Record<string, unknown>;
}

interface TsconfigPaths {
  /** The directory `paths` targets and `baseUrl` lookups resolve from. */
  base: string;
  baseUrl: boolean;
  paths: Record<string, string[]>;
}

/**
 * Resolves an import to a source file in the project: relative paths, explicit
 * or missing extensions, package.json "imports" (#aliases) and tsconfig
 * paths/baseUrl. Bare packages (node_modules) resolve to undefined; they are
 * never followed.
 */
export function createResolver() {
  const packageCache = new Map<string, PackageImports | null>();
  const tsconfigCache = new Map<string, TsconfigPaths | null>();

  function nearestPackage(dir: string): PackageImports | null {
    const cached = packageCache.get(dir);
    if (cached !== undefined) {
      return cached;
    }

    const file = join(dir, "package.json");
    const parent = dirname(dir);
    let result: PackageImports | null;

    if (existsSync(file)) {
      const json = readJson(file);
      const imports = isRecord(json) && isRecord(json.imports) && json.imports;
      result = imports ? { dir, imports } : null;
    } else {
      result = parent === dir ? null : nearestPackage(parent);
    }

    packageCache.set(dir, result);
    return result;
  }

  function nearestTsconfig(dir: string): TsconfigPaths | null {
    const cached = tsconfigCache.get(dir);
    if (cached !== undefined) {
      return cached;
    }

    const file = join(dir, "tsconfig.json");
    const parent = dirname(dir);
    const result = existsSync(file)
      ? loadTsconfig(file, new Set())
      : parent === dir
        ? null
        : nearestTsconfig(parent);

    tsconfigCache.set(dir, result);
    return result;
  }

  function resolvePackageImport(
    fromDir: string,
    specifier: string,
  ): string | undefined {
    const pkg = nearestPackage(fromDir);
    if (!pkg) {
      return undefined;
    }

    const target = matchPattern(pkg.imports, specifier, (value, star) => {
      const path = conditionTarget(value);
      return path ? [path.replaceAll("*", star)] : [];
    });

    for (const path of target) {
      const file = resolveFile(resolve(pkg.dir, path));
      if (file) {
        return file;
      }
    }

    return undefined;
  }

  function resolveTsconfigPath(
    fromDir: string,
    specifier: string,
  ): string | undefined {
    const config = nearestTsconfig(fromDir);
    if (!config) {
      return undefined;
    }

    const targets = matchPattern(config.paths, specifier, (value, star) =>
      Array.isArray(value)
        ? value.flatMap((path) =>
            typeof path === "string" ? [path.replaceAll("*", star)] : [],
          )
        : [],
    );

    for (const path of targets) {
      const file = resolveFile(resolve(config.base, path));
      if (file) {
        return file;
      }
    }

    return config.baseUrl
      ? resolveFile(resolve(config.base, specifier))
      : undefined;
  }

  return function resolveImport(
    fromFile: string,
    specifier: string,
  ): string | undefined {
    const fromDir = dirname(fromFile);

    if (specifier.startsWith(".") || specifier.startsWith("/")) {
      return resolveFile(resolve(fromDir, specifier));
    }

    if (specifier.startsWith("#")) {
      return resolvePackageImport(fromDir, specifier);
    }

    return resolveTsconfigPath(fromDir, specifier);
  };
}

/**
 * The first existing file for an import path, trying extensions and index
 * files.
 */
function resolveFile(path: string): string | undefined {
  const withoutJsExtension = path.replace(/\.(m?js|jsx)$/, "");
  const candidates = [
    path,
    ...EXTENSIONS.map((ext) => path + ext),
    ...(withoutJsExtension === path
      ? []
      : EXTENSIONS.map((ext) => withoutJsExtension + ext)),
    ...EXTENSIONS.map((ext) => join(path, "index" + ext)),
  ];

  return candidates.find(isFile);
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Matches a specifier against a map of exact keys and single-`*` patterns, the
 * longest prefix winning, the way both package.json "imports" and tsconfig
 * "paths" match.
 */
function matchPattern(
  map: Record<string, unknown>,
  specifier: string,
  expand: (value: unknown, star: string) => string[],
): string[] {
  if (specifier in map) {
    return expand(map[specifier], "");
  }

  let best: { prefix: string; star: string; value: unknown } | undefined;

  for (const [key, value] of Object.entries(map)) {
    const star = key.indexOf("*");
    if (star === -1) {
      continue;
    }

    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);

    if (
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix) &&
      specifier.length >= prefix.length + suffix.length &&
      (!best || prefix.length > best.prefix.length)
    ) {
      best = {
        prefix,
        star: specifier.slice(prefix.length, specifier.length - suffix.length),
        value,
      };
    }
  }

  return best ? expand(best.value, best.star) : [];
}

/**
 * The path of an "imports" target: a string, or the first string in its
 * conditions.
 */
function conditionTarget(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(conditionTarget).find(Boolean);
  }

  if (isRecord(value)) {
    return Object.values(value).map(conditionTarget).find(Boolean);
  }

  return undefined;
}

function loadTsconfig(file: string, seen: Set<string>): TsconfigPaths | null {
  if (seen.has(file)) {
    return null;
  }
  seen.add(file);

  const json = readJson(file);
  if (!isRecord(json)) {
    return null;
  }

  const dir = dirname(file);
  const options = isRecord(json.compilerOptions) ? json.compilerOptions : {};
  const parent =
    typeof json.extends === "string" && json.extends.startsWith(".")
      ? loadTsconfig(
          resolveFile(resolve(dir, json.extends)) ?? resolve(dir, json.extends),
          seen,
        )
      : null;
  const baseUrl =
    typeof options.baseUrl === "string"
      ? resolve(dir, options.baseUrl)
      : undefined;
  const paths = isRecord(options.paths)
    ? (options.paths as Record<string, string[]>)
    : undefined;

  if (!paths && !baseUrl) {
    return parent;
  }

  return {
    base: baseUrl ?? (paths ? dir : (parent?.base ?? dir)),
    baseUrl: Boolean(baseUrl) || Boolean(parent?.baseUrl),
    paths: paths ?? parent?.paths ?? {},
  };
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(stripJsonComments(readFileSync(file, "utf8")));
  } catch {
    return undefined;
  }
}

/** Strips comments and trailing commas so tsconfig's JSONC parses as JSON. */
function stripJsonComments(text: string): string {
  return text
    .replaceAll(
      /("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\S\s]*?\*\//g,
      (_match, string) => string ?? "",
    )
    .replaceAll(/,(\s*[\]}])/g, "$1");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
