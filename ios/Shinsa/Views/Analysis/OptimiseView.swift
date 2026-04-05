import SwiftUI

struct OptimiseView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var analytics: SongAnalytics?
    @State private var pumbilityData: PumbilityData?
    @State private var isLoading = true

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if isLoading {
                ProgressView()
                    .tint(DojoTheme.piuAccent)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Pumbility summary
                        pumbilitySummaryCard

                        // Level breakdown
                        if let dist = analytics?.levelDistribution, !dist.isEmpty {
                            levelBreakdownCard(dist)
                        }

                        // Grade distribution
                        if let grades = analytics?.gradeDistribution, !grades.isEmpty {
                            gradeDistributionCard(grades)
                        }

                        // Training recommendations
                        recommendationsCard
                    }
                    .padding()
                }
                .refreshable { await loadData() }
            }
        }
        .navigationTitle("Optimise")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadData() }
    }

    // MARK: - Pumbility Summary

    private var pumbilitySummaryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("PUMBILITY SUMMARY")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            HStack(spacing: 20) {
                VStack(spacing: 4) {
                    Text("\(pumbilityData?.pumbilityValue ?? 0)")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(DojoTheme.piuGold)
                    Text("Pumbility")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                }

                VStack(spacing: 4) {
                    Text("\(analytics?.totalPlays ?? 0)")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(.white)
                    Text("Total Plays")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                }

                VStack(spacing: 4) {
                    Text("\(analytics?.uniqueCharts ?? 0)")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(DojoTheme.piuBlue)
                    Text("Unique Charts")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                }

                Spacer()
            }

            if let scores = pumbilityData?.scores, !scores.isEmpty {
                Divider().background(DojoTheme.piuBorder)

                Text("Top 50 Scores")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(DojoTheme.textSecondary)

                ForEach(Array(scores.prefix(5).enumerated()), id: \.offset) { index, score in
                    HStack(spacing: 8) {
                        Text("#\(index + 1)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)
                            .frame(width: 28, alignment: .leading)

                        let isSingle = score.mode == "Single"
                        Text("\(isSingle ? "S" : "D")\(score.level)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(isSingle ? Color.red.opacity(0.5) : Color.green.opacity(0.5))
                            .cornerRadius(4)

                        Text(score.songTitle)
                            .font(.system(size: 12))
                            .foregroundColor(.white)
                            .lineLimit(1)

                        Spacer()

                        Text("\(score.score)")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(DojoTheme.piuGold)
                    }
                }
            }
        }
        .padding(16)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Level Breakdown

    private func levelBreakdownCard(_ distribution: [String: Int]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("LEVEL BREAKDOWN")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            let sorted = distribution.sorted { (Int($0.key) ?? 0) < (Int($1.key) ?? 0) }
            let maxValue = sorted.map(\.value).max() ?? 1

            ForEach(sorted, id: \.key) { level, count in
                HStack(spacing: 8) {
                    Text("Lv\(level)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 36, alignment: .trailing)

                    GeometryReader { geo in
                        let width = geo.size.width * CGFloat(count) / CGFloat(maxValue)
                        RoundedRectangle(cornerRadius: 3)
                            .fill(barColor(for: Int(level) ?? 0))
                            .frame(width: max(width, 4), height: 16)
                    }
                    .frame(height: 16)

                    Text("\(count)")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                        .frame(width: 30, alignment: .trailing)
                }
            }
        }
        .padding(16)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Grade Distribution

    private func gradeDistributionCard(_ grades: [String: Int]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("GRADE DISTRIBUTION")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            let gradeOrder = ["SSS+", "SSS", "SS+", "SS", "S+", "S", "A+", "A", "B+", "B", "C+", "C", "D+", "D", "F"]
            let sorted = gradeOrder.compactMap { g in grades[g].map { (g, $0) } }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5), spacing: 8) {
                ForEach(sorted, id: \.0) { grade, count in
                    VStack(spacing: 4) {
                        Text(grade)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(gradeColor(grade))
                        Text("\(count)")
                            .font(.system(size: 11))
                            .foregroundColor(.white)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(DojoTheme.piuDark)
                    .cornerRadius(6)
                }
            }
        }
        .padding(16)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Recommendations

    private var recommendationsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("TRAINING RECOMMENDATIONS")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            if let dist = analytics?.levelDistribution {
                let sorted = dist.sorted { (Int($0.key) ?? 0) < (Int($1.key) ?? 0) }
                if let highest = sorted.last {
                    recommendationRow(
                        icon: "arrow.up.circle.fill",
                        color: DojoTheme.piuGreen,
                        title: "Push Your Limits",
                        detail: "You play level \(highest.key) most. Try level \(Int(highest.key).map { $0 + 1 } ?? 0) charts to improve."
                    )
                }
            }

            if let grades = analytics?.gradeDistribution {
                let totalPlays = grades.values.reduce(0, +)
                let sssCount = (grades["SSS+"] ?? 0) + (grades["SSS"] ?? 0)
                if totalPlays > 0 {
                    let pct = (sssCount * 100) / totalPlays
                    recommendationRow(
                        icon: "target",
                        color: DojoTheme.piuGold,
                        title: "Accuracy Focus",
                        detail: "SSS rate: \(pct)%. Target songs where you scored SS to push for SSS."
                    )
                }
            }

            recommendationRow(
                icon: "repeat",
                color: DojoTheme.piuBlue,
                title: "Consistency Practice",
                detail: "Replay your lower-scoring charts to build muscle memory."
            )
        }
        .padding(16)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    private func recommendationRow(icon: String, color: Color, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(color)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                Text(detail)
                    .font(.system(size: 12))
                    .foregroundColor(DojoTheme.textSecondary)
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Helpers

    private func barColor(for level: Int) -> Color {
        switch level {
        case 1...10: return DojoTheme.piuGreen
        case 11...18: return DojoTheme.piuBlue
        case 19...23: return DojoTheme.piuGold
        default: return DojoTheme.piuAccent
        }
    }

    private func gradeColor(_ grade: String) -> Color {
        switch grade {
        case "SSS+", "SSS": return DojoTheme.piuGold
        case "SS+", "SS": return DojoTheme.piuSilver
        case "S+", "S": return DojoTheme.piuBronze
        case "A+", "A": return DojoTheme.piuGreen
        default: return DojoTheme.textMuted
        }
    }

    private func loadData() async {
        isLoading = true
        guard let userId = auth.currentUser?.id else {
            isLoading = false
            return
        }
        async let a = APIService.shared.getSongAnalytics(userId)
        analytics = try? await a
        // Pumbility data from profile
        if let user = try? await APIService.shared.getUserProfile(userId) {
            pumbilityData = PumbilityData(pumbilityValue: user.pumbility, scores: nil)
        }
        isLoading = false
    }
}
