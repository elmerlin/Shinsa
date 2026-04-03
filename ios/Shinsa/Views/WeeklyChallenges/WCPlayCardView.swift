import SwiftUI

/// Feed card for weekly challenge play posts
struct WCPlayCardView: View {
    let item: FeedItem
    @EnvironmentObject var auth: AuthManager
    @State private var isPumped: Bool
    @State private var pumpCount: Int
    @State private var showComments = false

    init(item: FeedItem) {
        self.item = item
        _isPumped = State(initialValue: item.isPumped)
        _pumpCount = State(initialValue: item.pumpCount ?? 0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack(spacing: 10) {
                NavigationLink(value: "profile/\(item.userId ?? "")") {
                    AvatarView(item.avatar, name: item.username ?? "?", size: 36)
                }

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        if let nat = item.nationality, !nat.isEmpty {
                            Text(flagEmoji(for: nat))
                                .font(.system(size: 11))
                        }
                        Text(item.username ?? "Player")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                    }

                    HStack(spacing: 4) {
                        Image(systemName: "trophy.fill")
                            .font(.system(size: 9))
                            .foregroundColor(DojoTheme.piuGold)
                        Text("Weekly Challenge")
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.piuGold)

                        if let wk = item.weekKey {
                            Text(wk)
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }
                }

                Spacer()

                // Total stats
                VStack(alignment: .trailing, spacing: 2) {
                    if let pts = item.totalRatingPoints, pts > 0 {
                        Text(String(format: "%.1f pts", pts))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.piuGold)
                    }
                    if let charts = item.totalChartsPlayed, charts > 0 {
                        Text("\(charts) charts")
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
            }
            .padding(12)

            // Play entries
            let plays = item.wcPlayItems
            if !plays.isEmpty {
                VStack(spacing: 1) {
                    ForEach(plays) { play in
                        playRow(play)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            }

            Divider().background(DojoTheme.piuBorder)

            // Action bar
            HStack(spacing: 20) {
                // Pump
                Button {
                    Task { await togglePump() }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: isPumped ? "hand.thumbsup.fill" : "hand.thumbsup")
                            .font(.system(size: 13))
                        if pumpCount > 0 {
                            Text("\(pumpCount)")
                                .font(.system(size: 12))
                        }
                    }
                    .foregroundColor(isPumped ? DojoTheme.piuAccent : DojoTheme.textMuted)
                }

                // Comments
                Button {
                    showComments = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "bubble.right")
                            .font(.system(size: 13))
                        if let cc = item.commentCount, cc > 0 {
                            Text("\(cc)")
                                .font(.system(size: 12))
                        }
                    }
                    .foregroundColor(DojoTheme.textMuted)
                }

                Spacer()

                // Timestamp
                if let ts = item.createdAt {
                    Text(timeAgo(ts))
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Play Row

    private func playRow(_ play: FeedItem.WCPlayItem) -> some View {
        HStack(spacing: 8) {
            // Jacket
            if let urlStr = play.jacketUrl,
               let url = URL(string: urlStr.hasPrefix("http") ? urlStr : "\(APIService.shared.baseURL)\(urlStr)") {
                AsyncImage(url: url) { phase in
                    if case .success(let img) = phase {
                        img.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        playJacketPlaceholder(play)
                    }
                }
                .frame(width: 36, height: 36)
                .cornerRadius(4)
                .clipped()
            } else {
                playJacketPlaceholder(play)
                    .frame(width: 36, height: 36)
                    .cornerRadius(4)
            }

            // Song info
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(play.songTitle ?? "Unknown")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)

                    // Mode badge
                    let letter = play.mode == "Single" ? "S" : "D"
                    let color = play.mode == "Single" ? Color(hex: "#ff6688") : Color(hex: "#44cc88")
                    Text("\(letter)\(play.level ?? 0)")
                        .font(.system(size: 8, weight: .black))
                        .foregroundColor(.white)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(color.opacity(0.8))
                        .cornerRadius(3)
                }

                HStack(spacing: 6) {
                    if let score = play.score {
                        Text(formatScore(score))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.gradeColor(for: score))
                    }

                    if let grade = play.grade {
                        Text(grade)
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(DojoTheme.gradeColor(for: play.score ?? 0))
                    }

                    if let rp = play.ratingPoints, rp > 0 {
                        Text(String(format: "+%.1f RP", rp))
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(DojoTheme.piuGold)
                    }
                }
            }

            Spacer()

            // Improvement indicator
            if let prev = play.previousScore, let current = play.score, current > prev {
                VStack(spacing: 1) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.piuGreen)
                    Text("+\(formatScore(current - prev))")
                        .font(.system(size: 8))
                        .foregroundColor(DojoTheme.piuGreen)
                }
            } else if play.isNew == true {
                Text("NEW")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(DojoTheme.piuGold)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(DojoTheme.piuGold.opacity(0.15))
                    .cornerRadius(3)
            }

            // Replay
            if play.replayEmbedUrl != nil || play.replayVideoId != nil {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 14))
                    .foregroundColor(DojoTheme.piuBlue.opacity(0.7))
            }
        }
        .padding(6)
        .background(DojoTheme.piuDark.opacity(0.5))
        .cornerRadius(6)
    }

    // MARK: - Helpers

    private func playJacketPlaceholder(_ play: FeedItem.WCPlayItem) -> some View {
        ZStack {
            let color = play.mode == "Single" ? Color(hex: "#ff6688") : Color(hex: "#44cc88")
            color.opacity(0.2)
            Text(String((play.songTitle ?? "?").prefix(1)).uppercased())
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white.opacity(0.4))
        }
    }

    private func togglePump() async {
        do {
            let resp = try await APIService.shared.pumpWeeklyChallengePlay(id: item.itemId)
            isPumped.toggle()
            pumpCount = isPumped ? pumpCount + 1 : max(0, pumpCount - 1)
        } catch {}
    }

    private func formatScore(_ score: Int) -> String {
        let s = String(score)
        if s.count > 3 {
            let idx = s.index(s.endIndex, offsetBy: -3)
            return s[s.startIndex..<idx] + "," + s[idx...]
        }
        return s
    }

    private func flagEmoji(for code: String) -> String {
        let base: UInt32 = 127397
        let upper = code.uppercased()
        var result = ""
        for scalar in upper.unicodeScalars {
            if let flag = Unicode.Scalar(base + scalar.value) {
                result.append(String(flag))
            }
        }
        return result.isEmpty ? "" : result
    }

    private func timeAgo(_ dateStr: String) -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        let fmtAlt = DateFormatter()
        fmtAlt.dateFormat = "yyyy-MM-dd HH:mm:ss"

        guard let date = fmt.date(from: dateStr) ?? fmtAlt.date(from: dateStr) else { return dateStr }
        let seconds = Int(-date.timeIntervalSinceNow)
        if seconds < 60 { return "now" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)d"
    }
}
