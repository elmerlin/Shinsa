import UIKit

enum HapticService {
    static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .medium) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    static func notification(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        UINotificationFeedbackGenerator().notificationOccurred(type)
    }

    static func veto() {
        impact(.heavy)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            notification(.warning)
        }
    }

    static func cardDraw() {
        impact(.medium)
    }

    static func matchWin() {
        notification(.success)
    }

    static func pump() {
        impact(.light)
    }

    static func shuffle() {
        for i in 0..<5 {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.08) {
                impact(.light)
            }
        }
    }
}
