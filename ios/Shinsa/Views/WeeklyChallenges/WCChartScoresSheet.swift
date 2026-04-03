import SwiftUI

struct WCChartScoresSheet: View {
    @ObservedObject var vm: WeeklyChallengesViewModel
    let chartId: Int

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    if vm.isLoadingChartScores {
                        ProgressView()
                            .tint(DojoTheme.piuAccent)
                            .padding(.top, 40)
                    } else if let data = vm.chartScores {
                        // Chart header
                        chartHeader(data.chart)

                        // Scores list
                        if data.scores.isEmpty {
                            Text("No scores yet")
                                .font(.system(size: 13))
                                .foregroundColor(DojoTheme.textMuted)
                                .padding(.top, 32)
                        } else {
                            scoresTable(data.scores)
                        }
                    }
                }
                .padding(.bottom, 32)
            }
            .background(DojoTheme.piuBg.ignoresSafeArea())
            .navigationTitle("Chart Scores")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
        .task {
            await vm.loadChartScores(chartId: chartId)
        }
    }

    // MARK: - Chart Header

    private func chartHeader(_ chart: WCChartScoreInfo) -> some View {
        HStack(spacing: 12) {
            // Jacket
            if let urlStr = chart.jacketUrl,
               let url = URL(string: urlStr.hasPrefix("http") ? urlStr : "\(APIService.shared.baseURL)\(urlStr)") {
                AsyncImage(url: url) { phase in
                    if case .success(let img) = phase {
                        img.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        jacketPlaceholder(chart)
                    }
                }
                .frame(width: 64, height: 64)
                .cornerRadius(8)
                .clipped()
            } else {
                jacketPlaceholder(chart)
                    .frame(width: 64, height: 64)
                    .cornerRadius(8)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(chart.songTitle)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(2)

                if let artist = chart.artist, !artist.isEmpty {
                    Text(artist)
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textSecondary)
                }

                modeBadge(mode: chart.mode, level: chart.level)
            }

            Spacer()
        }
        .padding(16)
        .background(DojoTheme.piuDark)
    }

    // MARK: - Scores Table

    private func scoresTable(_ scores: [WCChartScore]) -> some View {
        VStack(spacing: 0) {
            // Header
            HStack(spacing: 0) {
                Text("#")
                    .frame(width: 30, alignment: .center)
                Text("Player")
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Score")
                    .frame(width: 80, alignment: .trailing)
                Text("Grade")
                    .frame(width: 50, alignment: .trailing)
            }
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(DojoTheme.textMuted)
            .padding(.vertical, 6)
            .padding(.horizontal, 12)

            Divider().background(DojoTheme.piuBorder)

            ForEach(scores) { score in
                scoreRow(score)
            }
        }
        .padding(.top, 8)
    }

    private func scoreRow(_ score: WCChartScore) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                // Rank
                Group {
                    if score.rank <= 3 {
                        Text(DojoTheme.medalEmoji(for: score.rank))
                            .font(.system(size: 14))
                    } else {
                        Text("\(score.rank)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(DojoTheme.textSecondary)
                    }
                }
                .frame(width: 30, alignment: .center)

                // Player
                HStack(spacing: 8) {
                    AvatarView(score.avatar, name: score.username, size: 28)

                    VStack(alignment: .leading, spacing: 1) {
                        Text(score.username)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.white)
                            .lineLimit(1)

                        // Judgments
                        if let p = score.perfect {
                            HStack(spacing: 4) {
                                judgmentLabel("P", value: p, color: Color(hex: "#44ccff"))
                                if let g = score.great { judgmentLabel("Gr", value: g, color: Color(hex: "#44ff44")) }
                                if let go = score.good { judgmentLabel("Go", value: go, color: Color(hex: "#ffcc44")) }
                                if let b = score.bad { judgmentLabel("B", value: b, color: Color(hex: "#ff8844")) }
                                if let m = score.miss { judgmentLabel("M", value: m, color: Color(hex: "#ff4444")) }
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                // Score
                Text(formatScore(score.score))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.gradeColor(for: score.score))
                    .frame(width: 80, alignment: .trailing)

                // Grade
                Text(score.grade ?? DojoTheme.gradeLabel(for: score.score))
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(DojoTheme.gradeColor(for: score.score))
                    .frame(width: 50, alignment: .trailing)
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 12)

            // Replay indicator
            if score.replayEmbedUrl != nil || score.replayVideoId != nil {
                HStack(spacing: 4) {
                    Spacer()
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 10))
                    Text("Replay")
                        .font(.system(size: 9))
                }
                .foregroundColor(DojoTheme.piuBlue.opacity(0.7))
                .padding(.trailing, 12)
                .padding(.bottom, 2)
            }
        }
    }

    private func judgmentLabel(_ label: String, value: Int, color: Color) -> some View {
        HStack(spacing: 1) {
            Text(label)
                .font(.system(size: 7, weight: .bold))
                .foregroundColor(color.opacity(0.6))
            Text("\(value)")
                .font(.system(size: 7))
                .foregroundColor(color.opacity(0.8))
        }
    }

    // MARK: - Helpers

    private func modeBadge(mode: String, level: Int) -> some View {
        let letter = mode == "Single" ? "S" : mode == "Double" ? "D" : "C"
        let color = mode == "Single" ? Color(hex: "#ff6688") : Color(hex: "#44cc88")

        return Text("\(letter)\(level)")
            .font(.system(size: 11, weight: .black))
            .foregroundColor(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.85))
            .cornerRadius(4)
    }

    private func jacketPlaceholder(_ chart: WCChartScoreInfo) -> some View {
        ZStack {
            let color = chart.mode == "Single" ? Color(hex: "#ff6688") : Color(hex: "#44cc88")
            color.opacity(0.2)
            Text(String(chart.songTitle.prefix(2)).uppercased())
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.white.opacity(0.4))
        }
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
