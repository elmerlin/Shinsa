import Foundation

// MARK: - Conversation

struct ConversationPartner: Codable {
    var id: String?
    var username: String?
    var avatar: String?
}

struct ConversationLastMessage: Codable {
    var id: String?
    var preview: String?
}

struct Conversation: Codable, Identifiable {
    let id: String
    var kind: String?  // "direct", "squad"
    var partner: ConversationPartner?
    var lastMessage: ConversationLastMessage?
    var lastMessageAt: String?
    var unreadCount: Int?
    var isPinned: Bool?
    var title: String?
    var avatar: String?
    var memberCount: Int?
    var theme: String?

    // Convenience for views
    var partnerUsername: String? { partner?.username }
    var partnerAvatar: String? { partner?.avatar }
    var lastMessagePreview: String? { lastMessage?.preview }

    /// Display name: squad title or partner username
    var displayName: String {
        if kind == "squad" {
            return title ?? "Squad"
        }
        return partner?.username ?? "Chat"
    }

    var isSquad: Bool { kind == "squad" }

    enum CodingKeys: String, CodingKey {
        case id, kind, partner, title, avatar, theme
        case lastMessage = "last_message"
        case lastMessageAt = "last_message_at"
        case unreadCount = "unread_count"
        case isPinned = "is_pinned"
        case memberCount = "member_count"
    }
}

// MARK: - Response Wrappers

struct ConversationsResponse: Codable {
    var conversations: [Conversation]?
}

struct ConversationDetailResponse: Codable {
    var conversation: Conversation?
    var messages: [DirectMessage]?
    var hasMore: Bool?

    enum CodingKeys: String, CodingKey {
        case conversation, messages
        case hasMore = "has_more"
    }
}

// MARK: - Direct Message

struct MessageSender: Codable {
    var id: String?
    var username: String?
    var avatar: String?
}

struct DirectMessage: Codable, Identifiable {
    let id: String
    var sender: MessageSender?
    var isOwn: Bool?
    var messageType: String?
    var content: String?
    var createdAt: String?
    var linkShare: MessageLinkShare?
    var challengeCard: MessageChallengeCard?

    // Convenience accessors for views
    var senderId: String? { sender?.id }
    var senderUsername: String? { sender?.username }
    var senderAvatar: String? { sender?.avatar }

    enum CodingKeys: String, CodingKey {
        case id, sender, content
        case isOwn = "is_own"
        case messageType = "message_type"
        case createdAt = "created_at"
        case linkShare = "link_share"
        case challengeCard = "challenge_card"
    }
}

struct MessageLinkShare: Codable {
    var kind: String?  // "upscore", "clear", "score_snapshot", "chart_compare", "post", "live_session", "story"
    var title: String?
    var subtitle: String?
    var path: String?
    var songTitle: String?
    var mode: String?
    var level: Int?
    var score: Int?
    var grade: String?
    var plate: String?
    var oldScore: Int?
    var oldGrade: String?
    var playerName: String?
    var playerAvatar: String?
    var jacketUrl: String?
    var backgroundUrl: String?
    var perfect: Int?
    var great: Int?
    var good: Int?
    var bad: Int?
    var miss: Int?
    var replayEmbedUrl: String?
    var previewImage: String?
    var scoreDelta: Int?
    var playedAt: String?

