import SwiftUI

struct ChatTheme {
    let name: String
    let ownBubble: Color
    let ownBubbleBorder: Color
    let otherBubble: Color
    let otherBubbleBorder: Color
    let headerBg: Color
    let isLight: Bool

    static let themes: [String: ChatTheme] = [
        "default": ChatTheme(
            name: "Default",
            ownBubble: Color.cyan.opacity(0.1),
            ownBubbleBorder: Color.cyan.opacity(0.2),
            otherBubble: DojoTheme.piuDark.opacity(0.55),
            otherBubbleBorder: DojoTheme.piuBorder.opacity(0.6),
            headerBg: DojoTheme.piuCard,
            isLight: false
        ),
        "cli": ChatTheme(
            name: "CLI",
            ownBubble: Color.green.opacity(0.1),
            ownBubbleBorder: Color.green.opacity(0.3),
            otherBubble: Color.black.opacity(0.5),
            otherBubbleBorder: Color.green.opacity(0.2),
            headerBg: Color.black,
            isLight: false
        ),
        "aim": ChatTheme(
            name: "AIM",
            ownBubble: Color.yellow.opacity(0.15),
            ownBubbleBorder: Color.yellow.opacity(0.3),
            otherBubble: Color.white.opacity(0.9),
            otherBubbleBorder: Color.gray.opacity(0.3),
            headerBg: Color.yellow,
            isLight: true
        ),
        "discord": ChatTheme(
            name: "Discord",
            ownBubble: Color(hex: "#5865F2").opacity(0.15),
            ownBubbleBorder: Color(hex: "#5865F2").opacity(0.3),
            otherBubble: Color(hex: "#2f3136"),
            otherBubbleBorder: Color(hex: "#40444b"),
            headerBg: Color(hex: "#36393f"),
            isLight: false
        ),
        "msn": ChatTheme(
            name: "MSN",
            ownBubble: Color.blue.opacity(0.15),
            ownBubbleBorder: Color.blue.opacity(0.3),
            otherBubble: Color.white.opacity(0.85),
            otherBubbleBorder: Color.blue.opacity(0.2),
            headerBg: Color.blue,
            isLight: true
        ),
        "kakao": ChatTheme(
            name: "KakaoTalk",
            ownBubble: Color.yellow.opacity(0.3),
            ownBubbleBorder: Color.yellow.opacity(0.4),
            otherBubble: Color.white.opacity(0.9),
            otherBubbleBorder: Color.gray.opacity(0.2),
            headerBg: Color(hex: "#FEE500"),
            isLight: true
        ),
    ]

    static let orderedKeys = ["default", "cli", "aim", "discord", "msn", "kakao"]

    static func get(_ key: String?) -> ChatTheme {
        themes[key ?? "default"] ?? themes["default"]!
    }
}
