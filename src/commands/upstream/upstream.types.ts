export interface UpstreamTrackingState {
  forkPoint: string; // Version/commit where fork started
  lastSync: string; // ISO timestamp
  upstreamVersion: string; // Latest upstream version
  divergenceCommits: number; // Number of commits ahead/behind
  securityPatchesPending: string[]; // List of security patches not yet applied
  featuresAvailable: string[]; // List of new features in upstream
  lastCheck: string; // ISO timestamp of last upstream check
  remoteUrl: string; // Git remote URL for upstream
  trackingBranch: string; // Branch to track (e.g., "openclaw/main")
}

export interface UpstreamConfig {
  autoApplySecurity: boolean; // Auto-apply security patches
  checkInterval: number; // Hours between upstream checks
  remoteUrl: string; // Git remote URL
  trackingBranch: string; // Branch to track
}

export const DEFAULT_UPSTREAM_TRACKING: UpstreamTrackingState = {
  forkPoint: "v2026.2.1",
  lastSync: new Date().toISOString(),
  upstreamVersion: "unknown",
  divergenceCommits: 0,
  securityPatchesPending: [],
  featuresAvailable: [],
  lastCheck: new Date().toISOString(),
  remoteUrl: "https://github.com/openclaw/openclaw.git",
  trackingBranch: "openclaw/main",
};

export const DEFAULT_UPSTREAM_CONFIG: UpstreamConfig = {
  autoApplySecurity: false,
  checkInterval: 24,
  remoteUrl: "https://github.com/openclaw/openclaw.git",
  trackingBranch: "openclaw/main",
};
