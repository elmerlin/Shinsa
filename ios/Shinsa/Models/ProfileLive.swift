import Foundation

struct ProfileLiveResponse: Codable {
    var activeSession: ProfileLiveItem?
    var endedSessions: [ProfileLiveItem]?

    enum CodingKeys: String, CodingKey {
        case activeSession = "active_session"
        case endedSessions = "ended_sessions"
    }
}

struct ProfileLiveItem: Codable, Identifiable {
    var id: String { session?.id ?? UUID().uuidString }
    var session: LiveSessionInfo?
    var summary: LiveSessionSummary?
    var playCount: Int?
    var messageCount: Int?

    enum CodingKeys: String, CodingKey {
        case session, summary
        case playCount = "play_count"
        case messageCount = "message_count"
    }
}

struct LiveSessionInfo: Codable {
    var id: String?
    var title: String?
    var status: String?
    var liveUrl: String?
    var createdAt: String?
    var endedAt: String?
    var youtubeVideoId: String?
    var isUnlisted: Bool?
    var host: LiveSessionHost?

    enum CodingKeys: String, CodingKey {
        case id, title, status, host
        case liveUrl = "live_url"
        case createdAt = "created_at"
        case endedAt = "ended_at"
        case youtubeVideoId = "youtube_video_id"
        case isUnlisted = "is_unlisted"
    }
}

struct LiveSessionHost: Codable {
    var id: String?
    var username: String?
    var avatar: String?
}

struct LiveSessionSummary: Codable {
    var totalPlays: Int?
    var uniqueSongs: Int?
    var highestLevel: Int?
    var durationMinutes: Int?

    enum CodingKeys: String, CodingKey {
        case totalPlays = "total_plays"
        case uniqueSongs = "unique_songs"
        case highestLevel = "highest_level"
        case durationMinutes = "duration_minutes"
    }
}
