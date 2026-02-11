import { z } from "zod";
import { ChannelHeartbeatVisibilitySchema } from "./zod-schema.channels.js";
import { GroupPolicySchema } from "./zod-schema.core.js";
import {
  BlueBubblesConfigSchema,
  GoogleChatConfigSchema,
  MSTeamsConfigSchema,
} from "./zod-schema.providers-core.js";

export * from "./zod-schema.providers-core.js";
export { ChannelHeartbeatVisibilitySchema } from "./zod-schema.channels.js";

export const ChannelsSchema = z
  .object({
    mode: z.enum(["gtk-only", "auto"]).optional(),
    defaults: z
      .object({
        groupPolicy: GroupPolicySchema.optional(),
        heartbeat: ChannelHeartbeatVisibilitySchema,
      })
      .strict()
      .optional(),
    googlechat: GoogleChatConfigSchema.optional(),
    bluebubbles: BlueBubblesConfigSchema.optional(),
    msteams: MSTeamsConfigSchema.optional(),
  })
  .passthrough() // Allow extension channel configs (nostr, matrix, zalo, etc.)
  .optional();
