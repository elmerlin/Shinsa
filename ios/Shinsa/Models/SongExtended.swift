import Foundation

// MARK: - Chart Detail (used by skill charts, etc.)

struct ChartDetail: Codable, Identifiable {
    var id: Int { chartId ?? 0 }
    var chartId: Int?
    var title: String?
    var artist: String?
    var mode: String?
    var level: Int?
    var jacketUrl: String?
    var bpm: String?
    var duration: Int?
    var skills: [ChartSkill]?
    var tier: ChartTier?

    enum CodingKeys: String, CodingKey {
        case title, artist, mode, level, bpm, duration, skills, tier
        case chartId = "chart_id"
        case jacketUrl = "jacket_url"
    }
}

struct ChartSkill: Codable, Identifiable {
    var id: String { slug ?? UUID().uuidString }
    var slug: String?
    var name: String?
    var description: String?
    var chartCount: Int?

    enum CodingKeys: String, CodingKey {
        case slug, name, description
        case chartCount = "chart_count"
    }
}

struct ChartTier: Codable {
    var tier: String?
    var rating: Double?
    var voteCount: Int?

    enum CodingKeys: String, CodingKey {
        case tier, rating
        case voteCount = "vote_count"
    }
}

// MARK: - Song Library (from /songs/library)

struct SongLibraryResponse: Codable {
    var totalSongs: Int?
    var totalCharts: Int?
    var songs: [SongLibraryEntry]?

    enum CodingKeys: String, CodingKey {
        case songs
        case totalSongs = "total_songs"
        case totalCharts = "total_charts"
    }
}

struct SongLibraryEntry: Codable, Identifiable {
    var id: String { songGroupKey ?? UUID().uuidString }
    var songGroupKey: String?
    var title: String?
    var artist: String?
    var jacketUrl: String?
    var charts: [SongLibraryChart]?

    enum CodingKeys: String, CodingKey {
        case title, artist, charts
        case songGroupKey = "song_group_key"
        case jacketUrl = "jacket_url"
    }
}

struct SongLibraryChart: Codable, Identifiable {
    var id: Int { chartId ?? 0 }
    var chartId: Int?
    var mode: String?
    var level: Int?
    var bestScore: Int?
    var bestGrade: String?
    var isPass: Bool?

    enum CodingKeys: String, CodingKey {
        case mode, level
        case chartId = "chart_id"
        case bestScore = "best_score"
        case bestGrade = "best_grade"
        case isPass = "is_pass"
    }
}

// MARK: - Chart Detail Response (from /songs/chart/{chartId})

struct ChartDetailResponse: Codable {
    var chart: ChartInfo?
    var userSummary: ChartUserSummary?
    var progression: [ChartProgression]?
    var history: [ChartHistoryEntry]?
    var friendRecords: [ChartFriendRecord]?

    enum CodingKeys: String, CodingKey {
        case chart, progression, history
        case userSummary = "user_summary"
        case friendRecords = "friend_records"
    }
}

struct ChartInfo: Codable, Identifiable {
    var id: Int { chartId ?? 0 }
    var chartId: Int?
    var title: String?
    var artist: String?
    var mode: String?
    var level: Int?
    var jacketUrl: String?
    var bpm: String?
    var skills: [ChartSkill]?

    enum CodingKeys: String, CodingKey {
        case title, artist, mode, level, bpm, skills
        case chartId = "chart_id"
        case jacketUrl = "jacket_url"
    }
}

struct ChartUserSummary: Codable {
    var best: ChartBestScore?
}

struct ChartBestScore: Codable {
    var score: Int?
    var grade: String?
    var plate: String?
    var datePlayed: String?
    var rating: Double?
    var perfect: Int?
    var great: Int?
    var good: Int?
    var bad: Int?
    var miss: Int?
    var maxCombo: Int?

    enum CodingKeys: String, CodingKey {
        case score, grade, plate, rating, perfect, great, good, bad, miss
        case datePlayed = "date_played"
        case maxCombo = "max_combo"
    }
}

struct ChartProgression: Codable, Identifiable {
    var id: String { "\(score ?? 0)-\(datePlayed ?? "")" }
    var score: Int?
    var grade: String?
    var isPass: Bool?
    var datePlayed: String?

