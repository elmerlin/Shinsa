import SwiftUI

enum DojoTheme {
    // MARK: - Colors
    static let piuBg = Color(hex: "#0a0a1a")
    static let piuCard = Color(hex: "#141428")
    static let piuAccent = Color(hex: "#ff3366")
    static let piuGold = Color(hex: "#ffd700")
    static let piuSilver = Color(hex: "#c0c0c0")
    static let piuBronze = Color(hex: "#cd7f32")
    static let piuBlue = Color(hex: "#4488ff")
    static let piuGreen = Color(hex: "#33ff66")
    static let piuDark = Color(hex: "#0d0d20")
    static let piuBorder = Color(hex: "#2a2a4a")

    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.7)
    static let textMuted = Color.white.opacity(0.4)

    // MARK: - Skill Colors
    static func skillColor(for title: String) -> Color {
        switch title.lowercased() {
        case let t where t.contains("beginner"): return piuGreen
        case let t where t.contains("intermediate"): return piuBronze
        case let t where t.contains("advanced"): return piuSilver
        case let t where t.contains("expert"): return piuGold
        default: return piuSilver
        }
    }

    // MARK: - Phase Colors
    static func phaseColor(for phase: String) -> Color {
        switch phase {
        case "SETUP": return textMuted
        case "ROUND_ROBIN": return piuAccent
        case "GAUNTLET": return piuGold
        case "COMPLETED": return piuGreen
        default: return textMuted
        }
    }

    // MARK: - Match Status Colors
    static func statusColor(for status: String) -> Color {
        switch status {
        case "PENDING": return textMuted
        case "DRAWING", "VETOING": return piuAccent
        case "READY": return piuBlue
        case "COMPLETED": return piuGreen
        case "WAITING": return piuGold
        default: return textMuted
        }
    }

    // MARK: - Avatar Gradient Colors
    static let avatarGradients: [(Color, Color)] = [
        (Color(hex: "#667eea"), Color(hex: "#764ba2")),
        (Color(hex: "#f093fb"), Color(hex: "#f5576c")),
        (Color(hex: "#4facfe"), Color(hex: "#00f2fe")),
        (Color(hex: "#43e97b"), Color(hex: "#38f9d7")),
        (Color(hex: "#fa709a"), Color(hex: "#fee140")),
        (Color(hex: "#a18cd1"), Color(hex: "#fbc2eb")),
        (Color(hex: "#fad0c4"), Color(hex: "#ffd1ff")),
        (Color(hex: "#ffecd2"), Color(hex: "#fcb69f")),
    ]

    static func avatarGradient(for index: Int) -> LinearGradient {
        let pair = avatarGradients[index % avatarGradients.count]
        return LinearGradient(colors: [pair.0, pair.1], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    // MARK: - Grade Colors
    static func gradeColor(for score: Int) -> Color {
        if score >= 995000 { return Color(hex: "#7dd3fc") } // SSS+ sky-300
        if score >= 990000 { return Color(hex: "#38bdf8") } // SSS sky-400
        if score >= 985000 { return Color(hex: "#ffd700") } // SS+ gold
        if score >= 980000 { return Color(hex: "#facc15") } // SS yellow-400
        if score >= 975000 { return Color(hex: "#f59e0b") } // S+ amber-400
        if score >= 970000 { return Color(hex: "#d97706") } // S amber-500
        if score >= 960000 { return Color(hex: "#c0c0c0") } // AAA+ silver
        if score >= 950000 { return Color(hex: "#d1d5db") } // AAA gray-300
        if score >= 925000 { return Color(hex: "#cd7f32") } // AA+ bronze
        if score >= 900000 { return Color(hex: "#cd7f32") } // AA bronze
        if score >= 825000 { return Color(hex: "#b45309") } // A+ amber-700
        if score >= 750000 { return Color(hex: "#b45309") } // A amber-700
        return Color(hex: "#6b7280") // B/C/D/F gray
    }

    static func gradeLabel(for score: Int) -> String {
        if score >= 995000 { return "SSS+" }
        if score >= 990000 { return "SSS" }
        if score >= 985000 { return "SS+" }
        if score >= 980000 { return "SS" }
        if score >= 975000 { return "S+" }
        if score >= 970000 { return "S" }
        if score >= 960000 { return "AAA+" }
        if score >= 950000 { return "AAA" }
        if score >= 925000 { return "AA+" }
        if score >= 900000 { return "AA" }
        if score >= 825000 { return "A+" }
        if score >= 750000 { return "A" }
        if score >= 650000 { return "B" }
        if score >= 550000 { return "C" }
        if score >= 450000 { return "D" }
        return "F"
    }

    // MARK: - Medal
    static func medalEmoji(for rank: Int) -> String {
        switch rank {
        case 1: return "🥇"
        case 2: return "🥈"
        case 3: return "🥉"
        default: return "#\(rank)"
        }
    }
}

// MARK: - Color Extension
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
