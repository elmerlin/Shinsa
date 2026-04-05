import SwiftUI

struct LiveRecapTab: View {
    let summary: LiveRecapSummary
    let session: LiveSession?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Header
                Text("SESSION RECAP")
                    .font(.system(size: 11, weight: .black))
                    .foregroundColor(Color(hex: "#f87171"))
                    .tracking(2)

                // Schedule info
                VStack(alignment: .leading, spacing: 4) {
                    if let date = summary.sessionDateLabel, !date.isEmpty {
                        infoRow("calendar", date)
                    }
                    if let time = summary.sessionTimeRange, !time.isEmpty {
                        infoRow("clock", time)
                    }
                    if let duration = summary.sessionDurationLabel, !duration.isEmpty {
                        infoRow("timer", duration)
                    }
                    if let machine = summary.sessionMachineName, !machine.isEmpty {
                        infoRow("arcade.stick", "Machine: \(machine)")
                    }
                    if let shoe = summary.sessionShoeLabel, !shoe.isEmpty {
                        infoRow("shoe", shoe)
                    }
                }

                // Stats grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    statCell("Songs", value: "\(summary.songCount ?? 0)")
                    statCell("Clears", value: clearsLabel, accent: Color(hex: "#6ee7b7"))
                    statCell("Total Steps", value: "\(summary.totalSteps ?? 0)")
                    statCell("Est. Calories", value: "\(summary.estimatedKcal ?? 0)")
                    statCell("Perfect Rate", value: "\(summary.perfectRate ?? 0)%", accent: Color(hex: "#67e8f9"))
                    statCell("Avg Score", value: "\(summary.averageScore ?? 0)")
                }

                // Mode split
                if (summary.singleCount ?? 0) > 0 || (summary.doubleCount ?? 0) > 0 {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("MODE SPLIT")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)
                            .tracking(1)

                        HStack(spacing: 8) {
                            if let s = summary.singleCount, s > 0 {
                                modeBadge("Singles", count: s, color: Color(hex: "#7a1730"))
                            }
                            if let d = summary.doubleCount, d > 0 {
                                modeBadge("Doubles", count: d, color: Color(hex: "#0b5d48"))
                            }
                            if let o = summary.otherCount, o > 0 {
                                modeBadge("Other", count: o, color: Color(hex: "#1e40af"))
                            }
                        }
                    }
                }

                // Judgment totals
                if let jt = summary.judgmentTotals {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("JUDGMENTS")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)
                            .tracking(1)

                        HStack(spacing: 0) {
                            judgmentCell("P", count: jt.perfect ?? 0, color: Color(hex: "#7dd3fc"))
                            judgmentCell("G", count: jt.great ?? 0, color: Color(hex: "#6ee7b7"))
                            judgmentCell("Good", count: jt.good ?? 0, color: Color(hex: "#fde68a"))
                            judgmentCell("Bad", count: jt.bad ?? 0, color: Color(hex: "#f0abfc"))
                            judgmentCell("Miss", count: jt.miss ?? 0, color: Color(hex: "#fca5a5"))
                        }
                        .padding(8)
                        .background(Color.white.opacity(0.04))
                        .cornerRadius(10)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.06), lineWidth: 1))
                    }
                }

                // Engagement
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    statCell("Peak Viewers", value: "\(summary.viewerPeak ?? 0)", accent: .orange)
                    statCell("Messages", value: "\(summary.messageCount ?? 0)")
                    statCell("Interactions", value: "\(summary.interactions ?? 0)")
                }

                // Top songs by score
                if let topScores = summary.topSongsByScore, !topScores.isEmpty {
                    topSongsSection("TOP BY SCORE", songs: topScores)
                }

                // Top songs by rating
                if let topRating = summary.topSongsByRating, !topRating.isEmpty {
                    topSongsSection("TOP BY RATING", songs: topRating)
                }

                // Stream link
                if let url = summary.streamUrl, !url.isEmpty, let link = URL(string: url) {
                    Link(destination: link) {
                        HStack(spacing: 6) {
                            Image(systemName: "play.rectangle.fill")
                                .foregroundColor(.red)
                            Text("Watch replay")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.white)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.red.opacity(0.12))
                        .cornerRadius(10)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.red.opacity(0.25), lineWidth: 1))
                    }
                }
            }
            .padding(16)
        }
    }

    // MARK: - Helpers

    private var clearsLabel: String {
        let clears = summary.clearCount ?? 0
        let total = summary.songCount ?? 0
        return total > 0 ? "\(clears)/\(total) (\(summary.clearRate ?? 0)%)" : "\(clears)"
    }

    private func infoRow(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 11))
                .foregroundColor(DojoTheme.textMuted)
                .frame(width: 16)
            Text(text)
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.7))
        }
    }

    private func statCell(_ label: String, value: String, accent: Color = .white) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)
                .tracking(1)
            Text(value)
                .font(.system(size: 18, weight: .black))
                .foregroundColor(accent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.white.opacity(0.035))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.06), lineWidth: 1))
        )
    }

    private func modeBadge(_ label: String, count: Int, color: Color) -> some View {
        HStack(spacing: 4) {
            Text(label).font(.system(size: 10, weight: .bold)).foregroundColor(.white)
            Text("\(count)").font(.system(size: 10, weight: .black)).foregroundColor(.white)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color)
        .cornerRadius(4)
    }

    private func judgmentCell(_ label: String, count: Int, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 8, weight: .heavy))
                .foregroundColor(color)
            Text("\(count)")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
        }
        .frame(maxWidth: .infinity)
    }

    private func topSongsSection(_ title: String, songs: [LiveSongRow]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)
                .tracking(1)

            ForEach(songs.prefix(3)) { song in
                topSongRow(song)
            }
        }
    }

    private func topSongRow(_ song: LiveSongRow) -> some View {
        let isDouble = (song.mode ?? "").lowercased().hasPrefix("d")
        let score = song.score ?? 0
        let jacketURL = JacketService.shared.resolveJacketURL(
            title: song.songTitle, mode: song.mode, level: song.level,
            backgroundUrl: song.jacketUrl
        )

        return HStack(spacing: 10) {
            if let url = jacketURL {
                AsyncImage(url: url) { phase in
                    if case .success(let img) = phase {
                        img.resizable().scaledToFill()
                    } else {
                        RoundedRectangle(cornerRadius: 4).fill(DojoTheme.piuCard)
                    }
                }
                .frame(width: 40, height: 24)
                .cornerRadius(4)
                .clipped()
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(song.songTitle ?? "")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Text("\(isDouble ? "D" : "S")\(song.level ?? 0)")
                    .font(.system(size: 8, weight: .black))
                    .foregroundColor(.white)
                    .padding(.horizontal, 3)
                    .padding(.vertical, 1)
                    .background(isDouble ? Color(hex: "#0b5d48") : Color(hex: "#7a1730"))
                    .cornerRadius(2)
            }

            Spacer()

            if score > 0 {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(DojoTheme.gradeLabel(for: score))
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(DojoTheme.gradeColor(for: score))
                    Text(score.formattedScore)
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.8))
                }
            }
        }
        .padding(6)
        .background(Color.white.opacity(0.04))
        .cornerRadius(6)
    }
}
