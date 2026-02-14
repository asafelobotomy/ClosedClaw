/**
 * Auto-fix unused variables by prefixing with underscore
 *
 * This script parses oxlint output and automatically fixes unused variables:
 * - Imports: Removes from import statement
 * - Parameters: Prefixes with `_`
 * - Variables: Prefixes with `_`
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type UnusedVarKind = "import" | "parameter" | "variable";

interface UnusedVar {
  file: string;
  line: number;
  column: number;
  varName: string;
  kind: UnusedVarKind;
}

function extractUnusedVars(): UnusedVar[] {
  // Run oxlint and capture output
  const output = execSync("pnpm oxlint 2>&1 || true", {
    encoding: "utf-8",
    cwd: resolve(process.cwd()),
  });

  const vars: UnusedVar[] = [];

  // Parse line-by-line for no-unused-vars errors
  const lines = output.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this is a no-unused-vars error
    if (!line.includes("eslint(no-unused-vars)")) {
      continue;
    }

    // Determine kind based on error message
    let kind: UnusedVarKind = "variable";
    if (line.includes("is imported but never used")) {
      kind = "import";
    } else if (line.includes("Parameter") && line.includes("is declared but never used")) {
      kind = "parameter";
    }

    // Extract variable/type/identifier/parameter name
    const varMatch = line.match(/(?:Variable|Type|Identifier|Parameter) '(\w+)'/);
    if (!varMatch) {
      continue;
    }

    // Look ahead for the location line: ,-[file.ts:line:col]
    const lookAhead = lines[i + 1] || "";
    const locationMatch = lookAhead.match(/,-\[(.*?):(\d+):(\d+)\]/);

    if (locationMatch) {
      vars.push({
        file: locationMatch[1],
        line: Number.parseInt(locationMatch[2], 10),
        column: Number.parseInt(locationMatch[3], 10),
        varName: varMatch[1],
        kind,
      });
    }
  }

  return vars;
}

function fixUnusedVars(vars: UnusedVar[]): number {
  const fileGroups = new Map<string, UnusedVar[]>();

  // Group by file
  for (const v of vars) {
    const existing = fileGroups.get(v.file) ?? [];
    existing.push(v);
    fileGroups.set(v.file, existing);
  }

  let fixedCount = 0;

  for (const [file, varsInFile] of fileGroups.entries()) {
    try {
      let content = readFileSync(file, "utf-8");
      const originalContent = content;
      const lines = content.split("\n");

      // Sort by line number descending to avoid offset issues
      varsInFile.sort((a, b) => b.line - a.line);

      for (const v of varsInFile) {
        // Don't process if already prefixed
        if (v.varName.startsWith("_")) {
          continue;
        }

        if (v.kind === "import") {
          // Remove from import statement
          const lineIdx = v.line - 1;
          const line = lines[lineIdx];

          if (!line) {
            continue;
          }

          // Check if this is a type-only import
          const _isTypeImport = line.includes("import type");

          // Pattern 1: Single import - remove entire line
          // import { Something } from "..."
          // import type { Something } from "..."
          const singleImportPattern = new RegExp(
            `^\\s*import\\s+(?:type\\s+)?{\\s*${v.varName}\\s*}\\s+from\\s+["'].*?["'];?\\s*$`,
          );

          if (singleImportPattern.test(line)) {
            lines[lineIdx] = ""; // Remove entire line
            fixedCount++;
            continue;
          }

          // Pattern 2: Multiple imports - just remove this identifier
          // import { foo, Bar, baz } from "..."
          // import type { Foo, Bar, Baz } from "..."

          // Remove with leading comma: ", Identifier"
          let newLine = line.replace(new RegExp(`,\\s*${v.varName}\\b`), "");

          // Remove with trailing comma: "Identifier, "
          if (newLine === line) {
            newLine = line.replace(new RegExp(`\\b${v.varName}\\s*,`), "");
          }

          // Remove standalone (only identifier left): "{ Identifier }"
          if (newLine === line) {
            newLine = line.replace(new RegExp(`\\b${v.varName}\\b`), "");
          }

          // Clean up empty braces or double commas
          newLine = newLine.replace(/{\s*,/, "{");
          newLine = newLine.replace(/,\s*}/, "}");
          newLine = newLine.replace(/,\s*,/, ",");
          newLine = newLine.replace(/{\s*}/, "{}");

          // If we ended up with empty import, remove the line
          if (newLine.match(/import\s+(?:type\s+)?{}\s+from/)) {
            newLine = "";
          }

          if (newLine !== line) {
            lines[lineIdx] = newLine;
            fixedCount++;
          }
        } else if (v.kind === "parameter") {
          // Prefix parameters with underscore
          const lineIdx = v.line - 1;
          const line = lines[lineIdx];

          if (!line) {
            continue;
          }

          // Match parameter in function signature
          // Patterns:
          // - function(param)
          // - function(param: Type)
          // - function(param?: Type)
          // - (param) =>
          // - (param: Type) =>

          const newLine = line.replace(
            new RegExp(`\\b${v.varName}\\b(?=\\s*[?:,)])`),
            `_${v.varName}`,
          );

          if (newLine !== line) {
            lines[lineIdx] = newLine;
            fixedCount++;
          }
        } else {
          // Variable: prefix with underscore
          const lineIdx = v.line - 1;
          const line = lines[lineIdx];

          if (!line) {
            continue;
          }

          // Match variable declarations
          // - const varName =
          // - let varName =
          // - var varName =
          const newLine = line.replace(
            new RegExp(`\\b(const|let|var)\\s+${v.varName}\\b`),
            `$1 _${v.varName}`,
          );

          if (newLine !== line) {
            lines[lineIdx] = newLine;
            fixedCount++;
          }
        }
      }

      content = lines.join("\n");

      if (content !== originalContent) {
        writeFileSync(file, content, "utf-8");
        const importCount = varsInFile.filter((v) => v.kind === "import").length;
        const paramCount = varsInFile.filter((v) => v.kind === "parameter").length;
        const varCount = varsInFile.filter((v) => v.kind === "variable").length;

        const parts: string[] = [];
        if (importCount > 0) {
          parts.push(`${importCount} imports`);
        }
        if (paramCount > 0) {
          parts.push(`${paramCount} params`);
        }
        if (varCount > 0) {
          parts.push(`${varCount} vars`);
        }

        console.log(`✓ Fixed ${parts.join(", ")} in ${file}`);
      }
    } catch (err) {
      console.error(`✗ Error processing ${file}:`, err);
    }
  }

  return fixedCount;
}

// Main execution
console.log("🔍 Scanning for unused variables...\n");

const start = performance.now();
const unusedVars = extractUnusedVars();

const importCount = unusedVars.filter((v) => v.kind === "import").length;
const paramCount = unusedVars.filter((v) => v.kind === "parameter").length;
const varCount = unusedVars.filter((v) => v.kind === "variable").length;

console.log(`Found ${unusedVars.length} unused variables:`);
console.log(`  - ${importCount} imports (will remove)`);
console.log(`  - ${paramCount} parameters (will prefix with _)`);
console.log(`  - ${varCount} variables (will prefix with _)\n`);

if (unusedVars.length > 0) {
  console.log("🔧 Applying fixes...\n");
  const fixed = fixUnusedVars(unusedVars);
  const elapsed = ((performance.now() - start) / 1000).toFixed(2);

  console.log(`\n✨ Fixed ${fixed} unused variables in ${elapsed}s`);
  console.log("\nRun 'pnpm check' to verify remaining errors");
} else {
  console.log("✨ No unused variables found!");
}
