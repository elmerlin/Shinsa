import Foundation

struct Invitation: Codable, Identifiable {
    let id: String
    var userId: String
    var type: String
    var tournamentId: String?
    var duelId: String?
    var playerSlot: String?
    var status: String
    var createdAt: String?

    // Joined fields
    var tournamentName: String?
    var duelName: String?

    enum CodingKeys: String, CodingKey {
        case id, type, status
        case userId = "user_id"
        case tournamentId = "tournament_id"
        case duelId = "duel_id"
        case playerSlot = "player_slot"
        case createdAt = "created_at"
        case tournamentName = "tournament_name"
        case duelName = "duel_name"
    }
}
