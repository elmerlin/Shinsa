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

            // Score upgrades
            if !item.upscoreItems.isEmpty {
                VStack(spacing: 4) {
                    ForEach(Array(item.upscoreItems.enumerated()), id: \.offset) { _, upscore in
                        upscoreRow(
                            songTitle: upscore.songTitle,
                            mode: upscore.mode,
                            level: upscore.level,
                            oldScore: upscore.previousScore,
                            newScore: upscore.newScore
                        )
                    }
                }
            } else {
                // Fallback: single item from flat fields
                upscoreRow(
                    songTitle: item.songTitle,
                    mode: item.mode,
                    level: item.level,
                    oldScore: item.previousScore,
                    newScore: item.newScore
                )
            }

            // Footer
            HStack(spacing: 16) {
                PumpButtonView(pumped: $pumped, count: $pumpCount) {
                    await togglePump()
                }

                NavigationLink {
                    CommentsView(itemType: "upscore", itemId: item.itemId)
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

    // MARK: - Upscore Row

    private func upscoreRow(songTitle: String?, mode: String?, level: Int?, oldScore: Int?, newScore: Int?) -> some View {
        HStack(spacing: 8) {
            // Jacket placeholder
            jacketPlaceholder(mode: mode, level: level)

            // Mode badge
            if let mode = mode, let level = level {
                modeBadge(mode: mode, level: level)
            }

            // Song title
            VStack(alignment: .leading, spacing: 2) {
                Text(songTitle ?? "Unknown")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                if let old = oldScore, let new = newScore, new > old {
                    Text("+PB")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(DojoTheme.piuGreen)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(DojoTheme.piuGreen.opacity(0.15))
                        .cornerRadius(3)
                }
            }

            Spacer()

            // Scores with grades
            if let old = oldScore, let new = newScore {
                VStack(alignment: .trailing, spacing: 2) {
                    HStack(spacing: 4) {
                        Text(old.formattedScore)
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                        Image(systemName: "arrow.right")
                            .font(.system(size: 7))
                            .foregroundColor(DojoTheme.piuGreen)
                        Text(new.formattedScore)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(DojoTheme.piuGreen)
                    }
                    HStack(spacing: 4) {
                        Text(DojoTheme.gradeLabel(for: old))
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(DojoTheme.gradeColor(for: old))
                        Text(DojoTheme.gradeLabel(for: new))
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(DojoTheme.gradeColor(for: new))
                    }
                }
            }
        }
        .padding(8)
        .background(DojoTheme.piuDark)
        .cornerRadius(6)
    }

    // MARK: - Jacket Placeholder

    private func jacketPlaceholder(mode: String?, level: Int?) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4)
                .fill(
                    LinearGradient(
                        colors: mode == "Single"
                            ? [Color(hex: "#ff3366").opacity(0.3), Color(hex: "#ff6699").opacity(0.15)]
                            : [Color(hex: "#33ff66").opacity(0.3), Color(hex: "#66ff99").opacity(0.15)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            if let mode = mode {
                Text(mode == "Single" ? "S" : "D")
                    .font(.system(size: 14, weight: .black))
                    .foregroundColor(mode == "Single" ? DojoTheme.piuAccent.opacity(0.6) : DojoTheme.piuGreen.opacity(0.6))
            }
        }
        .frame(width: 50, height: 28)
    }

    // MARK: - Mode Badge

    private func modeBadge(mode: String, level: Int) -> some View {
        Text("\(mode == "Single" ? "S" : "D")\(level)")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
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

    private func togglePump() async {
        do {
            let response = try await APIService.shared.pumpUpscore(item.itemId)
            pumped = response.pumped
            pumpCount = response.pumpCount ?? pumpCount
            if pumped { HapticService.pump() }
        } catch {}
    }
}
