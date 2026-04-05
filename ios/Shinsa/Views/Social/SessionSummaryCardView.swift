import SwiftUI

/// Feed card for session summary posts (/summary command)
struct SessionSummaryCardView: View {
    let summary: SessionSummaryMarker

    @State private var showTopPlays = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack(spacing: 8) {
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: 14))
                    .foregroundColor(DojoTheme.piuAccent)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Session Summary")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)

                    HStack(spacing: 8) {
                        if let date = summary.sessionDateLabel, !date.isEmpty {
                            Text(date)
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                        if let time = summary.sessionTimeRange, !time.isEmpty {
                            Text(time)
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }
                }

                Spacer()

                if let duration = summary.sessionDurationLabel, !duration.isEmpty {
                    Text(duration)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(DojoTheme.piuGold)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(DojoTheme.piuGold.opacity(0.12))
                        .cornerRadius(6)
                }
            }

            // Machine + Shoe
            HStack(spacing: 12) {
                if let machine = summary.sessionMachineName, !machine.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "arcade.stick")
                            .font(.system(size: 10))
                        Text(machine)
                            .font(.system(size: 11))
                    }
                    .foregroundColor(DojoTheme.textMuted)
                }
                if let shoe = summary.sessionShoeLabel, !shoe.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "shoe.fill")
                            .font(.system(size: 10))
                        Text(shoe)
                            .font(.system(size: 11))
                    }
                    .foregroundColor(DojoTheme.textMuted)
                }
            }

            // Stats grid
            statsGrid

            // Mode breakdown
            modeBreakdown

            // Judgment totals
            if let judgments = summary.judgmentTotals {
                judgmentBar(judgments)
            }

            // Top plays
            if let byScore = summary.topSongsByScore, !byScore.isEmpty {
                topPlaysSection(byScore: byScore, byRating: summary.topSongsByRating ?? [])
            }
        }
        .padding(14)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Stats Grid

    private var statsGrid: some View {
        VStack(spacing: 4) {
            HStack(spacing: 0) {
                statCell(value: "\(summary.songCount ?? 0)", label: "Songs")
                statCell(value: "\(summary.clearCount ?? 0)", label: "Clears")
                statCell(value: "\(summary.clearRate ?? 0)%", label: "Clear Rate")
            }
            HStack(spacing: 0) {
                if let steps = summary.totalSteps, steps > 0 {
                    statCell(value: formatNumber(steps), label: "Steps")
                }
                if let kcal = summary.estimatedKcal, kcal > 0 {
                    statCell(value: "\(kcal)", label: "kcal")
                }
                if let kcalHr = summary.estimatedKcalPerHour, kcalHr > 0 {
                    statCell(value: "\(kcalHr)", label: "kcal/hr")
                }
            }
        }
    }

    // MARK: - Mode Breakdown

    private var modeBreakdown: some View {
        HStack(spacing: 12) {
            if let s = summary.singleCount, s > 0 {
                HStack(spacing: 3) {
                    Text("S")
                        .font(.system(size: 9, weight: .black))
                        .foregroundColor(Color(hex: "#ff6688"))
                    Text("\(s)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(DojoTheme.textSecondary)
                }
            }
            if let d = summary.doubleCount, d > 0 {
                HStack(spacing: 3) {
                    Text("D")
                        .font(.system(size: 9, weight: .black))
                        .foregroundColor(Color(hex: "#44cc88"))
                    Text("\(d)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(DojoTheme.textSecondary)
                }
            }
            if let o = summary.otherCount, o > 0 {
                HStack(spacing: 3) {
                    Text("Co-op")
                        .font(.system(size: 9, weight: .black))
                        .foregroundColor(Color(hex: "#4488ff"))
                    Text("\(o)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(DojoTheme.textSecondary)
                }
            }
            Spacer()
        }
    }

    // MARK: - Judgment Bar

    private func judgmentBar(_ j: JudgmentTotals) -> some View {
        let total = max(1, (j.perfect ?? 0) + (j.great ?? 0) + (j.good ?? 0) + (j.bad ?? 0) + (j.miss ?? 0))

        return VStack(spacing: 4) {
            GeometryReader { geo in
                HStack(spacing: 0) {
                    barSegment(value: j.perfect ?? 0, total: total, color: Color(hex: "#44ccff"), width: geo.size.width)
                    barSegment(value: j.great ?? 0, total: total, color: Color(hex: "#44ff44"), width: geo.size.width)
                    barSegment(value: j.good ?? 0, total: total, color: Color(hex: "#ffcc44"), width: geo.size.width)
                    barSegment(value: j.bad ?? 0, total: total, color: Color(hex: "#ff8844"), width: geo.size.width)
                    barSegment(value: j.miss ?? 0, total: total, color: Color(hex: "#ff4444"), width: geo.size.width)
                }
                .cornerRadius(3)
            }
            .frame(height: 6)

            HStack(spacing: 8) {
                judgmentLabel("P", value: j.perfect ?? 0, color: Color(hex: "#44ccff"))
                judgmentLabel("Gr", value: j.great ?? 0, color: Color(hex: "#44ff44"))
                judgmentLabel("Go", value: j.good ?? 0, color: Color(hex: "#ffcc44"))
                judgmentLabel("B", value: j.bad ?? 0, color: Color(hex: "#ff8844"))
                judgmentLabel("M", value: j.miss ?? 0, color: Color(hex: "#ff4444"))
                Spacer()
                if let pr = summary.perfectRate, pr > 0 {
                    Text("\(pr)% perfect")
                        .font(.system(size: 9))
                        .foregroundColor(Color(hex: "#44ccff").opacity(0.7))
                }
            }
        }
    }

    private func barSegment(value: Int, total: Int, color: Color, width: CGFloat) -> some View {
        let fraction = CGFloat(value) / CGFloat(total)
        return Rectangle()
            .fill(color)
            .frame(width: max(0, width * fraction))
    }

    private func judgmentLabel(_ label: String, value: Int, color: Color) -> some View {
        HStack(spacing: 2) {
            Text(label)
                .font(.system(size: 8, weight: .bold))
                .foregroundColor(color.opacity(0.7))
            Text("\(value)")
                .font(.system(size: 8))
                .foregroundColor(color.opacity(0.9))
        }
    }

    // MARK: - Top Plays

    private func topPlaysSection(byScore: [SessionSummarySong], byRating: [SessionSummarySong]) -> some View {
        VStack(spacing: 0) {
            Button {
                withAnimation { showTopPlays.toggle() }
            } label: {
                HStack {
                    Text("Top Plays")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                    Spacer()
                    Image(systemName: showTopPlays ? "chevron.up" : "chevron.down")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)
                }
                .padding(.vertical, 4)
            }

            if showTopPlays {
                VStack(alignment: .leading, spacing: 8) {
                    if !byScore.isEmpty {
                        Text("By Score")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(DojoTheme.textMuted)
                        ForEach(byScore) { song in
                            summarySongRow(song, showRating: false)
                        }
                    }
                    if !byRating.isEmpty {
                        Text("By Rating")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(DojoTheme.textMuted)
                            .padding(.top, 4)
                        ForEach(byRating) { song in
                            summarySongRow(song, showRating: true)
                        }
                    }
                }
            }
        }
    }

    private func summarySongRow(_ song: SessionSummarySong, showRating: Bool) -> some View {
        HStack(spacing: 8) {
            // Jacket
            if let urlStr = song.jacketUrl, !urlStr.isEmpty,
               let url = URL(string: urlStr.hasPrefix("http") ? urlStr : "\(APIService.shared.baseURL)\(urlStr)") {
                AsyncImage(url: url) { phase in
                    if case .success(let img) = phase {
                        img.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        Color(hex: "#2a2a4a")
                    }
                }
                .frame(width: 28, height: 28)
                .cornerRadius(4)
                .clipped()
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(song.songTitle ?? "Unknown")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    let letter = song.mode == "Single" ? "S" : song.mode == "Double" ? "D" : "C"
                    let color = song.mode == "Single" ? Color(hex: "#ff6688") : Color(hex: "#44cc88")
                    Text("\(letter)\(song.level ?? 0)")
                        .font(.system(size: 8, weight: .black))
                        .foregroundColor(.white)
                        .padding(.horizontal, 3)
                        .padding(.vertical, 1)
                        .background(color.opacity(0.8))
                        .cornerRadius(2)

                    if let wc = song.weeklyChallengeWeekKey, !wc.isEmpty {
                        Image(systemName: "trophy.fill")
                            .font(.system(size: 7))
                            .foregroundColor(DojoTheme.piuGold)
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 1) {
                if let score = song.score {
                    Text(formatScore(score))
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(DojoTheme.gradeColor(for: score))
                }
                if let grade = song.grade, !grade.isEmpty {
                    Text(grade)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(DojoTheme.gradeColor(for: song.score ?? 0))
                }
            }

            if showRating, let rating = song.rating, rating > 0 {
                Text(String(format: "%.1f", rating))
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(DojoTheme.piuGold.opacity(0.7))
                    .frame(width: 32, alignment: .trailing)
            }
        }
        .padding(.vertical, 3)
    }

    // MARK: - Helpers

    private func statCell(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.white)
            Text(label)
                .font(.system(size: 9))
                .foregroundColor(DojoTheme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(DojoTheme.piuDark.opacity(0.5))
        .cornerRadius(6)
    }

    private func formatScore(_ score: Int) -> String {
        let s = String(score)
        if s.count > 3 {
            let idx = s.index(s.endIndex, offsetBy: -3)
            return s[s.startIndex..<idx] + "," + s[idx...]
        }
        return s
    }

    private func formatNumber(_ n: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: n)) ?? "\(n)"
    }
}
