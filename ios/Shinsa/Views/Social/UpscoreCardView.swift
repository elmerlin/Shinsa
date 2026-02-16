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

    private var upgrades: [(String, String, Int, Int?, Int?)] {
        guard let json = item.upscoresJson,
              let data = json.data(using: .utf8),
              let entries = try? JSONDecoder().decode([UpscoreEntry].self, from: data)
        else { return [] }
        return entries.map { ($0.songTitle ?? "Unknown", $0.mode ?? "Single", $0.level ?? 0, $0.oldScore, $0.newScore) }
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
                        Text("improved \(upgrades.count) score\(upgrades.count != 1 ? "s" : "")")
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

            // Score upgrades
            ForEach(Array(upgrades.enumerated()), id: \.offset) { _, entry in
                HStack {
                    Text("\(entry.1 == "Single" ? "S" : "D")\(entry.2)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(entry.1 == "Single" ? .red : .green)
                        .frame(width: 30)

                    Text(entry.0)
                        .font(.system(size: 12))
                        .foregroundColor(.white)
                        .lineLimit(1)

                    Spacer()

                    if let old = entry.3, let new = entry.4 {
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
            }

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
