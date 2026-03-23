import SwiftUI

struct UpscoreCardView: View {
    let item: FeedItem
    @State private var pumped: Bool
    @State private var pumpCount: Int
    @State private var showAll = false

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
                        if let nat = item.nationality, !nat.isEmpty {
                            Text(CountryData.flag(for: nat))
                                .font(.system(size: 12))
                        }
                        Text(item.username ?? "Unknown")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                        Text("upscores!")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(DojoTheme.piuGreen)

                        // Pumbility gain badge
                        if let pb = item.pumbilityGain, pb.value > 0 {
                            Text("+\(Int(pb.value)) PB")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(Color(hex: "#67e8f9"))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Color.cyan.opacity(0.1))
                                .cornerRadius(3)
                        }
                    }
                    if let created = item.createdAt {
                        Text(created.timeAgo)
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
                Spacer()
            }

            // Upscore rows
            let upscores = item.upscoreItems
            if !upscores.isEmpty {
                let visible = showAll ? upscores : Array(upscores.prefix(5))
                VStack(spacing: 0) {
                    ForEach(Array(visible.enumerated()), id: \.offset) { idx, upscore in
                        upscoreRow(upscore)
                        if idx < visible.count - 1 {
                            Divider().background(DojoTheme.piuBorder.opacity(0.2))
                        }
                    }
                }
                .background(DojoTheme.piuDark)
                .cornerRadius(8)

                if upscores.count > 5 && !showAll {
                    Button {
                        showAll = true
                    } label: {
                        Text("Show \(upscores.count - 5) more")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)
                    }
                }
            } else {
                // Fallback for old format without upscores_json
                singleUpscoreRow
                    .background(DojoTheme.piuDark)
                    .cornerRadius(8)
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

    // MARK: - Upscore Row (from upscores_json)

    private func upscoreRow(_ u: FeedItem.UpscoreItem) -> some View {
        HStack(spacing: 8) {
            // Song jacket
            jacketView(backgroundUrl: u.backgroundUrl, songTitle: u.songTitle, mode: u.mode, level: u.level)

            // Song info
            VStack(alignment: .leading, spacing: 2) {
                Text(u.songTitle ?? "Unknown")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    if let rank = u.overTop100Rank, rank >= 1, rank <= 100 {
                        Text("TOP #\(rank)")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(Color(hex: "#fde68a"))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(DojoTheme.piuGold.opacity(0.15))
                            .overlay(RoundedRectangle(cornerRadius: 3).stroke(DojoTheme.piuGold.opacity(0.3), lineWidth: 0.5))
                            .cornerRadius(3)
                    }
                    if let pb = u.pumbilityGain, pb.value > 0 {
                        Text("+\(Int(pb.value)) PB")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(Color(hex: "#67e8f9"))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Color.cyan.opacity(0.1))
                            .cornerRadius(3)
                    }
                }
            }

            Spacer()

            // Scores with grades
            if let old = u.oldScore, let new = u.newScore {
                VStack(alignment: .trailing, spacing: 2) {
                    // Score line
                    HStack(spacing: 3) {
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(DojoTheme.gradeLabel(for: old))
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(DojoTheme.gradeColor(for: old))
                            Text(formatScore(old))
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundColor(DojoTheme.textMuted)
                        }

                        Text("→")
                            .font(.system(size: 8))
                            .foregroundColor(DojoTheme.textMuted)

                        VStack(alignment: .trailing, spacing: 0) {
                            Text(DojoTheme.gradeLabel(for: new))
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(DojoTheme.gradeColor(for: new))
                            Text(formatScore(new))
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundColor(.white)
                        }
                    }

                    // Improvement
                    let diff = new - old
                    if diff > 0 {
                        Text("+\(diff.formattedScore)")
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundColor(DojoTheme.piuGreen)
                    }
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
    }

    // MARK: - Fallback single row

    private var singleUpscoreRow: some View {
        HStack(spacing: 8) {
            jacketView(backgroundUrl: item.backgroundUrl, songTitle: item.songTitle, mode: item.mode, level: item.level)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.songTitle ?? "Unknown")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
            }

            Spacer()

            if let old = item.previousScore, let new = item.newScore {
                HStack(spacing: 3) {
                    Text(formatScore(old))
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("→")
                        .font(.system(size: 8))
                        .foregroundColor(DojoTheme.textMuted)
                    Text(formatScore(new))
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(DojoTheme.piuGreen)
                }
            }
        }
        .padding(10)
    }

    // MARK: - Song Jacket

    private func jacketView(backgroundUrl: String?, songTitle: String?, mode: String?, level: Int?) -> some View {
        let jacketURL = JacketService.shared.resolveJacketURL(title: songTitle, mode: mode, level: level, backgroundUrl: backgroundUrl)

        return ZStack(alignment: .bottomTrailing) {
            // Jacket image or fallback
            if let url = jacketURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFill()
                    default:
                        jacketFallback(songTitle: songTitle, mode: mode)
                    }
                }
            } else {
                jacketFallback(songTitle: songTitle, mode: mode)
            }

            // Gradient overlay
            LinearGradient(
                colors: [.clear, .black.opacity(0.5)],
                startPoint: .top,
                endPoint: .bottom
            )

            // Mode + Level badge
            if let mode = mode, let level = level {
                let isDouble = mode.lowercased().hasPrefix("d") || mode.lowercased() == "double"
                let isCoop = mode.lowercased().hasPrefix("c") || mode.lowercased() == "coop"
                let prefix = isCoop ? "C" : (isDouble ? "D" : "S")
                let colors: [Color] = isCoop
                    ? [Color(hex: "#69c8ff"), Color(hex: "#12457c")]
                    : isDouble
                        ? [Color(hex: "#4cf4aa"), Color(hex: "#0b5d48")]
                        : [Color(hex: "#ff7a7a"), Color(hex: "#7a1730")]

                Text("\(prefix)\(level)")
                    .font(.system(size: 8, weight: .black))
                    .foregroundColor(.white)
                    .padding(.horizontal, 3)
                    .padding(.vertical, 1)
                    .background(
                        LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
                    .cornerRadius(2)
                    .padding(2)
            }
        }
        .frame(width: 50, height: 28)
        .cornerRadius(6)
        .clipped()
    }

    private func jacketFallback(songTitle: String?, mode: String?) -> some View {
        let isDouble = (mode ?? "").lowercased().hasPrefix("d")
        return Rectangle()
            .fill(
                LinearGradient(
                    colors: isDouble
                        ? [Color(hex: "#0b5d48"), Color(hex: "#16b77f")]
                        : [Color(hex: "#7a1730"), Color(hex: "#d93d62")],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                Text(String((songTitle ?? "?").prefix(1)).uppercased())
                    .font(.system(size: 12, weight: .black))
                    .foregroundColor(.white.opacity(0.4))
            )
    }

    // MARK: - Helpers

    private func formatScore(_ score: Int) -> String {
        let str = String(format: "%06d", score)
        if str.count >= 3 {
            let idx = str.index(str.endIndex, offsetBy: -3)
            return str[str.startIndex..<idx] + "," + str[idx...]
        }
        return str
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
