import Foundation

@MainActor
class TournamentViewModel: ObservableObject {
    @Published var tournament: Tournament?
    @Published var players: [Player] = []
    @Published var matches: [Match] = []
    @Published var phases: [Phase] = []
    @Published var activeTab = "players"
    @Published var selectedRound = 1
    @Published var selectedPhase: Phase?
    @Published var isLoading = false
    @Published var errorMessage: String?

    let tournamentId: String

    init(tournamentId: String) {
        self.tournamentId = tournamentId
    }

    // MARK: - Phase-Aware Tabs

    var availableTabs: [String] {
        guard let t = tournament else { return ["players"] }

        // Phase-aware tournaments
        if t.hasPhases, let phase = selectedPhase ?? t.currentPhase {
            var tabs: [String] = []
            switch phase.format {
            case "round_robin":
                tabs = ["rounds", "standings"]
            case "pools":
                tabs = ["pools", "standings"]
            case "single_elim":
                tabs = ["bracket", "standings"]
            case "double_elim":
                tabs = ["bracket", "standings"]
            case "gauntlet":
                tabs = ["gauntlet", "standings"]
            case "hour_of_power", "b15":
                tabs = ["standings"]
            default:
                tabs = ["rounds", "standings"]
            }
            if phase.isActive || phase.isPending {
                tabs.append("seeding")
            }
            tabs.append("players")
            return tabs
        }

        // Legacy tournaments
        switch t.phase {
        case "SETUP": return ["players"]
        case "ROUND_ROBIN": return ["rounds", "standings", "players"]
        case "GAUNTLET": return ["gauntlet", "rounds", "standings", "players"]
        case "COMPLETED": return ["final", "rounds", "gauntlet", "standings", "players"]
        default: return ["players"]
        }
    }

    // MARK: - Load

    func load() async {
        isLoading = true
        async let t = APIService.shared.getTournament(tournamentId)
        async let p = APIService.shared.getPlayers(tournamentId)
        async let m = APIService.shared.getMatches(tournamentId)

        tournament = try? await t
        players = (try? await p) ?? []
        matches = (try? await m) ?? []

        // Load phases
        await loadPhases()

        // Auto-select current phase
        if selectedPhase == nil, let current = tournament?.currentPhase {
            selectedPhase = phases.first { $0.id == current.id }
        }

        if let tab = availableTabs.first, !availableTabs.contains(activeTab) {
            activeTab = tab
        }
        isLoading = false
    }

    // MARK: - Phase Management

    func loadPhases() async {
        do {
            phases = try await APIService.shared.getPhases(tournamentId)
            // Also update tournament phases
            tournament?.phases = phases
        } catch {
            // Phases may not exist for legacy tournaments
            phases = []
        }
    }

    func activatePhase(_ phaseId: String) async {
        do {
            let updated = try await APIService.shared.activatePhase(phaseId)
            if let idx = phases.firstIndex(where: { $0.id == phaseId }) {
                phases[idx] = updated
            }
            selectedPhase = updated
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func completePhase(_ phaseId: String) async {
        do {
            let updated = try await APIService.shared.completePhase(phaseId)
            if let idx = phases.firstIndex(where: { $0.id == phaseId }) {
                phases[idx] = updated
            }
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func generatePhaseMatches(_ phaseId: String) async {
        do {
            let newMatches = try await APIService.shared.generatePhaseMatches(phaseId)
            matches.append(contentsOf: newMatches)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Phase-Aware Match Filtering

    var matchesForSelectedPhase: [Match] {
        guard let phase = selectedPhase else { return matches }
        return matches.filter { $0.phaseId == phase.id }
    }

    var phasePlayersForSelected: [PhasePlayer] {
        selectedPhase?.players ?? []
    }

    var roundsForCurrentView: [Match] {
        let phaseMatches = selectedPhase != nil ? matchesForSelectedPhase : matches
        return phaseMatches.filter { $0.roundNumber == selectedRound }
    }

    var maxRound: Int {
        let phaseMatches = selectedPhase != nil ? matchesForSelectedPhase : matches
        return phaseMatches.map(\.roundNumber).max() ?? 1
    }

    // MARK: - Legacy Methods

    func generateRoundRobin() async {
        do {
            let newMatches = try await APIService.shared.generateRoundRobin(tournamentId)
            matches.append(contentsOf: newMatches)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func generateGauntlet() async {
        do {
            let newMatches = try await APIService.shared.generateGauntlet(tournamentId)
            matches.append(contentsOf: newMatches)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deletePlayer(_ id: String) async {
        do {
            try await APIService.shared.deletePlayer(id)
            players.removeAll { $0.id == id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
