import Foundation

struct Post: Codable, Identifiable {
    let id: Int
    var userId: String?
    var content: String
    var images: String? // JSON string of image URL array
    var youtubeUrl: String?
    var commentsDisabled: Int?
    var pumpCount: Int?
    var commentCount: Int?
    var userPumped: BoolOrInt?
    var username: String?
    var avatar: String?
    var nationality: String?
    var createdAt: String?
    var updatedAt: String?

    var areCommentsDisabled: Bool { commentsDisabled != nil && commentsDisabled != 0 }
    var isPumped: Bool { userPumped?.boolValue ?? false }
    var isEdited: Bool { updatedAt != nil }

    var imageUrls: [String] {
        guard let images = images, !images.isEmpty, images != "[]" else { return [] }
        guard let data = images.data(using: .utf8),
              let urls = try? JSONDecoder().decode([String].self, from: data) else { return [] }
        return urls
    }

    enum CodingKeys: String, CodingKey {
        case id, content, images, username, avatar, nationality
        case userId = "user_id"
        case youtubeUrl = "youtube_url"
        case commentsDisabled = "comments_disabled"
        case pumpCount = "pump_count"
        case commentCount = "comment_count"
        case userPumped = "user_pumped"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct Comment: Codable, Identifiable {
    let id: Int
    var postId: Int?
    var upscoreId: Int?
    var clearId: Int?
    var userId: String?
    var content: String
    var parentId: Int?
    var pumpCount: Int?
    var userPumped: BoolOrInt?
    var username: String?
    var avatar: String?
    var createdAt: String?
    var replies: [Comment]?

    var isPumped: Bool { userPumped?.boolValue ?? false }

    enum CodingKeys: String, CodingKey {
        case id, content, username, avatar, replies
        case postId = "post_id"
        case upscoreId = "upscore_id"
        case clearId = "clear_id"
        case userId = "user_id"
        case parentId = "parent_id"
        case pumpCount = "pump_count"
        case userPumped = "user_pumped"
        case createdAt = "created_at"
    }
}

struct PumpResponse: Codable {
    var pumped: Bool
    var pumpCount: Int?

    enum CodingKeys: String, CodingKey {
        case pumped
        case pumpCount = "pump_count"
    }
}

// Handles API returning either bool or int for pumped status
enum BoolOrInt: Codable {
    case bool(Bool)
    case int(Int)

    var boolValue: Bool {
        switch self {
        case .bool(let v): return v
        case .int(let v): return v != 0
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let v = try? container.decode(Bool.self) {
            self = .bool(v)
        } else if let v = try? container.decode(Int.self) {
            self = .int(v)
        } else {
            self = .bool(false)
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .bool(let v): try container.encode(v)
        case .int(let v): try container.encode(v)
        }
    }
}
