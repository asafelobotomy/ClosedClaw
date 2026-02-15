import type { ClosedClawConfig } from "../config/config.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import {
  NOTE_TITLES,
  NOTE_ICONS,
} from "../wizard/display-helpers.js";

export async function applyDefaultModelChoice(params: {
  config: ClosedClawConfig;
  setDefaultModel: boolean;
  defaultModel: string;
  applyDefaultConfig: (config: ClosedClawConfig) => ClosedClawConfig;
  applyProviderConfig: (config: ClosedClawConfig) => ClosedClawConfig;
  noteDefault?: string;
  noteAgentModel: (model: string) => Promise<void>;
  prompter: WizardPrompter;
}): Promise<{ config: ClosedClawConfig; agentModelOverride?: string }> {
  if (params.setDefaultModel) {
    const next = params.applyDefaultConfig(params.config);
    if (params.noteDefault) {
      await params.prompter.note(
        `${NOTE_ICONS.success} Default model set to ${params.noteDefault}`,
        NOTE_TITLES.modelConfigured,
      );
    }
    return { config: next };
  }

  const next = params.applyProviderConfig(params.config);
  await params.noteAgentModel(params.defaultModel);
  return { config: next, agentModelOverride: params.defaultModel };
}
