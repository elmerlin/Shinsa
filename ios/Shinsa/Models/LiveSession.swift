import Foundation

struct LiveSession: Codable, Identifiable {
    let id: String
    var hostId: String?
    var title: String?
    var description: String?
    var streamUrl: String?
    var gameMode: String?
    var status: String?
    var viewerCount: Int?
    var createdAt: String?
    var endedAt: String?
    var hostUsername: String?
    var hostAvatar: String?
    var cohosts: [LiveCohost]?

    var isActive: Bool { status == "active" }

    enum CodingKeys: String, CodingKey {
        case id, title, description, status, cohosts
        case hostId = "host_id"
        case streamUrl = "stream_url"
        case gameMode = "game_mode"
        case viewerCount = "viewer_count"
        case createdAt = "created_at"
        case endedAt = "ended_at"
        case hostUsername = "host_username"
        case hostAvatar = "host_avatar"
    }
}

struct LiveCohost: Codable, Identifiable {
    let id: String
    var userId: String?
    var username: String?
    var avatar: String?

    enum CodingKeys: String, CodingKey {
        case id, username, avatar
        case userId = "user_id"
    }
}

struct LiveMessage: Codable, Identifiable {
    let id: String
    var sessionId: String?
    var userId: String?
    var content: String?
    var type: String?  // "message", "emote", "system"
    var createdAt: String?
    var username: String?
    var avatar: String?

    enum CodingKeys: String, CodingKey {
        case id, content, type, username, avatar
        case sessionId = "session_id"
        case userId = "user_id"
        case createdAt = "created_at"
    }
}

struct LiveRequest: Codable, Identifiable {
    let id: String
    var sessionId: String?
    var userId: String?
    var songTitle: String?
    var songMode: String?
    var songLevel: Int?
    var votes: Int?
    var status: String?
    var createdAt: String?
    var username: String?

    enum CodingKeys: String, CodingKey {
        case id, votes, status, username
        case sessionId = "session_id"
        case userId = "user_id"
        case songTitle = "song_title"
        case songMode = "song_mode"
        case songLevel = "song_level"
        case createdAt = "created_at"
    }
}

struct HopLeaderboardEntry: Codable, Identifiable {
    var id: String { odId ?? UUID().uuidString }
    var odId: String?
    var userId: String?
    var username: String?
    var avatar: String?
    var totalRating: Double?
    var songCount: Int?
    var duration: Int?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case username, avatar, duration
        case odId = "od_id"
        case userId = "user_id"
        case totalRating = "total_rating"
        case songCount = "song_count"
        case createdAt = "created_at"
    }
}
