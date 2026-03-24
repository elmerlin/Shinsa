import SwiftUI

struct HighlightsStripView: View {
    let highlights: [UserHighlight]
    let currentUserId: String
    var onTapStory: (UserHighlight) -> Void = { _ in }
    var onTapAddStory: () -> Void = {}

    @State private var selectedHighlight: UserHighlight?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                // Own story circle (always first)
                let selfHighlight = highlights.first(where: { $0.userId == currentUserId })
                VStack(spacing: 4) {
                    ZStack(alignment: .bottomTrailing) {
                        Circle()
                            .stroke(
                                (selfHighlight?.hasUnviewed ?? false)
                                    ? LinearGradient(colors: [DojoTheme.piuAccent, Color.purple], startPoint: .topLeading, endPoint: .bottomTrailing)
                                    : LinearGradient(colors: [DojoTheme.piuBorder, DojoTheme.piuBorder], startPoint: .top, endPoint: .bottom),
                                lineWidth: 2.5
                            )
                            .frame(width: 56, height: 56)

                        if let sh = selfHighlight {
                            AvatarView(sh.avatar, name: sh.username ?? "You", size: 50)
                        } else {
                            Circle()
                                .fill(DojoTheme.piuDark)
                                .frame(width: 50, height: 50)
                                .overlay(
                                    Image(systemName: "person.fill")
                                        .font(.system(size: 18))
                                        .foregroundColor(DojoTheme.textMuted)
                                )
                        }

                        // Add button
                        Circle()
                            .fill(DojoTheme.piuAccent)
                            .frame(width: 18, height: 18)
                            .overlay(
                                Image(systemName: "plus")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.white)
                            )
                            .overlay(Circle().stroke(DojoTheme.piuBg, lineWidth: 2))
                    }
                    .onTapGesture {
                        if let sh = selfHighlight, (sh.storyCount ?? 0) > 0 {
                            selectedHighlight = sh
                        } else {
                            onTapAddStory()
                        }
                    }

                    Text("Your Story")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(DojoTheme.textMuted)
                        .lineLimit(1)
                }
                .frame(width: 64)

                // Other user circles
                ForEach(highlights.filter { $0.userId != currentUserId }) { h in
                    VStack(spacing: 4) {
                        Circle()
                            .stroke(
                                (h.hasUnviewed ?? false)
                                    ? LinearGradient(colors: [DojoTheme.piuAccent, Color.purple], startPoint: .topLeading, endPoint: .bottomTrailing)
                                    : LinearGradient(colors: [DojoTheme.piuBorder.opacity(0.5), DojoTheme.piuBorder.opacity(0.5)], startPoint: .top, endPoint: .bottom),
                                lineWidth: 2.5
                            )
                            .frame(width: 56, height: 56)
                            .overlay(
                                AvatarView(h.avatar, name: h.username ?? "?", size: 50)
                            )
                            .onTapGesture { selectedHighlight = h }

                        Text(h.username ?? "")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor((h.hasUnviewed ?? false) ? .white : DojoTheme.textMuted)
                            .lineLimit(1)
                    }
                    .frame(width: 64)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(
            LinearGradient(
                colors: [Color(hex: "#070c15").opacity(0.92), Color(hex: "#070c15").opacity(0.58)],
                startPoint: .top, endPoint: .bottom
            )
        )
        .fullScreenCover(item: $selectedHighlight) { highlight in
            StoryViewerView(highlight: highlight)
        }
    }
}
