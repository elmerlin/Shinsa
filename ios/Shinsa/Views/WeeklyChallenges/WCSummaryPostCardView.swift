import SwiftUI

/// Feed card for weekly challenge summary posts (5-page paginated)
struct WCSummaryPostCardView: View {
    let summary: WCSummaryMarker
    let text: String

    @State private var currentPage = 0
    private let totalPages = 5

    var body: some View {
        VStack(spacing: 0) {
            // Card content
            TabView(selection: $currentPage) {
                heroPage.tag(0)
                podiumsPage.tag(1)
                superlativesPage.tag(2)
                replaysPage.tag(3)
                nextWeekPage.tag(4)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: 360)

            // Page indicator
            HStack(spacing: 6) {
                ForEach(0..<totalPages, id: \.self) { idx in
                    Circle()
                        .fill(idx == currentPage ? DojoTheme.piuGold : Color.white.opacity(0.2))
                        .frame(width: 6, height: 6)
                }
            }
            .padding(.vertical, 8)
        }
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuGold.opacity(0.2), lineWidth: 1)
        )
    }

    // MARK: - Page 1: Hero

    private var heroPage: some View {
        VStack(spacing: 12) {
            Text("🏆")
                .font(.system(size: 36))

            Text("Weekly Challenge Recap")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.white)

            if let label = summary.weekLabel {
                Text(label)
                    .font(.system(size: 14))
                    .foregroundColor(DojoTheme.piuGold)
            }

            // Stats row
            HStack(spacing: 24) {
                statBubble(value: "\(summary.participantCount ?? 0)", label: "Players")
                statBubble(value: "\(summary.totalClears ?? 0)", label: "Clears")
                statBubble(value: "\(summary.chartCount ?? 0)", label: "Charts")
            }
            .padding(.top, 8)

            // Top Overall Podium
            if let podium = summary.topOverallPodium, !podium.isEmpty {
                VStack(spacing: 4) {
                    Text("TOP OVERALL")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(DojoTheme.textMuted)
                        .tracking(1)

                    ForEach(podium.prefix(3)) { entry in
                        miniPodiumRow(entry)
                    }
                }
                .padding(.top, 8)
            }

            Spacer()
        }
        .padding(16)
    }

    // MARK: - Page 2: Podiums

    private var podiumsPage: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text("PODIUMS")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.textMuted)
                    .tracking(1.5)

                if let awards = summary.awards {
                    podiumSection("Overall", entries: awards.overall)
                    podiumSection("Singles", entries: awards.singles)
                    podiumSection("Doubles", entries: awards.doubles)
                    podiumSection("Advanced", entries: awards.advanced)
                    podiumSection("Intermediate", entries: awards.intermediate)
                }
            }
            .padding(16)
        }
    }

    // MARK: - Page 3: Superlatives

    private var superlativesPage: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text("AWARDS")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.textMuted)
                    .tracking(1.5)

                if let sups = summary.superlatives {
                    superlativeTile("Most SSS", icon: "star.circle.fill", entries: sups.mostSss, unit: " SSS")
                    superlativeTile("Highest Clear %", icon: "percent", entries: sups.highestClearPercentage, unit: "%")
                    superlativeTile("Highest Clear Rating", icon: "chart.line.uptrend.xyaxis", entries: sups.highestClearRating, unit: " RP")
                    superlativeTile("Biggest Improvements", icon: "arrow.up.right", entries: sups.biggestImprovements, unit: " pts")
                }
            }
            .padding(16)
        }
    }

    // MARK: - Page 4: Replays

    private var replaysPage: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text("REPLAY HIGHLIGHTS")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.textMuted)
                    .tracking(1.5)

                if let replays = summary.replayHighlights, !replays.isEmpty {
                    ForEach(replays) { replay in
                        replayRow(replay)
                    }
                } else {
                    Text("No replay highlights this week")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                        .padding(.top, 16)
                }
            }
            .padding(16)
        }
    }

    // MARK: - Page 5: Next Week

    private var nextWeekPage: some View {
        VStack(spacing: 12) {
            if let next = summary.nextWeek {
                Text("NEXT WEEK")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.textMuted)
                    .tracking(1.5)

                if let label = next.weekLabel {
                    Text(label)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(DojoTheme.piuGold)
                }

                // Preview charts grid
                if let charts = next.previewCharts, !charts.isEmpty {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 80))], spacing: 8) {
                        ForEach(charts) { chart in
                            VStack(spacing: 4) {
                                if let urlStr = chart.jacketUrl,
                                   let url = URL(string: urlStr.hasPrefix("http") ? urlStr : "\(APIService.shared.baseURL)\(urlStr)") {
                                    AsyncImage(url: url) { phase in
                                        if case .success(let img) = phase {
                                            img.resizable().aspectRatio(contentMode: .fill)
                                        } else {
                                            Color(hex: "#2a2a4a")
                                        }
                                    }
                                    .frame(width: 60, height: 60)
                                    .cornerRadius(6)
                                    .clipped()
                                }

                                let letter = chart.mode == "Single" ? "S" : "D"
                                Text("\(letter)\(chart.level ?? 0)")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundColor(DojoTheme.textSecondary)
                            }
                        }
                    }
                }

                Spacer()

                NavigationLink(value: "weekly-challenges") {
                    Text("Jump In →")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 10)
                        .background(DojoTheme.piuAccent)
                        .cornerRadius(20)
                }
            } else {
                Text("Stay tuned for next week!")
                    .font(.system(size: 14))
                    .foregroundColor(DojoTheme.textSecondary)
            }
        }
        .padding(16)
    }

    // MARK: - Components

    private func statBubble(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.white)
            Text(label)
                .font(.system(size: 10))
                .foregroundColor(DojoTheme.textMuted)
        }
    }

    private func miniPodiumRow(_ entry: WCMarkerPodiumEntry) -> some View {
        HStack(spacing: 8) {
            Text(DojoTheme.medalEmoji(for: entry.rank ?? 0))
                .font(.system(size: 14))
            AvatarView(entry.avatar, name: entry.username ?? "?", size: 22)
            Text(entry.username ?? "?")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.white)
                .lineLimit(1)
            Spacer()
            if let pts = entry.points {
                Text("\(pts) pts")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(DojoTheme.piuGold)
            }
        }
    }

    @ViewBuilder
    private func podiumSection(_ title: String, entries: [WCMarkerPodiumEntry]?) -> some View {
        if let entries = entries, !entries.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(DojoTheme.textSecondary)

                ForEach(entries.prefix(3)) { entry in
                    miniPodiumRow(entry)
                }
            }
            .padding(10)
            .background(DojoTheme.piuDark)
            .cornerRadius(8)
        }
    }

    private func superlativeTile(_ title: String, icon: String, entries: [WCMarkerSuperlativeEntry]?, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 11))
                    .foregroundColor(DojoTheme.piuGold)
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
            }

            if let entries = entries, !entries.isEmpty {
                ForEach(entries.prefix(3)) { entry in
                    HStack(spacing: 6) {
                        Text(DojoTheme.medalEmoji(for: entry.rank ?? 0))
                            .font(.system(size: 12))
                        Text(entry.username ?? "?")
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textSecondary)
                            .lineLimit(1)
                        Spacer()
                        Text(formatSuperlativeValue(entry.value, unit: unit))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.piuGold)
                    }
                }
            }
        }
        .padding(10)
        .background(DojoTheme.piuDark)
        .cornerRadius(8)
    }

    private func replayRow(_ replay: WCMarkerReplay) -> some View {
        HStack(spacing: 10) {
            if let urlStr = replay.jacketUrl,
               let url = URL(string: urlStr.hasPrefix("http") ? urlStr : "\(APIService.shared.baseURL)\(urlStr)") {
                AsyncImage(url: url) { phase in
                    if case .success(let img) = phase {
                        img.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        Color(hex: "#2a2a4a")
                    }
                }
                .frame(width: 40, height: 40)
                .cornerRadius(6)
                .clipped()
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(replay.songTitle ?? "")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    Text(replay.username ?? "")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textSecondary)

                    if let score = replay.score {
                        Text(formatScore(score))
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(DojoTheme.gradeColor(for: score))
                    }
                }

                if let reason = replay.highlightReason, !reason.isEmpty {
                    Text(reason)
                        .font(.system(size: 9))
                        .foregroundColor(DojoTheme.piuGold.opacity(0.7))
                }
            }

            Spacer()

            if replay.replayVideoId != nil || replay.replayEmbedUrl != nil {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(DojoTheme.piuBlue)
            }
        }
        .padding(8)
        .background(DojoTheme.piuDark)
        .cornerRadius(8)
    }

    private func formatSuperlativeValue(_ value: Double?, unit: String) -> String {
        guard let v = value else { return "-" }
        if unit == "%" { return String(format: "%.0f%%", v) }
        if v == v.rounded() { return "\(Int(v))\(unit)" }
        return String(format: "%.1f\(unit)", v)
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
