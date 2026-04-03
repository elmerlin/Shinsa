import Foundation

// MARK: - Week

struct WCWeek: Codable, Identifiable {
    let weekKey: String
    let startsAtUtc: String
    let endsAtUtc: String
    let status: String
    let chartCount: Int?
    let challengeMinLevel: Int?
    let challengeMaxLevel: Int?
    let participantCount: Int?

    var id: String { weekKey }

    var isLive: Bool { status == "active" }

    var dateRange: String {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        let fmtAlt = DateFormatter()
        fmtAlt.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZ"

        guard let start = fmt.date(from: startsAtUtc) ?? fmtAlt.date(from: startsAtUtc),
              let end = fmt.date(from: endsAtUtc) ?? fmtAlt.date(from: endsAtUtc) else {
            return weekKey
        }
        let display = DateFormatter()
        display.dateFormat = "MMM d"
        return "\(display.string(from: start)) – \(display.string(from: end))"
    }

    enum CodingKeys: String, CodingKey {
        case weekKey = "week_key"
        case startsAtUtc = "starts_at_utc"
        case endsAtUtc = "ends_at_utc"
        case status
        case chartCount = "chart_count"
        case challengeMinLevel = "challenge_min_level"
        case challengeMaxLevel = "challenge_max_level"
        case participantCount = "participant_count"
    }
}

// MARK: - Chart

struct WCChart: Codable, Identifiable {
    let id: Int
    let weekId: Int?
    let chartId: Int?
    let mode: String
    let level: Int
    let sortOrder: Int?
    let songTitleSnapshot: String?
    let artistSnapshot: String?
    let jacketUrlSnapshot: String?
    let top3: [WCChartPlayer]?
    let participantCount: Int?
    let clearCount: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case weekId = "week_id"
        case chartId = "chart_id"
        case mode, level
        case sortOrder = "sort_order"
        case songTitleSnapshot = "song_title_snapshot"
        case artistSnapshot = "artist_snapshot"
        case jacketUrlSnapshot = "jacket_url_snapshot"
        case top3, participantCount, clearCount
    }
}

struct WCChartPlayer: Codable, Identifiable {
    let userId: String?
    let username: String?
    let avatar: String?
    let nationality: String?
    let score: Int?
    let grade: String?

    var id: String { userId ?? UUID().uuidString }

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case username, avatar, nationality, score, grade
    }
}

// MARK: - Leaderboard Entry

struct WCLeaderboardEntry: Codable, Identifiable {
    let rank: Int
    let userId: String
    let username: String
    let avatar: String?
    let nationality: String?
    let points: Double
    let clears: Int
    let totalScore: Int?
    let skillTitle: String?

    var id: String { userId }

    enum CodingKeys: String, CodingKey {
        case rank
        case userId = "user_id"
        case username, avatar, nationality, points, clears
        case totalScore = "total_score"
        case skillTitle = "skill_title"
    }
}

// MARK: - Award

struct WCAward: Codable, Identifiable {
    let awardKey: String
    let awardLabel: String?
    let rank: Int
    let userId: String
    let usernameSnapshot: String
    let avatarSnapshot: String?
    let nationalitySnapshot: String?
    let skillTitleSnapshot: String?
    let points: Double?
    let clears: Int?

    var id: String { "\(awardKey)_\(rank)" }

    var awardDisplayName: String {
        switch awardKey {
        case "overall": return "Overall"
        case "singles": return "Singles"
        case "doubles": return "Doubles"
        case "advanced": return "Advanced"
        case "intermediate": return "Intermediate"
        default: return awardKey.capitalized
        }
    }

    enum CodingKeys: String, CodingKey {
        case awardKey = "award_key"
        case awardLabel = "award_label"
        case rank
        case userId = "user_id"
        case usernameSnapshot = "username_snapshot"
        case avatarSnapshot = "avatar_snapshot"
        case nationalitySnapshot = "nationality_snapshot"
        case skillTitleSnapshot = "skill_title_snapshot"
        case points, clears
    }
}

// MARK: - Viewer Summary

struct WCViewerSummary: Codable {
    let rank: Int?
    let totalPoints: Double?
    let totalClears: Int?
    let bests: [String: WCViewerBest]?

    enum CodingKeys: String, CodingKey {
        case rank
        case totalPoints = "totalPoints"
        case totalClears = "totalClears"
        case bests
    }
}

struct WCViewerBest: Codable {
    let score: Int?
    let grade: String?
}

// MARK: - Chart Scores

struct WCChartScoresResponse: Codable {
    let chart: WCChartScoreInfo
    let scores: [WCChartScore]
}

struct WCChartScoreInfo: Codable {
    let id: Int
    let songTitle: String
    let artist: String?
    let mode: String
    let level: Int
    let jacketUrl: String?
    let weekKey: String?

    enum CodingKeys: String, CodingKey {
        case id
        case songTitle = "song_title"
        case artist, mode, level
        case jacketUrl = "jacket_url"
        case weekKey = "week_key"
    }
}

struct WCChartScore: Codable, Identifiable {
    let rank: Int
    let playId: Int?
    let userId: String
    let username: String
    let avatar: String?
    let nationality: String?
    let skillTitle: String?
    let score: Int
    let grade: String?
    let plate: String?
    let perfect: Int?
    let great: Int?
    let good: Int?
    let bad: Int?
    let miss: Int?
    let maxCombo: Int?
    let replayEmbedUrl: String?
    let replayVideoId: String?
    let replayStartSeconds: Double?

    var id: String { "\(rank)_\(userId)" }

    enum CodingKeys: String, CodingKey {
        case rank
        case playId = "play_id"
        case userId = "user_id"
        case username, avatar, nationality
        case skillTitle = "skill_title"
        case score, grade, plate
        case perfect, great, good, bad, miss
        case maxCombo = "max_combo"
        case replayEmbedUrl = "replay_embed_url"
        case replayVideoId = "replay_video_id"
        case replayStartSeconds = "replay_start_seconds"
    }
}

// MARK: - API Responses

struct WCHomeResponse: Codable {
    let week: WCWeek
    let participantCount: Int
    let awards: [WCAward]
    let challengePreviews: [WCChart]
    let viewerSummary: WCViewerSummary?
}

struct WCWeekDetailResponse: Codable {
    let week: WCWeek
    let awards: [WCAward]
    let leaderboard: [WCLeaderboardEntry]
    let groupedByLevel: [String: [WCChart]]
    let participantCount: Int
    let viewerSummary: WCViewerSummary?
}

// MARK: - User WC History

struct WCUserHistory: Codable, Identifiable {
    let weekKey: String
    let weekId: Int
    let startsAtUtc: String?
    let endsAtUtc: String?
    let rank: Int?
    let points: Double?
    let clears: Int?
    let totalScore: Int?
    let scopeMode: String?
    let participantCount: Int?

    var id: String { weekKey }

    enum CodingKeys: String, CodingKey {
        case weekKey = "week_key"
        case weekId = "week_id"
        case startsAtUtc = "starts_at_utc"
        case endsAtUtc = "ends_at_utc"
        case rank, points, clears
        case totalScore = "total_score"
        case scopeMode = "scope_mode"
        case participantCount = "participant_count"
    }
}
