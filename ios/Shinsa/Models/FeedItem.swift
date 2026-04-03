import Foundation

struct FeedItem: Codable, Identifiable {
    var id: String { "\(type)_\(itemId)" }

    let type: String // "post", "upscore", "clear"

    // Flat user fields
    var userId: String?
    var username: String?
    var avatar: String?
    var nationality: String?

    // Common fields
    var pumpCount: Int?
    var commentCount: Int?
    var userPumped: BoolOrInt?
    var createdAt: String?

    // Generic ID from server
    var feedId: Int?

    var itemId: Int { feedId ?? 0 }

    // Post fields
    var content: String?
    var images: String? // Raw JSON string from server
    var youtubeUrl: String?

    // Upscore fields
    var songTitle: String?
    var mode: String?
    var level: Int?
    var previousScore: Int?
    var newScore: Int?
    var previousGrade: String?
    var newGrade: String?
    var pumbilityGain: FlexDouble?
    var singlesPumbilityGain: FlexDouble?
    var upscoresJson: String?

    // Clear fields
    var score: Int?
    var grade: String?
    var plate: String?
    var clearsJson: String?
    var backgroundUrl: String?

    // Weekly Challenge play post fields
    var weekKey: String?
    var weekId: Int?
    var playsJson: String?
    var totalRatingPoints: Double?
    var totalChartsPlayed: Int?

    // Post kind (for system posts like WC summary/personal)
    var postKind: String?

    var isPumped: Bool { userPumped?.boolValue ?? false }

    var imageUrls: [String] {
        guard let raw = images, let data = raw.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([String].self, from: data)) ?? []
    }

    struct UpscoreItem: Codable, Identifiable {
        var id: String { "\(songTitle ?? "")_\(mode ?? "")_\(level ?? 0)_\(newScore ?? 0)" }
        var songTitle: String?
        var mode: String?
        var level: Int?
        var oldScore: Int?
        var newScore: Int?
        var oldGrade: String?
        var newGrade: String?
        var backgroundUrl: String?
        var pumbilityGain: FlexDouble?
        var singlesPumbilityGain: FlexDouble?
        var overTop100Rank: Int?
        var replayEmbedUrl: String?
        var replayVideoId: String?
        var perfect: Int?
        var great: Int?
        var good: Int?
        var bad: Int?
        var miss: Int?
        var datePlayed: String?
        enum CodingKeys: String, CodingKey {
            case mode, level, perfect, great, good, bad, miss
            case songTitle = "song_title"
            case oldScore = "old_score"
            case newScore = "new_score"
            case oldGrade = "old_grade"
            case newGrade = "new_grade"
            case backgroundUrl = "background_url"
            case pumbilityGain = "pumbility_gain"
            case singlesPumbilityGain = "singles_pumbility_gain"
            case overTop100Rank = "over_top100_rank"
            case replayEmbedUrl = "replay_embed_url"
            case replayVideoId = "replay_video_id"
            case datePlayed = "date_played"
        }
    }

    struct ClearItem: Codable, Identifiable {
        var id: String { "\(songTitle ?? "")_\(mode ?? "")_\(level ?? 0)_\(score ?? 0)" }
        var entryType: String?
        var songTitle: String?
        var mode: String?
        var level: Int?
        var score: Int?
        var grade: String?
        var plate: String?
        var backgroundUrl: String?
        var pumbilityGain: FlexDouble?
        var titleName: String?
        var replayEmbedUrl: String?
        var replayVideoId: String?
        var perfect: Int?
        var great: Int?
        var good: Int?
        var bad: Int?
        var miss: Int?
        var datePlayed: String?
        enum CodingKeys: String, CodingKey {
            case mode, level, score, grade, plate, perfect, great, good, bad, miss
            case entryType = "entry_type"
            case songTitle = "song_title"
            case backgroundUrl = "background_url"
            case pumbilityGain = "pumbility_gain"
            case titleName = "title_name"
            case replayEmbedUrl = "replay_embed_url"
            case replayVideoId = "replay_video_id"
            case datePlayed = "date_played"
        }
    }

    struct WCPlayItem: Codable, Identifiable {
        var id: String { "\(songTitle ?? "")_\(mode ?? "")_\(level ?? 0)_\(score ?? 0)" }
        var songTitle: String?
        var mode: String?
        var level: Int?
        var score: Int?
        var grade: String?
        var plate: String?
        var ratingPoints: Double?
        var isNew: Bool?
        var previousScore: Int?
        var jacketUrl: String?
        var replayEmbedUrl: String?
        var replayVideoId: String?
        var perfect: Int?
        var great: Int?
        var good: Int?
        var bad: Int?
        var miss: Int?
        var maxCombo: Int?
        var playId: Int?
        enum CodingKeys: String, CodingKey {
            case mode, level, score, grade, plate, perfect, great, good, bad, miss
            case songTitle = "song_title"
            case ratingPoints = "rating_points"
            case isNew = "is_new"
            case previousScore = "previous_score"
            case jacketUrl = "jacket_url"
            case replayEmbedUrl = "replay_embed_url"
            case replayVideoId = "replay_video_id"
            case maxCombo = "max_combo"
            case playId = "play_id"
        }
    }

    var upscoreItems: [UpscoreItem] {
        guard let raw = upscoresJson, let data = raw.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([UpscoreItem].self, from: data)) ?? []
    }

    var clearItems: [ClearItem] {
        guard let raw = clearsJson, let data = raw.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([ClearItem].self, from: data)) ?? []
    }

    var wcPlayItems: [WCPlayItem] {
        guard let raw = playsJson, let data = raw.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([WCPlayItem].self, from: data)) ?? []
    }

    enum CodingKeys: String, CodingKey {
        case type, content, images, mode, level, score, grade, plate, username, avatar, nationality
        case userId = "user_id"
        case pumpCount = "pump_count"
        case commentCount = "comment_count"
        case userPumped = "user_pumped"
        case createdAt = "created_at"
        case youtubeUrl = "youtube_url"
        case songTitle = "song_title"
        case feedId = "id"
        case previousScore = "previous_score"
        case newScore = "new_score"
        case previousGrade = "previous_grade"
        case newGrade = "new_grade"
        case pumbilityGain = "pumbility_gain"
        case singlesPumbilityGain = "singles_pumbility_gain"
        case upscoresJson = "upscores_json"
        case clearsJson = "clears_json"
        case backgroundUrl = "background_url"
        case weekKey = "week_key"
        case weekId = "week_id"
        case playsJson = "plays_json"
        case totalRatingPoints = "total_rating_points"
        case totalChartsPlayed = "total_charts_played"
        case postKind = "post_kind"
    }
}
