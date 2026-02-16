import SwiftUI

struct StatusBadgeView: View {
    let text: String
    let color: Color

    init(_ text: String, color: Color) {
        self.text = text
        self.color = color
    }

    init(phase: String) {
        switch phase {
        case "SETUP":
            self.init("Setup", color: DojoTheme.textMuted)
        case "ROUND_ROBIN":
            self.init("Round Robin", color: DojoTheme.piuAccent)
        case "GAUNTLET":
            self.init("Gauntlet", color: DojoTheme.piuGold)
        case "COMPLETED":
            self.init("Completed", color: DojoTheme.piuGreen)
        default:
            self.init(phase, color: DojoTheme.textMuted)
        }
    }

    init(duelStatus: String) {
        switch duelStatus {
        case "COMPLETED":
            self.init("Completed", color: DojoTheme.piuGreen)
        case "WAITING":
            self.init("Waiting", color: DojoTheme.piuGold)
        default:
            self.init("Active", color: DojoTheme.piuAccent)
        }
    }

    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.15))
            .clipShape(Capsule())
    }
}
