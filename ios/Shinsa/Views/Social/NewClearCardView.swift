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
            HStack(spacing: 12) {
                // Level badge
                if let mode = item.mode, let level = item.level {
                    Text("\(mode == "Single" ? "S" : "D")\(level)")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(mode == "Single" ? .red : .green)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.black.opacity(0.3))
                        .cornerRadius(6)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.songTitle ?? "Unknown Song")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)

                    HStack(spacing: 8) {
                        if let score = item.score {
                            Text(score.formattedScore)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(DojoTheme.piuGold)
                        }
                        if let grade = item.grade {
                            Text(grade)
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.piuSilver)
                        }
                        if let plate = item.plate {
                            Text(plate)
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.piuGold)
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

                HStack(spacing: 4) {
                    Image(systemName: "bubble.left")
                        .font(.system(size: 12))
                    Text("\(item.commentCount ?? 0)")
                        .font(.system(size: 12))
                }
                .foregroundColor(DojoTheme.textMuted)

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
