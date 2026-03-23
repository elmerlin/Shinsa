import Foundation

struct Duel: Codable, Identifiable {
    let id: String
    var name: String?
    var player1Name: String?
    var player2Name: String?
    var player1Avatar: String?
    var player2Avatar: String?
    var player1SkillTitle: String?
    var player2SkillTitle: String?
    var player1SkillLevel: Int?
    var player2SkillLevel: Int?
    var player1Gender: String?
    var player2Gender: String?
    var player1Nationality: String?
    var player2Nationality: String?
    var player1UserId: String?
    var player2UserId: String?
    var winnerId: String?
    var status: String?
    var mode: String?
    var date: String?
    var location: String?
    var createdBy: String?
    var createdAt: String?
    var songs: [DuelSongEntry]?

    enum CodingKeys: String, CodingKey {
        case id, name, status, mode, date, location, songs
        case player1Name = "player1_name"
        case player2Name = "player2_name"
        case player1Avatar = "player1_avatar"
        case player2Avatar = "player2_avatar"
        case player1SkillTitle = "player1_skill_title"
        case player2SkillTitle = "player2_skill_title"
        case player1SkillLevel = "player1_skill_level"
        case player2SkillLevel = "player2_skill_level"
        case player1Gender = "player1_gender"
        case player2Gender = "player2_gender"
        case player1Nationality = "player1_nationality"
        case player2Nationality = "player2_nationality"
        case player1UserId = "player1_user_id"
        case player2UserId = "player2_user_id"
        case winnerId = "winner_id"
        case createdBy = "created_by"
        case createdAt = "created_at"
    }
}

struct DuelSongEntry: Codable, Identifiable {
    let id: String
    var duelId: String?
    var songId: Int?
    var title: String?
    var artist: String?
    var mode: String?
    var level: Int?
    var jacketUrl: String?
    var player1Score: Int?
    var player2Score: Int?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, title, artist, mode, level
        case duelId = "duel_id"
        case songId = "song_id"
        case jacketUrl = "jacket_url"
        case player1Score = "player1_score"
        case player2Score = "player2_score"
        case createdAt = "created_at"
    }
}
