import Foundation

struct FeedItem: Codable, Identifiable {
    var id: String { "\(type)_\(itemId)" }

    let type: String // "post", "upscore", "clear"
    let itemId: Int

    // Common fields
    var userId: String?
    var username: String?
    var avatar: String?
    var nationality: String?
    var pumpCount: Int?
    var commentCount: Int?
    var userPumped: BoolOrInt?
    var createdAt: String?

    // Post fields
    var content: String?
    var images: String?
    var youtubeUrl: String?
    var commentsDisabled: Int?
    var updatedAt: String?

    // Upscore fields
    var upscoresJson: String?

    // New clear fields
    var songTitle: String?
    var mode: String?
    var level: Int?
    var score: Int?
    var grade: String?
    var plate: String?
    var backgroundUrl: String?

    var isPumped: Bool { userPumped?.boolValue ?? false }

    enum CodingKeys: String, CodingKey {
        case type, content, images, username, avatar, nationality, mode, level, score, grade, plate
        case itemId = "id"
        case userId = "user_id"
        case pumpCount = "pump_count"
        case commentCount = "comment_count"
        case userPumped = "user_pumped"
        case createdAt = "created_at"
        case youtubeUrl = "youtube_url"
        case commentsDisabled = "comments_disabled"
        case updatedAt = "updated_at"
        case upscoresJson = "upscores_json"
        case songTitle = "song_title"
        case backgroundUrl = "background_url"
    }
}

struct FeedResponse: Codable {
    var items: [FeedItem]?
    var page: Int?
    var hasMore: Bool?

    enum CodingKeys: String, CodingKey {
        case items, page
        case hasMore = "has_more"
    }
}
