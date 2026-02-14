import Foundation

public enum ClosedClawCameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
}

public enum ClosedClawCameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum ClosedClawCameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum ClosedClawCameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct ClosedClawCameraSnapParams: Codable, Sendable, Equatable {
    public var facing: ClosedClawCameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: ClosedClawCameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: ClosedClawCameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: ClosedClawCameraImageFormat? = nil,
        deviceId: String? = nil,
        delayMs: Int? = nil)
    {
        self.facing = facing
        self.maxWidth = maxWidth
        self.quality = quality
        self.format = format
        self.deviceId = deviceId
        self.delayMs = delayMs
    }
}

public struct ClosedClawCameraClipParams: Codable, Sendable, Equatable {
    public var facing: ClosedClawCameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: ClosedClawCameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: ClosedClawCameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: ClosedClawCameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}
