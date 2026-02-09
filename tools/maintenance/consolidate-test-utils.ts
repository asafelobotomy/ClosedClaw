/**
 * Repository Reorganization: Phase 2 - Consolidate Test Utilities
 * 
 * Consolidates fragmented test utilities from src/test-helpers/ and src/test-utils/
 * into unified test/helpers/ location.
 */

import fs from "node:fs/promises";
import path from "node:path";

async function* walkDir(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.includes("node_modules") && entry.name !== "dist") {
        yield* walkDir(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      yield fullPath;
    }
  }
}

interface Migration {
  from: string;
  to: string;
  type: "file" | "import";
}

// Files to move
const FILE_MIGRATIONS: Migration[] = [
  { from: "src/test-helpers/workspace.ts", to: "test/helpers/workspace.ts", type: "file" },
  { from: "src/test-utils/ports.ts", to: "test/helpers/ports.ts", type: "file" },
  { from: "src/test-utils/channel-plugins.ts", to: "test/helpers/channel-plugins.ts", type: "file" },
];

// Import path transformations based on file location
interface ImportTransform {
  pattern: RegExp;
  replacement: string;
  filePattern: string;
}

const IMPORT_TRANSFORMS: ImportTransform[] = [
  // From src/ → test/helpers/ (going up one level, then to test/)
  {
    pattern: /from ['"]\.\.\/test-helpers\/workspace(\.js)?['"]/g,
    replacement: 'from "../../test/helpers/workspace.js"',
    filePattern: "src/**/*.ts",
  },
  {
    pattern: /from ['"]\.\.\/test-utils\/(channel-plugins|ports)(\.js)?['"]/g,
    replacement: 'from "../../test/helpers/$1.js"',
    filePattern: "src/**/*.ts",
  },
  {
    pattern: /from ['"]\.\.\/\.\.\/test-utils\/(channel-plugins|ports)(\.js)?['"]/g,
    replacement: 'from "../../../test/helpers/$1.js"',
    filePattern: "src/**/**/*.ts",
  },
  
  // From test/ → test/helpers/ (same directory)
  {
    pattern: /from ['"]\.\.\/src\/test-utils\/(channel-plugins|ports)(\.js)?['"]/g,
    replacement: 'from "./helpers/$1.js"',
    filePattern: "test/**/*.ts",
  },
];

async function copyFile(from: string, to: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
    
    // Preserve executable permissions
    const stats = await fs.stat(from);
    if (stats.mode & 0o111) {
      await fs.chmod(to, stats.mode);
    }
    
    console.log(`✓ Copied: ${from} → ${to}`);
  } catch (err) {
    console.error(`✗ Failed: ${from} → ${to}`, err);
    throw err;
  }
}

async function updateImports(): Promise<number> {
  let totalUpdates = 0;
  
  // Get all TypeScript files
  const files: string[] = [];
  for await (const file of walkDir(process.cwd())) {
    files.push(file);
  }
  
  for (const file of files) {
    try {
      let content = await fs.readFile(file, "utf-8");
      let changed = false;
      let updatesInFile = 0;
      
      // Apply all transformations
      for (const transform of IMPORT_TRANSFORMS) {
        const matches = content.match(transform.pattern);
        if (matches) {
          content = content.replace(transform.pattern, transform.replacement);
          changed = true;
          updatesInFile += matches.length;
        }
      }
      
      if (changed) {
        await fs.writeFile(file, content, "utf-8");
        console.log(`✓ Updated ${updatesInFile} import(s) in: ${file}`);
        totalUpdates += updatesInFile;
      }
    } catch (err) {
      console.error(`✗ Failed to update imports in: ${file}`, err);
    }
  }
  
  return totalUpdates;
}

async function removeOldDirectories(): Promise<void> {
  const dirsToRemove = ["src/test-helpers", "src/test-utils"];
  
  for (const dir of dirsToRemove) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      console.log(`✓ Removed: ${dir}/`);
    } catch (err) {
      console.error(`✗ Failed to remove: ${dir}/`, err);
    }
  }
}

async function generateReport(updatesCount: number): Promise<void> {
  console.log("\n📊 Phase 2 Migration Summary:");
  console.log("============================");
  console.log(`  Files moved:       ${FILE_MIGRATIONS.length}`);
  console.log(`  Imports updated:   ${updatesCount}`);
  console.log(`  Old dirs removed:  2 (src/test-helpers, src/test-utils)`);
  console.log("\n✅ Test utilities consolidated!");
  console.log("\nNew location: test/helpers/");
  console.log("  - workspace.ts");
  console.log("  - ports.ts");
  console.log("  - channel-plugins.ts");
}

async function migrate(options: { dryRun?: boolean } = {}): Promise<void> {
  const { dryRun = false } = options;
  
  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No files will be modified\n");
  }
  
  console.log("🚀 Starting Phase 2: Test Utilities Consolidation\n");
  
  // Step 1: Copy files to new location
  console.log("📁 Migrating test utility files...\n");
  for (const migration of FILE_MIGRATIONS) {
    if (!dryRun) {
      await copyFile(migration.from, migration.to);
    } else {
      console.log(`[DRY RUN] Would copy: ${migration.from} → ${migration.to}`);
    }
  }
  
  // Step 2: Update imports
  console.log("\n📝 Updating import statements...\n");
  let updatesCount = 0;
  if (!dryRun) {
    updatesCount = await updateImports();
  } else {
    console.log("[DRY RUN] Would scan and update imports in all TypeScript files");
  }
  
  // Step 3: Remove old directories
  console.log("\n🗑️  Removing old test utility directories...\n");
  if (!dryRun) {
    await removeOldDirectories();
  } else {
    console.log("[DRY RUN] Would remove: src/test-helpers/");
    console.log("[DRY RUN] Would remove: src/test-utils/");
  }
  
  // Report
  await generateReport(updatesCount);
  
  if (!dryRun) {
    console.log("\nNext steps:");
    console.log("  1. Run tests: pnpm test");
    console.log("  2. Verify build: pnpm build");
    console.log("  3. Check for any remaining references to old paths");
  } else {
    console.log("\n✅ Dry run complete! Run without --dry-run to execute.");
  }
}

// CLI
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

migrate({ dryRun }).catch((error) => {
  console.error("\n❌ Migration failed:", error);
  process.exit(1);
});
