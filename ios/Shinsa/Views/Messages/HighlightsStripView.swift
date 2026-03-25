import SwiftUI

struct HighlightsStripView: View {
    let highlights: [UserHighlight]
    let currentUserId: String
    var onTapStory: (UserHighlight) -> Void = { _ in }
    var onTapAddStory: () -> Void = {}
    var onTapShareNote: () -> Void = {}

    @State private var selectedHighlight: UserHighlight?

    private let avatarSize: CGFloat = 62
    private let ringSize: CGFloat = 70
    private let columnWidth: CGFloat = 78

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    // Own story circle (always first, use isSelf flag)
                    let selfHighlight = highlights.first(where: { $0.isSelf == true }) ?? highlights.first(where: { $0.userId == currentUserId })
                    ownStoryCircle(selfHighlight)

                    // Other user circles
                    ForEach(highlights.filter { $0.isSelf != true && $0.userId != currentUserId }) { h in
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
            // "Share a note" tappable area
            Button(action: onTapShareNote) {
                Text(selfHighlight?.note?.text ?? "Share a note")
                    .font(.system(size: 8, weight: .medium))
                    .foregroundColor(selfHighlight?.note != nil ? .white : DojoTheme.textMuted)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(selfHighlight?.note != nil ? Color.cyan.opacity(0.15) : Color.clear)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(style: StrokeStyle(lineWidth: 1, dash: selfHighlight?.note != nil ? [] : [3, 3]))
                            .foregroundColor(selfHighlight?.note != nil ? Color.cyan.opacity(0.3) : DojoTheme.piuBorder)
                    )
            }
            .padding(.bottom, 2)

            ZStack {
                // Ring
                Circle()
                    .stroke(
                        AngularGradient(
                            gradient: Gradient(colors: [
                                Color(hex: "#22d3ee").opacity(0.95),
                                Color(hex: "#facc15").opacity(0.9),
                                Color(hex: "#10b981").opacity(0.9),
                                Color(hex: "#22d3ee").opacity(0.95),
                            ]),
                            center: .center
                        ),
                        lineWidth: 2.5
                    )
                    .frame(width: ringSize, height: ringSize)

                // Avatar (centered inside ring, clipped to circle)
                if let sh = selfHighlight {
                    AvatarView(sh.avatar, name: sh.username ?? "You", size: avatarSize)
                        .clipShape(Circle())
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

                // Cyan + button (bottom-right)
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Button {
                            onTapAddStory()
                        } label: {
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
                                .overlay(Circle().stroke(Color(hex: "#070b13"), lineWidth: 2.5))
                                .shadow(color: Color(hex: "#06b6d4").opacity(0.35), radius: 10)
                        }
                    }
                }
                .frame(width: ringSize, height: ringSize)
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

            ZStack {
                Circle()
                    .stroke(
                        hasUnviewed
                            ? AnyShapeStyle(AngularGradient(
                                gradient: Gradient(colors: [
                                    Color(hex: "#22d3ee").opacity(0.95),
                                    Color(hex: "#facc15").opacity(0.9),
                                    Color(hex: "#10b981").opacity(0.9),
                                    Color(hex: "#22d3ee").opacity(0.95),
                                ]),
                                center: .center
                            ))
                            : AnyShapeStyle(Color.white.opacity(0.1)),
                        lineWidth: 2.5
                    )
                    .frame(width: ringSize, height: ringSize)

                AvatarView(h.avatar, name: h.username ?? "?", size: avatarSize)
                    .clipShape(Circle())
            }
            .onTapGesture { selectedHighlight = h }

            Text(h.username ?? "")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(hasUnviewed ? .white : DojoTheme.textMuted)
                .lineLimit(1)
        }
        .frame(width: columnWidth)
    }
}
