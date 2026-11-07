/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";

const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs"];

interface PackageJson {
  dir: string;
  imports: Record<string, unknown> | undefined;
}

interface TsconfigPaths {
  /** compilerOptions.baseUrl, as an absolute directory. */
  baseUrl: string | undefined;
  paths: Record<string, unknown> | undefined;
  /**
   * The directory of the config that set `paths`; targets resolve from it
   * without a baseUrl.
   */
  pathsDir: string | undefined;
}

/**
 * Resolves an import to a source file in the project: relative and
 * root-absolute paths, explicit or missing extensions, package.json "imports"
 * (#aliases), tsconfig paths/baseUrl (with `extends` and `references`), and
 * workspace packages linked into node_modules. Packages installed in
 * node_modules resolve to undefined; they are never followed.
 */
export function createResolver() {
  const packageCache = new Map<string, PackageJson | null>();
  const tsconfigCache = new Map<string, TsconfigPaths[]>();

  function nearestPackage(dir: string): PackageJson | null {
    const cached = packageCache.get(dir);
    if (cached !== undefined) {
      return cached;
    }

    const file = join(dir, "package.json");
    const parent = dirname(dir);
    let result: PackageJson | null;

    if (existsSync(file)) {
      const json = readJson(file);
      result = {
        dir,
        imports:
          isRecord(json) && isRecord(json.imports) ? json.imports : undefined,
      };
    } else {
      result = parent === dir ? null : nearestPackage(parent);
    }

    packageCache.set(dir, result);
    return result;
  }

  /**
   * The nearest tsconfig.json and the configs it references (Vite's
   * tsconfig.app.json).
   */
  function nearestTsconfigs(dir: string): TsconfigPaths[] {
    const cached = tsconfigCache.get(dir);
    if (cached !== undefined) {
      return cached;
    }

    const file = join(dir, "tsconfig.json");
    const parent = dirname(dir);
    let result: TsconfigPaths[] = [];

    if (existsSync(file)) {
      const json = readJson(file);
      const references =
        isRecord(json) && Array.isArray(json.references) ? json.references : [];

      result = [file, ...references.flatMap((ref) => referencePath(dir, ref))]
        .map((config) => loadTsconfig(config, new Set()))
        .filter((config): config is TsconfigPaths => !!config);
    } else if (parent !== dir) {
      result = nearestTsconfigs(parent);
    }

    tsconfigCache.set(dir, result);
    return result;
  }

  function resolvePackageImport(
    fromDir: string,
    specifier: string,
  ): string | undefined {
    const pkg = nearestPackage(fromDir);
    if (!pkg?.imports) {
      return undefined;
    }

    const targets = matchPattern(pkg.imports, specifier, (value, star) => {
      const path = conditionTarget(value);
      return path ? [path.replaceAll("*", star)] : [];
    });

    return firstFile(targets.map((path) => resolve(pkg.dir, path)));
  }

  function resolveTsconfigPath(
    fromDir: string,
    specifier: string,
  ): string | undefined {
    for (const config of nearestTsconfigs(fromDir)) {
      const base = config.baseUrl ?? config.pathsDir;
      const targets =
        base && config.paths
          ? matchPattern(config.paths, specifier, (value, star) =>
              Array.isArray(value)
                ? value.flatMap((path) =>
                    typeof path === "string"
                      ? [resolve(base, path.replaceAll("*", star))]
                      : [],
                  )
                : [],
            )
          : [];
      const file =
        firstFile(targets) ??
        (config.baseUrl
          ? resolveFile(resolve(config.baseUrl, specifier))
          : undefined);

      if (file) {
        return file;
      }
    }

    return undefined;
  }

  /**
   * A workspace package linked into node_modules resolves to its real path
   * outside it.
   */
  function resolveWorkspacePackage(
    fromFile: string,
    specifier: string,
  ): string | undefined {
    try {
      const file = createRequire(fromFile).resolve(specifier);
      return !file.includes(`${sep}node_modules${sep}`) &&
        EXTENSIONS.includes(extname(file))
        ? file
        : undefined;
    } catch {
      return undefined;
    }
  }

  return function resolveImport(
    fromFile: string,
    specifier: string,
  ): string | undefined {
    const fromDir = dirname(fromFile);

    if (specifier.startsWith(".")) {
      return resolveFile(resolve(fromDir, specifier));
    }

    if (specifier.startsWith("/")) {
      // A bundler such as Vite resolves /src/x from the project root.
      const root = nearestPackage(fromDir)?.dir;
      return (
        resolveFile(specifier) ??
        (root ? resolveFile(join(root, specifier)) : undefined)
      );
    }

    if (specifier.startsWith("#")) {
      return resolvePackageImport(fromDir, specifier);
    }

    return (
      resolveTsconfigPath(fromDir, specifier) ??
      resolveWorkspacePackage(fromFile, specifier)
    );
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

function firstFile(paths: string[]): string | undefined {
  for (const path of paths) {
    const file = resolveFile(path);
    if (file) {
      return file;
    }
  }

  return undefined;
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
 * conditions, skipping "types" (declarations have no components to follow).
 */
function conditionTarget(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(conditionTarget).find(Boolean);
  }

  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([condition]) => condition !== "types")
      .map(([, target]) => conditionTarget(target))
      .find(Boolean);
  }

  return undefined;
}

function referencePath(dir: string, reference: unknown): string[] {
  if (!isRecord(reference) || typeof reference.path !== "string") {
    return [];
  }

  const path = resolve(dir, reference.path);
  return [path.endsWith(".json") ? path : join(path, "tsconfig.json")];
}

/**
 * A tsconfig's baseUrl and paths, following relative `extends` (a string or an
 * array).
 */
function loadTsconfig(file: string, seen: Set<string>): TsconfigPaths | null {
  if (seen.has(file) || !isFile(file)) {
    return null;
  }
  seen.add(file);

  const json = readJson(file);
  if (!isRecord(json)) {
    return null;
  }

  const dir = dirname(file);
  const parents = (
    Array.isArray(json.extends) ? json.extends : [json.extends]
  ).filter(
    (parent): parent is string =>
      typeof parent === "string" && parent.startsWith("."),
  );
  // Later configs in `extends` win, and the config's own options win over all.
  const merged: TsconfigPaths = {
    baseUrl: undefined,
    paths: undefined,
    pathsDir: undefined,
  };

  for (const parent of parents) {
    const path = resolve(dir, parent);
    const config = loadTsconfig(
      path.endsWith(".json") ? path : `${path}.json`,
      seen,
    );
    merged.baseUrl = config?.baseUrl ?? merged.baseUrl;
    if (config?.paths) {
      merged.paths = config.paths;
      merged.pathsDir = config.pathsDir;
    }
  }

  const options = isRecord(json.compilerOptions) ? json.compilerOptions : {};

  if (typeof options.baseUrl === "string") {
    merged.baseUrl = resolve(dir, options.baseUrl);
  }

  if (isRecord(options.paths)) {
    merged.paths = options.paths;
    merged.pathsDir = dir;
  }

  return merged;
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