    enum CodingKeys: String, CodingKey {
        case score, grade
        case isPass = "is_pass"
        case datePlayed = "date_played"
    }
}

struct ChartHistoryEntry: Codable, Identifiable {
    var id: String { "\(score ?? 0)-\(datePlayed ?? "")-\(grade ?? "")" }
    var score: Int?
    var grade: String?
    var plate: String?
    var datePlayed: String?
    var rating: Double?
    var perfect: Int?
    var great: Int?
    var good: Int?
    var bad: Int?
    var miss: Int?
    var maxCombo: Int?

    enum CodingKeys: String, CodingKey {
        case score, grade, plate, rating, perfect, great, good, bad, miss
        case datePlayed = "date_played"
        case maxCombo = "max_combo"
    }
}

struct ChartFriendRecord: Codable, Identifiable {
    var id: String { user?.id ?? UUID().uuidString }
    var user: ChartFriendUser?
    var best: ChartBestScore?
}

struct ChartFriendUser: Codable, Identifiable {
    var id: String { "\(userId ?? 0)" }
    var userId: Int?
    var username: String?
    var avatarUrl: String?

    enum CodingKeys: String, CodingKey {
        case username
        case userId = "user_id"
        case avatarUrl = "avatar_url"
    }
}

// MARK: - Song Lists

struct SongList: Codable, Identifiable {
    let id: String
    var name: String?
    var description: String?
    var itemCount: Int?
    var items: [SongListItem]?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, description, items
        case itemCount = "item_count"
        case createdAt = "created_at"
    }
}

struct SongListItem: Codable, Identifiable {
    let id: String
    var chartId: Int?
    var title: String?
    var mode: String?
    var level: Int?
    var jacketUrl: String?

    enum CodingKeys: String, CodingKey {
        case id, title, mode, level
        case chartId = "chart_id"
        case jacketUrl = "jacket_url"
    }
}

// MARK: - Tiers Response (from /songs/tiers)

struct TiersResponse: Codable {
    var tierListType: String?
    var mode: String?
    var level: Int?
    var levelsByMode: [String: [TierLevelInfo]]?
    var tierOrder: [String]?
    var totalCharts: Int?
    var tiers: [TierGroup]?

    enum CodingKeys: String, CodingKey {
        case mode, level, tiers
        case tierListType = "tier_list_type"
        case levelsByMode = "levels_by_mode"
        case tierOrder = "tier_order"
        case totalCharts = "total_charts"
    }
}

struct TiersMetaResponse: Codable {
    var levelsByMode: [String: [TierLevelInfo]]?

    enum CodingKeys: String, CodingKey {
        case levelsByMode = "levels_by_mode"
    }
}

struct TierLevelInfo: Codable, Identifiable {
    var id: Int { level }
    var level: Int
    var chartCount: Int?

    enum CodingKeys: String, CodingKey {
        case level
        case chartCount = "chart_count"
    }
}

struct TierGroup: Codable, Identifiable {
    var id: String { name ?? UUID().uuidString }
    var name: String?
    var rank: Int?
    var charts: [TierChart]?
}

struct TierChart: Codable, Identifiable {
    var id: Int { chartId ?? 0 }
    var chartId: Int?
    var title: String?
    var artist: String?
    var jacketUrl: String?
    var mode: String?
    var level: Int?
    var bpm: String?
    var songKey: String?
    var bestScore: Int?
    var bestGrade: String?
    var isPass: Bool?

    enum CodingKeys: String, CodingKey {
        case title, artist, mode, level, bpm
        case chartId = "chart_id"
        case jacketUrl = "jacket_url"
        case songKey = "song_key"
        case bestScore = "best_score"
        case bestGrade = "best_grade"
        case isPass = "is_pass"
    }
}

// MARK: - Pumbility Leaderboard Response

struct PumbilityLeaderboardResponse: Codable {
    var entries: [LeaderboardEntry]?
    var total: Int?
    var myRank: Int?
    var myPumbility: Double?

    enum CodingKeys: String, CodingKey {
        case entries, total
        case myRank = "my_rank"
        case myPumbility = "my_pumbility"
    }
}

