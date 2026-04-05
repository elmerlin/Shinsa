import SwiftUI

struct WCLevelRowView: View {
    let level: Int
    let charts: [WCChart]
    let viewerBests: [String: WCViewerBest]?
    let onChartTap: (Int) -> Void

    @State private var isExpanded = true

    var body: some View {
        VStack(spacing: 0) {
            // Level header
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 8) {
                    Text("Lv. \(level)")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)

                    Text("\(charts.count) chart\(charts.count == 1 ? "" : "s")")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)

                    Spacer()

                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(DojoTheme.textMuted)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(DojoTheme.piuDark)
            }

            if isExpanded {
                // 2-column grid
                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8)
                ], spacing: 8) {
                    ForEach(charts) { chart in
                        chartCard(chart)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
        }
    }

    // MARK: - Chart Card

    private func chartCard(_ chart: WCChart) -> some View {
        Button {
            onChartTap(chart.id)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                // Jacket + Mode badge
                ZStack(alignment: .topTrailing) {
                    jacketImage(chart)
                        .frame(height: 90)
                        .frame(maxWidth: .infinity)
                        .clipped()

                    // Mode/Level badge
                    modeBadge(mode: chart.mode, level: chart.level)
                        .padding(6)
                }

                // Info
                VStack(alignment: .leading, spacing: 4) {
                    Text(chart.songTitleSnapshot ?? "Unknown")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)

                    if let artist = chart.artistSnapshot, !artist.isEmpty {
                        Text(artist)
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                            .lineLimit(1)
                    }

                    // Stats
                    HStack(spacing: 8) {
                        HStack(spacing: 2) {
                            Image(systemName: "person.fill")
                                .font(.system(size: 8))
                            Text("\(chart.participantCount ?? 0)")
                                .font(.system(size: 10))
                        }
                        .foregroundColor(DojoTheme.textMuted)

                        if let clears = chart.clearCount, clears > 0 {
                            HStack(spacing: 2) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 8))
                                Text("\(clears)")
                                    .font(.system(size: 10))
                            }
                            .foregroundColor(DojoTheme.piuGreen.opacity(0.7))
                        }
                    }

                    // Top 3
                    if let top3 = chart.top3, !top3.isEmpty {
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(Array(top3.prefix(3).enumerated()), id: \.offset) { idx, player in
                                HStack(spacing: 4) {
                                    Text(DojoTheme.medalEmoji(for: idx + 1))
                                        .font(.system(size: 8))
                                    Text(player.username ?? "?")
                                        .font(.system(size: 9))
                                        .foregroundColor(DojoTheme.textSecondary)
                                        .lineLimit(1)
                                    Spacer()
                                    if let score = player.score {
                                        Text(formatScore(score))
                                            .font(.system(size: 9, weight: .semibold))
                                            .foregroundColor(DojoTheme.gradeColor(for: score))
                                    }
                                }
                            }
                        }
                        .padding(.top, 2)
                    }

                    // Viewer's best
                    if let chartIdStr = String?(String(chart.id)),
                       let best = viewerBests?[chartIdStr] {
                        HStack(spacing: 4) {
                            Image(systemName: "person.fill")
                                .font(.system(size: 8))
                                .foregroundColor(DojoTheme.piuGold)
                            Text("Your best:")
                                .font(.system(size: 9))
                                .foregroundColor(DojoTheme.piuGold.opacity(0.7))
                            if let score = best.score {
                                Text(formatScore(score))
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundColor(DojoTheme.piuGold)
                            }
                            if let grade = best.grade {
                                Text(grade)
                                    .font(.system(size: 8, weight: .bold))
                                    .foregroundColor(DojoTheme.piuGold)
                            }
                        }
                        .padding(.top, 2)
                    }
                }
                .padding(8)
            }
            .background(DojoTheme.piuCard)
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(DojoTheme.piuBorder, lineWidth: 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }

    // MARK: - Jacket Image

    @ViewBuilder
    private func jacketImage(_ chart: WCChart) -> some View {
        if let urlStr = chart.jacketUrlSnapshot,
           let url = URL(string: urlStr.hasPrefix("http") ? urlStr : "\(APIService.shared.baseURL)\(urlStr)") {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fill)
                case .failure:
                    jacketPlaceholder(chart)
                default:
                    jacketPlaceholder(chart)
                }
            }
        } else {
            jacketPlaceholder(chart)
        }
    }

    private func jacketPlaceholder(_ chart: WCChart) -> some View {
        ZStack {
            modeGradient(chart.mode)
            Text(chart.songTitleSnapshot?.prefix(2).uppercased() ?? "?")
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.white.opacity(0.5))
        }
    }

    // MARK: - Mode Badge

    private func modeBadge(mode: String, level: Int) -> some View {
        let letter = mode == "Single" ? "S" : mode == "Double" ? "D" : "C"
        let color = mode == "Single" ? Color(hex: "#ff6688") : Color(hex: "#44cc88")

        return Text("\(letter)\(level)")
            .font(.system(size: 10, weight: .black))
            .foregroundColor(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(color.opacity(0.85))
            .cornerRadius(4)
    }

    private func modeGradient(_ mode: String) -> LinearGradient {
        if mode == "Single" {
            return LinearGradient(colors: [Color(hex: "#ff3366").opacity(0.3), Color(hex: "#ff6688").opacity(0.1)], startPoint: .topLeading, endPoint: .bottomTrailing)
        } else {
            return LinearGradient(colors: [Color(hex: "#33cc66").opacity(0.3), Color(hex: "#44cc88").opacity(0.1)], startPoint: .topLeading, endPoint: .bottomTrailing)
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
