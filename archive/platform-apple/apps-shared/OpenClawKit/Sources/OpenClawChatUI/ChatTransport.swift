import Foundation

public enum ClosedClawChatTransportEvent: Sendable {
    case health(ok: Bool)
    case tick
    case chat(ClosedClawChatEventPayload)
    case agent(ClosedClawAgentEventPayload)
    case seqGap
}

public protocol ClosedClawChatTransport: Sendable {
    func requestHistory(sessionKey: String) async throws -> ClosedClawChatHistoryPayload
    func sendMessage(
        sessionKey: String,
        message: String,
        thinking: String,
        idempotencyKey: String,
        attachments: [ClosedClawChatAttachmentPayload]) async throws -> ClosedClawChatSendResponse

    func abortRun(sessionKey: String, runId: String) async throws
    func listSessions(limit: Int?) async throws -> ClosedClawChatSessionsListResponse

    func requestHealth(timeoutMs: Int) async throws -> Bool
    func events() -> AsyncStream<ClosedClawChatTransportEvent>

    func setActiveSessionKey(_ sessionKey: String) async throws
}

extension ClosedClawChatTransport {
    public func setActiveSessionKey(_: String) async throws {}

    public func abortRun(sessionKey _: String, runId _: String) async throws {
        throw NSError(
            domain: "ClosedClawChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "chat.abort not supported by this transport"])
    }

    public func listSessions(limit _: Int?) async throws -> ClosedClawChatSessionsListResponse {
        throw NSError(
            domain: "ClosedClawChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "sessions.list not supported by this transport"])
    }
}
