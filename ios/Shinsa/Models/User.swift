import Foundation

struct User: Codable, Identifiable {
    let id: String
    var username: String
    var email: String?
    var avatar: String?
    var pumbility: Int?
    var skillTitle: String?
    var skillLevel: Int?
    var gender: String?
    var nationality: String?
    var dateOfBirth: String?
    var showAge: Int?
    var description: String?
    var createdAt: String?

    // Social counts (returned from profile endpoint)
    var followerCount: Int?
    var followingCount: Int?
    var postCount: Int?
    var locationCountry: String?
    var locationCity: String?
    var groupBadges: [GroupBadge]?
    var achievementBadges: [AchievementBadge]?

    var shouldShowAge: Bool { showAge != nil && showAge != 0 }

    enum CodingKeys: String, CodingKey {
        case id, username, email, avatar, pumbility, gender, nationality, description
        case skillTitle = "skill_title"
        case skillLevel = "skill_level"
        case dateOfBirth = "date_of_birth"
        case showAge = "show_age"
        case createdAt = "created_at"
        case followerCount = "follower_count"
        case followingCount = "following_count"
        case postCount = "post_count"
        case locationCountry = "location_country"
        case locationCity = "location_city"
        case groupBadges = "group_badges"
        case achievementBadges = "achievement_badges"
    }
}

struct GroupBadge: Codable, Identifiable {
    let id: String
    var groupId: String?
    var name: String?
    var description: String?
    var image: String?
    enum CodingKeys: String, CodingKey {
        case id, name, description, image
        case groupId = "group_id"
    }
}

struct AchievementBadge: Codable, Identifiable {
    var id: String { tierId ?? UUID().uuidString }
    var tierId: String?
    var seriesId: String?
    var seriesKey: String?
    var seriesName: String?
    var name: String?
    var description: String?
    var image: String?  // base64 image data
    var threshold: Int?
    var currentValue: Int?
    var awardedAt: String?
    var nextTier: AchievementNextTier?

    enum CodingKeys: String, CodingKey {
        case name, description, image, threshold
        case tierId = "tier_id"
        case seriesId = "series_id"
        case seriesKey = "series_key"
        case seriesName = "series_name"
        case currentValue = "current_value"
        case awardedAt = "awarded_at"
        case nextTier = "next_tier"
    }
}

struct AchievementNextTier: Codable {
    var tierId: String?
    var name: String?
    var image: String?
    var threshold: Int?
    enum CodingKeys: String, CodingKey {
        case name, image, threshold
        case tierId = "tier_id"
    }
}

struct HeatmapDay: Identifiable {
    var id: String { key }
    let key: String // "YYYY-MM-DD"
    var plays: Int
    var singlesAvgLevel: Double
    var doublesAvgLevel: Double
    var doubleRatio: Double
}

struct AuthResponse: Codable {
    let token: String
    let user: User
}

struct UserStats: Codable {
    var tournaments: [UserTournamentStat]?
    var duels: [UserDuelStat]?
    var onlineDuels: [UserOnlineDuelStat]?

    enum CodingKeys: String, CodingKey {
        case tournaments, duels
        case onlineDuels = "online_duels"
    }
}

struct UserTournamentStat: Codable, Identifiable {
    let id: String
    var tournamentName: String?
    var tournamentDate: String?
    var wins: Int?
    var losses: Int?
    var phase: String?

    enum CodingKeys: String, CodingKey {
        case id, wins, losses, phase
        case tournamentName = "tournament_name"
        case tournamentDate = "tournament_date"
    }
}

struct UserDuelStat: Codable, Identifiable {
    let id: String
    var name: String?
    var date: String?
    var player1Name: String?
    var player2Name: String?
    var winner: String?

    enum CodingKeys: String, CodingKey {
        case id, name, date, winner
        case player1Name = "player1_name"
        case player2Name = "player2_name"
    }
}

struct UserOnlineDuelStat: Codable, Identifiable {
    let id: String
    var name: String?
    var date: String?
    var opponentUsername: String?
    var winner: String?

    enum CodingKeys: String, CodingKey {
        case id, name, date, winner
        case opponentUsername = "opponent_username"
    }
}

struct FollowStatus: Codable {
    var isFollowing: Bool
    var followersCount: Int
    var followingCount: Int

    enum CodingKeys: String, CodingKey {
        case isFollowing = "is_following"
        case followersCount = "followers_count"
        case followingCount = "following_count"
    }
}

struct SocialCounts: Codable {
    var followersCount: Int?
    var followingCount: Int?
    var postsCount: Int?
    var pumpsReceived: Int?
    var followerTrend: Int?

    enum CodingKeys: String, CodingKey {
        case followersCount = "followers_count"
        case followingCount = "following_count"
        case postsCount = "posts_count"
        case pumpsReceived = "pumps_received"
        case followerTrend = "follower_trend"
    }
}
