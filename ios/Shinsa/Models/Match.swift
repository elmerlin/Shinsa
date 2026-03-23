import Foundation

struct Match: Codable, Identifiable {
    let id: String
    var tournamentId: String
    var phaseId: String?
    var roundNumber: Int
    var player1Id: String?
    var player2Id: String?
    var winnerId: String?
    var difficultyMin: Int?
    var difficultyMax: Int?
    var isBye: Int
    var status: String
    var drawnSongs: [Song]?
    var vetoedSongs: [VetoedSong]?
    var playedSongs: [PlayedSong]?
    var scores: MatchScores?
    var matchType: String?
    var gauntletOrder: Int?
    var bracket: String?          // "winners", "losers", "grand_final"
    var bracketRound: Int?
    var bracketPosition: Int?
    var poolId: Int?
    var createdAt: String?

    // Populated when fetching single match
    var player1: Player?
    var player2: Player?

    var isByeMatch: Bool { isBye != 0 }
    var isGauntlet: Bool { matchType == "gauntlet" }
    var isGrandFinal: Bool { bracket == "grand_final" }
    var isWinnersBracket: Bool { bracket == "winners" }
    var isLosersBracket: Bool { bracket == "losers" }

    enum CodingKeys: String, CodingKey {
        case id, status, scores, player1, player2, bracket
        case tournamentId = "tournament_id"
        case phaseId = "phase_id"
        case roundNumber = "round_number"
        case player1Id = "player1_id"
        case player2Id = "player2_id"
        case winnerId = "winner_id"
        case difficultyMin = "difficulty_min"
        case difficultyMax = "difficulty_max"
        case isBye = "is_bye"
        case drawnSongs = "drawn_songs"
        case vetoedSongs = "vetoed_songs"
        case playedSongs = "played_songs"
        case matchType = "match_type"
        case gauntletOrder = "gauntlet_order"
        case bracketRound = "bracket_round"
        case bracketPosition = "bracket_position"
        case poolId = "pool_id"
        case createdAt = "created_at"
    }
}

struct VetoedSong: Codable {
    var songId: Int?
    var playerId: String?
    var song: Song?

    enum CodingKeys: String, CodingKey {
        case song
        case songId = "song_id"
        case playerId = "player_id"
    }
}

struct PlayedSong: Codable {
    var songId: Int?
    var song: Song?
    var p1Score: Int?
    var p2Score: Int?
    var songWinnerId: String?
    var title: String?
    var mode: String?
    var level: Int?

    enum CodingKeys: String, CodingKey {
        case song, title, mode, level
        case songId = "song_id"
        case p1Score = "p1_score"
        case p2Score = "p2_score"
        case songWinnerId = "song_winner_id"
    }
}

struct MatchScores: Codable {
    var player1Wins: Int?
    var player2Wins: Int?
    var p1Total: Int?
    var p2Total: Int?

    enum CodingKeys: String, CodingKey {
        case player1Wins = "player1_wins"
        case player2Wins = "player2_wins"
        case p1Total = "p1_total"
        case p2Total = "p2_total"
    }
}

struct VetoRequest: Encodable {
    let songId: Int
    let playerId: String

    enum CodingKeys: String, CodingKey {
        case songId = "song_id"
        case playerId = "player_id"
    }
}

struct SubmitResultRequest: Encodable {
    let winnerId: String
    let playedSongs: [PlayedSongResult]
    let scores: MatchScores

    enum CodingKeys: String, CodingKey {
        case winnerId = "winner_id"
        case playedSongs = "played_songs"
        case scores
    }
}

struct PlayedSongResult: Encodable {
    let songId: Int?
    let title: String
    let mode: String
    let level: Int
    let p1Score: Int
    let p2Score: Int

    enum CodingKeys: String, CodingKey {
        case title, mode, level
        case songId = "song_id"
        case p1Score = "p1_score"
        case p2Score = "p2_score"
    }
}
