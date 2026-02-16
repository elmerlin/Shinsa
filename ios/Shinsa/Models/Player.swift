import Foundation

struct Player: Codable, Identifiable {
    let id: String
    var tournamentId: String
    var name: String
    var skillTitle: String?
    var skillLevel: Int
    var pumbility: Int
    var description: String?
    var avatar: String?
    var gender: String?
    var nationality: String?
    var userId: String?
    var wins: Int
    var losses: Int
    var points: Int
    var buchholz: Double
    var seedRank: Int
    var isActive: Int
    var createdAt: String?

    var isPlayerActive: Bool { isActive != 0 }

    enum CodingKeys: String, CodingKey {
        case id, name, pumbility, description, avatar, gender, nationality, wins, losses, points, buchholz
        case tournamentId = "tournament_id"
        case skillTitle = "skill_title"
        case skillLevel = "skill_level"
        case userId = "user_id"
        case seedRank = "seed_rank"
        case isActive = "is_active"
        case createdAt = "created_at"
    }
}

struct CreatePlayerRequest: Encodable {
    let tournamentId: String
    let name: String
    let pumbility: Int
    let avatar: String
    let skillTitle: String
    let skillLevel: Int
    let gender: String
    let nationality: String
    let description: String
    let userId: String?

    enum CodingKeys: String, CodingKey {
        case name, pumbility, description, avatar, gender, nationality
        case tournamentId = "tournament_id"
        case skillTitle = "skill_title"
        case skillLevel = "skill_level"
        case userId = "user_id"
    }
}
