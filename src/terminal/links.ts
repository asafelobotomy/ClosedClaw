import { formatTerminalLink } from "../utils.js";

// Prefer repo-hosted docs so help text stays relevant to this fork.
export const DOCS_ROOT = "https://github.com/asafelobotomy/ClosedClaw/blob/main/docs";
export const OPENCLAW_URL_DISCLAIMER =
  "(NOT ASSOCIATED WITH CLOSEDCLAW - Keeping for posterity and future reference) ";

const HAS_EXTENSION = /\.[a-z0-9]+$/i;
const OPENCLAW_HOST = "docs.OpenClaw.ai";

const ensureHttps = (value: string) => (value.startsWith("http") ? value : `https://${value}`);

const withDisclaimerIfOpenClaw = (value?: string) => {
  if (!value || !value.includes(OPENCLAW_HOST)) {
    return undefined;
  }
  return withOpenClawDisclaimer(ensureHttps(value));
};

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
  const openClawLabel = withDisclaimerIfOpenClaw(label);
  const safeLabel =
    openClawLabel ?? (url.includes(OPENCLAW_HOST) ? withOpenClawDisclaimer(url) : normalizeLabel(label, url));
  return formatTerminalLink(safeLabel, url, {
    fallback:
      withDisclaimerIfOpenClaw(opts?.fallback) ?? withDisclaimerIfOpenClaw(url) ?? opts?.fallback ?? url,
    force: opts?.force,
  });
}

export function withOpenClawDisclaimer(url: string): string {
  return `${OPENCLAW_URL_DISCLAIMER}${url}`;
}

export function formatDocsRootLink(label?: string): string {
  return formatTerminalLink(label ?? DOCS_ROOT, DOCS_ROOT, {
    fallback: DOCS_ROOT,
  });
}
