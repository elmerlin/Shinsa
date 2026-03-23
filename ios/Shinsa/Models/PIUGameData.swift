import Foundation

struct PumbilityScore: Codable, Identifiable {
    var id: String { "\(songTitle)|\(mode)|\(level)" }
    var userId: String?
    var songTitle: String
    var mode: String
    var level: Int
    var score: Int
    var grade: String?
    var backgroundUrl: String?
    var datePlayed: String?
    var rankOrder: Int?
    var rating: Int?
    var overTop100Rank: Int?

    enum CodingKeys: String, CodingKey {
        case mode, level, score, grade, rating
        case userId = "user_id"
        case songTitle = "song_title"
        case backgroundUrl = "background_url"
        case datePlayed = "date_played"
        case rankOrder = "rank_order"
        case overTop100Rank = "over_top100_rank"
    }
}

struct BestScore: Codable, Identifiable {
    let id: Int
    var userId: String?
    var songTitle: String
    var mode: String
    var level: Int
    var score: Int
    var grade: String?
    var plate: String?
    var backgroundUrl: String?

    enum CodingKeys: String, CodingKey {
        case id, mode, level, score, grade, plate
        case userId = "user_id"
        case songTitle = "song_title"
        case backgroundUrl = "background_url"
    }
}

struct RecentlyPlayed: Codable, Identifiable {
    let id: Int
    var userId: String?
    var songTitle: String?
    var mode: String?
    var level: Int?
    var score: Int?
    var grade: String?
    var backgroundUrl: String?
    var datePlayed: String?
    var playedAtUtc: String?
    var perfect: Int?
    var great: Int?
    var good: Int?
    var bad: Int?
    var miss: Int?
    var maxCombo: Int?
    var kcal: Double?
    var plate: String?

    /// Best available date string for this play
    var effectiveDate: String? {
        let utc = playedAtUtc ?? ""
        let dp = datePlayed ?? ""
        return !utc.isEmpty ? utc : (!dp.isEmpty ? dp : nil)
    }

    enum CodingKeys: String, CodingKey {
        case id, mode, level, score, grade, perfect, great, good, bad, miss, kcal, plate
        case userId = "user_id"
        case songTitle = "song_title"
        case backgroundUrl = "background_url"
        case datePlayed = "date_played"
        case playedAtUtc = "played_at_utc"
        case maxCombo = "max_combo"
    }
}

struct PiugameCredentialStatus: Codable {
    var linked: Bool
    var username: String?
}

struct PiugameSyncStatus: Codable {
    var lastBestScoresSync: String?
    var lastPumbilitySync: String?
    var lastRecentlyPlayedSync: String?
    var bestScoresImported: Int?
    var pumbilityValue: Int?
    var syncInProgress: String?
    var syncProgress: Int?
    var syncTotal: Int?

    enum CodingKeys: String, CodingKey {
        case lastBestScoresSync = "last_best_scores_sync"
        case lastPumbilitySync = "last_pumbility_sync"
        case lastRecentlyPlayedSync = "last_recently_played_sync"
        case bestScoresImported = "best_scores_imported"
        case pumbilityValue = "pumbility_value"
        case syncInProgress = "sync_in_progress"
        case syncProgress = "sync_progress"
        case syncTotal = "sync_total"
    }
}

struct PumbilityData: Codable {
    var pumbilityValue: Int?
    var officialPumbility: Int?
    var scores: [PumbilityScore]?
    var averageRating: Double?
    var equivalentLevel: Int?
    var equivalentGrade: String?
    var minEntryRating: Int?
    var minEntryDetails: MinEntryDetails?
    var ranking: Int?
    var scoreCount: Int?

    struct MinEntryDetails: Codable {
        var rating: Int?
        var songTitle: String?
        var mode: String?
        var level: Int?
        var score: Int?
        var grade: String?
        enum CodingKeys: String, CodingKey {
            case rating, mode, level, score, grade
            case songTitle = "song_title"
        }
    }

    enum CodingKeys: String, CodingKey {
        case scores, ranking
        case pumbilityValue = "pumbility_value"
        case officialPumbility = "official_pumbility"
        case averageRating = "average_rating"
        case equivalentLevel = "equivalent_level"
        case equivalentGrade = "equivalent_grade"
        case minEntryRating = "min_entry_rating"
        case minEntryDetails = "min_entry_details"
        case scoreCount = "score_count"
    }
}

struct PiuSyncStatus: Codable {
    var linked: Bool?
    var highestSingle: Int?
    var highestDouble: Int?
    var pumbilityValue: Int?
    var bestScoresImported: Bool?

    enum CodingKeys: String, CodingKey {
        case linked
        case highestSingle = "highest_single"
        case highestDouble = "highest_double"
        case pumbilityValue = "pumbility_value"
        case bestScoresImported = "best_scores_imported"
    }
}

struct SyncProgressResponse: Codable {
    var syncInProgress: String?
    var syncProgress: Int?
    var syncTotal: Int?

    enum CodingKeys: String, CodingKey {
        case syncInProgress = "sync_in_progress"
        case syncProgress = "sync_progress"
        case syncTotal = "sync_total"
    }
}
