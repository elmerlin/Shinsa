import SwiftUI

struct UpscoreCardView: View {
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
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.piuGreen)
                        Text(item.username ?? "Unknown")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                        Text("improved a score!")
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

            // Score upgrade
            HStack {
                if let mode = item.mode, let level = item.level {
                    Text("\(mode == "Single" ? "S" : "D")\(level)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(mode == "Single" ? .red : .green)
                        .frame(width: 30)
                }

                Text(item.songTitle ?? "Unknown")
                    .font(.system(size: 12))
                    .foregroundColor(.white)
                    .lineLimit(1)

                Spacer()

                if let old = item.previousScore, let new = item.newScore {
                    HStack(spacing: 4) {
                        Text(old.formattedScore)
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                        Image(systemName: "arrow.right")
                            .font(.system(size: 8))
                            .foregroundColor(DojoTheme.piuGreen)
                        Text(new.formattedScore)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.piuGreen)
                    }
                }
            }
            .padding(6)
            .background(DojoTheme.piuDark)
            .cornerRadius(4)

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
            let response = try await APIService.shared.pumpUpscore(item.itemId)
            pumped = response.pumped
            pumpCount = response.pumpCount ?? pumpCount
            if pumped { HapticService.pump() }
        } catch {}
    }
}
