import SwiftUI

struct PumpButtonView: View {
    @Binding var pumped: Bool
    @Binding var count: Int
    let onToggle: () async -> Void
    @State private var bouncing = false

    var body: some View {
        Button {
            Task { await onToggle() }
        } label: {
            HStack(spacing: 4) {
                // Stomp pad icon - simple geometric shape
                ZStack {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(pumped ? DojoTheme.piuGold : Color.gray.opacity(0.4))
                        .frame(width: 16, height: 16)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(pumped ? DojoTheme.piuGold.opacity(0.6) : Color.gray.opacity(0.2))
                        .frame(width: 10, height: 10)
                    Circle()
                        .fill(pumped ? Color.yellow : Color.gray.opacity(0.3))
                        .frame(width: 5, height: 5)
                }
                .scaleEffect(bouncing ? 1.3 : 1.0)

                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: 12, weight: .bold))
                }
            }
            .foregroundColor(pumped ? DojoTheme.piuGold : DojoTheme.textMuted)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(pumped ? DojoTheme.piuGold.opacity(0.1) : Color.clear)
            .cornerRadius(8)
        }
        .onChange(of: pumped) { newVal in
            if newVal {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
                    bouncing = true
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    withAnimation { bouncing = false }
                }
            }
        }
    }
}
