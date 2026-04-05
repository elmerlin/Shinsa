import Foundation

// MARK: - Session Share Marker

struct SessionShareMarker: Codable {
    var shareType: String?
    var sessionId: String?
    var sessionTitle: String?
    var streamUrl: String?
    var generatedAt: String?
    var sessionDateLabel: String?
    var sessionTimeRange: String?
    var sessionDurationMinutes: Int?
    var sessionDurationLabel: String?
    var sessionMachineName: String?
    var filterMode: String?
    var minGrade: String?
    var minGradeLabel: String?
    var minLevel: Int?
    var maxLevel: Int?
    var hasLevelRange: Bool?
    var levelRangeLabel: String?
    var songCount: Int?
    var clearCount: Int?
    var clearRate: Int?
    var averageScore: Int?
    var singleCount: Int?
    var doubleCount: Int?
    var otherCount: Int?
    var totalRatingPoints: Int?
    var averageRatingPoints: Double?
    var averageLevel: Double?
    var highestRatingPoints: Int?
    var lowestRatingPoints: Int?
    var countedClearCount: Int?
    var completed: Bool?
    var leaderboardEligible: Bool?
    var judgmentTotals: JudgmentTotals?
    var perfectRate: Int?
    var rows: [SessionShareRow]?

    var isHourOfPower: Bool { shareType == "hour_of_power" }
}

struct SessionShareRow: Codable, Identifiable {
    var id: String { "\(songTitle ?? "")_\(mode ?? "")_\(level ?? 0)_\(score ?? 0)" }
    var songTitle: String?
    var mode: String?
    var level: Int?
    var score: Int?
    var grade: String?
    var ratingPoints: Int?
    var overTop100Rank: Int?
    var jacketUrl: String?
    var replayEmbedUrl: String?
    var replayVideoId: String?
    var perfect: Int?
    var great: Int?
    var good: Int?
    var bad: Int?
    var miss: Int?
    var maxCombo: Int?
    var datePlayed: String?
    var weeklyChallengeWeekKey: String?

    enum CodingKeys: String, CodingKey {
        case mode, level, score, grade, perfect, great, good, bad, miss
        case songTitle = "song_title"
        case ratingPoints = "rating_points"
        case overTop100Rank = "over_top100_rank"
        case jacketUrl = "jacket_url"
        case replayEmbedUrl = "replay_embed_url"
        case replayVideoId = "replay_video_id"
        case maxCombo = "max_combo"
        case datePlayed = "date_played"
        case weeklyChallengeWeekKey = "weekly_challenge_week_key"
    }
}

struct JudgmentTotals: Codable {
    var perfect: Int?
    var great: Int?
    var good: Int?
    var bad: Int?
    var miss: Int?
}

// MARK: - Session Summary Marker

struct SessionSummaryMarker: Codable {
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
    var estimatedKcalPerHour: Int?
    var singleCount: Int?
    var doubleCount: Int?
    var otherCount: Int?
    var judgmentTotals: JudgmentTotals?
    var perfectRate: Int?
    var topSongsByScore: [SessionSummarySong]?
    var topSongsByRating: [SessionSummarySong]?
}

struct SessionSummarySong: Codable, Identifiable {
    var id: String { "\(songTitle ?? "")_\(mode ?? "")_\(level ?? 0)" }
    var songTitle: String?
    var mode: String?
    var level: Int?
    var score: Int?
    var grade: String?
    var rating: Double?
    var overTop100Rank: Int?
    var jacketUrl: String?
    var weeklyChallengeWeekKey: String?

    enum CodingKeys: String, CodingKey {
        case mode, level, score, grade, rating
        case songTitle = "song_title"
        case overTop100Rank = "over_top100_rank"
        case jacketUrl = "jacket_url"
        case weeklyChallengeWeekKey = "weekly_challenge_week_key"
    }
}

// MARK: - Session Plan Marker

struct SessionPlanMarker: Codable {
    var feeling: String?
    var chartMode: String?
    var pumbility: Int?
    var avgRating: Double?
    var scoringLevel: Int?
    var passingLevel: Int?
    var adjustedScoringLevel: Int?
    var adjustedPassingLevel: Int?
    var skillsTrain: [String]?
    var skillsAvoid: [String]?
    var activation: [SessionPlanSong]?
    var scoring: [SessionPlanSong]?
    var passing: [SessionPlanSong]?
}

