import SwiftUI

struct PumbilityBreakdownView: View {
    let userId: String

    @State private var pumbilityData: PumbilityData?
    @State private var isLoading = false

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if isLoading && pumbilityData == nil {
                ProgressView().tint(DojoTheme.piuAccent)
            } else if let data = pumbilityData {
                ScrollView {
                    VStack(spacing: 16) {
                        totalCard(data)
                        summaryStatsGrid(data)
                        rankedSongsList(data)
                    }
                    .padding()
                }
                .refreshable { await load() }
            } else {
                Text("No pumbility data available")
                    .foregroundColor(DojoTheme.textMuted)
            }
        }
        .navigationTitle("Pumbility")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    // MARK: - Total Card

    private func totalCard(_ data: PumbilityData) -> some View {
        VStack(spacing: 8) {
            Text("TOTAL PUMBILITY")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)

            Text("\(data.pumbilityValue ?? 0)")
                .font(.system(size: 36, weight: .bold))
                .foregroundColor(DojoTheme.piuGold)

            if let count = data.scoreCount {
                Text("\(count) qualifying scores")
                    .font(.system(size: 12))
                    .foregroundColor(DojoTheme.textMuted)
            } else if let scores = data.scores {
                Text("\(scores.count) qualifying scores")
                    .font(.system(size: 12))
                    .foregroundColor(DojoTheme.textMuted)
            }

            if let ranking = data.ranking, ranking > 0 {
                Text("Rank #\(ranking)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuGold.opacity(0.3), lineWidth: 1)
        )
    }

    // MARK: - Summary Stats Grid (2x2)

    private func summaryStatsGrid(_ data: PumbilityData) -> some View {
        let avgScore: Int? = {
            guard let scores = data.scores, !scores.isEmpty else { return nil }
            return scores.reduce(0) { $0 + $1.score } / scores.count
        }()
        let avgLevel: Double? = {
            guard let scores = data.scores, !scores.isEmpty else { return nil }
            return Double(scores.reduce(0) { $0 + $1.level }) / Double(scores.count)
        }()

        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            // Avg Rating
            summaryCard(
                title: "AVG RATING",
                value: data.averageRating != nil ? String(format: "%.1f", data.averageRating!) : "--",
                subtitle: {
                    if let lvl = data.equivalentLevel, let grade = data.equivalentGrade {
                        return "Lv.\(lvl) \(grade)"
                    }
                    return nil
                }(),
                accentColor: DojoTheme.piuGold
            )

            // Min Entry
            summaryCard(
                title: "MIN ENTRY",
                value: data.minEntryRating != nil ? "\(data.minEntryRating!)" : "--",
                subtitle: {
                    if let details = data.minEntryDetails {
                        let song = details.songTitle ?? "?"
                        return song.count > 18 ? String(song.prefix(18)) + "..." : song
                    }
                    return nil
                }(),
                accentColor: DojoTheme.piuAccent
            )

            // Avg Score
            summaryCard(
                title: "AVG SCORE",
                value: avgScore != nil ? formatScore(avgScore!) : "--",
                subtitle: avgScore != nil ? gradeForScore(avgScore!) : nil,
                accentColor: DojoTheme.piuBlue
            )

            // Avg Level
            summaryCard(
                title: "AVG LEVEL",
                value: avgLevel != nil ? String(format: "%.1f", avgLevel!) : "--",
                subtitle: nil,
                accentColor: DojoTheme.piuGreen
            )
        }
    }

    private func summaryCard(title: String, value: String, subtitle: String?, accentColor: Color) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)

            Text(value)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(accentColor)

            if let sub = subtitle {
                Text(sub)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(DojoTheme.textMuted)
                    .lineLimit(1)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(DojoTheme.piuCard)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(accentColor.opacity(0.2), lineWidth: 1)
        )
    }

    // MARK: - Ranked Songs List

    private func rankedSongsList(_ data: PumbilityData) -> some View {
        let scores = data.scores ?? []

        return VStack(alignment: .leading, spacing: 10) {
            Text("RANKED SONGS (\(scores.count))")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            ForEach(Array(scores.enumerated()), id: \.element.id) { index, score in
                HStack(spacing: 8) {
                    // Rank number
                    Text("#\(score.rankOrder ?? (index + 1))")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(DojoTheme.piuGold)
                        .frame(width: 28, alignment: .center)

                    // Song jacket
                    jacketImage(score: score)
                        .frame(width: 36, height: 36)
                        .cornerRadius(4)

                    // Mode + Level badge and song title
                    VStack(alignment: .leading, spacing: 3) {
                        Text(score.songTitle)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.white)
                            .lineLimit(1)

                        HStack(spacing: 4) {
                            modeLevelBadge(mode: score.mode, level: score.level)

                            if let grade = score.grade {
                                Text(grade)
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(gradeColor(grade))
                            }
                        }
                    }

                    Spacer()

                    // Score + Rating
                    VStack(alignment: .trailing, spacing: 3) {
                        Text(formatScore(score.score))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)

                        if let rating = score.rating {
                            Text("\(rating) pts")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(DojoTheme.piuGold)
                        }
                    }
                }
                .padding(8)
                .background(Color.white.opacity(0.03))
                .cornerRadius(6)
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Jacket Image

    private func jacketImage(score: PumbilityScore) -> some View {
        Group {
            if let url = JacketService.shared.resolveJacketURL(title: score.songTitle, mode: score.mode, level: score.level, backgroundUrl: score.backgroundUrl) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFill()
                    default:
                        Rectangle().fill(DojoTheme.piuBorder)
                    }
                }
            } else {
                Rectangle().fill(DojoTheme.piuBorder)
                    .overlay(
                        Text(String(score.songTitle.prefix(1)))
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                    )
            }
        }
        .clipped()
    }

    // MARK: - Mode Level Badge

    private func modeLevelBadge(mode: String, level: Int) -> some View {
        let modeUpper = mode.uppercased()
        let prefix: String
        let color: Color
        if modeUpper.hasPrefix("S") || modeUpper == "SINGLE" {
            prefix = "S"
            color = DojoTheme.piuAccent
        } else if modeUpper.hasPrefix("D") || modeUpper == "DOUBLE" {
            prefix = "D"
            color = DojoTheme.piuGreen
        } else if modeUpper.hasPrefix("CO") || modeUpper == "CO-OP" {
            prefix = "Co"
            color = DojoTheme.piuBlue
        } else {
            prefix = modeUpper
            color = DojoTheme.textMuted
        }

        return Text("\(prefix)\(level)")
            .font(.system(size: 9, weight: .bold))
            .foregroundColor(.white)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(color.opacity(0.8))
            .cornerRadius(3)
    }

    // MARK: - Helpers

    private func load() async {
        isLoading = true
        pumbilityData = try? await APIService.shared.getPiugamePumbility(userId)
        isLoading = false
    }

    private func formatScore(_ score: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: score)) ?? "\(score)"
    }

    private func gradeForScore(_ score: Int) -> String {
        switch score {
        case 995000...: return "SSS+"
        case 990000...: return "SSS"
        case 980000...: return "SS+"
        case 960000...: return "SS"
        case 940000...: return "S+"
        case 920000...: return "S"
        case 900000...: return "A+"
        case 850000...: return "A"
        case 800000...: return "B"
        case 700000...: return "C"
        case 600000...: return "D"
        default: return "F"
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
