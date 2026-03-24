import SwiftUI
import Foundation

// MARK: - Live Session Marker Parser

struct LiveRecapSummary: Codable {
    var version: Int?
    var sessionId: String?
    var sessionTitle: String?
    var participantRole: String?
    var sessionDateLabel: String?
    var sessionTimeRange: String?
    var sessionDurationMinutes: Int?
    var sessionDurationLabel: String?
    var sessionMachineName: String?
    var sessionShoeLabel: String?
    var songCount: Int?
    var clearCount: Int?
    var clearRate: Int?
    var totalSteps: Int?
    var estimatedKcal: Int?
    var singleCount: Int?
    var doubleCount: Int?
    var otherCount: Int?
    var perfectRate: Int?
    var averageScore: Int?
    var averageLevel: Double?
    var averageRating: Int?
    var viewerCount: Int?
    var viewerPeak: Int?
    var messageCount: Int?
    var requestPlayCount: Int?
    var votedSongPlayCount: Int?
    var interactions: Int?
    var streamUrl: String?
    var hostUsername: String?
    var topSongsByScore: [LiveSongRow]?
    var topSongsByRating: [LiveSongRow]?
    var judgmentTotals: LiveJudgmentTotals?
}

struct LiveSongRow: Codable, Identifiable {
    var id: String { "\(songTitle ?? "")-\(mode ?? "")-\(level ?? 0)" }
    var songTitle: String?
    var mode: String?
    var level: Int?
    var score: Int?
    var grade: String?
    var rating: Int?
    var overTop100Rank: Int?
    var jacketUrl: String?

    enum CodingKeys: String, CodingKey {
        case mode, level, score, grade, rating
        case songTitle = "song_title"
        case overTop100Rank = "over_top100_rank"
        case jacketUrl = "jacket_url"
    }
}

struct LiveJudgmentTotals: Codable {
    var perfect: Int?
    var great: Int?
    var good: Int?
    var bad: Int?
    var miss: Int?
}

enum LiveSessionMarker {
    static let regex = try! NSRegularExpression(pattern: "\\[\\[SHINSA_LIVE_V1:([A-Za-z0-9+/=_-]+)\\]\\]")

    /// Parse and split content into (text, summary)
    static func split(_ content: String) -> (text: String, summary: LiveRecapSummary?) {
        let range = NSRange(content.startIndex..., in: content)
        guard let match = regex.firstMatch(in: content, range: range),
              let b64Range = Range(match.range(at: 1), in: content) else {
            return (content, nil)
        }

        let b64 = String(content[b64Range])
        // Decode base64 → JSON
        guard let data = Data(base64Encoded: b64, options: .ignoreUnknownCharacters),
              let jsonStr = String(data: data, encoding: .utf8),
              let jsonData = jsonStr.data(using: .utf8) else {
            return (content, nil)
        }

        let decoder = JSONDecoder()
        guard let summary = try? decoder.decode(LiveRecapSummary.self, from: jsonData) else {
            return (content, nil)
        }

        // Remove the marker from content
        let fullMatchRange = Range(match.range(at: 0), in: content)!
        var cleaned = content.replacingCharacters(in: fullMatchRange, with: "")
        // Collapse excessive newlines
        while cleaned.contains("\n\n\n") {
            cleaned = cleaned.replacingOccurrences(of: "\n\n\n", with: "\n\n")
        }
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)

        return (cleaned, summary)
    }
}

// MARK: - Compact Live Session Card

struct LiveSessionCardView: View {
    let summary: LiveRecapSummary
    let username: String?

    private var title: String {
        let t = summary.sessionTitle?.trimmingCharacters(in: .whitespaces) ?? ""
        return t.isEmpty ? "Shinsa Live" : t
    }

    private var hostLabel: String {
        guard let host = summary.hostUsername, !host.isEmpty else { return "Live session recap" }
        let role = (summary.participantRole ?? "").lowercased()
        return role == "cohost" ? "Co-Hosted by \(host)" : "Hosted by \(host)"
    }

    private var scheduleLabel: String {
        [summary.sessionDateLabel, summary.sessionTimeRange, summary.sessionDurationLabel]
            .compactMap { $0?.isEmpty == false ? $0 : nil }
            .joined(separator: " • ")
    }

