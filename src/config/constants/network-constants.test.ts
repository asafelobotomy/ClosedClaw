import { describe, it, expect } from "vitest";
import {
  LOCALHOST_IPV4,
  LOCALHOST_HOSTNAME,
  DEFAULT_GATEWAY_PORT,
  buildGatewayHttpUrl,
  buildGatewayWsUrl,
  buildSignalHttpUrl,
  buildOllamaHttpUrl,
  buildHttpUrl,
  buildWsUrl,
  buildGatewayRpcUrl,
  buildGatewayWsEndpointUrl,
  buildGatewayStatusUrl,
  GATEWAY_ENDPOINT_RPC,
  GATEWAY_ENDPOINT_WS,
  GATEWAY_ENDPOINT_STATUS,
  PROTOCOL_HTTP,
  PROTOCOL_WS,
  HTTP_TIMEOUT_DEFAULT_MS,
  DEFAULT_SIGNAL_PORT,
  DEFAULT_OLLAMA_PORT,
} from "./network-constants.js";

describe("network-constants", () => {
  describe("constant definitions", () => {
    it("should define IP addresses", () => {
      expect(LOCALHOST_IPV4).toBe("127.0.0.1");
      expect(LOCALHOST_HOSTNAME).toBe("localhost");
    });

    it("should define default ports", () => {
      expect(DEFAULT_GATEWAY_PORT).toBe(18789);
      expect(DEFAULT_SIGNAL_PORT).toBe(8080);
      expect(DEFAULT_OLLAMA_PORT).toBe(11434);
    });

    it("should define protocols", () => {
      expect(PROTOCOL_HTTP).toBe("http");
      expect(PROTOCOL_WS).toBe("ws");
    });

    it("should define endpoint paths", () => {
      expect(GATEWAY_ENDPOINT_RPC).toBe("/rpc");
      expect(GATEWAY_ENDPOINT_WS).toBe("/ws");
      expect(GATEWAY_ENDPOINT_STATUS).toBe("/gateway/status");
    });

    it("should define timeouts", () => {
      expect(HTTP_TIMEOUT_DEFAULT_MS).toBe(30_000);
    });
  });

  describe("buildGatewayHttpUrl()", () => {
    it("should build default gateway HTTP URL", () => {
      const url = buildGatewayHttpUrl();
      expect(url).toBe("http://127.0.0.1:18789");
    });

    it("should build gateway HTTP URL with custom port", () => {
      const url = buildGatewayHttpUrl(8080);
      expect(url).toBe("http://127.0.0.1:8080");
    });

    it("should build gateway HTTP URL with custom host", () => {
      const url = buildGatewayHttpUrl(18789, "localhost");
      expect(url).toBe("http://localhost:18789");
    });

    it("should build gateway HTTP URL with custom port and host", () => {
      const url = buildGatewayHttpUrl(9999, "example.com");
      expect(url).toBe("http://example.com:9999");
    });
  });

  describe("buildGatewayWsUrl()", () => {
    it("should build default gateway WebSocket URL", () => {
      const url = buildGatewayWsUrl();
      expect(url).toBe("ws://127.0.0.1:18789");
    });

    it("should build gateway WebSocket URL with custom port", () => {
      const url = buildGatewayWsUrl(8080);
      expect(url).toBe("ws://127.0.0.1:8080");
    });

    it("should build gateway WebSocket URL with custom host", () => {
      const url = buildGatewayWsUrl(18789, "localhost");
      expect(url).toBe("ws://localhost:18789");
    });
  });

  describe("buildSignalHttpUrl()", () => {
    it("should build default Signal HTTP URL", () => {
      const url = buildSignalHttpUrl();
      expect(url).toBe("http://127.0.0.1:8080");
    });

    it("should build Signal HTTP URL with custom port", () => {
      const url = buildSignalHttpUrl(9090);
      expect(url).toBe("http://127.0.0.1:9090");
    });
  });

  describe("buildOllamaHttpUrl()", () => {
    it("should build default Ollama HTTP URL", () => {
      const url = buildOllamaHttpUrl();
      expect(url).toBe("http://127.0.0.1:11434");
    });

    it("should build Ollama HTTP URL with custom port", () => {
      const url = buildOllamaHttpUrl(12345);
      expect(url).toBe("http://127.0.0.1:12345");
    });
  });

  describe("buildHttpUrl()", () => {
    it("should build HTTP URL without path", () => {
      const url = buildHttpUrl("localhost", 8080);
      expect(url).toBe("http://localhost:8080");
    });

    it("should build HTTP URL with path", () => {
      const url = buildHttpUrl("localhost", 8080, "/api/v1");
      expect(url).toBe("http://localhost:8080/api/v1");
    });

    it("should build HTTP URL with IPv4 address", () => {
      const url = buildHttpUrl("192.168.1.1", 3000, "/status");
      expect(url).toBe("http://192.168.1.1:3000/status");
    });
  });

  describe("buildWsUrl()", () => {
    it("should build WebSocket URL without path", () => {
      const url = buildWsUrl("localhost", 8080);
      expect(url).toBe("ws://localhost:8080");
    });

    it("should build WebSocket URL with path", () => {
      const url = buildWsUrl("localhost", 8080, "/socket");
      expect(url).toBe("ws://localhost:8080/socket");
    });
  });

  describe("gateway endpoint URLs", () => {
    it("should build gateway RPC URL", () => {
      const url = buildGatewayRpcUrl();
      expect(url).toBe("http://127.0.0.1:18789/rpc");
    });

    it("should build gateway WebSocket endpoint URL", () => {
      const url = buildGatewayWsEndpointUrl();
      expect(url).toBe("ws://127.0.0.1:18789/ws");
    });

    it("should build gateway status URL", () => {
      const url = buildGatewayStatusUrl();
      expect(url).toBe("http://127.0.0.1:18789/gateway/status");
    });

    it("should build gateway RPC URL with custom port", () => {
      const url = buildGatewayRpcUrl(9999);
      expect(url).toBe("http://127.0.0.1:9999/rpc");
    });

    it("should build gateway status URL with custom host and port", () => {
      const url = buildGatewayStatusUrl(8888, "localhost");
      expect(url).toBe("http://localhost:8888/gateway/status");
    });
  });

  describe("type safety", () => {
    it("should have constant number literal types for ports", () => {
      // TypeScript should enforce these as literal types
      const port: 18789 = DEFAULT_GATEWAY_PORT;
      expect(port).toBe(18789);
    });

    it("should have constant string literal types for endpoints", () => {
      const endpoint: "/rpc" = GATEWAY_ENDPOINT_RPC;
      expect(endpoint).toBe("/rpc");
    });
  });

  describe("URL builder consistency", () => {
    it("should produce consistent URLs across different builders", () => {
      const httpUrl = buildGatewayHttpUrl(18789, "localhost");
      const wsUrl = buildGatewayWsUrl(18789, "localhost");

      expect(httpUrl).toMatch(/^http:\/\/localhost:18789$/);
      expect(wsUrl).toMatch(/^ws:\/\/localhost:18789$/);
    });

    it("should handle default parameters consistently", () => {
      const url1 = buildGatewayHttpUrl();
      const url2 = buildGatewayHttpUrl(DEFAULT_GATEWAY_PORT, LOCALHOST_IPV4);

      expect(url1).toBe(url2);
    });
  });
});
