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

    // Convenience accessors for views
    var senderId: String? { sender?.id }
    var senderUsername: String? { sender?.username }
    var senderAvatar: String? { sender?.avatar }

    enum CodingKeys: String, CodingKey {
        case id, sender, content
        case isOwn = "is_own"
        case messageType = "message_type"
        case createdAt = "created_at"
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
    let id: String
    var username: String?
    var avatar: String?
    var role: String?
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
    var highlights: [UserHighlight]?
}

struct UserHighlight: Codable, Identifiable {
    var id: String { userId ?? UUID().uuidString }
    var userId: String?
    var username: String?
    var avatar: String?
    var hasUnviewed: Bool?
    var storyCount: Int?

    enum CodingKeys: String, CodingKey {
        case username, avatar
        case userId = "user_id"
        case hasUnviewed = "has_unviewed"
        case storyCount = "story_count"
    }
}

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
    var storyType: String?
    var snapshot: StorySnapshot?
    var text: String?
    var backgroundGradient: String?
    var createdAt: String?
    var viewCount: Int?
    var pumpCount: Int?
    var isPumped: Bool?
    var link: StoryLink?

    enum CodingKeys: String, CodingKey {
        case id, snapshot, text, link
        case storyType = "story_type"
        case backgroundGradient = "background_gradient"
        case createdAt = "created_at"
        case viewCount = "view_count"
        case pumpCount = "pump_count"
        case isPumped = "is_pumped"
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
