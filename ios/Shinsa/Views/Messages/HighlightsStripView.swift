import SwiftUI

struct HighlightsStripView: View {
    let highlights: [UserHighlight]
    let currentUserId: String
    var onTapStory: (UserHighlight) -> Void = { _ in }
    var onTapAddStory: () -> Void = {}

    @State private var selectedHighlight: UserHighlight?

    private let avatarSize: CGFloat = 62
    private let ringSize: CGFloat = 70
    private let columnWidth: CGFloat = 78

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    // Own story circle (always first)
                    let selfHighlight = highlights.first(where: { $0.userId == currentUserId })
                    ownStoryCircle(selfHighlight)

                    // Other user circles
                    ForEach(highlights.filter { $0.userId != currentUserId }) { h in
                        otherStoryCircle(h)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
        }
        .background(
            LinearGradient(
                colors: [Color(hex: "#070c15").opacity(0.95), Color(hex: "#070c15").opacity(0.6)],
                startPoint: .top, endPoint: .bottom
            )
        )
        .fullScreenCover(item: $selectedHighlight) { highlight in
            StoryViewerView(highlight: highlight)
        }
    }

    // MARK: - Own Story Circle

    private func ownStoryCircle(_ selfHighlight: UserHighlight?) -> some View {
        VStack(spacing: 5) {
            // "Share a note" dashed border area
            Text("Share a note")
                .font(.system(size: 8, weight: .medium))
                .foregroundColor(DojoTheme.textMuted)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        .foregroundColor(DojoTheme.piuBorder)
                )
                .padding(.bottom, 2)

            ZStack(alignment: .bottomTrailing) {
                // Ring
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [Color(hex: "#00e5ff"), Color(hex: "#00bcd4")],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        ),
                        lineWidth: 2.5
                    )
                    .frame(width: ringSize, height: ringSize)

                // Avatar
                if let sh = selfHighlight {
                    AvatarView(sh.avatar, name: sh.username ?? "You", size: avatarSize)
                } else {
                    Circle()
                        .fill(DojoTheme.piuDark)
                        .frame(width: avatarSize, height: avatarSize)
                        .overlay(
                            Image(systemName: "person.fill")
                                .font(.system(size: 22))
                                .foregroundColor(DojoTheme.textMuted)
                        )
                }

                // Cyan + button
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: "#00e5ff"), Color(hex: "#00bcd4")],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
                    .frame(width: 22, height: 22)
                    .overlay(
                        Image(systemName: "plus")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                    )
                    .overlay(Circle().stroke(DojoTheme.piuBg, lineWidth: 2.5))
            }
            .onTapGesture {
                if let sh = selfHighlight, (sh.storyCount ?? 0) > 0 {
                    selectedHighlight = sh
                } else {
                    onTapAddStory()
                }
            }

            Text("Your Status")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)
                .lineLimit(1)
        }
        .frame(width: columnWidth)
    }

    // MARK: - Other Story Circle

    private func otherStoryCircle(_ h: UserHighlight) -> some View {
        let hasUnviewed = h.hasUnviewed ?? false

        return VStack(spacing: 5) {
            // Spacer to align with "Share a note" on own circle
            Color.clear.frame(height: 16)

            Circle()
                .stroke(
                    hasUnviewed
                        ? LinearGradient(
                            colors: [Color(hex: "#33ff66"), Color(hex: "#00cc44")],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                        : LinearGradient(
                            colors: [DojoTheme.piuBorder.opacity(0.5), DojoTheme.piuBorder.opacity(0.5)],
                            startPoint: .top, endPoint: .bottom
                        ),
                    lineWidth: 2.5
                )
                .frame(width: ringSize, height: ringSize)
                .overlay(
                    AvatarView(h.avatar, name: h.username ?? "?", size: avatarSize)
                )
                .onTapGesture { selectedHighlight = h }

            Text(h.username ?? "")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(hasUnviewed ? .white : DojoTheme.textMuted)
                .lineLimit(1)
        }
        .frame(width: columnWidth)
    }
}
