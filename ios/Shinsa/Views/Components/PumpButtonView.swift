import SwiftUI

struct PumpButtonView: View {
    @Binding var pumped: Bool
    @Binding var count: Int
    let onToggle: () async -> Void
    @State private var animating = false

    var body: some View {
        Button {
            Task { await onToggle() }
            withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
                animating = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                animating = false
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: pumped ? "heart.fill" : "heart")
                    .font(.system(size: 14))
                    .foregroundColor(pumped ? DojoTheme.piuAccent : DojoTheme.textMuted)
                    .scaleEffect(animating ? 1.3 : 1.0)

                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: 12))
                        .foregroundColor(pumped ? DojoTheme.piuAccent : DojoTheme.textMuted)
                }
            }
        }
    }
}
