import Foundation

struct OnlineDuel: Codable, Identifiable {
    let id: String
    var name: String
    var location: String?
    var date: String?
    var time: String?
    var mode: String?
    var creatorUserId: String
    var opponentUserId: String?
    var status: String
    var currentTurn: String?
    var player1EndRequested: Int?
    var player2EndRequested: Int?
    var winner: String?
    var createdAt: String?

    // Joined fields
    var creatorUsername: String?
    var creatorAvatar: String?
    var creatorSkillTitle: String?
    var creatorSkillLevel: Int?
    var creatorNationality: String?
    var opponentUsername: String?
    var opponentAvatar: String?
    var opponentSkillTitle: String?
    var opponentSkillLevel: Int?
    var opponentNationality: String?
    var songs: [OnlineDuelSong]?
    var player1PumpCount: Int?
    var player2PumpCount: Int?

    enum CodingKeys: String, CodingKey {
        case id, name, location, date, time, mode, status, winner, songs
        case creatorUserId = "creator_user_id"
        case opponentUserId = "opponent_user_id"
        case currentTurn = "current_turn"
        case player1EndRequested = "player1_end_requested"
        case player2EndRequested = "player2_end_requested"
        case createdAt = "created_at"
        case creatorUsername = "creator_username"
        case creatorAvatar = "creator_avatar"
        case creatorSkillTitle = "creator_skill_title"
        case creatorSkillLevel = "creator_skill_level"
        case creatorNationality = "creator_nationality"
        case opponentUsername = "opponent_username"
        case opponentAvatar = "opponent_avatar"
        case opponentSkillTitle = "opponent_skill_title"
        case opponentSkillLevel = "opponent_skill_level"
        case opponentNationality = "opponent_nationality"
        case player1PumpCount = "player1_pump_count"
        case player2PumpCount = "player2_pump_count"
    }
}

struct OnlineDuelSong: Codable, Identifiable {
    let id: String
    var duelId: String?
    var songId: Int?
    var songTitle: String?
    var songArtist: String?
    var songMode: String?
    var songLevel: Int?
    var songJacketUrl: String?
    var songBpm: String?
    var chosenBy: String?
    var player1Accepted: Int?
    var player2Accepted: Int?
    var player1Declined: Int?
    var player2Declined: Int?
    var player1Score: Int?
    var player2Score: Int?
    var player1Perfect: Int?
    var player1Great: Int?
    var player1Good: Int?
    var player1Bad: Int?
    var player1Miss: Int?
    var player1MaxCombo: Int?
    var player1Kcal: Double?
    var player2Perfect: Int?
    var player2Great: Int?
    var player2Good: Int?
    var player2Bad: Int?
    var player2Miss: Int?
    var player2MaxCombo: Int?
    var player2Kcal: Double?
    var player1Submitted: Int?
    var player2Submitted: Int?
    var winner: String?
    var status: String?
    var playedOrder: Int?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, winner, status
        case duelId = "duel_id"
        case songId = "song_id"
        case songTitle = "song_title"
        case songArtist = "song_artist"
        case songMode = "song_mode"
        case songLevel = "song_level"
        case songJacketUrl = "song_jacket_url"
        case songBpm = "song_bpm"
        case chosenBy = "chosen_by"
        case player1Accepted = "player1_accepted"
        case player2Accepted = "player2_accepted"
        case player1Declined = "player1_declined"
        case player2Declined = "player2_declined"
        case player1Score = "player1_score"
        case player2Score = "player2_score"
        case player1Perfect = "player1_perfect"
        case player1Great = "player1_great"
        case player1Good = "player1_good"
        case player1Bad = "player1_bad"
        case player1Miss = "player1_miss"
        case player1MaxCombo = "player1_max_combo"
        case player1Kcal = "player1_kcal"
        case player2Perfect = "player2_perfect"
        case player2Great = "player2_great"
        case player2Good = "player2_good"
        case player2Bad = "player2_bad"
        case player2Miss = "player2_miss"
        case player2MaxCombo = "player2_max_combo"
        case player2Kcal = "player2_kcal"
        case player1Submitted = "player1_submitted"
        case player2Submitted = "player2_submitted"
        case playedOrder = "played_order"
        case createdAt = "created_at"
    }
}
