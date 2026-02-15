import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { githubCopilotLoginCommand } from "../providers/github-copilot-auth.js";
import { applyAuthProfileConfig } from "./onboard-auth.js";
import {
  NOTE_TITLES,
  NOTE_ICONS,
  formatModelSummary,
  formatNoteWithIcon,
} from "../wizard/display-helpers.js";

export async function applyAuthChoiceGitHubCopilot(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "github-copilot") {
    return null;
  }

  let nextConfig = params.config;

  await params.prompter.note(
    [
      `${NOTE_ICONS.info} This will open a GitHub device login to authorize Copilot.`,
      "Requires an active GitHub Copilot subscription.",
    ].join("\n"),
    "GitHub Copilot",
  );

  if (!process.stdin.isTTY) {
    await params.prompter.note(
      formatNoteWithIcon("warning", "GitHub Copilot login requires an interactive TTY."),
      NOTE_TITLES.warning,
    );
    return { config: nextConfig };
  }

  try {
    await githubCopilotLoginCommand({ yes: true }, params.runtime);
  } catch (err) {
    await params.prompter.note(
      formatNoteWithIcon("error", `GitHub Copilot login failed: ${String(err)}`),
      NOTE_TITLES.authFailed,
    );
    return { config: nextConfig };
  }

  nextConfig = applyAuthProfileConfig(nextConfig, {
    profileId: "github-copilot:github",
    provider: "github-copilot",
    mode: "token",
  });

  if (params.setDefaultModel) {
    const model = "github-copilot/gpt-4o";
    nextConfig = {
      ...nextConfig,
      agents: {
        ...nextConfig.agents,
        defaults: {
          ...nextConfig.agents?.defaults,
          model: {
            ...(typeof nextConfig.agents?.defaults?.model === "object"
              ? nextConfig.agents.defaults.model
              : undefined),
            primary: model,
          },
        },
      },
    };
    await params.prompter.note(
      formatModelSummary({
        provider: "GitHub Copilot",
        models: ["gpt-4o"],
        defaultModel: model,
        isLocal: false,
      }),
      NOTE_TITLES.providerReady,
    );
  }

  return { config: nextConfig };
}
