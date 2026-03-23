import Foundation

struct Tournament: Codable, Identifiable {
    let id: String
    var name: String
    var location: String?
    var date: String?
    var phase: String
    var currentRound: Int
    var totalRounds: Int
    var config: TournamentConfig
    var avatar: String?
    var archived: Int
    var currentPhaseId: String?
    var createdAt: String?

    // Phase-aware tournaments
    var phases: [Phase]?

    var isArchived: Bool { archived != 0 }
    var hasPhases: Bool { phases != nil && !(phases?.isEmpty ?? true) }

    var activePhase: Phase? {
        phases?.first { $0.status == "ACTIVE" }
    }

    var currentPhase: Phase? {
        if let cpId = currentPhaseId {
            return phases?.first { $0.id == cpId }
        }
        return activePhase ?? phases?.last
    }

    var nextPendingPhase: Phase? {
        phases?.first { $0.status == "PENDING" }
    }

    enum CodingKeys: String, CodingKey {
        case id, name, location, date, phase, config, avatar, archived, phases
        case currentRound = "current_round"
        case totalRounds = "total_rounds"
        case currentPhaseId = "current_phase_id"
        case createdAt = "created_at"
    }
}

struct TournamentConfig: Codable {
    var roundLevels: [RoundLevel]?
    var cardsPerDraw: Int?
    var vetoesPerPlayer: Int?
    var bestOf: Int?
    var gauntletEnabled: Bool?
    var gauntletStartSingleLevel: Int?
    var gauntletFinalSingleLevel: Int?

    enum CodingKeys: String, CodingKey {
        case roundLevels = "round_levels"
        case cardsPerDraw = "cards_per_draw"
        case vetoesPerPlayer = "vetoes_per_player"
        case bestOf = "best_of"
        case gauntletEnabled = "gauntlet_enabled"
        case gauntletStartSingleLevel = "gauntlet_start_single_level"
        case gauntletFinalSingleLevel = "gauntlet_final_single_level"
    }
}

struct RoundLevel: Codable {
    var round: Int
    var min: Int
    var max: Int
}

struct CreateTournamentRequest: Encodable {
    let name: String
    let location: String
    let date: String
    let totalRounds: Int
    let config: TournamentConfig
    let avatar: String?

    enum CodingKeys: String, CodingKey {
        case name, location, date, config, avatar
        case totalRounds = "total_rounds"
    }
}
