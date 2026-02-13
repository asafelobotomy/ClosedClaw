/**
 * ClawTalk Dictionary
 *
 * Manages the macro and abbreviation dictionary for ClawTalk protocol.
 * Handles loading, saving, versioning, proposals, and LRU eviction.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ClawTalkDictionary, ClawTalkMacro, ClawTalkProposal } from "./types.js";

const DEFAULT_DICTIONARY: ClawTalkDictionary = {
  version: 1,
  updated: new Date().toISOString(),
  macros: {
    WEBSRCH: {
      expansion: 'CT/1 REQ web_search q="{query}" limit={limit}',
      description: "Quick web search",
      params: ["query", "limit"],
      addedBy: "system",
      addedAt: "2026-02-09",
      usageCount: 0,
    },
    READFILE: {
      expansion: 'CT/1 REQ read_file target="{path}"',
      description: "Read a file",
      params: ["path"],
      addedBy: "system",
      addedAt: "2026-02-09",
      usageCount: 0,
    },
    LSDIR: {
      expansion: 'CT/1 REQ list_directory target="{path}"',
      description: "List directory contents",
      params: ["path"],
      addedBy: "system",
      addedAt: "2026-02-09",
      usageCount: 0,
    },
    RUNCMD: {
      expansion: 'CT/1 REQ exec cmd="{command}"',
      description: "Execute a shell command",
      params: ["command"],
      addedBy: "system",
      addedAt: "2026-02-09",
      usageCount: 0,
    },
    CODEGEN: {
      expansion: 'CT/1 TASK code_generate lang={lang} q="{description}"',
      description: "Generate code",
      params: ["lang", "description"],
      addedBy: "system",
      addedAt: "2026-02-09",
      usageCount: 0,
    },
    REMEMBER: {
      expansion: 'CT/1 REQ save_note q="{content}"',
      description: "Save a note",
      params: ["content"],
      addedBy: "system",
      addedAt: "2026-02-09",
      usageCount: 0,
    },
    RECALL: {
      expansion: 'CT/1 REQ recall_notes q="{query}"',
      description: "Search saved notes",
      params: ["query"],
      addedBy: "system",
      addedAt: "2026-02-09",
      usageCount: 0,
    },
  },
  abbreviations: {
    "src/sec": "src/security",
    "src/ag": "src/agents",
    "src/gw": "src/gateway",
    "src/cfg": "src/config",
    "src/rt": "src/routing",
    "ext/": "extensions/",
    crit: "critical",
    tok: "tokens",
    sess: "session",
    cfg: "config",
    gw: "gateway",
  },
  proposed: [],
};

/** Load dictionary from disk or return defaults. */
export async function loadDictionary(path?: string): Promise<ClawTalkDictionary> {
  if (!path) {return structuredClone(DEFAULT_DICTIONARY);}

  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as ClawTalkDictionary;
  } catch {
    return structuredClone(DEFAULT_DICTIONARY);
  }
}

/** Save dictionary to disk. */
export async function saveDictionary(dict: ClawTalkDictionary, path: string): Promise<void> {
  dict.updated = new Date().toISOString();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(dict, null, 2), "utf-8");
}

/** Add a macro to the dictionary. */
export function addMacro(
  dict: ClawTalkDictionary,
  name: string,
  macro: Omit<ClawTalkMacro, "usageCount">,
): void {
  dict.macros[name.toUpperCase()] = { ...macro, usageCount: 0 };
  dict.version++;
}

/** Remove a macro from the dictionary. */
export function removeMacro(dict: ClawTalkDictionary, name: string): boolean {
  const key = name.toUpperCase();
  if (dict.macros[key]) {
    delete dict.macros[key];
    dict.version++;
    return true;
  }
  return false;
}

/** Increment usage count for a macro. */
export function trackMacroUsage(dict: ClawTalkDictionary, name: string): void {
  const macro = dict.macros[name.toUpperCase()];
  if (macro) {
    macro.usageCount++;
  }
}

/** Add a proposal. */
export function propose(dict: ClawTalkDictionary, proposal: ClawTalkProposal): void {
  dict.proposed.push(proposal);
}

/** Approve a proposal, moving it to the macros. */
export function approveProposal(dict: ClawTalkDictionary, name: string): boolean {
  const idx = dict.proposed.findIndex((p) => p.name.toUpperCase() === name.toUpperCase());
  if (idx === -1) {return false;}

  const proposal = dict.proposed[idx];
  dict.proposed.splice(idx, 1);
  dict.macros[proposal.name.toUpperCase()] = {
    expansion: proposal.expansion,
    description: proposal.reason,
    addedBy: proposal.proposedBy,
    addedAt: new Date().toISOString().split("T")[0],
    usageCount: 0,
  };
  dict.version++;
  return true;
}

/** Reject a proposal. */
export function rejectProposal(dict: ClawTalkDictionary, name: string): boolean {
  const idx = dict.proposed.findIndex((p) => p.name.toUpperCase() === name.toUpperCase());
  if (idx === -1) {return false;}
  dict.proposed.splice(idx, 1);
  return true;
}

/** Evict least-used non-system macros if dictionary exceeds max size. */
export function evictLRU(dict: ClawTalkDictionary, maxSize: number): string[] {
  const entries = Object.entries(dict.macros);
  if (entries.length <= maxSize) {return [];}

  const sortable = entries
    .filter(([_, m]) => m.addedBy !== "system")
    .toSorted((a, b) => a[1].usageCount - b[1].usageCount);

  const evicted: string[] = [];
  while (entries.length - evicted.length > maxSize && sortable.length > 0) {
    const [name] = sortable.shift()!;
    delete dict.macros[name];
    evicted.push(name);
  }

  if (evicted.length > 0) {dict.version++;}
  return evicted;
}

/** Get default dictionary (clone). */
export function getDefaultDictionary(): ClawTalkDictionary {
  return structuredClone(DEFAULT_DICTIONARY);
}
