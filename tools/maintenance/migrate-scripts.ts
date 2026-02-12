/**
 * Repository Reorganization: Phase 1 - Scripts Migration
 * 
 * Migrates scripts from flat scripts/ directory to organized tools/ structure.
 * Safe migration: copies files, updates package.json, creates symlinks for backwards compatibility.
 */

import fs from "node:fs/promises";
import path from "node:path";

interface Migration {
  from: string;
  to: string;
  category: string;
}

// Complete mapping of all scripts to new locations
const MIGRATIONS: Migration[] = [
  // Build & Compilation
  { from: "scripts/bundle-a2ui.sh", to: "tools/build/bundle-a2ui.sh", category: "build" },
  { from: "scripts/canvas-a2ui-copy.ts", to: "tools/build/canvas-a2ui-copy.ts", category: "build" },
  { from: "scripts/copy-hook-metadata.ts", to: "tools/build/copy-hook-metadata.ts", category: "build" },
  { from: "scripts/write-build-info.ts", to: "tools/build/write-build-info.ts", category: "build" },
  { from: "scripts/build_icon.sh", to: "tools/build/build_icon.sh", category: "build" },
  { from: "scripts/build-docs-list.mjs", to: "tools/docs/build-docs-list.mjs", category: "docs" },

  // Development Tools
  { from: "scripts/auth-monitor.sh", to: "tools/dev/auth-monitor.sh", category: "dev" },
  { from: "scripts/bench-model.ts", to: "tools/dev/bench-model.ts", category: "dev" },
  { from: "scripts/debug-claude-usage.ts", to: "tools/dev/debug-claude-usage.ts", category: "dev" },
  { from: "scripts/fix-unused-vars.ts", to: "tools/dev/fix-unused-vars.ts", category: "dev" },
  { from: "scripts/run-node.mjs", to: "tools/dev/run-node.mjs", category: "dev" },
  { from: "scripts/watch-node.mjs", to: "tools/dev/watch-node.mjs", category: "dev" },
  { from: "scripts/check-ts-max-loc.ts", to: "tools/dev/check-ts-max-loc.ts", category: "dev" },
  { from: "scripts/postinstall.js", to: "tools/dev/postinstall.js", category: "dev" },

  // Platform-specific: macOS
  { from: "scripts/package-mac-dist.sh", to: "tools/platform/macos/package-mac-dist.sh", category: "platform" },
  { from: "scripts/notarize-mac-artifact.sh", to: "tools/platform/macos/notarize-mac-artifact.sh", category: "platform" },
  { from: "scripts/make_appcast.sh", to: "tools/platform/macos/make_appcast.sh", category: "platform" },

  // Platform-specific: Linux
  { from: "scripts/clawlog-linux.sh", to: "tools/platform/linux/clawlog-linux.sh", category: "platform" },

  // Platform-specific: iOS
  { from: "scripts/ios-team-id.sh", to: "tools/platform/ios/ios-team-id.sh", category: "platform" },

  // Platform-specific: Mobile (cross-platform mobile)
  { from: "scripts/mobile-reauth.sh", to: "tools/platform/mobile/mobile-reauth.sh", category: "platform" },

  // Docker & Containers
  { from: "scripts/sandbox-browser-entrypoint.sh", to: "tools/docker/sandbox-browser-entrypoint.sh", category: "docker" },
  { from: "scripts/sandbox-browser-setup.sh", to: "tools/docker/sandbox-browser-setup.sh", category: "docker" },
  { from: "scripts/sandbox-common-setup.sh", to: "tools/docker/sandbox-common-setup.sh", category: "docker" },
  { from: "scripts/sandbox-setup.sh", to: "tools/docker/sandbox-setup.sh", category: "docker" },

  // CI/CD & Git
  { from: "scripts/committer", to: "tools/ci/committer", category: "ci" },
  { from: "scripts/format-staged.js", to: "tools/ci/format-staged.js", category: "ci" },
  { from: "scripts/setup-git-hooks.js", to: "tools/ci/setup-git-hooks.js", category: "ci" },

  // Testing
  { from: "scripts/test-parallel.mjs", to: "tools/testing/test-parallel.mjs", category: "testing" },
  { from: "scripts/test-cleanup-docker.sh", to: "tools/testing/test-cleanup-docker.sh", category: "testing" },
  { from: "scripts/test-install-sh-docker.sh", to: "tools/testing/test-install-sh-docker.sh", category: "testing" },
  { from: "scripts/test-install-sh-e2e-docker.sh", to: "tools/testing/test-install-sh-e2e-docker.sh", category: "testing" },
  { from: "scripts/test-live-gateway-models-docker.sh", to: "tools/testing/test-live-gateway-models-docker.sh", category: "testing" },
  { from: "scripts/test-live-models-docker.sh", to: "tools/testing/test-live-models-docker.sh", category: "testing" },

  // Documentation
  { from: "scripts/docs-list.js", to: "tools/docs/docs-list.js", category: "docs" },
  { from: "scripts/changelog-to-html.sh", to: "tools/docs/changelog-to-html.sh", category: "docs" },

  // Deployment & DevOps
  { from: "scripts/tailscale-enforce.sh", to: "tools/deployment/cloud/tailscale-enforce.sh", category: "deployment" },
  { from: "scripts/tailscale-mullvad.sh", to: "tools/deployment/cloud/tailscale-mullvad.sh", category: "deployment" },
  { from: "scripts/tailscale-preflight.sh", to: "tools/deployment/cloud/tailscale-preflight.sh", category: "deployment" },
  { from: "scripts/setup-auth-system.sh", to: "tools/deployment/cloud/setup-auth-system.sh", category: "deployment" },
  { from: "scripts/termux-auth-widget.sh", to: "tools/deployment/cloud/termux-auth-widget.sh", category: "deployment" },
  { from: "scripts/termux-quick-auth.sh", to: "tools/deployment/cloud/termux-quick-auth.sh", category: "deployment" },
  { from: "scripts/termux-sync-widget.sh", to: "tools/deployment/cloud/termux-sync-widget.sh", category: "deployment" },

  // Maintenance & Release
  { from: "scripts/release-check.ts", to: "tools/maintenance/release-check.ts", category: "maintenance" },
  { from: "scripts/sync-labels.ts", to: "tools/maintenance/sync-labels.ts", category: "maintenance" },
  { from: "scripts/sync-moonshot-docs.ts", to: "tools/maintenance/sync-moonshot-docs.ts", category: "maintenance" },
  { from: "scripts/sync-plugin-versions.ts", to: "tools/maintenance/sync-plugin-versions.ts", category: "maintenance" },
  { from: "scripts/protocol-gen-swift.ts", to: "tools/maintenance/protocol-gen-swift.ts", category: "maintenance" },
  { from: "scripts/protocol-gen.ts", to: "tools/maintenance/protocol-gen.ts", category: "maintenance" },
  { from: "scripts/firecrawl-compare.ts", to: "tools/maintenance/firecrawl-compare.ts", category: "maintenance" },
  { from: "scripts/readability-basic-compare.ts", to: "tools/maintenance/readability-basic-compare.ts", category: "maintenance" },
  { from: "scripts/sqlite-vec-smoke.mjs", to: "tools/maintenance/sqlite-vec-smoke.mjs", category: "maintenance" },
  { from: "scripts/update-clawtributors.ts", to: "tools/maintenance/update-clawtributors.ts", category: "maintenance" },
  { from: "scripts/update-clawtributors.types.ts", to: "tools/maintenance/update-clawtributors.types.ts", category: "maintenance" },
  { from: "scripts/zai-fallback-repro.ts", to: "tools/testing/repro/zai-fallback-repro.ts", category: "testing" },
  { from: "scripts/test-force.ts", to: "tools/testing/test-force.ts", category: "testing" },
  { from: "scripts/ui.js", to: "tools/dev/ui.js", category: "dev" },
  { from: "scripts/claude-auth-status.sh", to: "tools/dev/claude-auth-status.sh", category: "dev" },
];

