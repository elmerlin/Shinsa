import Foundation

struct Community: Codable, Identifiable {
    let id: String
    var name: String
    var displayName: String?
    var description: String?
    var avatar: String?
    var banner: String?
    var isPrivate: Int?
    var memberCount: Int?
    var postCount: Int?
    var createdBy: String?
    var createdAt: String?
    var isMember: Bool?
    var isAdmin: Bool?
    var tags: String?

    enum CodingKeys: String, CodingKey {
        case id, name, description, avatar, banner, tags
        case displayName = "display_name"
        case isPrivate = "is_private"
        case memberCount = "member_count"
        case postCount = "post_count"
        case createdBy = "created_by"
        case createdAt = "created_at"
        case isMember = "is_member"
        case isAdmin = "is_admin"
    }
}

struct CommunityPost: Codable, Identifiable {
    let id: Int
    var communityId: String?
    var userId: String?
    var content: String?
    var images: String?
    var isPinned: Int?
    var pumpCount: Int?
    var commentCount: Int?
    var isPumped: Bool?
    var createdAt: String?
    var username: String?
    var avatar: String?

    var imageUrls: [String] {
        guard let imgs = images, !imgs.isEmpty else { return [] }
        return (try? JSONDecoder().decode([String].self, from: Data(imgs.utf8))) ?? imgs.components(separatedBy: ",")
    }

    enum CodingKeys: String, CodingKey {
        case id, content, images, username, avatar
        case communityId = "community_id"
        case userId = "user_id"
        case isPinned = "is_pinned"
        case pumpCount = "pump_count"
        case commentCount = "comment_count"
        case isPumped = "is_pumped"
        case createdAt = "created_at"
    }
}

struct CommunityMember: Codable, Identifiable {
    let id: String
    var userId: String?
    var username: String?
    var avatar: String?
    var role: String?
    var joinedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, username, avatar, role
        case userId = "user_id"
        case joinedAt = "joined_at"
    }
}
