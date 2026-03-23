import Foundation

@MainActor
class TournamentSetupViewModel: ObservableObject {
    // General
    @Published var name = ""
    @Published var location = ""
    @Published var date = Date()
    @Published var avatar = ""

    // Mode toggle
    @Published var useLegacyMode = false

    // Legacy mode fields
    @Published var totalRounds = 3
    @Published var gauntletEnabled = false
    @Published var gauntletStartLevel = 10
    @Published var gauntletFinalLevel = 15
    @Published var levels: [RoundLevelInput] = []

    // Phase mode fields
    @Published var phaseEntries: [PhaseEntry] = []
    @Published var selectedPreset: Int? = nil
    @Published var showPresetsSheet = false

    // State
    @Published var saving = false
    @Published var errorMessage: String?

    // MARK: - Legacy Level Input

    struct RoundLevelInput: Identifiable {
        let id = UUID()
        var round: Int
        var min: Int
        var max: Int
    }

    // MARK: - Phase Entry (for building multi-phase tournaments)

    struct PhaseEntry: Identifiable {
        let id = UUID()
        var format: TournamentFormat
        var name: String
        var config: PhaseConfig
        var advancement: PhaseAdvancement

        var order: Int = 0
    }

    // MARK: - Legacy Level Management

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

    // MARK: - Phase Management

    func addPhase(_ format: TournamentFormat) {
        let entry = PhaseEntry(
            format: format,
            name: format.label,
            config: format.defaultConfig,
            advancement: format.defaultAdvancement,
            order: phaseEntries.count + 1
        )
        phaseEntries.append(entry)
    }

    func removePhase(at index: Int) {
        guard phaseEntries.indices.contains(index) else { return }
        phaseEntries.remove(at: index)
        reorderPhases()
    }

    func movePhase(from source: IndexSet, to destination: Int) {
        phaseEntries.move(fromOffsets: source, toOffset: destination)
        reorderPhases()
    }

    private func reorderPhases() {
        for i in phaseEntries.indices {
            phaseEntries[i].order = i + 1
        }
    }

    // MARK: - Apply Preset

    func applyPreset(_ preset: TournamentPreset) {
        phaseEntries = preset.phases.enumerated().map { index, entry in
            let (format, config, advancement) = entry
            return PhaseEntry(
                format: format,
                name: format.label,
                config: config ?? format.defaultConfig,
                advancement: advancement ?? format.defaultAdvancement,
                order: index + 1
            )
        }
        useLegacyMode = false
        showPresetsSheet = false
    }

    // MARK: - Save

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

        if useLegacyMode || phaseEntries.isEmpty {
            return await saveLegacy(dateStr: dateStr)
        } else {
            return await saveWithPhases(dateStr: dateStr)
        }
    }

    private func saveLegacy(dateStr: String) async -> Tournament? {
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

    private func saveWithPhases(dateStr: String) async -> Tournament? {
        // Create tournament first with minimal config
        var config = TournamentConfig()
        config.cardsPerDraw = 5
        config.vetoesPerPlayer = 1
        config.bestOf = 3

        let request = CreateTournamentRequest(
            name: name,
            location: location,
            date: dateStr,
            totalRounds: phaseEntries.first?.config.rounds ?? 3,
            config: config,
            avatar: avatar.isEmpty ? nil : avatar
        )

        do {
            let tournament = try await APIService.shared.createTournament(request)

            // Create each phase
            for entry in phaseEntries {
                let phaseRequest = CreatePhaseRequest(
                    tournamentId: tournament.id,
                    phaseOrder: entry.order,
                    format: entry.format.rawValue,
                    name: entry.name,
                    config: entry.config,
                    advancement: entry.advancement
                )
                _ = try await APIService.shared.createPhase(phaseRequest)
            }

            saving = false
            return tournament
        } catch {
            errorMessage = error.localizedDescription
            saving = false
            return nil
        }
    }
}
