import { describe, expect, it } from "vitest";
import {
  deliveryContextKey,
  deliveryContextFromSession,
  mergeDeliveryContext,
  normalizeDeliveryContext,
  normalizeSessionDeliveryFields,
} from "./delivery-context.js";

describe("delivery context helpers", () => {
  it("normalizes channel/to/accountId and drops empty contexts", () => {
    expect(
      normalizeDeliveryContext({
        channel: " webchat ",
        to: " user123 ",
        accountId: " acct-1 ",
      }),
    ).toEqual({
      channel: "webchat",
      to: "user123",
      accountId: "acct-1",
    });

    expect(normalizeDeliveryContext({ channel: "  " })).toBeUndefined();
  });

  it("merges primary values over fallback", () => {
    const merged = mergeDeliveryContext(
      { channel: "webchat", to: "channel:abc" },
      { channel: "matrix", to: "channel:def", accountId: "acct" },
    );

    expect(merged).toEqual({
      channel: "webchat",
      to: "channel:abc",
      accountId: "acct",
    });
  });

  it("builds stable keys only when channel and to are present", () => {
    expect(deliveryContextKey({ channel: "webchat", to: "user123" })).toBe("webchat|user123||");
    expect(deliveryContextKey({ channel: "webchat" })).toBeUndefined();
    expect(deliveryContextKey({ channel: "webchat", to: "user123", accountId: "acct-1" })).toBe(
      "webchat|user123|acct-1|",
    );
    expect(deliveryContextKey({ channel: "matrix", to: "channel:C1", threadId: "123.456" })).toBe(
      "matrix|channel:C1||123.456",
    );
  });

  it("derives delivery context from a session entry", () => {
    expect(
      deliveryContextFromSession({
        channel: "webchat",
        lastChannel: " gtk-gui ",
        lastTo: " user777 ",
        lastAccountId: " acct-9 ",
      }),
    ).toEqual({
      channel: "gtk-gui",
      to: "user777",
      accountId: "acct-9",
    });

    expect(
      deliveryContextFromSession({
        channel: "matrix",
        lastTo: " 123 ",
        lastThreadId: " 999 ",
      }),
    ).toEqual({
      channel: "matrix",
      to: "123",
      accountId: undefined,
      threadId: "999",
    });

    expect(
      deliveryContextFromSession({
        channel: "matrix",
        lastTo: " room1001 ",
        origin: { threadId: 42 },
      }),
    ).toEqual({
      channel: "matrix",
      to: "room1001",
      accountId: undefined,
      threadId: 42,
    });

    expect(
      deliveryContextFromSession({
        channel: "matrix",
        lastTo: " room1001 ",
        deliveryContext: { threadId: " 777 " },
        origin: { threadId: 42 },
      }),
    ).toEqual({
      channel: "matrix",
      to: "room1001",
      accountId: undefined,
      threadId: "777",
    });
  });

  it("normalizes delivery fields and mirrors them on session entries", () => {
    const normalized = normalizeSessionDeliveryFields({
      deliveryContext: {
        channel: " Matrix ",
        to: " channel:1 ",
        accountId: " acct-2 ",
        threadId: " 444 ",
      },
      lastChannel: " webchat ",
      lastTo: " user555 ",
    });

    expect(normalized.deliveryContext).toEqual({
      channel: "webchat",
      to: "user555",
      accountId: "acct-2",
      threadId: "444",
    });
    expect(normalized.lastChannel).toBe("webchat");
    expect(normalized.lastTo).toBe("user555");
    expect(normalized.lastAccountId).toBe("acct-2");
    expect(normalized.lastThreadId).toBe("444");
  });
});
