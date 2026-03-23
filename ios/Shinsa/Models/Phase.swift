import Foundation

struct Phase: Codable, Identifiable {
    let id: String
    var tournamentId: String
    var phaseOrder: Int
    var format: String
    var name: String?
    var config: PhaseConfig?
    var advancement: PhaseAdvancement?
    var status: String
    var createdAt: String?

    // Populated from API
    var players: [PhasePlayer]?

    var isActive: Bool { status == "ACTIVE" }
    var isCompleted: Bool { status == "COMPLETED" }
    var isPending: Bool { status == "PENDING" }

    var formatLabel: String {
        switch format {
        case "round_robin": return "Round Robin"
        case "pools": return "Pools"
        case "single_elim": return "Single Elimination"
        case "double_elim": return "Double Elimination"
        case "gauntlet": return "Gauntlet"
        case "hour_of_power": return "Hour of Power"
        case "b15": return "Best 15"
        default: return format.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    var formatIcon: String {
        switch format {
        case "round_robin": return "arrow.triangle.2.circlepath"
        case "pools": return "rectangle.split.2x2"
        case "single_elim": return "trophy"
        case "double_elim": return "trophy.fill"
        case "gauntlet": return "flame"
        case "hour_of_power": return "clock"
        case "b15": return "star.fill"
        default: return "questionmark"
        }
    }

    enum CodingKeys: String, CodingKey {
        case id, format, name, config, advancement, status, players
        case tournamentId = "tournament_id"
        case phaseOrder = "phase_order"
        case createdAt = "created_at"
    }
}

struct PhaseConfig: Codable {
    // Round Robin
    var rounds: Int?
    var roundLevels: [RoundLevel]?
    var cardsPerDraw: Int?
    var vetoesPerPlayer: Int?
    var bestOf: Int?

    // Pools
    var poolCount: Int?
    var roundsPerPool: Int?

    // Shared difficulty
    var difficultyMin: Int?
    var difficultyMax: Int?

    // Gauntlet
    var startSingleLevel: Int?
    var finalSingleLevel: Int?

    // Single/Double Elim
    var thirdPlaceMatch: Bool?
    var grandFinalReset: Bool?

    // Hour of Power / B15
    var durationMinutes: Int?

    // Legacy gauntlet
    var gauntletEnabled: Bool?
    var gauntletStartSingleLevel: Int?
    var gauntletFinalSingleLevel: Int?

    enum CodingKeys: String, CodingKey {
        case rounds
        case roundLevels = "round_levels"
        case cardsPerDraw = "cards_per_draw"
        case vetoesPerPlayer = "vetoes_per_player"
        case bestOf = "best_of"
        case poolCount = "pool_count"
        case roundsPerPool = "rounds_per_pool"
        case difficultyMin = "difficulty_min"
        case difficultyMax = "difficulty_max"
        case startSingleLevel = "start_single_level"
        case finalSingleLevel = "final_single_level"
        case thirdPlaceMatch = "third_place_match"
        case grandFinalReset = "grand_final_reset"
        case durationMinutes = "duration_minutes"
        case gauntletEnabled = "gauntlet_enabled"
        case gauntletStartSingleLevel = "gauntlet_start_single_level"
        case gauntletFinalSingleLevel = "gauntlet_final_single_level"
    }
}

struct PhaseAdvancement: Codable {
    var type: String  // "all", "top_n", "per_pool_top_n", "threshold"
    var count: Int?
    var points: Int?
}

struct PhasePlayer: Codable, Identifiable {
    let id: String
    var phaseId: String
    var playerId: String
    var seed: Int
    var poolId: Int?
    var wins: Int
    var losses: Int
    var points: Int
    var buchholz: Double
    var status: String

    // Populated player details
    var name: String?
    var avatar: String?
    var pumbility: Int?
    var skillTitle: String?
    var skillLevel: Int?
    var gender: String?
    var nationality: String?

    var isEliminated: Bool { status == "eliminated" }

    enum CodingKeys: String, CodingKey {
        case id, seed, wins, losses, points, buchholz, status
        case name, avatar, pumbility, gender, nationality
        case phaseId = "phase_id"
        case playerId = "player_id"
        case poolId = "pool_id"
        case skillTitle = "skill_title"
        case skillLevel = "skill_level"
    }
}

struct CreatePhaseRequest: Encodable {
    let tournamentId: String
    let phaseOrder: Int
    let format: String
    var name: String?
    var config: PhaseConfig?
    var advancement: PhaseAdvancement?

    enum CodingKeys: String, CodingKey {
        case format, name, config, advancement
        case tournamentId = "tournament_id"
        case phaseOrder = "phase_order"
    }
}

// MARK: - Tournament Format Definitions

enum TournamentFormat: String, CaseIterable {
    case roundRobin = "round_robin"
    case pools = "pools"
    case singleElim = "single_elim"
    case doubleElim = "double_elim"
    case gauntlet = "gauntlet"
    case hourOfPower = "hour_of_power"
    case b15 = "b15"

    var label: String {
        switch self {
        case .roundRobin: return "Round Robin"
        case .pools: return "Pools"
        case .singleElim: return "Single Elimination"
        case .doubleElim: return "Double Elimination"
        case .gauntlet: return "Gauntlet"
        case .hourOfPower: return "Hour of Power"
        case .b15: return "Best 15"
        }
    }

    var description: String {
        switch self {
        case .roundRobin: return "Every player plays every other player"
        case .pools: return "Players split into groups, round robin within each"
        case .singleElim: return "Single elimination bracket knockout"
        case .doubleElim: return "Double elimination with winners and losers brackets"
        case .gauntlet: return "King of the Hill - bottom ranks fight upward"
        case .hourOfPower: return "60-minute timed endurance, cumulative rating"
        case .b15: return "Best 15 scores in a time window"
        }
    }

    var icon: String {
        switch self {
        case .roundRobin: return "arrow.triangle.2.circlepath"
        case .pools: return "rectangle.split.2x2"
        case .singleElim: return "trophy"
        case .doubleElim: return "trophy.fill"
        case .gauntlet: return "flame"
        case .hourOfPower: return "clock"
        case .b15: return "star.fill"
        }
    }

    var defaultConfig: PhaseConfig {
        switch self {
        case .roundRobin:
            return PhaseConfig(rounds: 3, roundLevels: [
                RoundLevel(round: 1, min: 18, max: 19),
                RoundLevel(round: 2, min: 20, max: 21),
                RoundLevel(round: 3, min: 22, max: 23),
            ], cardsPerDraw: 5, vetoesPerPlayer: 1, bestOf: 3)
        case .pools:
            return PhaseConfig(cardsPerDraw: 5, vetoesPerPlayer: 1, bestOf: 3, poolCount: 4, roundsPerPool: 1, difficultyMin: 18, difficultyMax: 23)
        case .singleElim:
            return PhaseConfig(cardsPerDraw: 5, vetoesPerPlayer: 1, bestOf: 3, difficultyMin: 18, difficultyMax: 23, thirdPlaceMatch: true)
        case .doubleElim:
            return PhaseConfig(cardsPerDraw: 5, vetoesPerPlayer: 1, bestOf: 3, difficultyMin: 18, difficultyMax: 23, grandFinalReset: true)
        case .gauntlet:
            return PhaseConfig(startSingleLevel: 19, finalSingleLevel: 24)
        case .hourOfPower:
            return PhaseConfig(difficultyMin: 18, difficultyMax: 23, durationMinutes: 60)
        case .b15:
            return PhaseConfig(difficultyMin: 18, difficultyMax: 23, durationMinutes: 60)
        }
    }

    var defaultAdvancement: PhaseAdvancement {
        switch self {
        case .pools: return PhaseAdvancement(type: "per_pool_top_n", count: 2)
        case .roundRobin: return PhaseAdvancement(type: "top_n", count: 8)
        default: return PhaseAdvancement(type: "all")
        }
    }
}

// MARK: - Tournament Presets

struct TournamentPreset {
    let name: String
    let description: String
    let icon: String
    let phases: [(TournamentFormat, PhaseConfig?, PhaseAdvancement?)]

    static let presets: [TournamentPreset] = [
        TournamentPreset(
            name: "Round Robin Only",
            description: "3 rounds, Lv18-23, best-of-3",
            icon: "arrow.triangle.2.circlepath",
            phases: [(.roundRobin, nil, nil)]
        ),
        TournamentPreset(
            name: "Pools → Top 8 Bracket",
            description: "4 pools, top 2 per pool → single elimination",
            icon: "rectangle.split.2x2",
            phases: [
                (.pools, PhaseConfig(cardsPerDraw: 5, vetoesPerPlayer: 1, bestOf: 3, poolCount: 4, roundsPerPool: 1, difficultyMin: 18, difficultyMax: 23), PhaseAdvancement(type: "per_pool_top_n", count: 2)),
                (.singleElim, PhaseConfig(cardsPerDraw: 5, vetoesPerPlayer: 1, bestOf: 3, difficultyMin: 20, difficultyMax: 24), nil),
            ]
        ),
        TournamentPreset(
            name: "Swiss → Gauntlet",
            description: "3 seeding rounds → gauntlet progression",
            icon: "flame",
            phases: [
                (.roundRobin, nil, PhaseAdvancement(type: "all")),
                (.gauntlet, PhaseConfig(startSingleLevel: 19, finalSingleLevel: 24), nil),
            ]
        ),
        TournamentPreset(
            name: "Double Elimination",
            description: "Full double-elim bracket",
            icon: "trophy.fill",
            phases: [(.doubleElim, nil, nil)]
        ),
        TournamentPreset(
            name: "Round Robin → Hour of Power",
            description: "2 seeding rounds → 60min endurance",
            icon: "clock",
            phases: [
                (.roundRobin, PhaseConfig(rounds: 2, roundLevels: [
                    RoundLevel(round: 1, min: 18, max: 19),
                    RoundLevel(round: 2, min: 20, max: 21),
                ], cardsPerDraw: 5, vetoesPerPlayer: 1, bestOf: 3), PhaseAdvancement(type: "all")),
                (.hourOfPower, PhaseConfig(difficultyMin: 18, difficultyMax: 23, durationMinutes: 60), nil),
            ]
        ),
        TournamentPreset(
            name: "Pools → Double Elimination",
            description: "4 pools → double-elim top 8",
            icon: "rectangle.split.2x2",
            phases: [
                (.pools, PhaseConfig(cardsPerDraw: 5, vetoesPerPlayer: 1, bestOf: 3, poolCount: 4, roundsPerPool: 1, difficultyMin: 18, difficultyMax: 23), PhaseAdvancement(type: "per_pool_top_n", count: 2)),
                (.doubleElim, PhaseConfig(cardsPerDraw: 5, vetoesPerPlayer: 1, bestOf: 3, difficultyMin: 20, difficultyMax: 24, grandFinalReset: true), nil),
            ]
        ),
    ]
}
