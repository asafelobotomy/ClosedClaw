import { createRequire } from "node:module";
import { installProcessWarningFilter } from "../infra/warnings.js";

const require = createRequire(import.meta.url);

export function requireNodeSqlite(): typeof import("node:sqlite") {
  installProcessWarningFilter();
  try {
    return require("node:sqlite") as typeof import("node:sqlite");
  } catch (err) {
    throw new Error(
      "node:sqlite is not available. This requires Node.js >= 22.5.0 " +
        "(stable from 23.4.0+). Ensure your Node.js version supports the " +
        "built-in SQLite module. Current version: " +
        process.version,
      { cause: err },
    );
  }
}
