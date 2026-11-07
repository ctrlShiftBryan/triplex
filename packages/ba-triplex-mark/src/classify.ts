/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */
import { readFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import { transformSync, type ParserOptions } from "@babel/core";
import * as t from "@babel/types";
import { createResolver } from "./resolve";
import { inferExports, triplexBabelPlugin } from "./triplex";

/** The `triplexMeta.root` Triplex's babel plugin gives a component. */
export type ComponentRoot = "react" | "react-three-fiber" | undefined;

export interface Classification {
  /** The export auto-open shows: the default export, else the last named one. */
  exportName: string | undefined;
  root: ComponentRoot;
}

type ExportTarget = { local: string } | { imported: string; source: string };

interface ModuleInfo {
  exports: Map<string, ExportTarget>;
  imports: Map<string, { imported: string; source: string }>;
  /** Each component's `triplexMeta.root` expression, by local name. */
  roots: Map<string, t.Expression>;
  starExports: string[];
}

/**
 * Classifies files the way Triplex does at runtime: runs Triplex's babel plugin
 * and evaluates the `triplexMeta.root` of the export auto-open would show. A
 * root that inherits from a child component (`Child?.triplexMeta?.root`)
 * follows the child's import into its own file.
 */
export function createClassifier() {
  const resolveImport = createResolver();
  const modules = new Map<string, ModuleInfo | null>();
  const roots = new Map<string, ComponentRoot>();
  /** The components being evaluated, to stop at an import cycle. */
  const inProgress = new Set<string>();
  /**
   * Cycles cut so far. A cut child reads as undefined, as an unassigned
   * triplexMeta does at runtime, but the answer then depends on which file was
   * the entry, so results computed across a cut are never cached.
   */
  let cycleCuts = 0;

  /**
   * A file the classifier follows into; one that fails to parse counts as not
   * 3D.
   */
  function load(file: string): ModuleInfo | null {
    if (!modules.has(file)) {
      try {
        modules.set(file, analyze(file));
      } catch {
        modules.set(file, null);
      }
    }

    return modules.get(file) ?? null;
  }

  /** Follows re-exports to the file and local name that define an export. */
  function resolveExport(
    file: string,
    exportName: string,
    seen: Set<string>,
  ): { file: string; local: string } | undefined {
    const key = `${file}#export:${exportName}`;
    const info = load(file);
    if (!info || seen.has(key)) {
      return undefined;
    }
    seen.add(key);

    const target = info.exports.get(exportName);

    if (target && "local" in target) {
      const imported = info.imports.get(target.local);
      return imported
        ? followImport(file, imported.source, imported.imported, seen)
        : { file, local: target.local };
    }

    if (target) {
      return followImport(file, target.source, target.imported, seen);
    }

    if (exportName === "default") {
      return undefined;
    }

    for (const source of info.starExports) {
      const found = followImport(file, source, exportName, seen);
      if (found) {
        return found;
      }
    }

    return undefined;
  }

  function followImport(
    file: string,
    source: string,
    exportName: string,
    seen: Set<string>,
  ) {
    const target = resolveImport(file, source);
    return target && exportName !== "*"
      ? resolveExport(target, exportName, seen)
      : undefined;
  }

  function rootOfLocal(file: string, local: string): ComponentRoot {
    const key = `${file}#${local}`;
    if (roots.has(key)) {
      return roots.get(key);
    }

    const info = load(file);
    if (!info) {
      return undefined;
    }

    if (inProgress.has(key)) {
      cycleCuts++;
      return undefined;
    }

    const cutsBefore = cycleCuts;
    inProgress.add(key);

    try {
      const expression = info.roots.get(local);
      const imported = info.imports.get(local);
      const definition =
        !expression &&
        imported &&
        followImport(file, imported.source, imported.imported, new Set());
      const root = expression
        ? evaluate(file, expression)
        : definition
          ? rootOfLocal(definition.file, definition.local)
          : undefined;

      if (cycleCuts === cutsBefore) {
        roots.set(key, root);
      }
      return root;
    } finally {
      inProgress.delete(key);
    }
  }

  /** Evaluates the root expressions the babel plugin emits. */
  function evaluate(file: string, node: t.Expression): ComponentRoot {
    if (t.isStringLiteral(node)) {
      return node.value === "react" || node.value === "react-three-fiber"
        ? node.value
        : undefined;
    }

    if (t.isLogicalExpression(node) && node.operator === "||") {
      return evaluate(file, node.left) || evaluate(file, node.right);
    }

    // Child?.triplexMeta?.root
    if (
      t.isOptionalMemberExpression(node) &&
      t.isIdentifier(node.property, { name: "root" }) &&
      t.isOptionalMemberExpression(node.object) &&
      t.isIdentifier(node.object.property, { name: "triplexMeta" }) &&
      t.isIdentifier(node.object.object)
    ) {
      return rootOfLocal(file, node.object.object.name);
    }

    return undefined;
  }

  /** Throws when the file itself fails to parse. */
  return function classifyFile(file: string): Classification {
    const exportName = inferExports(readFileSync(file, "utf8")).at(
      -1,
    )?.exportName;

    if (!modules.get(file)) {
      modules.set(file, analyze(file));
    }

    if (!exportName) {
      return { exportName, root: undefined };
    }

    const definition = resolveExport(file, exportName, new Set());

    return {
      exportName,
      root: definition
        ? rootOfLocal(definition.file, definition.local)
        : undefined,
    };
  };
}

function parserPlugins(file: string): ParserOptions["plugins"] {
  const ext = extname(file);
  return ext === ".ts" || ext === ".mts"
    ? ["typescript"]
    : ext === ".tsx"
      ? ["jsx", "typescript"]
      : ["jsx"];
}

function analyze(file: string): ModuleInfo | null {
  const result = transformSync(readFileSync(file, "utf8"), {
    ast: true,
    babelrc: false,
    code: false,
    configFile: false,
    cwd: dirname(file),
    filename: file,
    parserOpts: { plugins: parserPlugins(file) },
    plugins: [triplexBabelPlugin({ cwd: dirname(file), exclude: [] })],
  });

  if (!result?.ast) {
    return null;
  }

  const info: ModuleInfo = {
    exports: new Map(),
    imports: new Map(),
    roots: new Map(),
    starExports: [],
  };

  for (const statement of result.ast.program.body) {
    if (t.isImportDeclaration(statement)) {
      for (const specifier of statement.specifiers) {
        info.imports.set(specifier.local.name, {
          imported: t.isImportDefaultSpecifier(specifier)
            ? "default"
            : t.isImportNamespaceSpecifier(specifier)
              ? "*"
              : exportedName(specifier.imported),
          source: statement.source.value,
        });
      }
    } else if (t.isExportNamedDeclaration(statement)) {
      const { declaration, source } = statement;

      if (t.isFunctionDeclaration(declaration) && declaration.id) {
        info.exports.set(declaration.id.name, { local: declaration.id.name });
      } else if (t.isVariableDeclaration(declaration)) {
        for (const declarator of declaration.declarations) {
          if (t.isIdentifier(declarator.id)) {
            info.exports.set(declarator.id.name, { local: declarator.id.name });
          }
        }
      }

      for (const specifier of statement.specifiers) {
        if (!t.isExportSpecifier(specifier)) {
          continue;
        }

        info.exports.set(
          exportedName(specifier.exported),
          source
            ? { imported: specifier.local.name, source: source.value }
            : { local: specifier.local.name },
        );
      }
    } else if (t.isExportDefaultDeclaration(statement)) {
      const { declaration } = statement;

      if (
        (t.isFunctionDeclaration(declaration) ||
          t.isClassDeclaration(declaration)) &&
        declaration.id
      ) {
        info.exports.set("default", { local: declaration.id.name });
      } else if (t.isIdentifier(declaration)) {
        info.exports.set("default", { local: declaration.name });
      }
    } else if (t.isExportAllDeclaration(statement)) {
      info.starExports.push(statement.source.value);
    } else if (
      t.isExpressionStatement(statement) &&
      t.isAssignmentExpression(statement.expression) &&
      t.isMemberExpression(statement.expression.left) &&
      t.isIdentifier(statement.expression.left.object) &&
      t.isIdentifier(statement.expression.left.property, {
        name: "triplexMeta",
      }) &&
      t.isObjectExpression(statement.expression.right)
    ) {
      const root = statement.expression.right.properties.find(
        (property): property is t.ObjectProperty =>
          t.isObjectProperty(property) &&
          t.isStringLiteral(property.key, { value: "root" }),
      );

      if (root && t.isExpression(root.value)) {
        info.roots.set(statement.expression.left.object.name, root.value);
      }
    }
  }

  return info;
}

function exportedName(node: t.Identifier | t.StringLiteral): string {
  return t.isIdentifier(node) ? node.name : node.value;
}
