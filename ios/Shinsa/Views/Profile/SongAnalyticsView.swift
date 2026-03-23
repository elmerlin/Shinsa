import SwiftUI

struct SongAnalyticsView: View {
    let userId: String

    @State private var analytics: SongAnalytics?
    @State private var isLoading = false

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if isLoading && analytics == nil {
                ProgressView().tint(DojoTheme.piuAccent)
            } else if let data = analytics {
                ScrollView {
                    VStack(spacing: 16) {
                        overviewCard(data)
                        levelDistributionSection(data)
                        gradeDistributionSection(data)
                        recentScoresSection(data)
                    }
                    .padding()
                }
                .refreshable { await load() }
            } else {
                Text("No analytics data available")
                    .foregroundColor(DojoTheme.textMuted)
            }
        }
        .navigationTitle("Song Analytics")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    // MARK: - Overview

    private func overviewCard(_ data: SongAnalytics) -> some View {
        HStack(spacing: 0) {
            statBlock("\(data.totalPlays ?? 0)", label: "Total Plays", color: DojoTheme.piuAccent)
            Divider().frame(height: 40).background(DojoTheme.piuBorder)
            statBlock("\(data.uniqueCharts ?? 0)", label: "Unique Charts", color: DojoTheme.piuBlue)
        }
        .padding(.vertical, 16)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    private func statBlock(_ value: String, label: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(color)
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(DojoTheme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Level Distribution

    private func levelDistributionSection(_ data: SongAnalytics) -> some View {
        let dist = data.levelDistribution ?? [:]
        let sortedKeys = dist.keys.compactMap { Int($0) }.sorted()
        let maxVal = dist.values.max() ?? 1

        return VStack(alignment: .leading, spacing: 12) {
            Text("LEVEL DISTRIBUTION")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            if sortedKeys.isEmpty {
                Text("No data")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
            } else {
                ForEach(sortedKeys, id: \.self) { level in
                    let count = dist[String(level)] ?? 0

                    HStack(spacing: 10) {
                        Text("Lv.\(level)")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 45, alignment: .leading)

                        GeometryReader { geo in
                            let width = geo.size.width * CGFloat(count) / CGFloat(max(maxVal, 1))
                            RoundedRectangle(cornerRadius: 4)
                                .fill(levelColor(level))
                                .frame(width: max(width, 4), height: 18)
                        }
                        .frame(height: 18)

                        Text("\(count)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)
                            .frame(width: 35, alignment: .trailing)
                    }
                }
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Grade Distribution

    private func gradeDistributionSection(_ data: SongAnalytics) -> some View {
        let dist = data.gradeDistribution ?? [:]
        let gradeOrder = ["SSS+", "SSS", "SS+", "SS", "S+", "S", "A+", "A", "B", "C", "D", "F"]
        let sortedGrades = gradeOrder.filter { dist[$0] != nil }
        let total = max(dist.values.reduce(0, +), 1)

        return VStack(alignment: .leading, spacing: 12) {
            Text("GRADE DISTRIBUTION")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            if sortedGrades.isEmpty {
                Text("No grades yet")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
            } else {
                // Pie-chart-like horizontal bars
                ForEach(sortedGrades, id: \.self) { grade in
                    let count = dist[grade] ?? 0
                    let pct = Double(count) / Double(total) * 100

                    HStack(spacing: 10) {
                        Text(grade)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(gradeColor(grade))
                            .frame(width: 40, alignment: .leading)

                        GeometryReader { geo in
                            let width = geo.size.width * CGFloat(count) / CGFloat(total)
                            RoundedRectangle(cornerRadius: 4)
                                .fill(gradeColor(grade))
                                .frame(width: max(width, 4), height: 18)
                        }
                        .frame(height: 18)

                        Text("\(count)")
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                            .frame(width: 30, alignment: .trailing)

                        Text(String(format: "%.0f%%", pct))
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                            .frame(width: 35, alignment: .trailing)
                    }
                }
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Recent Scores

    private func recentScoresSection(_ data: SongAnalytics) -> some View {
        let scores = data.recentScores ?? []

        return VStack(alignment: .leading, spacing: 12) {
            Text("RECENT SCORES")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            if scores.isEmpty {
                Text("No recent scores")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .padding(.vertical, 12)
            } else {
                ForEach(scores.prefix(30)) { score in
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(score.title ?? "Unknown")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.white)
                                .lineLimit(1)

                            HStack(spacing: 4) {
                                Text((score.mode ?? "").uppercased())
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundColor(score.mode == "S" ? DojoTheme.piuGold : DojoTheme.piuBlue)
                                Text("Lv.\(score.level ?? 0)")
                                    .font(.system(size: 10))
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                        }

                        Spacer()

                        VStack(alignment: .trailing, spacing: 2) {
                            if let s = score.score {
                                Text(formatScore(s))
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(.white)
                            }
                            if let grade = score.grade {
                                Text(grade)
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(gradeColor(grade))
                            }
                        }

                        if let date = score.datePlayed {
                            Text(String(date.prefix(10)))
                                .font(.system(size: 9))
                                .foregroundColor(DojoTheme.textMuted)
                                .frame(width: 60, alignment: .trailing)
                        }
                    }
                    .padding(8)
                    .background(Color.white.opacity(0.03))
                    .cornerRadius(6)
                }
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Helpers

    private func load() async {
        isLoading = true
        analytics = try? await APIService.shared.getSongAnalytics(userId)
        isLoading = false
    }

    private func formatScore(_ score: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: score)) ?? "\(score)"
    }

    private func levelColor(_ level: Int) -> Color {
        switch level {
        case 1...10: return DojoTheme.piuGreen
        case 11...15: return DojoTheme.piuBlue
        case 16...20: return DojoTheme.piuGold
        case 21...25: return DojoTheme.piuAccent
        default: return Color.purple
        }
    }

    private func gradeColor(_ grade: String) -> Color {
        switch grade {
        case "SSS+", "SSS": return DojoTheme.piuGold
        case "SS+", "SS": return Color(hex: "#c0c0c0")
        case "S+", "S": return DojoTheme.piuGreen
        case "A+", "A": return DojoTheme.piuBlue
        default: return DojoTheme.textMuted
        }
    }
}
