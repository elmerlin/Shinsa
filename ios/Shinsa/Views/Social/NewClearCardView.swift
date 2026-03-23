import SwiftUI

struct NewClearCardView: View {
    let item: FeedItem
    @State private var pumped: Bool
    @State private var pumpCount: Int

    init(item: FeedItem) {
        self.item = item
        _pumped = State(initialValue: item.isPumped)
        _pumpCount = State(initialValue: item.pumpCount ?? 0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header
            HStack(spacing: 10) {
                NavigationLink(value: "profile/\(item.userId ?? "")") {
                    AvatarView(item.avatar, name: item.username ?? "?", size: 36)
                }

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Image(systemName: "star.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.cyan)
                        Text(item.username ?? "Unknown")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                        Text("cleared a new song!")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                    if let created = item.createdAt {
                        Text(created.timeAgo)
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
                Spacer()
            }

            // Song info
            HStack(spacing: 10) {
                // Jacket placeholder
                ZStack {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(
                            LinearGradient(
                                colors: item.mode == "Single"
                                    ? [Color(hex: "#ff3366").opacity(0.3), Color(hex: "#ff6699").opacity(0.15)]
                                    : [Color(hex: "#33ff66").opacity(0.3), Color(hex: "#66ff99").opacity(0.15)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    if let mode = item.mode {
                        Text(mode == "Single" ? "S" : "D")
                            .font(.system(size: 16, weight: .black))
                            .foregroundColor(mode == "Single" ? DojoTheme.piuAccent.opacity(0.6) : DojoTheme.piuGreen.opacity(0.6))
                    }
                }
                .frame(width: 56, height: 32)

                // Mode badge
                if let mode = item.mode, let level = item.level {
                    Text("\(mode == "Single" ? "S" : "D")\(level)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(
                            LinearGradient(
                                colors: mode == "Single"
                                    ? [Color(hex: "#ff3366"), Color(hex: "#ff6699")]
                                    : [Color(hex: "#33ff66"), Color(hex: "#22cc55")],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .cornerRadius(4)
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(item.songTitle ?? "Unknown Song")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)

                    HStack(spacing: 8) {
                        if let score = item.score {
                            Text(score.formattedScore)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(DojoTheme.gradeColor(for: score))

                            Text(DojoTheme.gradeLabel(for: score))
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(DojoTheme.gradeColor(for: score))
                        }
                        if let plate = item.plate {
                            Text(plate)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(DojoTheme.piuGold)
                                .padding(.horizontal, 4)
                                .padding(.vertical, 1)
                                .background(DojoTheme.piuGold.opacity(0.1))
                                .cornerRadius(3)
                        }
                    }
                }

                Spacer()
            }
            .padding(10)
            .background(DojoTheme.piuDark)
            .cornerRadius(8)

            // Footer
            HStack(spacing: 16) {
                PumpButtonView(pumped: $pumped, count: $pumpCount) {
                    await togglePump()
                }

                NavigationLink {
                    CommentsView(itemType: "clear", itemId: item.itemId)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "bubble.left")
                            .font(.system(size: 12))
                        Text("\(item.commentCount ?? 0)")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .foregroundColor(DojoTheme.textMuted)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                }

                Spacer()
            }
        }
        .padding(14)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    private func togglePump() async {
        do {
            let response = try await APIService.shared.pumpNewClear(item.itemId)
            pumped = response.pumped
            pumpCount = response.pumpCount ?? pumpCount
            if pumped { HapticService.pump() }
        } catch {}
    }
}
