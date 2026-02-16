import Foundation

@MainActor
class TournamentViewModel: ObservableObject {
    @Published var tournament: Tournament?
    @Published var players: [Player] = []
    @Published var matches: [Match] = []
    @Published var activeTab = "players"
    @Published var selectedRound = 1
    @Published var isLoading = false
    @Published var errorMessage: String?

    let tournamentId: String

    init(tournamentId: String) {
        self.tournamentId = tournamentId
    }

    var availableTabs: [String] {
        guard let t = tournament else { return ["players"] }
        switch t.phase {
        case "SETUP": return ["players"]
        case "ROUND_ROBIN": return ["rounds", "standings", "players"]
        case "GAUNTLET": return ["gauntlet", "rounds", "standings", "players"]
        case "COMPLETED": return ["final", "rounds", "gauntlet", "standings", "players"]
        default: return ["players"]
        }
    }

    func load() async {
        isLoading = true
        async let t = APIService.shared.getTournament(tournamentId)
        async let p = APIService.shared.getPlayers(tournamentId)
        async let m = APIService.shared.getMatches(tournamentId)

        tournament = try? await t
        players = (try? await p) ?? []
        matches = (try? await m) ?? []

        if let tab = availableTabs.first, !availableTabs.contains(activeTab) {
            activeTab = tab
        }
        isLoading = false
    }

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

    var roundsForCurrentView: [Match] {
        matches.filter { $0.roundNumber == selectedRound }
    }

    var maxRound: Int {
        matches.map(\.roundNumber).max() ?? 1
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
