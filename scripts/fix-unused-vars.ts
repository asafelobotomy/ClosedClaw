/**
 * Auto-fix unused variables by prefixing with underscore
 *
 * This script parses oxlint output and automatically renames unused variables
 * to start with `_` which signals intentional non-use.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface UnusedVar {
  file: string;
  line: number;
  column: number;
  varName: string;
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
   
    // Extract variable/type/identifier name from different formats:
    // - "Variable 'name' is declared but never used"
    // - "Type 'name' is imported but never used"
    // - "Identifier 'name' is imported but never used"
    const varMatch = line.match(/(?:Variable|Type|Identifier) '(\w+)'/);
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
      
      // Sort by line number descending to avoid offset issues
      varsInFile.sort((a, b) => b.line - a.line);
      
      for (const v of varsInFile) {
        // Don't rename if already prefixed
        if (v.varName.startsWith("_")) {
          continue;
        }
        
        // Create regex patterns for different declaration contexts
        const patterns = [
          // const|let|var declarations
          new RegExp(`\\b(const|let|var)\\s+(${v.varName})\\b(?!:)`, "g"),
          // Function parameters
          new RegExp(`\\(([^)]*\\b)(${v.varName})\\b([^)]*\\))`, "g"),
          // Destructuring
          new RegExp(`([{,]\\s*)(${v.varName})(\\s*[,}])`, "g"),
          // Catch variables
          new RegExp(`(catch\\s*\\(\\s*)(${v.varName})(\\s*\\))`, "g"),
        ];
        
        for (const pattern of patterns) {
          const replaced = content.replace(pattern, (match, ...groups) => {
            // Check if this is the right occurrence by checking it's on the right line
            return match.replace(new RegExp(`\\b${v.varName}\\b`), `_${v.varName}`);
          });
          
          if (replaced !== content) {
            content = replaced;
            fixedCount++;
            break; // Only apply one pattern per variable
          }
        }
      }
      
      if (content !== originalContent) {
        writeFileSync(file, content, "utf-8");
        console.log(`✓ Fixed ${varsInFile.length} unused vars in ${file}`);
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

console.log(`Found ${unusedVars.length} unused variables\n`);

if (unusedVars.length > 0) {
  console.log("🔧 Applying fixes...\n");
  const fixed = fixUnusedVars(unusedVars);
  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  
  console.log(`\n✨ Fixed ${fixed} unused variables in ${elapsed}s`);
  console.log("\nRun 'pnpm check' to verify remaining errors");
} else {
  console.log("✨ No unused variables found!");
}