    // Web app sends camelCase, API stores snake_case — accept both
    enum CodingKeys: String, CodingKey {
        case kind, title, subtitle, path, mode, level, score, grade, plate, perfect, great, good, bad, miss
        case songTitle, oldScore, oldGrade, playerName, playerAvatar, jacketUrl, backgroundUrl, replayEmbedUrl, previewImage, scoreDelta, playedAt
        // snake_case alternatives
        case song_title, old_score, old_grade, player_name, player_avatar, jacket_url, background_url, replay_embed_url, preview_image, score_delta, played_at
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = try c.decodeIfPresent(String.self, forKey: .kind)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        subtitle = try c.decodeIfPresent(String.self, forKey: .subtitle)
        path = try c.decodeIfPresent(String.self, forKey: .path)
        mode = try c.decodeIfPresent(String.self, forKey: .mode)
        level = try c.decodeIfPresent(Int.self, forKey: .level)
        score = try c.decodeIfPresent(Int.self, forKey: .score)
        grade = try c.decodeIfPresent(String.self, forKey: .grade)
        plate = try c.decodeIfPresent(String.self, forKey: .plate)
        perfect = try c.decodeIfPresent(Int.self, forKey: .perfect)
        great = try c.decodeIfPresent(Int.self, forKey: .great)
        good = try c.decodeIfPresent(Int.self, forKey: .good)
        bad = try c.decodeIfPresent(Int.self, forKey: .bad)
        miss = try c.decodeIfPresent(Int.self, forKey: .miss)
        // Try camelCase first, fall back to snake_case
        songTitle = try c.decodeIfPresent(String.self, forKey: .songTitle) ?? c.decodeIfPresent(String.self, forKey: .song_title)
        oldScore = try c.decodeIfPresent(Int.self, forKey: .oldScore) ?? c.decodeIfPresent(Int.self, forKey: .old_score)
        oldGrade = try c.decodeIfPresent(String.self, forKey: .oldGrade) ?? c.decodeIfPresent(String.self, forKey: .old_grade)
        playerName = try c.decodeIfPresent(String.self, forKey: .playerName) ?? c.decodeIfPresent(String.self, forKey: .player_name)
        playerAvatar = try c.decodeIfPresent(String.self, forKey: .playerAvatar) ?? c.decodeIfPresent(String.self, forKey: .player_avatar)
        jacketUrl = try c.decodeIfPresent(String.self, forKey: .jacketUrl) ?? c.decodeIfPresent(String.self, forKey: .jacket_url)
        backgroundUrl = try c.decodeIfPresent(String.self, forKey: .backgroundUrl) ?? c.decodeIfPresent(String.self, forKey: .background_url)
        replayEmbedUrl = try c.decodeIfPresent(String.self, forKey: .replayEmbedUrl) ?? c.decodeIfPresent(String.self, forKey: .replay_embed_url)
        previewImage = try c.decodeIfPresent(String.self, forKey: .previewImage) ?? c.decodeIfPresent(String.self, forKey: .preview_image)
        scoreDelta = try c.decodeIfPresent(Int.self, forKey: .scoreDelta) ?? c.decodeIfPresent(Int.self, forKey: .score_delta)
        playedAt = try c.decodeIfPresent(String.self, forKey: .playedAt) ?? c.decodeIfPresent(String.self, forKey: .played_at)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(kind, forKey: .kind)
        try c.encodeIfPresent(title, forKey: .title)
        try c.encodeIfPresent(subtitle, forKey: .subtitle)
        try c.encodeIfPresent(path, forKey: .path)
        try c.encodeIfPresent(songTitle, forKey: .songTitle)
        try c.encodeIfPresent(mode, forKey: .mode)
        try c.encodeIfPresent(level, forKey: .level)
        try c.encodeIfPresent(score, forKey: .score)
        try c.encodeIfPresent(grade, forKey: .grade)
        try c.encodeIfPresent(plate, forKey: .plate)
        try c.encodeIfPresent(oldScore, forKey: .oldScore)
        try c.encodeIfPresent(oldGrade, forKey: .oldGrade)
        try c.encodeIfPresent(playerName, forKey: .playerName)
        try c.encodeIfPresent(playerAvatar, forKey: .playerAvatar)
        try c.encodeIfPresent(jacketUrl, forKey: .jacketUrl)
        try c.encodeIfPresent(backgroundUrl, forKey: .backgroundUrl)
        try c.encodeIfPresent(perfect, forKey: .perfect)
        try c.encodeIfPresent(great, forKey: .great)
        try c.encodeIfPresent(good, forKey: .good)
        try c.encodeIfPresent(bad, forKey: .bad)
        try c.encodeIfPresent(miss, forKey: .miss)
        try c.encodeIfPresent(replayEmbedUrl, forKey: .replayEmbedUrl)
        try c.encodeIfPresent(previewImage, forKey: .previewImage)
        try c.encodeIfPresent(scoreDelta, forKey: .scoreDelta)
        try c.encodeIfPresent(playedAt, forKey: .playedAt)
    }
}

struct MessageChallengeCard: Codable {
    var kind: String?  // "beat_score", "clear_chart"
    var targetLabel: String?
    var subtitle: String?
    var statusKind: String?
    var statusLabel: String?
    var songTitle: String?
    var mode: String?
    var level: Int?
    var score: Int?

    enum CodingKeys: String, CodingKey {
        case kind, subtitle, mode, level, score
        case targetLabel = "target_label"
        case statusKind = "status_kind"
        case statusLabel = "status_label"
        case songTitle = "song_title"
    }
}

// MARK: - Squad

struct SquadCreateRequest: Encodable {
    let title: String
    var avatar: String?
    var members: [String]?
}

struct SquadInfo: Codable {
    var squad: SquadDetail?
    var conversation: Conversation?
    var members: [SquadMember]?
    var viewerMembership: SquadViewerMembership?

    enum CodingKeys: String, CodingKey {
        case squad, conversation, members
        case viewerMembership = "viewer_membership"
    }
}

struct SquadViewerMembership: Codable {
    var role: String?
    var notificationsEnabled: Bool?
    var notifyMentions: Bool?

    enum CodingKeys: String, CodingKey {
        case role
        case notificationsEnabled = "notifications_enabled"
        case notifyMentions = "notify_mentions"
    }
}

struct SquadDetail: Codable {
    var id: String?
    var title: String?
    var avatar: String?
    var members: [SquadMember]?
}

