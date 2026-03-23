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

    var isPumped: Bool { userPumped?.boolValue ?? false }

    var imageUrls: [String] {
        guard let raw = images, let data = raw.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([String].self, from: data)) ?? []
    }

    struct UpscoreItem: Codable {
        var songTitle: String?
        var mode: String?
        var level: Int?
        var previousScore: Int?
        var newScore: Int?
        var previousGrade: String?
        var newGrade: String?
        enum CodingKeys: String, CodingKey {
            case mode, level
            case songTitle = "song_title"
            case previousScore = "previous_score"
            case newScore = "new_score"
            case previousGrade = "previous_grade"
            case newGrade = "new_grade"
        }
    }

    var upscoreItems: [UpscoreItem] {
        guard let raw = upscoresJson, let data = raw.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([UpscoreItem].self, from: data)) ?? []
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
    }
}
