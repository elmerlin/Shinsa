import SwiftUI

struct ChatTheme {
    let name: String
    let background: Color
    let ownBubble: Color
    let ownBubbleBorder: Color
    let otherBubble: Color
    let otherBubbleBorder: Color
    let headerBg: Color
    let textColor: Color
    let isLight: Bool
    let useMonospace: Bool

    init(
        name: String,
        background: Color = DojoTheme.piuBg,
        ownBubble: Color,
        ownBubbleBorder: Color,
        otherBubble: Color,
        otherBubbleBorder: Color,
        headerBg: Color,
        textColor: Color = .white,
        isLight: Bool,
        useMonospace: Bool = false
    ) {
        self.name = name
        self.background = background
        self.ownBubble = ownBubble
        self.ownBubbleBorder = ownBubbleBorder
        self.otherBubble = otherBubble
        self.otherBubbleBorder = otherBubbleBorder
        self.headerBg = headerBg
        self.textColor = textColor
        self.isLight = isLight
        self.useMonospace = useMonospace
    }

    static let themes: [String: ChatTheme] = [
        // Default: piuBg bg, cyan own bubble, piuDark other bubble
        "default": ChatTheme(
            name: "Default",
            background: DojoTheme.piuBg,
            ownBubble: Color.cyan.opacity(0.1),
            ownBubbleBorder: Color.cyan.opacity(0.2),
            otherBubble: DojoTheme.piuDark.opacity(0.55),
            otherBubbleBorder: DojoTheme.piuBorder.opacity(0.6),
            headerBg: DojoTheme.piuCard,
            isLight: false
        ),
        // CLI: Black bg, green text, monospace, terminal style
        "cli": ChatTheme(
            name: "CLI",
            background: Color.black,
            ownBubble: Color.green.opacity(0.1),
            ownBubbleBorder: Color.green.opacity(0.3),
            otherBubble: Color.black.opacity(0.5),
            otherBubbleBorder: Color.green.opacity(0.2),
            headerBg: Color.black,
            textColor: Color.green,
            isLight: false,
            useMonospace: true
        ),
        // AIM: Yellow header, cream/beige bg
        "aim": ChatTheme(
            name: "AIM",
            background: Color(hex: "#f5f0e1"),
            ownBubble: Color(hex: "#fff8c4"),
            ownBubbleBorder: Color(hex: "#e6dfa0"),
            otherBubble: Color(hex: "#e8e4d8"),
            otherBubbleBorder: Color(hex: "#d0cbb8"),
            headerBg: Color.yellow,
            textColor: .black,
            isLight: true
        ),
        // Yahoo: Dark purple bg, purple bubbles
        "yahoo": ChatTheme(
            name: "Yahoo",
            background: Color(hex: "#1a0533"),
            ownBubble: Color(hex: "#6b21a8").opacity(0.5),
            ownBubbleBorder: Color(hex: "#7c3aed").opacity(0.4),
            otherBubble: Color(hex: "#2d0a4e"),
            otherBubbleBorder: Color(hex: "#4c1d95").opacity(0.4),
            headerBg: Color(hex: "#2d0a4e"),
            isLight: false
        ),
        // MSN: Blue header gradient, light blue bg
        "msn": ChatTheme(
            name: "MSN",
            background: Color(hex: "#d6e9f8"),
            ownBubble: Color(hex: "#dcefff"),
            ownBubbleBorder: Color(hex: "#a8d4f0"),
            otherBubble: Color.white,
            otherBubbleBorder: Color(hex: "#c0d8ec"),
            headerBg: Color(hex: "#1b6ec2"),
            textColor: .black,
            isLight: true
        ),
        // Skype: #00aff0 header, light bg
        "skype": ChatTheme(
            name: "Skype",
            background: Color(hex: "#e4f0f8"),
            ownBubble: Color(hex: "#00aff0"),
            ownBubbleBorder: Color(hex: "#009ad6"),
            otherBubble: Color.white,
            otherBubbleBorder: Color(hex: "#d0e4f0"),
            headerBg: Color(hex: "#00aff0"),
            textColor: .black,
            isLight: true
        ),
        // Winamp: Dark bg, green accents, monospace
        "winamp": ChatTheme(
            name: "Winamp",
            background: Color(hex: "#29292e"),
            ownBubble: Color.green.opacity(0.15),
            ownBubbleBorder: Color.green.opacity(0.3),
            otherBubble: Color(hex: "#1e1e22"),
            otherBubbleBorder: Color(hex: "#3a3a40"),
            headerBg: Color(hex: "#29292e"),
            textColor: Color.green,
            isLight: false,
            useMonospace: true
        ),
        // ICQ: Light green bg, green borders
        "icq": ChatTheme(
            name: "ICQ",
            background: Color(hex: "#eef5e6"),
            ownBubble: Color(hex: "#d4edbc"),
            ownBubbleBorder: Color(hex: "#a8d48a"),
            otherBubble: Color.white,
            otherBubbleBorder: Color(hex: "#b8d8a0"),
            headerBg: Color(hex: "#6db33f"),
            textColor: .black,
            isLight: true
        ),
        // WeChat: Gray bg, green own, white other
        "wechat": ChatTheme(
            name: "WeChat",
            background: Color(hex: "#ededed"),
            ownBubble: Color(hex: "#95EC69"),
            ownBubbleBorder: Color(hex: "#7dd856"),
            otherBubble: Color.white,
            otherBubbleBorder: Color(hex: "#d8d8d8"),
            headerBg: Color(hex: "#ededed"),
            textColor: .black,
            isLight: true
        ),
        // Discord: Dark bg, #5865f2 accent
        "discord": ChatTheme(
            name: "Discord",
            background: Color(hex: "#313338"),
            ownBubble: Color(hex: "#5865f2").opacity(0.15),
            ownBubbleBorder: Color(hex: "#5865f2").opacity(0.3),
            otherBubble: Color(hex: "#4e5058"),
            otherBubbleBorder: Color(hex: "#5a5d64"),
            headerBg: Color(hex: "#313338"),
            isLight: false
        ),
        // QQ: Light blue bg, blue accents
        "qq": ChatTheme(
            name: "QQ",
            background: Color(hex: "#edf2fa"),
            ownBubble: Color(hex: "#0099ff").opacity(0.15),
            ownBubbleBorder: Color(hex: "#0099ff").opacity(0.3),
            otherBubble: Color.white,
            otherBubbleBorder: Color(hex: "#c8d8ec"),
            headerBg: Color(hex: "#12b7f5"),
            textColor: .black,
            isLight: true
        ),
        // NXA: Very dark bg, blue neon accents
        "nxa": ChatTheme(
            name: "NXA",
            background: Color(hex: "#0a0e14"),
            ownBubble: Color(hex: "#88ccff").opacity(0.12),
            ownBubbleBorder: Color(hex: "#88ccff").opacity(0.25),
            otherBubble: Color(hex: "#111820"),
            otherBubbleBorder: Color(hex: "#88ccff").opacity(0.15),
            headerBg: Color(hex: "#0a0e14"),
            textColor: Color(hex: "#88ccff"),
            isLight: false
        ),
        // KakaoTalk: Blue-gray bg, yellow own
        "kakao": ChatTheme(
            name: "KakaoTalk",
            background: Color(hex: "#b2c7d9"),
            ownBubble: Color(hex: "#fee500"),
            ownBubbleBorder: Color(hex: "#e6cf00"),
            otherBubble: Color.white,
            otherBubbleBorder: Color(hex: "#d0d8e0"),
            headerBg: Color(hex: "#b2c7d9"),
            textColor: .black,
            isLight: true
        ),
        // LINE: Green accent, gray-blue bg
        "line": ChatTheme(
            name: "LINE",
            background: Color(hex: "#7b96a8"),
            ownBubble: Color(hex: "#06c755"),
            ownBubbleBorder: Color(hex: "#05a847"),
            otherBubble: Color.white,
            otherBubbleBorder: Color(hex: "#c8d4dc"),
            headerBg: Color(hex: "#06c755"),
            textColor: .black,
            isLight: true
        ),
    ]

    static let orderedKeys = [
        "default", "cli", "aim", "yahoo", "msn", "skype",
        "winamp", "icq", "wechat", "discord", "qq", "nxa",
        "kakao", "line"
    ]

    static func get(_ key: String?) -> ChatTheme {
        themes[key ?? "default"] ?? themes["default"]!
    }
}
