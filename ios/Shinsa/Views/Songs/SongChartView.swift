import SwiftUI

struct SongChartView: View {
    let chartId: Int
    @State private var response: ChartDetailResponse?
    @State private var isLoading = true

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if isLoading {
                ProgressView()
                    .tint(DojoTheme.piuAccent)
            } else if let response {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if let chart = response.chart {
                            headerSection(chart)
                        }

                        if let best = response.userSummary?.best {
                            personalBestSection(best)
                            judgmentSection(best)
                        }

                        if let progression = response.progression, !progression.isEmpty {
                            progressionSection(progression)
                        }

                        if let history = response.history, !history.isEmpty {
                            historySection(history)
                        }

                        if let friends = response.friendRecords, !friends.isEmpty {
                            friendRecordsSection(friends)
                        }
                    }
                    .padding()
                }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 32))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("Chart not found")
                        .foregroundColor(DojoTheme.textMuted)
                }
            }
        }
        .navigationTitle("Chart Detail")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadChart() }
    }

    // MARK: - Header Section

    private func headerSection(_ chart: ChartInfo) -> some View {
        ZStack(alignment: .bottomLeading) {
            // Background jacket with overlay
            Group {
                if let url = chart.jacketUrl, !url.isEmpty, let imgURL = fullURL(url) {
                    AsyncImage(url: imgURL) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(height: 200)
                                .clipped()
                        default:
                            headerPlaceholder
                        }
                    }
                } else {
                    headerPlaceholder
                }
            }
            .overlay(
                LinearGradient(
                    colors: [.clear, DojoTheme.piuBg.opacity(0.7), DojoTheme.piuBg],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )

            // Content overlay
            VStack(alignment: .leading, spacing: 8) {
                Text(chart.title ?? "Unknown")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.white)

                Text(chart.artist ?? "Unknown Artist")
                    .font(.system(size: 14))
                    .foregroundColor(DojoTheme.textSecondary)

                HStack(spacing: 10) {
                    // Mode/Level badge
                    modeLevelBadge(mode: chart.mode, level: chart.level)

                    if let bpm = chart.bpm {
                        HStack(spacing: 4) {
                            Image(systemName: "metronome")
                                .font(.system(size: 11))
                            Text("\(bpm) BPM")
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundColor(DojoTheme.textSecondary)
                    }
                }

                // Skills tags
                if let skills = chart.skills, !skills.isEmpty {
                    FlowLayout(spacing: 6) {
                        ForEach(skills) { skill in
                            Text(skill.name ?? "")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(Color(hex: "#34d399")) // emerald
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Color(hex: "#34d399").opacity(0.15))
                                .cornerRadius(6)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 6)
                                        .stroke(Color(hex: "#34d399").opacity(0.3), lineWidth: 1)
                                )
                        }
                    }
                }
            }
            .padding(16)
        }
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    private var headerPlaceholder: some View {
        LinearGradient(
            colors: [DojoTheme.piuAccent.opacity(0.3), DojoTheme.piuCard],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .frame(height: 200)
    }

    private func modeLevelBadge(mode: String?, level: Int?) -> some View {
        let isSingle = mode == "Single"
        let isDouble = mode == "Double"
        let prefix = isSingle ? "S" : (isDouble ? "D" : "CO")
        let bgColor: Color = isSingle ? Color(hex: "#dc2626") : (isDouble ? Color(hex: "#16a34a") : Color(hex: "#7c3aed"))

        return Text("\(prefix)\(level ?? 0)")
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(bgColor)
            .cornerRadius(8)
    }

    // MARK: - Personal Best Section

    private func personalBestSection(_ best: ChartBestScore) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("PERSONAL BEST", icon: "trophy.fill", color: DojoTheme.piuGold)

            HStack(spacing: 20) {
                // Score
                VStack(spacing: 4) {
                    if let score = best.score, score > 0 {
                        Text(formatScore(score))
                            .font(.system(size: 28, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                    } else {
                        Text("STAGE BREAK")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(Color(hex: "#ef4444"))
                    }
                    Text("Score")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)
                }

                // Grade
                if let grade = best.grade {
                    VStack(spacing: 4) {
                        Text(grade)
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(gradeColor(grade))
                        Text("Grade")
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }

                // Plate
                if let plate = best.plate, !plate.isEmpty {
                    VStack(spacing: 4) {
                        Text(plate)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(DojoTheme.piuGold)
                        Text("Plate")
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }

                Spacer()
            }

            // Date played
            if let date = best.datePlayed {
                HStack(spacing: 4) {
                    Image(systemName: "calendar")
                        .font(.system(size: 11))
                    Text(formatDate(date))
                        .font(.system(size: 12))
                }
                .foregroundColor(DojoTheme.textMuted)
            }

            // Max combo
            if let combo = best.maxCombo {
                HStack(spacing: 4) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "#f59e0b"))
                    Text("Max Combo: \(combo)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(DojoTheme.textSecondary)
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

    // MARK: - Judgment Breakdown

    private func judgmentSection(_ best: ChartBestScore) -> some View {
        let judgments: [(String, Int?, Color)] = [
            ("PERFECT", best.perfect, Color(hex: "#38bdf8")),
            ("GREAT", best.great, Color(hex: "#4ade80")),
            ("GOOD", best.good, Color(hex: "#facc15")),
            ("BAD", best.bad, Color(hex: "#fb923c")),
            ("MISS", best.miss, Color(hex: "#f87171")),
        ]

        let total = judgments.compactMap(\.1).reduce(0, +)

        return VStack(alignment: .leading, spacing: 12) {
            sectionHeader("JUDGMENT BREAKDOWN", icon: "chart.bar.fill", color: DojoTheme.piuBlue)

            ForEach(judgments, id: \.0) { label, count, color in
                if let count {
                    HStack(spacing: 10) {
                        Text(label)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(color)
                            .frame(width: 70, alignment: .leading)

                        GeometryReader { geo in
                            let pct = total > 0 ? CGFloat(count) / CGFloat(total) : 0
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(DojoTheme.piuBorder.opacity(0.3))
                                    .frame(height: 8)
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(color)
                                    .frame(width: geo.size.width * pct, height: 8)
                            }
                        }
                        .frame(height: 8)

                        Text("\(count)")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                            .frame(width: 50, alignment: .trailing)
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

    // MARK: - Score Progression

    private func progressionSection(_ progression: [ChartProgression]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("SCORE PROGRESSION", icon: "chart.line.uptrend.xyaxis", color: DojoTheme.piuGreen)

            let maxScore = progression.compactMap(\.score).max() ?? 1
            let minScore = progression.compactMap(\.score).min() ?? 0
            let range = max(maxScore - minScore, 1)

            // Simple bar chart
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .bottom, spacing: 4) {
                    ForEach(Array(progression.enumerated()), id: \.offset) { index, entry in
                        VStack(spacing: 2) {
                            if let score = entry.score {
                                let normalized = CGFloat(score - minScore) / CGFloat(range)
                                let height = max(normalized * 80, 4)

                                RoundedRectangle(cornerRadius: 3)
                                    .fill(entry.isPass == true ? DojoTheme.piuGreen : Color(hex: "#ef4444"))
                                    .frame(width: 20, height: height)

                                Text(compactScore(score))
                                    .font(.system(size: 8, design: .monospaced))
                                    .foregroundColor(DojoTheme.textMuted)
                                    .rotationEffect(.degrees(-45))
                                    .frame(width: 20, height: 20)
                            }
                        }
                    }
                }
                .frame(minHeight: 120)
                .padding(.horizontal, 4)
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

    // MARK: - Play History

    private func historySection(_ history: [ChartHistoryEntry]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("PLAY HISTORY", icon: "clock.fill", color: DojoTheme.piuAccent)

            ForEach(history.prefix(20)) { entry in
                HStack(spacing: 12) {
                    // Score
                    VStack(alignment: .leading, spacing: 2) {
                        if let score = entry.score {
                            Text(formatScore(score))
                                .font(.system(size: 14, weight: .bold, design: .monospaced))
                                .foregroundColor(.white)
                        }
                        if let date = entry.datePlayed {
                            Text(formatDate(date))
                                .font(.system(size: 10))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }

                    Spacer()

                    // Grade
                    if let grade = entry.grade {
                        Text(grade)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(gradeColor(grade))
                    }

                    // Plate
                    if let plate = entry.plate, !plate.isEmpty {
                        Text(plate)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(DojoTheme.piuGold)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(DojoTheme.piuGold.opacity(0.15))
                            .cornerRadius(4)
                    }
                }
                .padding(.vertical, 6)
                .padding(.horizontal, 10)
                .background(DojoTheme.piuBg.opacity(0.5))
                .cornerRadius(8)
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

    // MARK: - Friend Records

    private func friendRecordsSection(_ friends: [ChartFriendRecord]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("FRIEND RECORDS", icon: "person.2.fill", color: DojoTheme.piuBlue)

            ForEach(friends) { record in
                HStack(spacing: 12) {
                    // Avatar
                    if let avatarUrl = record.user?.avatarUrl, !avatarUrl.isEmpty, let url = fullURL(avatarUrl) {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let img):
                                img.resizable().aspectRatio(contentMode: .fill)
                                    .frame(width: 32, height: 32)
                                    .clipShape(Circle())
                            default:
                                avatarPlaceholder(record.user?.username ?? "?")
                            }
                        }
                    } else {
                        avatarPlaceholder(record.user?.username ?? "?")
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(record.user?.username ?? "Unknown")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.white)

                        if let date = record.best?.datePlayed {
                            Text(formatDate(date))
                                .font(.system(size: 10))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }

                    Spacer()

                    if let score = record.best?.score {
                        Text(formatScore(score))
                            .font(.system(size: 13, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                    }

                    if let grade = record.best?.grade {
                        Text(grade)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(gradeColor(grade))
                    }
                }
                .padding(.vertical, 6)
                .padding(.horizontal, 10)
                .background(DojoTheme.piuBg.opacity(0.5))
                .cornerRadius(8)
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

    // MARK: - Helpers

    private func sectionHeader(_ title: String, icon: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundColor(color)
            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(color)
        }
    }

    private func avatarPlaceholder(_ name: String) -> some View {
        ZStack {
            Circle().fill(DojoTheme.piuBorder)
            Text(String(name.prefix(1)).uppercased())
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)
        }
        .frame(width: 32, height: 32)
    }

    private func gradeColor(_ grade: String) -> Color {
        switch grade {
        case "SSS+", "SSS": return Color(hex: "#7dd3fc") // sky
        case "SS+", "SS": return DojoTheme.piuGold
        case "S+", "S": return Color(hex: "#fbbf24") // amber
        case "AAA+", "AAA": return DojoTheme.piuSilver
        case "AA+", "AA": return DojoTheme.piuBronze
        default: return .white.opacity(0.7)
        }
    }

    private func formatScore(_ score: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: score)) ?? "\(score)"
    }

    private func compactScore(_ score: Int) -> String {
        if score >= 1_000_000 {
            return String(format: "%.1fM", Double(score) / 1_000_000)
        } else if score >= 1_000 {
            return String(format: "%.0fK", Double(score) / 1_000)
        }
        return "\(score)"
    }

    private func formatDate(_ dateStr: String) -> String {
        // Try ISO 8601 first
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoFormatter.date(from: dateStr) {
            let display = DateFormatter()
            display.dateStyle = .medium
            return display.string(from: date)
        }
        // Try without fractional seconds
        isoFormatter.formatOptions = [.withInternetDateTime]
        if let date = isoFormatter.date(from: dateStr) {
            let display = DateFormatter()
            display.dateStyle = .medium
            return display.string(from: date)
        }
        // Try simple date format
        let simple = DateFormatter()
        simple.dateFormat = "yyyy-MM-dd"
        if let date = simple.date(from: String(dateStr.prefix(10))) {
            let display = DateFormatter()
            display.dateStyle = .medium
            return display.string(from: date)
        }
        return dateStr
    }

    private func fullURL(_ path: String) -> URL? {
        if path.hasPrefix("http") { return URL(string: path) }
        let base = APIService.shared.baseURL
        let p = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: "\(base)\(p)")
    }

    private func loadChart() async {
        isLoading = true
        response = try? await APIService.shared.getChartDetail(chartId)
        isLoading = false
    }
}

// MARK: - Flow Layout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = layout(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func layout(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            totalHeight = y + rowHeight
        }

        return (CGSize(width: maxWidth, height: totalHeight), positions)
    }
}
