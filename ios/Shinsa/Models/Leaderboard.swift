import Foundation

struct LeaderboardEntry: Codable, Identifiable {
    var id: String { odUserId ?? UUID().uuidString }
    var odUserId: String?
    var username: String?
    var avatar: String?
    var pumbility: Double?
    var rank: Int?
    var nationality: String?
    var skillTitle: String?

    enum CodingKeys: String, CodingKey {
        case username, avatar, pumbility, rank, nationality
        case odUserId = "user_id"
        case skillTitle = "skill_title"
    }
}