struct SessionPlanSong: Codable, Identifiable {
    var id: String { "\(title ?? "")_\(mode ?? "")_\(level ?? 0)" }
    var title: String?
    var mode: String?
    var level: Int?
    var jacketUrl: String?
    var bestScore: Int?
    var bestGrade: String?

    enum CodingKeys: String, CodingKey {
        case title, mode, level
        case jacketUrl = "jacket_url"
        case bestScore = "best_score"
        case bestGrade = "best_grade"
    }
}

// MARK: - Parsed Result

struct ParsedPostMarkers {
    var text: String
    var wcSummary: WCSummaryMarker?
    var wcPersonal: WCPersonalMarker?
    var sessionSummary: SessionSummaryMarker?
    var sessionShare: SessionShareMarker?
    var liveSession: Any? // Already handled by LiveSessionMarker
    var sessionPlan: SessionPlanMarker?

    var hasAnyMarker: Bool {
        wcSummary != nil || wcPersonal != nil || sessionSummary != nil ||
        sessionShare != nil || sessionPlan != nil
    }
}

// MARK: - Universal Parser

enum PostMarkerParser {
    private static let allMarkerRegex = /\[\[SHINSA_(?:WC_SUMMARY|WC_PERSONAL|SUMMARY|SHARE|LIVE|SESSION_PLAN)_V1:[A-Za-z0-9+\/=_-]+\]\]/
    private static let sharePattern = /\[\[SHINSA_SHARE_V1:([A-Za-z0-9+\/=_-]+)\]\]/
    private static let summaryPattern = /\[\[SHINSA_SUMMARY_V1:([A-Za-z0-9+\/=_-]+)\]\]/
    private static let planPattern = /\[\[SHINSA_SESSION_PLAN_V1:([A-Za-z0-9+\/=_-]+)\]\]/
    private static let wcSummaryPattern = /\[\[SHINSA_WC_SUMMARY_V1:([A-Za-z0-9+\/=_-]+)\]\]/
    private static let wcPersonalPattern = /\[\[SHINSA_WC_PERSONAL_V1:([A-Za-z0-9+\/=_-]+)\]\]/
    private static let livePattern = /\[\[SHINSA_LIVE_V1:([A-Za-z0-9+\/=_-]+)\]\]/

    static func parseAll(from content: String?) -> ParsedPostMarkers {
        guard let content = content, !content.isEmpty else {
            return ParsedPostMarkers(text: content ?? "")
        }

        let wcSummary = decodeMarker(content, pattern: wcSummaryPattern, type: WCSummaryMarker.self)
        let wcPersonal = decodeMarker(content, pattern: wcPersonalPattern, type: WCPersonalMarker.self)
        let sessionSummary = decodeMarker(content, pattern: summaryPattern, type: SessionSummaryMarker.self)
        let sessionShare = decodeMarker(content, pattern: sharePattern, type: SessionShareMarker.self)
        let sessionPlan = decodeMarker(content, pattern: planPattern, type: SessionPlanMarker.self)

        // Strip all markers from text
        var text = content
        while let range = text.firstMatch(of: allMarkerRegex)?.range {
            text.removeSubrange(range)
        }
        text = text.replacingOccurrences(of: "\n\n\n", with: "\n\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return ParsedPostMarkers(
            text: text,
            wcSummary: wcSummary,
            wcPersonal: wcPersonal,
            sessionSummary: sessionSummary,
            sessionShare: sessionShare,
            sessionPlan: sessionPlan
        )
    }

    /// Check if content has any markers (quick check without parsing)
    static func hasMarkers(_ content: String?) -> Bool {
        guard let content = content else { return false }
        return content.contains("[[SHINSA_")
    }

    // MARK: - Internal

    private static func decodeMarker<T: Decodable, R: RegexComponent>(
        _ content: String,
        pattern: R,
        type: T.Type
    ) -> T? where R.RegexOutput == (Substring, Substring) {
        guard let match = content.firstMatch(of: pattern) else { return nil }
        let encoded = String(match.1)
        guard let data = Data(base64Encoded: encoded),
              let jsonStr = decodeUnicodeBase64(data),
              let jsonData = jsonStr.data(using: .utf8) else {
            return nil
        }
        return try? JSONDecoder().decode(T.self, from: jsonData)
    }

    private static func decodeUnicodeBase64(_ data: Data) -> String? {
        guard let percentEncoded = String(data: data, encoding: .ascii) else { return nil }
        return percentEncoded.removingPercentEncoding ?? percentEncoded
    }
}
