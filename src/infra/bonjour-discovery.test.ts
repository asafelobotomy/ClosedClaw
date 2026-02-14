import { describe, expect, it, vi } from "vitest";
import type { runCommandWithTimeout } from "../process/exec.js";
import { discoverGatewayBeacons } from "./bonjour-discovery.js";

const WIDE_AREA_DOMAIN = "ClosedClaw.internal.";

describe("bonjour-discovery", () => {
  it("discovers beacons on linux across local + wide-area domains", async () => {
    const calls: Array<{ argv: string[]; timeoutMs: number }> = [];

    const run = vi.fn(async (argv: string[], options: { timeoutMs: number }) => {
      calls.push({ argv, timeoutMs: options.timeoutMs });
      const cmd = argv[0];

      if (cmd === "avahi-browse") {
        const domainArg = argv.includes("-d") ? argv[argv.indexOf("-d") + 1] : null;
        const isWideArea = domainArg === "ClosedClaw.internal";

        if (isWideArea) {
          return {
            stdout: [
              "=  eth0 IPv4 Tailnet Gateway                        _ClosedClaw-gw._tcp  ClosedClaw.internal",
              "   hostname = [tailnet.local]",
              "   port = [18789]",
              '   txt = ["txtvers=1" "displayName=Tailnet" "lanHost=tailnet.local" "gatewayPort=18789" "sshPort=22" "tailnetDns=studio.tailnet.ts.net"]',
              "",
            ].join("\n"),
            stderr: "",
            code: 0,
            signal: null,
            killed: false,
          };
        }

        return {
          stdout: [
            "=  eth0 IPv4 Peter\u2019s Mac Studio Gateway            _ClosedClaw-gw._tcp  local",
            "   hostname = [studio.local]",
            "   port = [18789]",
            '   txt = ["txtvers=1" "displayName=Peter\'s Mac Studio" "lanHost=studio.local" "gatewayPort=18789" "sshPort=22"]',
            "",
            "=  eth0 IPv4 Laptop Gateway                           _ClosedClaw-gw._tcp  local",
            "   hostname = [laptop.local]",
            "   port = [18789]",
            '   txt = ["txtvers=1" "displayName=Laptop" "lanHost=laptop.local" "gatewayPort=18789" "sshPort=22"]',
            "",
          ].join("\n"),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }

      throw new Error(`unexpected argv: ${argv.join(" ")}`);
    });

    const beacons = await discoverGatewayBeacons({
      platform: "linux",
      timeoutMs: 1234,
      wideAreaDomain: WIDE_AREA_DOMAIN,
      run: run as unknown as typeof runCommandWithTimeout,
    });

    expect(beacons).toHaveLength(3);
    expect(beacons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instanceName: "Peter\u2019s Mac Studio Gateway",
          displayName: "Peter's Mac Studio",
        }),
      ]),
    );
    expect(beacons.map((b) => b.domain)).toEqual(
      expect.arrayContaining(["local.", WIDE_AREA_DOMAIN]),
    );

    const browseCalls = calls.filter((c) => c.argv[0] === "avahi-browse");
    expect(browseCalls).toHaveLength(2);
    expect(browseCalls.every((c) => c.timeoutMs === 1234)).toBe(true);
  });

  it("parses displayName from avahi-browse TXT records", async () => {
    const run = vi.fn(async (argv: string[], options: { timeoutMs: number }) => {
      if (options.timeoutMs < 0) {
        throw new Error("invalid timeout");
      }

      if (argv[0] === "avahi-browse") {
        return {
          stdout: [
            "=  eth0 IPv4 Studio Gateway                           _ClosedClaw-gw._tcp  local",
            "   hostname = [studio.local]",
            "   port = [18789]",
            '   txt = ["txtvers=1" "displayName=Peter\'s Mac Studio" "lanHost=studio.local" "gatewayPort=18789" "sshPort=22"]',
            "",
          ].join("\n"),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }

      return {
        stdout: "",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      };
    });

    const beacons = await discoverGatewayBeacons({
      platform: "linux",
      timeoutMs: 800,
      domains: ["local."],
      run: run as unknown as typeof runCommandWithTimeout,
    });

    expect(beacons).toEqual([
      expect.objectContaining({
        domain: "local.",
        instanceName: "Studio Gateway",
        displayName: "Peter's Mac Studio",
        txt: expect.objectContaining({
          displayName: "Peter's Mac Studio",
        }),
      }),
    ]);
  });

  it("discovers beacons from wide-area domain via avahi-browse", async () => {
    const calls: Array<{ argv: string[]; timeoutMs: number }> = [];

    const run = vi.fn(async (argv: string[], options: { timeoutMs: number }) => {
      calls.push({ argv, timeoutMs: options.timeoutMs });

      if (argv[0] === "avahi-browse") {
        const domainArg = argv.includes("-d") ? argv[argv.indexOf("-d") + 1] : null;
        const isWideArea = domainArg === "ClosedClaw.internal";

        if (isWideArea) {
          return {
            stdout: [
              "=  eth0 IPv4 studio-gateway                          _ClosedClaw-gw._tcp  ClosedClaw.internal",
              "   hostname = [studio.ClosedClaw.internal]",
              "   port = [18789]",
              '   txt = ["displayName=Studio" "gatewayPort=18789" "transport=gateway" "sshPort=22" "tailnetDns=peters-mac-studio-1.sheep-coho.ts.net" "cliPath=/opt/homebrew/bin/ClosedClaw"]',
              "",
            ].join("\n"),
            stderr: "",
            code: 0,
            signal: null,
            killed: false,
          };
        }

        return { stdout: "", stderr: "", code: 0, signal: null, killed: false };
      }

      throw new Error(`unexpected argv: ${argv.join(" ")}`);
    });

    const beacons = await discoverGatewayBeacons({
      platform: "linux",
      timeoutMs: 1200,
      domains: [WIDE_AREA_DOMAIN],
      wideAreaDomain: WIDE_AREA_DOMAIN,
      run: run as unknown as typeof runCommandWithTimeout,
    });

    expect(beacons).toEqual([
      expect.objectContaining({
        domain: WIDE_AREA_DOMAIN,
        instanceName: "studio-gateway",
        displayName: "Studio",
        host: "studio.ClosedClaw.internal",
        port: 18789,
        tailnetDns: "peters-mac-studio-1.sheep-coho.ts.net",
        gatewayPort: 18789,
        sshPort: 22,
        cliPath: "/opt/homebrew/bin/ClosedClaw",
      }),
    ]);
  });

  it("normalizes domains and respects domains override", async () => {
    const calls: string[][] = [];
    const run = vi.fn(async (argv: string[]) => {
      calls.push(argv);
      return {
        stdout: "",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      };
    });

    await discoverGatewayBeacons({
      platform: "linux",
      timeoutMs: 1,
      domains: ["local", "ClosedClaw.internal"],
      run: run as unknown as typeof runCommandWithTimeout,
    });

    // avahi-browse is called once per domain
    expect(calls).toHaveLength(2);
    // The local domain call has no -d flag; the wide-area call uses -d
    const localCall = calls.find((c) => !c.includes("-d"));
    const wideAreaCall = calls.find((c) => c.includes("-d"));
    expect(localCall).toBeTruthy();
    expect(wideAreaCall).toBeTruthy();
    expect(wideAreaCall![wideAreaCall!.indexOf("-d") + 1]).toBe("ClosedClaw.internal");

    calls.length = 0;
    await discoverGatewayBeacons({
      platform: "linux",
      timeoutMs: 1,
      domains: ["local."],
      run: run as unknown as typeof runCommandWithTimeout,
    });

    expect(calls).toHaveLength(1);
  });
});
