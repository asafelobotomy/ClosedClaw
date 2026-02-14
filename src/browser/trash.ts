import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TIMEOUT_HTTP_SHORT_MS } from "../config/constants/index.js";
import { runExec } from "../process/exec.js";

export async function movePathToTrash(targetPath: string): Promise<string> {
  try {
    await runExec("trash", [targetPath], { timeoutMs: TIMEOUT_HTTP_SHORT_MS });
    return targetPath;
  } catch {
    const trashDir = path.join(os.homedir(), ".Trash");
    fs.mkdirSync(trashDir, { recursive: true });
    const base = path.basename(targetPath);
    let dest = path.join(trashDir, `${base}-${Date.now()}`);
    if (fs.existsSync(dest)) {
      dest = path.join(trashDir, `${base}-${Date.now()}-${Math.random()}`);
    }
    fs.renameSync(targetPath, dest);
    return dest;
  }
}
