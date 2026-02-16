import Foundation

struct ChatMessage: Codable, Identifiable {
    let id: String
    var duelId: String?
    var userId: String?
    var username: String
    var message: String
    var isSystem: Int?
    var isParticipant: Int?
    var createdAt: String?

    var isSystemMessage: Bool { isSystem != nil && isSystem != 0 }
    var isParticipantMessage: Bool { isParticipant != nil && isParticipant != 0 }

    enum CodingKeys: String, CodingKey {
        case id, username, message
        case duelId = "duel_id"
        case userId = "user_id"
        case isSystem = "is_system"
        case isParticipant = "is_participant"
        case createdAt = "created_at"
    }
}
