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
    var participants: [LiveParticipant]?
    var sessionType: String?
    var requestsEnabled: Bool?
    var requestModeFilter: String?
    var requestMaxLevel: Int?
    var youtubeVideoId: String?
    var statusText: String?
    var isHost: Bool?
    var isParticipant: Bool?
    var viewerPeak: Int?

    var isActive: Bool { status == "active" || status == "live" }

    enum CodingKeys: String, CodingKey {
        case id, title, description, status, cohosts, participants
        case hostId = "host_user_id"
        case streamUrl = "stream_url"
        case gameMode = "game_mode"
        case viewerCount = "viewer_count"
        case createdAt = "created_at"
        case endedAt = "ended_at"
        case hostUsername = "host_username"
        case hostAvatar = "host_avatar"
        case sessionType = "session_type"
        case requestsEnabled = "requests_enabled"
        case requestModeFilter = "request_mode_filter"
        case requestMaxLevel = "request_max_level"
        case youtubeVideoId = "youtube_video_id"
        case statusText = "status_text"
        case isHost = "is_host"
        case isParticipant = "is_participant"
        case viewerPeak = "viewer_peak"
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
    var avatar: String?
    var jacketUrl: String?
    var backgroundUrl: String?
    var fulfilled: Int?
    var targetUsername: String?

    var effectiveStatus: String {
        if let s = status, !s.isEmpty { return s }
        return (fulfilled ?? 0) != 0 ? "played" : "open"
    }

    enum CodingKeys: String, CodingKey {
        case id, votes, status, username, avatar, fulfilled
        case sessionId = "session_id"
        case userId = "user_id"
        case songTitle = "song_title"
        case songMode = "song_mode"
        case songLevel = "song_level"
        case createdAt = "created_at"
        case jacketUrl = "jacket_url"
        case backgroundUrl = "background_url"
        case targetUsername = "resolved_target_username"
    }
}

// MARK: - Full Session Snapshot (returned by GET /live/sessions/:id)

struct LiveSessionSnapshot: Codable {
    var session: LiveSession?
    var plays: [LivePlay]?
    var messages: [LiveMessage]?
    var requests: [LiveRequest]?
    var activeVote: LiveVote?
    var viewerState: LiveViewerState?
    var summary: LiveRecapSummary?
    var lastPlay: LivePlay?

    enum CodingKeys: String, CodingKey {
        case session, plays, messages, requests, summary
        case activeVote = "active_vote"
        case viewerState = "viewer_state"
        case lastPlay = "last_play"
    }
}

struct LivePlay: Codable, Identifiable {
    var id: String { "\(songTitle ?? "")-\(playedAt ?? "")-\(score ?? 0)" }
    var songTitle: String?
    var mode: String?
    var level: Int?
    var score: Int?
    var grade: String?
    var plate: String?
    var isPass: Bool?
    var jacketUrl: String?
    var backgroundUrl: String?
    var userId: String?
    var username: String?
    var avatar: String?
    var playedAt: String?
    var requestId: String?
    var perfect: Int?
    var great: Int?
    var good: Int?
    var bad: Int?
    var miss: Int?
    var replayEmbedUrl: String?

    enum CodingKeys: String, CodingKey {
        case mode, level, score, grade, plate, username, avatar, perfect, great, good, bad, miss
        case songTitle = "song_title"
        case isPass = "is_pass"
        case jacketUrl = "jacket_url"
        case backgroundUrl = "background_url"
        case userId = "user_id"
        case playedAt = "played_at"
        case requestId = "request_id"
        case replayEmbedUrl = "replay_embed_url"
    }
}

struct LiveVote: Codable, Identifiable {
    let id: String
    var liveSessionId: String?
    var status: String? // "active", "closed"
    var endsAt: String?
    var modeFilter: String?
    var minLevel: Int?
    var maxLevel: Int?
    var options: [LiveVoteOption]?
    var winningOptionId: String?

    var isActive: Bool { status == "active" }

    enum CodingKeys: String, CodingKey {
        case id, status, options
        case liveSessionId = "live_session_id"
        case endsAt = "ends_at"
        case modeFilter = "mode_filter"
        case minLevel = "min_level"
        case maxLevel = "max_level"
        case winningOptionId = "winning_option_id"
    }
}

struct LiveVoteOption: Codable, Identifiable {
    let id: String
    var songTitle: String?
    var mode: String?
    var level: Int?
    var jacketUrl: String?
    var backgroundUrl: String?
    var voteCount: Int?
    var userVoted: Bool?
    var isWinner: Bool?

    enum CodingKeys: String, CodingKey {
        case id, mode, level
        case songTitle = "song_title"
        case jacketUrl = "jacket_url"
        case backgroundUrl = "background_url"
        case voteCount = "vote_count"
        case userVoted = "user_voted"
        case isWinner = "is_winner"
    }
}

struct LiveViewerState: Codable {
    var chatMuted: Bool?
    var requestsBlocked: Bool?

    enum CodingKeys: String, CodingKey {
        case chatMuted = "chat_muted"
        case requestsBlocked = "requests_blocked"
    }
}

struct LiveParticipant: Codable, Identifiable {
    var id: String { odId ?? UUID().uuidString }
    var odId: String?
    var userId: String?
    var username: String?
    var avatar: String?
    var role: String? // "owner", "cohost"
    var status: String? // "active", "left"

    enum CodingKeys: String, CodingKey {
        case username, avatar, role, status
        case odId = "id"
        case userId = "user_id"
    }
}

// MARK: - HoP Leaderboard

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