    private var clearsLabel: String {
        if let total = summary.songCount, total > 0 {
            return "\(summary.clearCount ?? 0)/\(total)"
        }
        return "\(summary.clearCount ?? 0)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("SHINSA LIVE RECAP")
                        .font(.system(size: 9, weight: .black))
                        .foregroundColor(Color(hex: "#f87171"))
                        .tracking(2)

                    if let sid = summary.sessionId, !sid.isEmpty {
                        NavigationLink(value: "live-session/\(sid)") {
                            Text(title)
                                .font(.system(size: 17, weight: .black))
                                .foregroundColor(.cyan)
                                .lineLimit(1)
                        }
                    } else {
                        Text(title)
                            .font(.system(size: 17, weight: .black))
                            .foregroundColor(.white)
                            .lineLimit(1)
                    }

                    Text(hostLabel)
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                        .lineLimit(1)
                }

                Spacer()

                Text("Live")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white.opacity(0.7))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Color.white.opacity(0.06)).overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1)))
            }

            // Schedule & machine
            if !scheduleLabel.isEmpty {
                Text(scheduleLabel)
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.6))
            }

            if let machine = summary.sessionMachineName, !machine.isEmpty {
                Text("Machine: \(machine)")
                    .font(.system(size: 11))
                    .foregroundColor(DojoTheme.textMuted)
                    .lineLimit(1)
            }

            // Stats grid
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                statCell("Songs", value: "\(summary.songCount ?? 0)")
                statCell("Clears", value: clearsLabel, accent: Color(hex: "#6ee7b7"))
                statCell("Perfects", value: "\(summary.perfectRate ?? 0)%", accent: Color(hex: "#67e8f9"))
                statCell("Chat", value: "\(summary.messageCount ?? 0)")
            }

            // Top songs
            if let topSongs = summary.topSongsByScore, !topSongs.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("TOP SCORES")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(DojoTheme.textMuted)
                        .tracking(1)

                    ForEach(topSongs.prefix(3)) { song in
                        topSongRow(song)
                    }
                }
                .padding(.top, 4)
            }

            // Stream link
            if let streamUrl = summary.streamUrl, !streamUrl.isEmpty, let url = URL(string: streamUrl) {
                Link(destination: url) {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Color.red)
                            .frame(width: 6, height: 6)
                        Text(url.host ?? "Stream")
                            .font(.system(size: 11))
                            .foregroundColor(.orange.opacity(0.8))
                            .lineLimit(1)
                    }
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: "#0e1421").opacity(0.98), Color(hex: "#0b101c").opacity(0.96)],
                        startPoint: .top, endPoint: .bottom
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
        )
    }

    // MARK: - Stat Cell
    private func statCell(_ label: String, value: String, accent: Color = .white) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)
                .tracking(1.5)
            Text(value)
                .font(.system(size: 18, weight: .black))
                .foregroundColor(accent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.white.opacity(0.035))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.06), lineWidth: 1))
        )
    }

    // MARK: - Top Song Row
    private func topSongRow(_ song: LiveSongRow) -> some View {
        let isDouble = (song.mode ?? "").lowercased().hasPrefix("d")
        let prefix = isDouble ? "D" : "S"
        let jacketURL = JacketService.shared.resolveJacketURL(
            title: song.songTitle, mode: song.mode, level: song.level,
            backgroundUrl: song.jacketUrl
        )

        return HStack(spacing: 10) {
            // Jacket
            if let url = jacketURL {
                AsyncImage(url: url) { phase in
                    if case .success(let img) = phase {
                        img.resizable().scaledToFill()
                    } else {
                        RoundedRectangle(cornerRadius: 4).fill(DojoTheme.piuCard)
                    }
                }
                .frame(width: 36, height: 22)
                .cornerRadius(4)
                .clipped()
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(song.songTitle ?? "")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                Text("\(prefix)\(song.level ?? 0)")
                    .font(.system(size: 8, weight: .black))
                    .foregroundColor(.white)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .background(isDouble ? Color(hex: "#0b5d48") : Color(hex: "#7a1730"))
                    .cornerRadius(3)
            }

            Spacer()

            if let score = song.score, score > 0 {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(DojoTheme.gradeLabel(for: score))
                        .font(.system(size: 10, weight: .bold))
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
