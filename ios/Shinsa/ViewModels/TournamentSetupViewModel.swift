import Foundation

@MainActor
class TournamentSetupViewModel: ObservableObject {
    @Published var name = ""
    @Published var location = ""
    @Published var date = Date()
    @Published var totalRounds = 3
    @Published var avatar = ""
    @Published var gauntletEnabled = false
    @Published var gauntletStartLevel = 10
    @Published var gauntletFinalLevel = 15
    @Published var levels: [RoundLevelInput] = []
    @Published var saving = false
    @Published var errorMessage: String?

    struct RoundLevelInput: Identifiable {
        let id = UUID()
        var round: Int
        var min: Int
        var max: Int
    }

    func updateLevels() {
        let current = levels.count
        if totalRounds > current {
            for r in (current + 1)...totalRounds {
                levels.append(RoundLevelInput(round: r, min: 5, max: 15))
            }
        } else if totalRounds < current {
            levels = Array(levels.prefix(totalRounds))
        }
    }

    func save() async -> Tournament? {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorMessage = "Tournament name is required"
            return nil
        }

        saving = true
        errorMessage = nil

        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        let dateStr = df.string(from: date)

        let roundLevels = levels.map { RoundLevel(round: $0.round, min: $0.min, max: $0.max) }

        var config = TournamentConfig()
        config.roundLevels = roundLevels
        config.cardsPerDraw = 5
        config.vetoesPerPlayer = 1
        config.bestOf = 3
        config.gauntletEnabled = gauntletEnabled
        if gauntletEnabled {
            config.gauntletStartSingleLevel = gauntletStartLevel
            config.gauntletFinalSingleLevel = gauntletFinalLevel
        }

        let request = CreateTournamentRequest(
            name: name,
            location: location,
            date: dateStr,
            totalRounds: totalRounds,
            config: config,
            avatar: avatar.isEmpty ? nil : avatar
        )

        do {
            let tournament = try await APIService.shared.createTournament(request)
            saving = false
            return tournament
        } catch {
            errorMessage = error.localizedDescription
            saving = false
            return nil
        }
    }
}
