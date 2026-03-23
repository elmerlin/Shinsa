import SwiftUI

struct HighlightsStripView: View {
    let highlights: [UserHighlight]
    @State private var selectedHighlight: UserHighlight?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                ForEach(highlights) { highlight in
                    Button {
                        selectedHighlight = highlight
                    } label: {
                        highlightCircle(highlight)
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .fullScreenCover(item: $selectedHighlight) { highlight in
            StoryViewerView(highlight: highlight)
        }
    }

    private func highlightCircle(_ highlight: UserHighlight) -> some View {
        VStack(spacing: 4) {
            ZStack {
                // Ring
                Circle()
                    .stroke(
                        highlight.hasUnviewed == true
                            ? LinearGradient(
                                colors: [Color(hex: "00ddff"), Color(hex: "ff3366")],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                              )
                            : LinearGradient(
                                colors: [Color.gray.opacity(0.4), Color.gray.opacity(0.4)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                              ),
                        lineWidth: 2.5
                    )
                    .frame(width: 50, height: 50)

                // Avatar
                AvatarView(highlight.avatar, name: highlight.username ?? "?", size: 44)
            }

            Text(highlight.username ?? "")
                .font(.system(size: 9))
                .foregroundColor(DojoTheme.textSecondary)
                .lineLimit(1)
                .frame(width: 56)
        }
    }
}
