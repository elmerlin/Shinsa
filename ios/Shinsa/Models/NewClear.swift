import Foundation

struct NewClear: Codable, Identifiable {
    let id: Int
    var userId: String?
    var songTitle: String
    var mode: String
    var level: Int
    var score: Int
    var grade: String?
    var plate: String?
    var backgroundUrl: String?
    var pumpCount: Int?
    var commentCount: Int?
    var userPumped: BoolOrInt?
    var username: String?
    var avatar: String?
    var nationality: String?
    var createdAt: String?

    var isPumped: Bool { userPumped?.boolValue ?? false }

    enum CodingKeys: String, CodingKey {
        case id, mode, level, score, grade, plate, username, avatar, nationality
        case userId = "user_id"
        case songTitle = "song_title"
        case backgroundUrl = "background_url"
        case pumpCount = "pump_count"
        case commentCount = "comment_count"
        case userPumped = "user_pumped"
        case createdAt = "created_at"
    }
}
