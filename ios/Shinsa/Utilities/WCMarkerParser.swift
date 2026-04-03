import Foundation

// MARK: - WC Summary Marker

struct WCSummaryMarker: Codable {
    var weekKey: String?
    var weekLabel: String?
    var participantCount: Int?
    var totalClears: Int?
    var chartCount: Int?
    var topOverallPodium: [WCMarkerPodiumEntry]?
    var awards: WCMarkerAwards?
    var superlatives: WCMarkerSuperlatives?
    var replayHighlights: [WCMarkerReplay]?
    var nextWeek: WCMarkerNextWeek?
}

struct WCMarkerAwards: Codable {
    var overall: [WCMarkerPodiumEntry]?
    var singles: [WCMarkerPodiumEntry]?
    var doubles: [WCMarkerPodiumEntry]?
    var advanced: [WCMarkerPodiumEntry]?
    var intermediate: [WCMarkerPodiumEntry]?
}

struct WCMarkerPodiumEntry: Codable, Identifiable {
    var id: String { "\(userId ?? "")_\(rank ?? 0)" }
    var rank: Int?
    var userId: String?
    var username: String?
    var avatar: String?
    var nationality: String?
    var skillTitle: String?
    var points: Int?
    var clears: Int?

    enum CodingKeys: String, CodingKey {
        case rank, username, avatar, nationality, points, clears
        case userId = "user_id"
        case skillTitle = "skill_title"
    }
}

struct WCMarkerSuperlatives: Codable {
    var mostSss: [WCMarkerSuperlativeEntry]?
    var highestClearPercentage: [WCMarkerSuperlativeEntry]?
    var highestClearRating: [WCMarkerSuperlativeEntry]?
    var biggestImprovements: [WCMarkerSuperlativeEntry]?

    enum CodingKeys: String, CodingKey {
        case mostSss = "most_sss"
        case highestClearPercentage = "highest_clear_percentage"
        case highestClearRating = "highest_clear_rating"
        case biggestImprovements = "biggest_improvements"
    }
}

struct WCMarkerSuperlativeEntry: Codable, Identifiable {
    var id: String { "\(userId ?? "")_\(rank ?? 0)" }
    var rank: Int?
    var userId: String?
    var username: String?
    var avatar: String?
    var nationality: String?
    var value: Double?

    enum CodingKeys: String, CodingKey {
        case rank, username, avatar, nationality, value
        case userId = "user_id"
    }
}

struct WCMarkerReplay: Codable, Identifiable {
    var id: String { "\(userId ?? "")_\(songTitle ?? "")" }
    var userId: String?
    var username: String?
    var avatar: String?
    var songTitle: String?
    var mode: String?
    var level: Int?
    var jacketUrl: String?
    var score: Int?
    var grade: String?
    var replayEmbedUrl: String?
    var replayVideoId: String?
    var highlightReason: String?

    enum CodingKeys: String, CodingKey {
        case username, avatar, mode, level, score, grade
        case userId = "user_id"
        case songTitle = "song_title"
        case jacketUrl = "jacket_url"
        case replayEmbedUrl = "replay_embed_url"
        case replayVideoId = "replay_video_id"
        case highlightReason = "highlight_reason"
    }
}

struct WCMarkerNextWeek: Codable {
    var weekKey: String?
    var weekLabel: String?
    var previewCharts: [WCMarkerPreviewChart]?
}

struct WCMarkerPreviewChart: Codable, Identifiable {
    var id: String { "\(songTitle ?? "")_\(mode ?? "")_\(level ?? 0)" }
    var songTitle: String?
    var mode: String?
    var level: Int?
    var jacketUrl: String?

    enum CodingKeys: String, CodingKey {
        case mode, level
        case songTitle = "song_title"
        case jacketUrl = "jacket_url"
    }
}

// MARK: - WC Personal Marker

struct WCPersonalMarker: Codable {
    var weekKey: String?
    var weekLabel: String?
    var averageScore: Double?
    var highestRatedPlay: WCPersonalHighestPlay?
    var sssCount: Int?
    var totalClears: Int?
    var chartCount: Int?
    var rankings: WCPersonalRankings?
    var averageRank: Double?
    var bracketComparison: WCPersonalBracket?
    var podiums: [WCPersonalPodium]?
    var skillFamily: String?
}

