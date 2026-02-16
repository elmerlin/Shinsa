import Foundation

struct PumbilityScore: Codable, Identifiable {
    let id: Int
    var userId: String?
    var songTitle: String
    var mode: String
    var level: Int
    var score: Int
    var grade: String?
    var backgroundUrl: String?
    var datePlayed: String?
    var rankOrder: Int?

    enum CodingKeys: String, CodingKey {
        case id, mode, level, score, grade
        case userId = "user_id"
        case songTitle = "song_title"
        case backgroundUrl = "background_url"
        case datePlayed = "date_played"
        case rankOrder = "rank_order"
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
    var songTitle: String
    var mode: String
    var level: Int
    var score: Int
    var grade: String?
    var backgroundUrl: String?
    var datePlayed: String?
    var perfect: Int?
    var great: Int?
    var good: Int?
    var bad: Int?
    var miss: Int?
    var maxCombo: Int?
    var kcal: Double?
    var plate: String?

    enum CodingKeys: String, CodingKey {
        case id, mode, level, score, grade, perfect, great, good, bad, miss, kcal, plate
        case userId = "user_id"
        case songTitle = "song_title"
        case backgroundUrl = "background_url"
        case datePlayed = "date_played"
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
    var pumbility: Int?
    var scores: [PumbilityScore]?
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
