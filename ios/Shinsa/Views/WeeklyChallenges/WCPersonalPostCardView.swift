import SwiftUI

/// Feed card for weekly challenge personal recap posts
struct WCPersonalPostCardView: View {
    let personal: WCPersonalMarker
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack(spacing: 8) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 14))
                    .foregroundColor(DojoTheme.piuGold)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Weekly Challenge Recap")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)

                    if let label = personal.weekLabel {
                        Text(label)
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.piuGold)
                    }
                }

                Spacer()

                if let family = personal.skillFamily, !family.isEmpty {
                    Text(family.capitalized)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(DojoTheme.skillColor(for: family))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(DojoTheme.skillColor(for: family).opacity(0.15))
                        .cornerRadius(4)
                }
            }

            // Podium badges
            if let podiums = personal.podiums, !podiums.isEmpty {
                HStack(spacing: 6) {
                    ForEach(podiums) { podium in
                        HStack(spacing: 3) {
                            Text(DojoTheme.medalEmoji(for: podium.rank ?? 0))
                                .font(.system(size: 12))
                            Text(podium.awardLabel ?? podium.awardKey ?? "")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(.white)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(DojoTheme.piuGold.opacity(0.15))
                        .cornerRadius(12)
                    }
                }
            }

            // Stats grid (4 columns)
            HStack(spacing: 0) {
                statCell(value: formatAvg(personal.averageScore), label: "Avg Score")
                statCell(value: "\(personal.sssCount ?? 0)", label: "SSS/SSS+")
                statCell(value: "\(personal.totalClears ?? 0)/\(personal.chartCount ?? 0)", label: "Cleared")
                statCell(value: formatAvg(personal.averageRank), label: "Avg Rank")
            }

            // Highest Rated Play
            if let play = personal.highestRatedPlay {
                VStack(alignment: .leading, spacing: 6) {
                    Text("HIGHEST RATED PLAY")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(DojoTheme.textMuted)
                        .tracking(1)

                    HStack(spacing: 10) {
                        if let urlStr = play.jacketUrl,
                           let url = URL(string: urlStr.hasPrefix("http") ? urlStr : "\(APIService.shared.baseURL)\(urlStr)") {
                            AsyncImage(url: url) { phase in
                                if case .success(let img) = phase {
                                    img.resizable().aspectRatio(contentMode: .fill)
                                } else {
                                    Color(hex: "#2a2a4a")
                                }
                            }
                            .frame(width: 44, height: 44)
                            .cornerRadius(6)
                            .clipped()
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(play.songTitle ?? "Unknown")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white)
                                .lineLimit(1)

                            HStack(spacing: 6) {
                                let letter = play.mode == "Single" ? "S" : "D"
                                let color = play.mode == "Single" ? Color(hex: "#ff6688") : Color(hex: "#44cc88")
                                Text("\(letter)\(play.level ?? 0)")
                                    .font(.system(size: 9, weight: .black))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(color.opacity(0.8))
                                    .cornerRadius(3)

                                if let score = play.score {
                                    Text(formatScore(score))
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundColor(DojoTheme.gradeColor(for: score))
                                }

                                if let grade = play.grade {
                                    Text(grade)
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundColor(DojoTheme.gradeColor(for: play.score ?? 0))
                                }
                            }
                        }

                        Spacer()

                        if let rp = play.ratingPoints, rp > 0 {
                            VStack(spacing: 1) {
                                Text(String(format: "%.1f", rp))
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(DojoTheme.piuGold)
                                Text("RP")
                                    .font(.system(size: 8, weight: .bold))
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                        }
                    }
                }
                .padding(10)
                .background(DojoTheme.piuDark)
                .cornerRadius(8)
            }

            // Rankings
            if let rankings = personal.rankings {
                HStack(spacing: 8) {
                    if let overall = rankings.overall {
                        rankingBadge("Overall", rank: overall.rank, total: overall.total)
                    }
                    if let singles = rankings.singles {
                        rankingBadge("Singles", rank: singles.rank, total: singles.total)
                    }
                    if let doubles = rankings.doubles {
                        rankingBadge("Doubles", rank: doubles.rank, total: doubles.total)
                    }
                }
            }

            // Bracket comparison
            if let bracket = personal.bracketComparison {
                HStack(spacing: 8) {
                    Image(systemName: "person.3.fill")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)

                    VStack(alignment: .leading, spacing: 1) {
                        if let name = bracket.bracketName {
                            Text(name)
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(DojoTheme.textSecondary)
                        }

                        HStack(spacing: 8) {
                            if let rank = bracket.bracketRank, let count = bracket.bracketParticipantCount {
                                Text("#\(rank) of \(count)")
                                    .font(.system(size: 10))
                                    .foregroundColor(DojoTheme.piuGold)
                            }

                            if let avg = bracket.bracketAverageScore {
                                Text("Avg: \(formatScore(Int(avg)))")
                                    .font(.system(size: 10))
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                        }
                    }
                }
                .padding(8)
                .background(DojoTheme.piuDark)
                .cornerRadius(6)
            }
        }
        .padding(14)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuGold.opacity(0.15), lineWidth: 1)
        )
    }

    // MARK: - Components

    private func statCell(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.white)
            Text(label)
                .font(.system(size: 9))
                .foregroundColor(DojoTheme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }

    private func rankingBadge(_ title: String, rank: Int?, total: Int?) -> some View {
        VStack(spacing: 2) {
            Text(title)
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)

            if let r = rank, let t = total {
                HStack(spacing: 2) {
                    Text("#\(r)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(r <= 3 ? DojoTheme.piuGold : .white)
                    Text("/\(t)")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(DojoTheme.piuDark)
        .cornerRadius(8)
    }

    private func formatAvg(_ value: Double?) -> String {
        guard let v = value else { return "-" }
        if v == v.rounded() { return "\(Int(v))" }
        return String(format: "%.1f", v)
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