struct WCPersonalHighestPlay: Codable {
    var songTitle: String?
    var mode: String?
    var level: Int?
    var jacketUrl: String?
    var score: Int?
    var grade: String?
    var ratingPoints: Double?

    enum CodingKeys: String, CodingKey {
        case mode, level, score, grade
        case songTitle = "songTitle"
        case jacketUrl = "jacketUrl"
        case ratingPoints = "ratingPoints"
    }
}

struct WCPersonalRankings: Codable {
    var overall: WCPersonalRanking?
    var singles: WCPersonalRanking?
    var doubles: WCPersonalRanking?
}

struct WCPersonalRanking: Codable {
    var rank: Int?
    var total: Int?
}

struct WCPersonalBracket: Codable {
    var bracketName: String?
    var bracketRank: Int?
    var bracketParticipantCount: Int?
    var bracketAverageScore: Double?
}

struct WCPersonalPodium: Codable, Identifiable {
    var id: String { "\(awardKey ?? "")_\(rank ?? 0)" }
    var awardKey: String?
    var awardLabel: String?
    var rank: Int?
}

// MARK: - Parser

enum WCMarkerParser {
    private static let summaryPattern = /\[\[SHINSA_WC_SUMMARY_V1:([A-Za-z0-9+\/=_-]+)\]\]/
    private static let personalPattern = /\[\[SHINSA_WC_PERSONAL_V1:([A-Za-z0-9+\/=_-]+)\]\]/

    static func parseSummary(from content: String?) -> (text: String, summary: WCSummaryMarker?)? {
        guard let content = content else { return nil }

        if let match = content.firstMatch(of: summaryPattern) {
            let encoded = String(match.1)
            guard let data = Data(base64Encoded: encoded),
                  let jsonStr = decodeUnicodeBase64(data),
                  let jsonData = jsonStr.data(using: .utf8) else {
                return (text: content, summary: nil)
            }

            let decoder = JSONDecoder()
            let summary = try? decoder.decode(WCSummaryMarker.self, from: jsonData)
            let text = content.replacing(summaryPattern, with: "")
                .replacingOccurrences(of: "\n\n\n", with: "\n\n")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return (text: text, summary: summary)
        }

        return nil
    }

    static func parsePersonal(from content: String?) -> (text: String, personal: WCPersonalMarker?)? {
        guard let content = content else { return nil }

        if let match = content.firstMatch(of: personalPattern) {
            let encoded = String(match.1)
            guard let data = Data(base64Encoded: encoded),
                  let jsonStr = decodeUnicodeBase64(data),
                  let jsonData = jsonStr.data(using: .utf8) else {
                return (text: content, personal: nil)
            }

            let decoder = JSONDecoder()
            let personal = try? decoder.decode(WCPersonalMarker.self, from: jsonData)
            let text = content.replacing(personalPattern, with: "")
                .replacingOccurrences(of: "\n\n\n", with: "\n\n")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return (text: text, personal: personal)
        }

        return nil
    }

    /// Decode Base64 that was encoded with URI-component encoding for Unicode safety
    private static func decodeUnicodeBase64(_ data: Data) -> String? {
        // The JS encoder uses encodeURIComponent + atob, so the base64 decodes to percent-encoded UTF-8
        guard let percentEncoded = String(data: data, encoding: .ascii) else { return nil }
        return percentEncoded.removingPercentEncoding ?? percentEncoded
    }

    /// Check if post content contains a WC summary marker
    static func hasSummaryMarker(_ content: String?) -> Bool {
        guard let content = content else { return false }
        return content.contains("[[SHINSA_WC_SUMMARY_V1:")
    }

    /// Check if post content contains a WC personal marker
    static func hasPersonalMarker(_ content: String?) -> Bool {
        guard let content = content else { return false }
        return content.contains("[[SHINSA_WC_PERSONAL_V1:")
    }
}
