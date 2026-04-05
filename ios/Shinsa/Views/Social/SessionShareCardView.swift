import SwiftUI

/// Feed card for session share posts (/share command)
struct SessionShareCardView: View {
    let share: SessionShareMarker

    @State private var showAllRows = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack(spacing: 8) {
                Image(systemName: share.isHourOfPower ? "flame.fill" : "music.note.list")
                    .font(.system(size: 14))
                    .foregroundColor(share.isHourOfPower ? Color(hex: "#ff6644") : DojoTheme.piuAccent)

                VStack(alignment: .leading, spacing: 2) {
                    Text(share.isHourOfPower ? "Hour of Power" : "Session Share")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)

                    HStack(spacing: 8) {
                        if let date = share.sessionDateLabel, !date.isEmpty {
                            Text(date)
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                        if let time = share.sessionTimeRange, !time.isEmpty {
                            Text(time)
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }
                }

                Spacer()

                if let duration = share.sessionDurationLabel, !duration.isEmpty {
                    Text(duration)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(DojoTheme.piuGold)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(DojoTheme.piuGold.opacity(0.12))
                        .cornerRadius(6)
                }
            }

            // Machine name
            if let machine = share.sessionMachineName, !machine.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "arcade.stick")
                        .font(.system(size: 10))
                    Text(machine)
                        .font(.system(size: 11))
                }
                .foregroundColor(DojoTheme.textMuted)
            }

            // Stats grid
            statsGrid

            // Mode breakdown
            modeBreakdown

            // Judgment totals
            if let judgments = share.judgmentTotals {
                judgmentBar(judgments)
            }

            // Song rows
            if let rows = share.rows, !rows.isEmpty {
                songRowsSection(rows)
            }
        }
        .padding(14)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(share.isHourOfPower ? Color(hex: "#ff6644").opacity(0.3) : DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Stats Grid

    private var statsGrid: some View {
        HStack(spacing: 0) {
            statCell(value: "\(share.songCount ?? 0)", label: "Songs")
            statCell(value: "\(share.clearCount ?? 0)", label: "Clears")
            statCell(value: "\(share.clearRate ?? 0)%", label: "Clear Rate")
            statCell(value: formatScore(share.averageScore ?? 0), label: "Avg Score")
        }
    }

    // MARK: - Mode Breakdown

    private var modeBreakdown: some View {
        HStack(spacing: 12) {
            if let s = share.singleCount, s > 0 {
                HStack(spacing: 3) {
                    Text("S")
                        .font(.system(size: 9, weight: .black))
                        .foregroundColor(Color(hex: "#ff6688"))
                    Text("\(s)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(DojoTheme.textSecondary)
                }
            }
            if let d = share.doubleCount, d > 0 {
                HStack(spacing: 3) {
                    Text("D")
                        .font(.system(size: 9, weight: .black))
                        .foregroundColor(Color(hex: "#44cc88"))
                    Text("\(d)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(DojoTheme.textSecondary)
                }
            }

            Spacer()

            if let total = share.totalRatingPoints, total > 0 {
                HStack(spacing: 3) {
                    Text("Total RP:")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("\(total)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(DojoTheme.piuGold)
                }
            }

            if let avg = share.averageLevel, avg > 0 {
                HStack(spacing: 3) {
                    Text("Avg Lv:")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)
                    Text(String(format: "%.1f", avg))
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(DojoTheme.textSecondary)
                }
            }
        }
    }

    // MARK: - Judgment Bar

    private func judgmentBar(_ j: JudgmentTotals) -> some View {
        let total = max(1, (j.perfect ?? 0) + (j.great ?? 0) + (j.good ?? 0) + (j.bad ?? 0) + (j.miss ?? 0))

        return VStack(spacing: 4) {
            // Visual bar
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

            // Labels
            HStack(spacing: 8) {
                judgmentLabel("P", value: j.perfect ?? 0, color: Color(hex: "#44ccff"))
                judgmentLabel("Gr", value: j.great ?? 0, color: Color(hex: "#44ff44"))
                judgmentLabel("Go", value: j.good ?? 0, color: Color(hex: "#ffcc44"))
                judgmentLabel("B", value: j.bad ?? 0, color: Color(hex: "#ff8844"))
                judgmentLabel("M", value: j.miss ?? 0, color: Color(hex: "#ff4444"))
                Spacer()
                if let pr = share.perfectRate, pr > 0 {
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

    // MARK: - Song Rows

    private func songRowsSection(_ rows: [SessionShareRow]) -> some View {
        VStack(spacing: 0) {
            let displayRows = showAllRows ? rows : Array(rows.prefix(5))

            ForEach(displayRows) { row in
                songRow(row)
            }

            if rows.count > 5 {
                Button {
                    withAnimation { showAllRows.toggle() }
                } label: {
                    Text(showAllRows ? "Show Less" : "Show All \(rows.count) Songs")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(DojoTheme.piuAccent)
                        .padding(.vertical, 6)
                }
            }
        }
    }

    private func songRow(_ row: SessionShareRow) -> some View {
        HStack(spacing: 8) {
            // Jacket
            if let urlStr = row.jacketUrl, !urlStr.isEmpty,
               let url = URL(string: urlStr.hasPrefix("http") ? urlStr : "\(APIService.shared.baseURL)\(urlStr)") {
                AsyncImage(url: url) { phase in
                    if case .success(let img) = phase {
                        img.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        Color(hex: "#2a2a4a")
                    }
                }
                .frame(width: 32, height: 32)
                .cornerRadius(4)
                .clipped()
            }

            // Song info
            VStack(alignment: .leading, spacing: 1) {
                Text(row.songTitle ?? "Unknown")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    let letter = row.mode == "Single" ? "S" : row.mode == "Double" ? "D" : "C"
                    let color = row.mode == "Single" ? Color(hex: "#ff6688") : Color(hex: "#44cc88")
                    Text("\(letter)\(row.level ?? 0)")
                        .font(.system(size: 8, weight: .black))
                        .foregroundColor(.white)
                        .padding(.horizontal, 3)
                        .padding(.vertical, 1)
                        .background(color.opacity(0.8))
                        .cornerRadius(2)

                    if let wc = row.weeklyChallengeWeekKey, !wc.isEmpty {
                        Image(systemName: "trophy.fill")
                            .font(.system(size: 7))
                            .foregroundColor(DojoTheme.piuGold)
                    }
                }
            }

            Spacer()

            // Score & Grade
            VStack(alignment: .trailing, spacing: 1) {
                if let score = row.score {
                    Text(formatScore(score))
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(DojoTheme.gradeColor(for: score))
                }
                if let grade = row.grade, !grade.isEmpty {
                    Text(grade)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(DojoTheme.gradeColor(for: row.score ?? 0))
                }
            }

            // Rating points
            if let rp = row.ratingPoints, rp > 0 {
                Text("\(rp)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(DojoTheme.piuGold.opacity(0.7))
                    .frame(width: 28, alignment: .trailing)
            }
        }
        .padding(.vertical, 4)
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
}
