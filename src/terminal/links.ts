import { formatTerminalLink } from "../utils.js";

// Prefer repo-hosted docs so help text stays relevant to this fork.
export const DOCS_ROOT = "https://github.com/asafelobotomy/ClosedClaw/blob/main/docs";

const HAS_EXTENSION = /\.[a-z0-9]+$/i;

const buildDocsUrl = (path: string) => {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const withExt = HAS_EXTENSION.test(normalized) ? normalized : `${normalized}.md`;
  return `${DOCS_ROOT}${withExt}`;
};

const normalizeLabel = (label: string | undefined, url: string) => {
  if (!label) {
    return url;
  }
  if (label.includes("docs.OpenClaw.ai")) {
    return label.replace("docs.OpenClaw.ai", "github.com/asafelobotomy/ClosedClaw/blob/main/docs");
  }
  return label;
};

export function formatDocsLink(
  path: string,
  label?: string,
  opts?: { fallback?: string; force?: boolean },
): string {
  const trimmed = path.trim();
  const url = trimmed.startsWith("http") ? trimmed : buildDocsUrl(trimmed);
  const safeLabel = normalizeLabel(label, url);
  return formatTerminalLink(safeLabel, url, {
    fallback: opts?.fallback ?? url,
    force: opts?.force,
  });
}

export function formatDocsRootLink(label?: string): string {
  return formatTerminalLink(label ?? DOCS_ROOT, DOCS_ROOT, {
    fallback: DOCS_ROOT,
  });
}