// Subdirectories to move as-is
const DIRECTORY_MIGRATIONS = [
  { from: "scripts/docker", to: "tools/docker/legacy", category: "docker" },
  { from: "scripts/docs-i18n", to: "tools/docs/i18n", category: "docs" },
  { from: "scripts/e2e", to: "tools/testing/e2e", category: "testing" },
  { from: "scripts/pre-commit", to: "tools/ci/pre-commit", category: "ci" },
  { from: "scripts/repro", to: "tools/testing/repro", category: "testing" },
  { from: "scripts/systemd", to: "tools/deployment/systemd", category: "deployment" },
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

async function copyDirectory(from: string, to: string): Promise<void> {
  try {
    await fs.mkdir(to, { recursive: true });
    const entries = await fs.readdir(from, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(from, entry.name);
      const destPath = path.join(to, entry.name);
      
      if (entry.isDirectory()) {
        await copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
        const stats = await fs.stat(srcPath);
        if (stats.mode & 0o111) {
          await fs.chmod(destPath, stats.mode);
        }
      }
    }
    
    console.log(`✓ Copied directory: ${from} → ${to}`);
  } catch (err) {
    console.error(`✗ Failed directory: ${from} → ${to}`, err);
    throw err;
  }
}

async function createSymlink(from: string, to: string): Promise<void> {
  try {
    const relativePath = path.relative(path.dirname(from), to);
    await fs.symlink(relativePath, from);
    console.log(`✓ Symlink: ${from} → ${to}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      console.error(`✗ Symlink failed: ${from} → ${to}`, err);
    }
  }
}

async function updatePackageJson(): Promise<void> {
  const pkgPath = "package.json";
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
  
  let updatedCount = 0;
  const scriptEntries = Object.entries(pkg.scripts as Record<string, string>);
  
  for (const [key, cmd] of scriptEntries) {
    let updated = cmd;
    for (const { from, to } of MIGRATIONS) {
      if (updated.includes(from)) {
        updated = updated.replace(new RegExp(from.replace(/\//g, "\\/"), "g"), to);
        updatedCount++;
      }
    }
    for (const { from, to } of DIRECTORY_MIGRATIONS) {
      if (updated.includes(from)) {
        updated = updated.replace(new RegExp(from.replace(/\//g, "\\/"), "g"), to);
        updatedCount++;
      }
    }
    pkg.scripts[key] = updated;
  }
  
  // Update files array
  if (Array.isArray(pkg.files)) {
    pkg.files = pkg.files.map((file: string) => {
      for (const { from, to } of MIGRATIONS) {
        if (file === from) {return to;}
      }
      return file;
    });
    
    // Add tools directory to files
    if (!pkg.files.includes("tools")) {
      pkg.files.push("tools");
    }
  }
  
  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`\n✓ Updated package.json (${updatedCount} script references)`);
}

async function generateReport(): Promise<void> {
  const categories = MIGRATIONS.reduce((acc, m) => {
    acc[m.category] = (acc[m.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log("\n📊 Migration Summary:");
  console.log("==================");
  for (const [category, count] of Object.entries(categories).toSorted(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${category.padEnd(15)} ${count} files`);
  }
  console.log(`  ${"directories".padEnd(15)} ${DIRECTORY_MIGRATIONS.length} directories`);
  console.log(`  ${"TOTAL".padEnd(15)} ${MIGRATIONS.length + DIRECTORY_MIGRATIONS.length} items`);
}

async function migrate(options: { dryRun?: boolean; createSymlinks?: boolean } = {}): Promise<void> {
  const { dryRun = false, createSymlinks = true } = options;
  
  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No files will be modified\n");
  }
  
  console.log("🚀 Starting repository reorganization (Phase 1: Scripts)\n");
  
  // Step 1: Copy files
  console.log("📁 Copying files...\n");
  for (const migration of MIGRATIONS) {
    if (!dryRun) {
      await copyFile(migration.from, migration.to);
    } else {
      console.log(`[DRY RUN] Would copy: ${migration.from} → ${migration.to}`);
    }
  }
  
  // Step 2: Copy directories
  console.log("\n📁 Copying directories...\n");
  for (const migration of DIRECTORY_MIGRATIONS) {
    if (!dryRun) {
      await copyDirectory(migration.from, migration.to);
    } else {
      console.log(`[DRY RUN] Would copy directory: ${migration.from} → ${migration.to}`);
    }
  }
  
  // Step 3: Update package.json
  console.log("\n📝 Updating package.json...\n");
  if (!dryRun) {
    await updatePackageJson();
  } else {
    console.log("[DRY RUN] Would update package.json script references");
  }
  
  // Step 4: Create symlinks for backwards compatibility
  if (createSymlinks) {
    console.log("\n🔗 Creating backwards compatibility symlinks...\n");
    for (const migration of MIGRATIONS) {
      if (!dryRun) {
        await createSymlink(migration.from, migration.to);
      } else {
        console.log(`[DRY RUN] Would create symlink: ${migration.from} → ${migration.to}`);
      }
    }
  }
  
  await generateReport();
  
  if (!dryRun) {
    console.log("\n✅ Migration complete!");
    console.log("\nNext steps:");
    console.log("  1. Test critical scripts: pnpm build, pnpm dev");
    console.log("  2. Update documentation references to scripts/");
    console.log("  3. After 1-2 releases, remove scripts/ directory");
  } else {
    console.log("\n✅ Dry run complete! Run without --dry-run to execute.");
  }
}

// CLI
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const noSymlinks = args.has("--no-symlinks");

migrate({ dryRun, createSymlinks: !noSymlinks }).catch((error) => {
  console.error("\n❌ Migration failed:", error);
  process.exit(1);
});
