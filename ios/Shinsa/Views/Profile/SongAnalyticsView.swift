import SwiftUI

struct SongAnalyticsView: View {
    let userId: String

    @State private var analytics: SongAnalytics?
    @State private var isLoading = false
    @State private var selectedModeTab = "both"
    @State private var expandedCompetitive: String? // "single" or "double"

    private let gradeColors: [String: Color] = [
        "SSS+": Color(hex: "#7dd3fc"), "SSS": Color(hex: "#38bdf8"),
        "SS+": Color(hex: "#fde047"), "SS": Color(hex: "#facc15"),
        "S+": Color(hex: "#f59e0b"), "S": Color(hex: "#d97706"),
        "AAA+": Color(hex: "#cbd5e1"), "AAA": Color(hex: "#94a3b8"),
        "AA+": Color(hex: "#a78bfa"), "AA": Color(hex: "#8b5cf6"),
        "A+": Color(hex: "#34d399"), "A": Color(hex: "#10b981"),
        "B": Color(hex: "#9ca3af"),
    ]

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if isLoading && analytics == nil {
                ProgressView().tint(DojoTheme.piuAccent)
            } else if let data = analytics {
                ScrollView {
                    VStack(spacing: 16) {
                        competitiveLevelCards(data)
                        totalsSection(data)
                        modeTabBar
                        levelBreakdownSection(data)
                        pumbilityPreview(data)
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

    // MARK: - Competitive Level Cards

    private func competitiveLevelCards(_ data: SongAnalytics) -> some View {
        HStack(spacing: 12) {
            if let cl = data.competitiveLevels {
                competitiveCard(mode: "single", level: cl.single, color: Color(hex: "#d93d62"), prefix: "S")
                competitiveCard(mode: "double", level: cl.double, color: Color(hex: "#16b77f"), prefix: "D")
            } else {
                Text("No competitive level data")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private func competitiveCard(mode: String, level: CompetitiveLevel?, color: Color, prefix: String) -> some View {
        let isExpanded = expandedCompetitive == mode

        return VStack(spacing: 6) {
            if let lv = level {
                // Main display
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        expandedCompetitive = expandedCompetitive == mode ? nil : mode
                    }
                } label: {
                    VStack(spacing: 4) {
                        Text("\(prefix)\(lv.level ?? 0)")
                            .font(.system(size: 28, weight: .black))
                            .foregroundColor(color)

                        if let grade = lv.averageGrade {
                            Text(grade)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(gradeColors[grade] ?? .white)
                        }

                        if let score = lv.averageScore {
                            Text(score.formattedScore)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(DojoTheme.textSecondary)
                        }
                    }
                }
                .buttonStyle(.plain)

                // Expanded details
                if isExpanded {
                    VStack(alignment: .leading, spacing: 4) {
                        Divider().background(DojoTheme.piuBorder)

                        // Find level data from levels
                        let levelEntries = mode == "single" ? analytics?.levels?.single : analytics?.levels?.double
                        let entry = levelEntries?.first(where: { $0.level == lv.level })

                        if let entry = entry {
                            HStack {
                                Text("Passed")
                                    .font(.system(size: 10))
                                    .foregroundColor(DojoTheme.textMuted)
                                Spacer()
                                Text("\(entry.clearedCharts ?? 0)/\(entry.totalCharts ?? 0)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.white)
                            }
                        }

                        if let score = lv.averageScore {
                            HStack {
                                Text("Avg Score")
                                    .font(.system(size: 10))
                                    .foregroundColor(DojoTheme.textMuted)
                                Spacer()
                                Text(score.formattedScore)
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.white)
                            }
                        }

                        if let pct = lv.clearPercentage {
                            HStack {
                                Text("50%+ clear")
                                    .font(.system(size: 10))
                                    .foregroundColor(DojoTheme.textMuted)
                                Spacer()
                                Image(systemName: pct >= 50 ? "checkmark.circle.fill" : "xmark.circle.fill")
                                    .font(.system(size: 10))
                                    .foregroundColor(pct >= 50 ? DojoTheme.piuGreen : Color(hex: "#f87171"))
                            }
                        }

                        // S-or-better check
                        let gradeOk = isGradeSOrBetter(lv.averageGrade)
                        HStack {
                            Text("S+ avg grade")
                                .font(.system(size: 10))
                                .foregroundColor(DojoTheme.textMuted)
                            Spacer()
                            Image(systemName: gradeOk ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .font(.system(size: 10))
                                .foregroundColor(gradeOk ? DojoTheme.piuGreen : Color(hex: "#f87171"))
                        }
                    }
                    .padding(.top, 4)
                }
            } else {
                Text("--")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(DojoTheme.textMuted)
                Text(mode == "single" ? "Single" : "Double")
                    .font(.system(size: 11))
                    .foregroundColor(DojoTheme.textMuted)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(color.opacity(0.08))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(color.opacity(0.2), lineWidth: 1)
        )
    }

    private func isGradeSOrBetter(_ grade: String?) -> Bool {
        guard let g = grade else { return false }
        let sOrBetter = ["SSS+", "SSS", "SS+", "SS", "S+", "S"]
        return sOrBetter.contains(g)
    }

    // MARK: - Totals

    private func totalsSection(_ data: SongAnalytics) -> some View {
        let totals = data.totals

        return VStack(alignment: .leading, spacing: 10) {
            Text("TOTALS")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            HStack(spacing: 0) {
                totalColumn("Singles", totals: totals?.single, color: Color(hex: "#d93d62"))
                Divider().frame(height: 50).background(DojoTheme.piuBorder)
                totalColumn("Doubles", totals: totals?.double, color: Color(hex: "#16b77f"))
                Divider().frame(height: 50).background(DojoTheme.piuBorder)
                totalColumn("Both", totals: totals?.both, color: DojoTheme.piuBlue)
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    private func totalColumn(_ label: String, totals: ModeTotals?, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(color)

            Text("\(totals?.clearedCharts ?? 0) / \(totals?.totalCharts ?? 0)")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)

            if let pct = totals?.clearPercentage {
                Text(String(format: "%.1f%%", pct))
                    .font(.system(size: 11))
                    .foregroundColor(DojoTheme.textMuted)
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Mode Tab Bar

    private var modeTabBar: some View {
        HStack(spacing: 0) {
            modeTab("Both", key: "both")
            modeTab("Single", key: "single")
            modeTab("Double", key: "double")
        }
        .background(DojoTheme.piuCard)
        .cornerRadius(8)
    }

    private func modeTab(_ label: String, key: String) -> some View {
        Button {
            selectedModeTab = key
        } label: {
            Text(label)
                .font(.system(size: 12, weight: selectedModeTab == key ? .bold : .medium))
                .foregroundColor(selectedModeTab == key ? .white : DojoTheme.textMuted)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .background(selectedModeTab == key ? DojoTheme.piuAccent.opacity(0.3) : Color.clear)
                .cornerRadius(8)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Level Breakdown

    private func levelBreakdownSection(_ data: SongAnalytics) -> some View {
        let entries: [LevelEntry] = {
            switch selectedModeTab {
            case "single": return data.levels?.single ?? []
            case "double": return data.levels?.double ?? []
            default: return data.levels?.both ?? []
            }
        }()

        return VStack(alignment: .leading, spacing: 8) {
            Text("LEVEL BREAKDOWN")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            if entries.isEmpty {
                Text("No data for this mode")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .padding(.vertical, 12)
            } else {
                ForEach(entries) { entry in
                    levelRow(entry)
                }
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    private func levelRow(_ entry: LevelEntry) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 8) {
                Text("Lv.\(entry.level ?? 0)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 42, alignment: .leading)

                Text("\(entry.clearedCharts ?? 0)/\(entry.totalCharts ?? 0)")
                    .font(.system(size: 10))
                    .foregroundColor(DojoTheme.textMuted)
                    .frame(width: 40, alignment: .center)

                if let grade = entry.averageGrade {
                    Text(grade)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(gradeColors[grade] ?? .white)
                        .frame(width: 32, alignment: .center)
                }

                if let score = entry.averageScore {
                    Text(score.formattedScore)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(DojoTheme.textSecondary)
                        .frame(width: 60, alignment: .trailing)
                }

                Spacer()

                // Clear percentage bar
                GeometryReader { geo in
                    let pct = CGFloat(entry.clearPercentage ?? 0) / 100.0
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.white.opacity(0.05))
                        RoundedRectangle(cornerRadius: 3)
                            .fill(levelBarColor(entry.level ?? 0))
                            .frame(width: geo.size.width * pct)
                    }
                }
                .frame(width: 60, height: 12)

                Text(String(format: "%.0f%%", entry.clearPercentage ?? 0))
                    .font(.system(size: 9))
                    .foregroundColor(DojoTheme.textMuted)
                    .frame(width: 30, alignment: .trailing)
            }
        }
        .padding(.vertical, 3)
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

    // MARK: - Pumbility Breakdown Preview

    private func pumbilityPreview(_ data: SongAnalytics) -> some View {
        let entries = data.pumbilityBreakdown?.overallTop50 ?? []
        let top10 = Array(entries.prefix(10))

        return VStack(alignment: .leading, spacing: 10) {
            Text("PUMBILITY TOP 10")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuGold)

            if top10.isEmpty {
                Text("No pumbility data")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .padding(.vertical, 12)
            } else {
                ForEach(Array(top10.enumerated()), id: \.element.id) { idx, entry in
                    HStack(spacing: 10) {
                        // Rank
                        Text("#\(idx + 1)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(DojoTheme.piuGold.opacity(0.7))
                            .frame(width: 24, alignment: .center)

                        // Jacket
                        if let urlStr = entry.jacketUrl, let url = URL(string: urlStr) {
                            AsyncImage(url: url) { phase in
                                switch phase {
                                case .success(let img):
                                    img.resizable().scaledToFill()
                                default:
                                    RoundedRectangle(cornerRadius: 4).fill(DojoTheme.piuBorder)
                                }
                            }
                            .frame(width: 34, height: 34)
                            .cornerRadius(5)
                            .clipped()
                        } else {
                            RoundedRectangle(cornerRadius: 4).fill(DojoTheme.piuBorder)
                                .frame(width: 34, height: 34)
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.title ?? "Unknown")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white)
                                .lineLimit(1)

                            HStack(spacing: 4) {
                                // Mode badge
                                if let mode = entry.mode, let level = entry.level {
                                    let isDouble = mode.lowercased().hasPrefix("d") || mode.lowercased() == "double"
                                    Text("\(isDouble ? "D" : "S")\(level)")
                                        .font(.system(size: 8, weight: .black))
                                        .foregroundColor(.white)
                                        .padding(.horizontal, 3)
                                        .padding(.vertical, 1)
                                        .background(isDouble ? Color(hex: "#16b77f") : Color(hex: "#d93d62"))
                                        .cornerRadius(3)
                                }
                            }
                        }

                        Spacer()

                        VStack(alignment: .trailing, spacing: 2) {
                            if let grade = entry.grade {
                                Text(grade)
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(gradeColors[grade] ?? .white)
                            }
                            if let score = entry.score {
                                Text(score.formattedScore)
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundColor(DojoTheme.textSecondary)
                            }
                        }

                        if let rating = entry.rating {
                            Text(String(format: "%.0f", rating))
                                .font(.system(size: 11, weight: .bold, design: .monospaced))
                                .foregroundColor(DojoTheme.piuGold)
                                .frame(width: 32, alignment: .trailing)
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

    // MARK: - Load

    private func load() async {
        isLoading = true
        analytics = try? await APIService.shared.getSongAnalytics(userId)
        isLoading = false
    }
}