struct SongAnalytics: Codable {
    var pumbility: Int?
    var singlesPumbility: Int?
    var totals: AnalyticsTotals?
    var levels: AnalyticsLevels?
    var competitiveLevels: CompetitiveLevels?
    var pumbilityBreakdown: PumbilityBreakdown?

    // Legacy fields kept for OptimiseView compatibility (API no longer returns these)
    var totalPlays: Int?
    var uniqueCharts: Int?
    var gradeDistribution: [String: Int]?
    var levelDistribution: [String: Int]?
    var recentScores: [AnalyticsScore]?

    enum CodingKeys: String, CodingKey {
        case pumbility, totals, levels
        case singlesPumbility = "singles_pumbility"
        case competitiveLevels = "competitive_levels"
        case pumbilityBreakdown = "pumbility_breakdown"
        case totalPlays = "total_plays"
        case uniqueCharts = "unique_charts"
        case gradeDistribution = "grade_distribution"
        case levelDistribution = "level_distribution"
        case recentScores = "recent_scores"
    }
}

struct AnalyticsTotals: Codable {
    var single: ModeTotals?
    var double: ModeTotals?
    var both: ModeTotals?
}

struct ModeTotals: Codable {
    var totalCharts: Int?
    var clearedCharts: Int?
    var clearPercentage: Double?
    enum CodingKeys: String, CodingKey {
        case totalCharts = "total_charts"
        case clearedCharts = "cleared_charts"
        case clearPercentage = "clear_percentage"
    }
}

struct AnalyticsLevels: Codable {
    var single: [LevelEntry]?
    var double: [LevelEntry]?
    var both: [LevelEntry]?
}

struct LevelEntry: Codable, Identifiable {
    var id: Int { level ?? 0 }
    var level: Int?
    var totalCharts: Int?
    var clearedCharts: Int?
    var clearPercentage: Double?
    var averageScore: Int?
    var averageGrade: String?
    var ratingTotal: Double?
    enum CodingKeys: String, CodingKey {
        case level
        case totalCharts = "total_charts"
        case clearedCharts = "cleared_charts"
        case clearPercentage = "clear_percentage"
        case averageScore = "average_score"
        case averageGrade = "average_grade"
        case ratingTotal = "rating_total"
    }
}

struct CompetitiveLevels: Codable {
    var single: CompetitiveLevel?
    var double: CompetitiveLevel?
}

struct CompetitiveLevel: Codable {
    var level: Int?
    var averageGrade: String?
    var averageScore: Int?
    var clearPercentage: Double?
    enum CodingKeys: String, CodingKey {
        case level
        case averageGrade = "average_grade"
        case averageScore = "average_score"
        case clearPercentage = "clear_percentage"
    }
}

struct PumbilityBreakdown: Codable {
    var overallTop50: [PumbilityEntry]?
    var singlesTop50: [PumbilityEntry]?
    var doublesTop50: [PumbilityEntry]?
    enum CodingKeys: String, CodingKey {
        case overallTop50 = "overall_top50"
        case singlesTop50 = "singles_top50"
        case doublesTop50 = "doubles_top50"
    }
}

struct PumbilityEntry: Codable, Identifiable {
    var id: String { "\(chartId ?? 0)_\(title ?? "")" }
    var chartId: Int?
    var title: String?
    var mode: String?
    var level: Int?
    var score: Int?
    var grade: String?
    var rating: Double?
    var datePlayed: String?
    var jacketUrl: String?
    enum CodingKeys: String, CodingKey {
        case title, mode, level, score, grade, rating
        case chartId = "chart_id"
        case datePlayed = "date_played"
        case jacketUrl = "jacket_url"
    }
}

struct AnalyticsScore: Codable, Identifiable {
    var id: String { "\(chartId ?? 0)-\(datePlayed ?? "")" }
    var chartId: Int?
    var title: String?
    var mode: String?
    var level: Int?
    var score: Int?
    var grade: String?
    var datePlayed: String?

    enum CodingKeys: String, CodingKey {
        case title, mode, level, score, grade
        case chartId = "chart_id"
        case datePlayed = "date_played"
    }
}
