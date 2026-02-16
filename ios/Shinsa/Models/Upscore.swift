import Foundation

struct Upscore: Codable, Identifiable {
    let id: Int
    var userId: String?
    var upscoresJson: String?
    var pumpCount: Int?
    var commentCount: Int?
    var userPumped: BoolOrInt?
    var username: String?
    var avatar: String?
    var nationality: String?
    var createdAt: String?

    var isPumped: Bool { userPumped?.boolValue ?? false }

    var upgrades: [UpscoreEntry] {
        guard let json = upscoresJson, !json.isEmpty else { return [] }
        guard let data = json.data(using: .utf8),
              let entries = try? JSONDecoder().decode([UpscoreEntry].self, from: data) else { return [] }
        return entries
    }

    enum CodingKeys: String, CodingKey {
        case id, username, avatar, nationality
        case userId = "user_id"
        case upscoresJson = "upscores_json"
        case pumpCount = "pump_count"
        case commentCount = "comment_count"
        case userPumped = "user_pumped"
        case createdAt = "created_at"
    }
}

struct UpscoreEntry: Codable {
    var songTitle: String?
    var mode: String?
    var level: Int?
    var oldScore: Int?
    var newScore: Int?
    var grade: String?

    enum CodingKeys: String, CodingKey {
        case mode, level, grade
        case songTitle = "song_title"
        case oldScore = "old_score"
        case newScore = "new_score"
    }
}
