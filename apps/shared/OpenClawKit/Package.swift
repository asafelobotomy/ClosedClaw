// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "ClosedClawKit",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
    ],
    products: [
        .library(name: "ClosedClawProtocol", targets: ["ClosedClawProtocol"]),
        .library(name: "ClosedClawKit", targets: ["ClosedClawKit"]),
        .library(name: "ClosedClawChatUI", targets: ["ClosedClawChatUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/steipete/ElevenLabsKit", exact: "0.1.0"),
        .package(url: "https://github.com/gonzalezreal/textual", exact: "0.3.1"),
    ],
    targets: [
        .target(
            name: "ClosedClawProtocol",
            path: "Sources/ClosedClawProtocol",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "ClosedClawKit",
            dependencies: [
                "ClosedClawProtocol",
                .product(name: "ElevenLabsKit", package: "ElevenLabsKit"),
            ],
            path: "Sources/ClosedClawKit",
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "ClosedClawChatUI",
            dependencies: [
                "ClosedClawKit",
                .product(
                    name: "Textual",
                    package: "textual",
                    condition: .when(platforms: [.macOS, .iOS])),
            ],
            path: "Sources/ClosedClawChatUI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "ClosedClawKitTests",
            dependencies: ["ClosedClawKit", "ClosedClawChatUI"],
            path: "Tests/ClosedClawKitTests",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