struct SquadMember: Codable, Identifiable {
    var id: String { userId ?? user?.id ?? UUID().uuidString }
    var userId: String?
    var role: String?
    var user: SquadMemberUser?

    // Convenience accessors
    var username: String? { user?.username }
    var avatar: String? { user?.avatar }

    enum CodingKeys: String, CodingKey {
        case role, user
        case userId = "user_id"
    }
}

struct SquadMemberUser: Codable {
    var id: String?
    var username: String?
    var avatar: String?
    var playingStatus: String?

    enum CodingKeys: String, CodingKey {
        case id, username, avatar
        case playingStatus = "playing_status"
    }
}

// MARK: - Stories

struct Story: Codable, Identifiable {
    let id: String
    var userId: String?
    var image: String?
    var viewCount: Int?
    var pumpCount: Int?
    var isPumped: Bool?
    var createdAt: String?
    var username: String?
    var avatar: String?

    enum CodingKeys: String, CodingKey {
        case id, image, username, avatar
        case userId = "user_id"
        case viewCount = "view_count"
        case pumpCount = "pump_count"
        case isPumped = "is_pumped"
        case createdAt = "created_at"
    }
}

struct HighlightsResponse: Codable {
    var me: HighlightCircle?
    var circles: [HighlightCircle]?
}

struct HighlightCircle: Codable, Identifiable {
    var id: String { user?.id ?? UUID().uuidString }
    var user: HighlightUser?
    var note: HighlightNote?
    var hasStory: Bool?
    var storyCount: Int?
    var isSelf: Bool?
    var lastActivityAt: String?

    // Convenience
    var userId: String? { user?.id }
    var username: String? { user?.username }
    var avatar: String? { user?.avatar }
    var hasUnviewed: Bool { hasStory ?? false }

    enum CodingKeys: String, CodingKey {
        case user, note
        case hasStory = "has_story"
        case storyCount = "story_count"
        case isSelf = "is_self"
        case lastActivityAt = "last_activity_at"
    }
}

struct HighlightUser: Codable {
    var id: String?
    var username: String?
    var avatar: String?
}

struct HighlightNote: Codable {
    var content: String?
    var kind: String?
    var createdAt: String?
    var updatedAt: String?

    /// Convenience: the API uses "content" but callers expect "text"
    var text: String? { content }

    enum CodingKeys: String, CodingKey {
        case content, kind
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// Legacy alias
typealias UserHighlight = HighlightCircle

struct UserStoryResponse: Codable {
    var stories: [StoryItem]?
    var user: StoryUser?
}

struct StoryUser: Codable {
    var id: String?
    var username: String?
    var avatar: String?
}

struct StoryItem: Codable, Identifiable {
    let id: String
    var type: String?  // "score_snapshot", "score_roundup", "text", "image", "post", "link"
    var snapshot: StorySnapshot?
    var text: String?
    var title: String?
    var subtitle: String?
    var caption: String?
    var backgroundGradient: String?
    var createdAt: String?
    var expiresAt: String?
    var viewCount: Int?
    var pumpCount: Int?
    var isPumped: Bool?
    var link: StoryLink?
    var source: StorySource?
    var scores: [StoryScoreEntry]?
    var totalCount: Int?
    var entryKind: String?
    var mediaUrl: String?
    var user: StoryUser?

    // Convenience
    var storyType: String? { type }

    enum CodingKeys: String, CodingKey {
        case id, type, snapshot, text, title, subtitle, caption, link, source, scores, user
        case backgroundGradient = "background_gradient"
        case createdAt = "created_at"
        case expiresAt = "expires_at"
        case viewCount = "view_count"
        case pumpCount = "pump_count"
        case isPumped = "is_pumped"
        case totalCount = "total_count"
        case entryKind = "entry_kind"
        case mediaUrl = "media_url"
    }
}

struct StorySource: Codable {
    var kind: String?  // "upscore", "clear", "post"
    var id: String?
}

struct StoryScoreEntry: Codable {
    var songTitle: String?
    var mode: String?
    var level: Int?
    var score: Int?
    var grade: String?
    var plate: String?
    var jacketUrl: String?
    var backgroundUrl: String?

    enum CodingKeys: String, CodingKey {
        case mode, level, score, grade, plate
        case songTitle = "song_title"
        case jacketUrl = "jacket_url"
        case backgroundUrl = "background_url"
    }
}

struct StorySnapshot: Codable {
    var songTitle: String?
    var mode: String?
    var level: Int?
    var score: Int?
    var grade: String?
    var plate: String?
    var jacketUrl: String?

    enum CodingKeys: String, CodingKey {
        case mode, level, score, grade, plate
        case songTitle = "song_title"
        case jacketUrl = "jacket_url"
    }
}

struct StoryLink: Codable {
    var path: String?
    var url: String?
    var label: String?
}
