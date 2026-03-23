import Foundation

struct FeedUser: Codable {
    var id: String?
    var username: String?
    var avatar: String?
    var countryCode: String?

    enum CodingKeys: String, CodingKey {
        case id, username, avatar
        case countryCode = "country_code"
    }
}

struct FeedItem: Codable, Identifiable {
    var id: String { "\(entryType)_\(itemId)" }

    let entryType: String // "post", "upscore", "new_clear"
    var user: FeedUser?

    // Computed convenience accessors for views
    var userId: String? { user?.id }
    var username: String? { user?.username }
    var avatar: String? { user?.avatar }
    var nationality: String? { user?.countryCode }

    // Common fields
    var pumpCount: Int?
    var commentCount: Int?
    var pumped: BoolOrInt?
    var createdAt: String?

    // Type-specific IDs
    var upscoreId: Int?
    var clearId: Int?
    var postId: Int?

    var itemId: Int {
        upscoreId ?? clearId ?? postId ?? 0
    }

    // Post fields
    var content: String?
    var images: [String]?
    var youtubeUrl: String?

    // Upscore fields
    var songTitle: String?
    var mode: String?
    var level: Int?
    var previousScore: Int?
    var newScore: Int?
    var previousGrade: String?
    var newGrade: String?
    var pumbilityGain: Double?

    // New clear fields
    var score: Int?
    var grade: String?
    var plate: String?

    var isPumped: Bool { pumped?.boolValue ?? false }

    enum CodingKeys: String, CodingKey {
        case entryType = "entry_type"
        case user, content, images, mode, level, score, grade, plate, pumped
        case pumpCount = "pump_count"
        case commentCount = "comment_count"
        case createdAt = "created_at"
        case youtubeUrl = "youtube_url"
        case songTitle = "song_title"
        case upscoreId = "upscore_id"
        case clearId = "clear_id"
        case postId = "post_id"
        case previousScore = "previous_score"
        case newScore = "new_score"
        case previousGrade = "previous_grade"
        case newGrade = "new_grade"
        case pumbilityGain = "pumbility_gain"
    }
}
