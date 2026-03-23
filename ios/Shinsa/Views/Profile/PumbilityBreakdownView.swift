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
                        levelBreakdownSection(data)
                        gradeDistributionSection(data)
                        recentScoresSection(data)
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

            Text("\(data.pumbility ?? 0)")
                .font(.system(size: 36, weight: .bold))
                .foregroundColor(DojoTheme.piuGold)

            if let scores = data.scores {
                Text("\(scores.count) qualifying scores")
                    .font(.system(size: 12))
                    .foregroundColor(DojoTheme.textMuted)
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

    // MARK: - Level Breakdown

    private func levelBreakdownSection(_ data: PumbilityData) -> some View {
        let scores = data.scores ?? []
        let levelGroups = Dictionary(grouping: scores) { $0.level }
        let sortedLevels = levelGroups.keys.sorted()
        let maxCount = levelGroups.values.map(\.count).max() ?? 1

        return VStack(alignment: .leading, spacing: 12) {
            Text("LEVEL BREAKDOWN")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            if sortedLevels.isEmpty {
                Text("No scores to show")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
            } else {
                ForEach(sortedLevels, id: \.self) { level in
                    let count = levelGroups[level]?.count ?? 0
                    let totalScore = levelGroups[level]?.reduce(0) { $0 + $1.score } ?? 0

                    HStack(spacing: 10) {
                        Text("Lv.\(level)")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 45, alignment: .leading)

                        GeometryReader { geo in
                            let width = geo.size.width * CGFloat(count) / CGFloat(max(maxCount, 1))
                            RoundedRectangle(cornerRadius: 4)
                                .fill(levelBarColor(level))
                                .frame(width: max(width, 4), height: 20)
                        }
                        .frame(height: 20)

                        Text("\(count)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)
                            .frame(width: 25, alignment: .trailing)

                        Text(formatScore(totalScore))
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.piuGold)
                            .frame(width: 55, alignment: .trailing)
                    }
                }
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Grade Distribution

    private func gradeDistributionSection(_ data: PumbilityData) -> some View {
        let scores = data.scores ?? []
        let gradeGroups = Dictionary(grouping: scores) { $0.grade ?? "?" }
        let gradeOrder = ["SSS+", "SSS", "SS+", "SS", "S+", "S", "A+", "A", "B", "C", "D", "F"]
        let sortedGrades = gradeOrder.filter { gradeGroups[$0] != nil }

        return VStack(alignment: .leading, spacing: 12) {
            Text("GRADE DISTRIBUTION")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            if sortedGrades.isEmpty {
                Text("No grades to show")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
            } else {
                let maxCount = gradeGroups.values.map(\.count).max() ?? 1

                ForEach(sortedGrades, id: \.self) { grade in
                    let count = gradeGroups[grade]?.count ?? 0

                    HStack(spacing: 10) {
                        Text(grade)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(gradeColor(grade))
                            .frame(width: 40, alignment: .leading)

                        GeometryReader { geo in
                            let width = geo.size.width * CGFloat(count) / CGFloat(max(maxCount, 1))
                            RoundedRectangle(cornerRadius: 4)
                                .fill(gradeColor(grade))
                                .frame(width: max(width, 4), height: 18)
                        }
                        .frame(height: 18)

                        Text("\(count)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)
                            .frame(width: 30, alignment: .trailing)
                    }
                }
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Recent Scores

    private func recentScoresSection(_ data: PumbilityData) -> some View {
        let scores = data.scores ?? []

        return VStack(alignment: .leading, spacing: 12) {
            Text("SCORES (\(scores.count))")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            ForEach(scores.prefix(50)) { score in
                HStack(spacing: 8) {
                    if let order = score.rankOrder {
                        Text("#\(order)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.piuGold)
                            .frame(width: 30)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(score.songTitle)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.white)
                            .lineLimit(1)

                        HStack(spacing: 4) {
                            Text(score.mode.uppercased())
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(score.mode == "S" ? DojoTheme.piuGold : DojoTheme.piuBlue)
                            Text("Lv.\(score.level)")
                                .font(.system(size: 10))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 2) {
                        Text(formatScore(score.score))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                        if let grade = score.grade {
                            Text(grade)
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(gradeColor(grade))
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

    private func levelBarColor(_ level: Int) -> Color {
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
