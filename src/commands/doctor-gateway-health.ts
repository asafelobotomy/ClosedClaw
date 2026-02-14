import type { ClosedClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { TIMEOUT_TEST_SUITE_SHORT_MS, secondsToMs } from "../config/constants/index.js";
import { buildGatewayConnectionDetails, callGateway } from "../gateway/call.js";
import { collectChannelStatusIssues } from "../infra/channels-status-issues.js";
import { note } from "../terminal/note.js";
import { formatHealthCheckFailure } from "./health-format.js";
import { healthCommand } from "./health.js";

export async function checkGatewayHealth(params: {
  runtime: RuntimeEnv;
  cfg: ClosedClawConfig;
  timeoutMs?: number;
}) {
  const gatewayDetails = buildGatewayConnectionDetails({ config: params.cfg });
  const timeoutMs =
    typeof params.timeoutMs === "number" && params.timeoutMs > 0 ? params.timeoutMs : 10_000;
  let healthOk = false;
  try {
    await healthCommand({ json: false, timeoutMs, config: params.cfg }, params.runtime);
    healthOk = true;
  } catch (err) {
    const message = String(err);
    if (message.includes("gateway closed")) {
      note("Gateway not running.", "Gateway");
      note(gatewayDetails.message, "Gateway connection");
    } else {
      params.runtime.error(formatHealthCheckFailure(err));
      note(gatewayDetails.message, "Gateway connection");
      try {
        await callGateway({
          method: "gateway.status",
          params: {},
          timeoutMs: secondsToMs(3),
        });
      } catch (probeErr) {
        params.runtime.error(`Gateway status probe failed: ${String(probeErr)}`);
      }
    }
  }

  if (healthOk) {
    try {
      const status = await callGateway({
        method: "channels.status",
        params: { probe: true, timeoutMs: TIMEOUT_TEST_SUITE_SHORT_MS },
        timeoutMs: secondsToMs(6),
      });
      const issues = collectChannelStatusIssues(status);
      if (issues.length > 0) {
        note(
          issues
            .map(
              (issue) =>
                `- ${issue.channel} ${issue.accountId}: ${issue.message}${
                  issue.fix ? ` (${issue.fix})` : ""
                }`,
            )
            .join("\n"),
          "Channel warnings",
        );
      }
    } catch {
      // ignore: doctor already reported gateway health
    }
  }

  return { healthOk };
}
