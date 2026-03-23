import SwiftUI

struct TournamentDetailView: View {
    @StateObject private var vm: TournamentViewModel
    @EnvironmentObject var auth: AuthManager

    init(tournamentId: String) {
        _vm = StateObject(wrappedValue: TournamentViewModel(tournamentId: tournamentId))
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if vm.isLoading && vm.tournament == nil {
                ProgressView()
                    .tint(DojoTheme.piuAccent)
            } else if let tournament = vm.tournament {
                VStack(spacing: 0) {
                    // Header
                    tournamentHeader(tournament)

                    // Phase cards (if tournament has phases)
                    if tournament.hasPhases {
                        phaseCardsRow
                    }

                    // Phase action buttons
                    phaseAction(tournament)

                    // Tabs
                    tabBar

                    // Tab content
                    tabContent
                }
            } else {
                Text("Tournament not found")
                    .foregroundColor(DojoTheme.textMuted)
            }
        }
        .navigationTitle(vm.tournament?.name ?? "Tournament")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .refreshable { await vm.load() }
        .alert("Error", isPresented: .constant(vm.errorMessage != nil)) {
            Button("OK") { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
    }

    // MARK: - Header

    private func tournamentHeader(_ t: Tournament) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                AvatarView(t.avatar, name: t.name, size: 56)

                VStack(alignment: .leading, spacing: 4) {
                    Text(t.name)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(.white)

                    HStack(spacing: 8) {
                        StatusBadgeView(phase: t.phase)

                        if let loc = t.location, !loc.isEmpty {
                            Text(loc)
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }
                }

                Spacer()
            }

            HStack(spacing: 16) {
                statItem("\(vm.players.count)", "Players")
                statItem("\(vm.matches.count)", "Matches")
                if t.hasPhases {
                    statItem("\(vm.phases.count)", "Phases")
                } else {
                    statItem("R\(t.currentRound)/\(t.totalRounds)", "Round")
                }
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
    }

    private func statItem(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.white)
            Text(label)
                .font(.system(size: 10))
                .foregroundColor(DojoTheme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Phase Cards Row

    private var phaseCardsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(vm.phases) { phase in
                    PhaseCardView(
                        phase: phase,
                        isSelected: vm.selectedPhase?.id == phase.id
                    ) {
                        vm.selectedPhase = phase
                        // Reset tab to first available
                        if let firstTab = vm.availableTabs.first {
                            vm.activeTab = firstTab
                        }
                    }
                    .frame(width: 240)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .background(DojoTheme.piuBg)
    }

    // MARK: - Phase Action

    @ViewBuilder
    private func phaseAction(_ t: Tournament) -> some View {
        // Phase-aware action buttons
        if t.hasPhases, let phase = vm.selectedPhase {
            PhaseActionButtons(
                phase: phase,
                playerCount: vm.players.count,
                onActivate: { await vm.activatePhase(phase.id) },
                onComplete: { await vm.completePhase(phase.id) },
                onGenerate: { await vm.generatePhaseMatches(phase.id) }
            )
        } else {
            // Legacy action buttons
            switch t.phase {
            case "SETUP":
                if vm.players.count >= 3 {
                    actionButton("Start Round Robin") {
                        await vm.generateRoundRobin()
                    }
                }
            case "ROUND_ROBIN":
                let allComplete = vm.roundsForCurrentView.allSatisfy { $0.status == "COMPLETED" }
                if allComplete && t.currentRound < t.totalRounds {
                    actionButton("Generate Next Round") {
                        await vm.generateRoundRobin()
                    }
                } else if allComplete && t.currentRound >= t.totalRounds {
                    if t.config.gauntletEnabled == true {
                        actionButton("Start Gauntlet") {
                            await vm.generateGauntlet()
                        }
                    }
                }
            default:
                EmptyView()
            }
        }
    }

    private func actionButton(_ text: String, action: @escaping () async -> Void) -> some View {
        Button {
            Task { await action() }
        } label: {
            Text(text)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(DojoTheme.piuAccent)
                .cornerRadius(10)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(vm.availableTabs, id: \.self) { tab in
                    Button {
                        vm.activeTab = tab
                    } label: {
                        Text(tabLabel(tab))
                            .font(.system(size: 13, weight: vm.activeTab == tab ? .bold : .medium))
                            .foregroundColor(vm.activeTab == tab ? DojoTheme.piuAccent : DojoTheme.textMuted)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .overlay(alignment: .bottom) {
                                if vm.activeTab == tab {
                                    Rectangle()
                                        .fill(DojoTheme.piuAccent)
                                        .frame(height: 2)
                                }
                            }
                    }
                }
            }
        }
        .background(DojoTheme.piuCard)
    }

    private func tabLabel(_ tab: String) -> String {
        switch tab {
        case "players": return "Players"
        case "rounds": return "Rounds"
        case "standings": return "Standings"
        case "gauntlet": return "Gauntlet"
        case "final": return "Final"
        case "bracket": return "Bracket"
        case "pools": return "Pools"
        case "seeding": return "Seeding"
        default: return tab.capitalized
        }
    }

    // MARK: - Tab Content

    @ViewBuilder
    private var tabContent: some View {
        ScrollView {
            switch vm.activeTab {
            case "players":
                PlayerListView(vm: vm)
            case "rounds":
                RoundsTabView(vm: vm)
            case "standings":
                StandingsTabView(vm: vm)
            case "gauntlet":
                GauntletTabView(vm: vm)
            case "final":
                FinalStandingsView(vm: vm)
            case "bracket":
                bracketContent
            case "pools":
                PoolsView(
                    matches: vm.matchesForSelectedPhase,
                    players: vm.players,
                    phasePlayers: vm.phasePlayersForSelected
                )
            case "seeding":
                SeedingPanelView(
                    phasePlayers: Binding(
                        get: { vm.selectedPhase?.players ?? [] },
                        set: { newPlayers in
                            if let idx = vm.phases.firstIndex(where: { $0.id == vm.selectedPhase?.id }) {
                                vm.phases[idx].players = newPlayers
                                vm.selectedPhase = vm.phases[idx]
                            }
                        }
                    ),
                    onAutoSeed: {
                        // Sort by pumbility descending
                        if let idx = vm.phases.firstIndex(where: { $0.id == vm.selectedPhase?.id }) {
                            vm.phases[idx].players?.sort { ($0.pumbility ?? 0) > ($1.pumbility ?? 0) }
                            if var sorted = vm.phases[idx].players {
                                for i in sorted.indices { sorted[i].seed = i + 1 }
                                vm.phases[idx].players = sorted
                            }
                            vm.selectedPhase = vm.phases[idx]
                        }
                    },
                    onSave: {
                        // Save seeding via API would go here
                    }
                )
            default:
                Text("Unknown tab")
                    .foregroundColor(DojoTheme.textMuted)
            }
        }
        .refreshable { await vm.load() }
    }

    @ViewBuilder
    private var bracketContent: some View {
        if let phase = vm.selectedPhase {
            if phase.format == "double_elim" {
                DoubleElimBracketView(
                    matches: vm.matchesForSelectedPhase,
                    players: vm.players,
                    phasePlayers: vm.phasePlayersForSelected
                )
            } else {
                BracketView(
                    matches: vm.matchesForSelectedPhase,
                    players: vm.players,
                    phasePlayers: vm.phasePlayersForSelected
                )
            }
        } else {
            BracketView(
                matches: vm.matches,
                players: vm.players,
                phasePlayers: []
            )
        }
    }
}

// MARK: - Placeholder views (will be replaced in Phase 5+6)

struct RoundsTabView: View {
    @ObservedObject var vm: TournamentViewModel
    var body: some View {
        VStack(spacing: 12) {
            // Round Selector
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(1...max(vm.maxRound, 1), id: \.self) { round in
                        Button {
                            vm.selectedRound = round
                        } label: {
                            Text("Round \(round)")
                                .font(.system(size: 12, weight: vm.selectedRound == round ? .bold : .medium))
                                .foregroundColor(vm.selectedRound == round ? .white : DojoTheme.textMuted)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(vm.selectedRound == round ? DojoTheme.piuAccent : DojoTheme.piuCard)
                                .cornerRadius(6)
                        }
                    }
                }
                .padding(.horizontal)
            }
            .padding(.top, 8)

            // Matches for selected round
            ForEach(vm.roundsForCurrentView) { match in
                NavigationLink(value: "match/\(match.id)") {
                    MatchCardView(match: match, players: vm.players)
                }
            }

            if vm.roundsForCurrentView.isEmpty {
                Text("No matches in this round")
                    .foregroundColor(DojoTheme.textMuted)
                    .padding(.vertical, 30)
            }
        }
        .padding(.bottom, 20)
    }
}

struct StandingsTabView: View {
    @ObservedObject var vm: TournamentViewModel
    var body: some View {
        VStack(spacing: 2) {
            // Header
            HStack {
                Text("#").frame(width: 24)
                Text("Player").frame(maxWidth: .infinity, alignment: .leading)
                Text("W").frame(width: 30)
                Text("L").frame(width: 30)
                Text("Pts").frame(width: 36)
                Text("Buch").frame(width: 44)
            }
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(DojoTheme.textMuted)
            .padding(.horizontal)
            .padding(.vertical, 8)

            // Use phase players if available, otherwise tournament players
            let standingsData: [(id: String, name: String, avatar: String?, nationality: String?, wins: Int, losses: Int, points: Int, buchholz: Double)] = {
                if let phasePlayers = vm.selectedPhase?.players, !phasePlayers.isEmpty {
                    return phasePlayers.map { pp in
                        (id: pp.id, name: pp.name ?? "?", avatar: pp.avatar, nationality: pp.nationality,
                         wins: pp.wins, losses: pp.losses, points: pp.points, buchholz: pp.buchholz)
                    }
                } else {
                    return vm.players.map { p in
                        (id: p.id, name: p.name, avatar: p.avatar, nationality: p.nationality,
                         wins: p.wins, losses: p.losses, points: p.points, buchholz: p.buchholz)
                    }
                }
            }()

            let sorted = standingsData.sorted { a, b in
                if a.points != b.points { return a.points > b.points }
                return a.buchholz > b.buchholz
            }

            ForEach(Array(sorted.enumerated()), id: \.element.id) { index, entry in
                HStack {
                    Text("\(index + 1)")
                        .frame(width: 24)
                        .font(.system(size: 12, weight: index < 3 ? .bold : .regular))
                        .foregroundColor(index < 3 ? DojoTheme.piuGold : .white)

                    HStack(spacing: 6) {
                        AvatarView(entry.avatar, name: entry.name, size: 24)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(entry.name)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.white)
                            if let nat = entry.nationality, !nat.isEmpty {
                                Text(CountryData.flag(for: nat))
                                    .font(.system(size: 10))
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Text("\(entry.wins)").frame(width: 30)
                        .foregroundColor(DojoTheme.piuGreen)
                    Text("\(entry.losses)").frame(width: 30)
                        .foregroundColor(DojoTheme.piuAccent)
                    Text("\(entry.points)").frame(width: 36)
                        .foregroundColor(.white)
                        .fontWeight(.bold)
                    Text(String(format: "%.1f", entry.buchholz)).frame(width: 44)
                        .foregroundColor(DojoTheme.textMuted)
                }
                .font(.system(size: 12))
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(index % 2 == 0 ? DojoTheme.piuCard : Color.clear)
            }
        }
        .padding(.top, 8)
    }
}

struct GauntletTabView: View {
    @ObservedObject var vm: TournamentViewModel
    var body: some View {
        let gauntletMatches: [Match] = {
            if vm.selectedPhase != nil {
                return vm.matchesForSelectedPhase
            }
            return vm.matches.filter { $0.roundNumber == -1 }
        }()

        VStack(spacing: 8) {
            if gauntletMatches.isEmpty {
                Text("No gauntlet matches yet")
                    .foregroundColor(DojoTheme.textMuted)
                    .padding(.vertical, 30)
            } else {
                ForEach(gauntletMatches) { match in
                    NavigationLink(value: "match/\(match.id)") {
                        MatchCardView(match: match, players: vm.players)
                    }
                }
            }
        }
        .padding()
    }
}

struct FinalStandingsView: View {
    @ObservedObject var vm: TournamentViewModel
    var body: some View {
        let sorted = vm.players.sorted { a, b in
            if a.points != b.points { return a.points > b.points }
            return a.buchholz > b.buchholz
        }
        VStack(spacing: 16) {
            // Podium
            if sorted.count >= 3 {
                HStack(alignment: .bottom, spacing: 12) {
                    podiumCard(sorted[1], rank: 2, height: 100)
                    podiumCard(sorted[0], rank: 1, height: 130)
                    podiumCard(sorted[2], rank: 3, height: 80)
                }
                .padding(.top, 20)
            }

            // Full standings
            ForEach(Array(sorted.enumerated()), id: \.element.id) { index, player in
                HStack(spacing: 10) {
                    Text(DojoTheme.medalEmoji(for: index + 1))
                        .font(.system(size: 16))
                        .frame(width: 30)

                    AvatarView(player.avatar, name: player.name, size: 32)

                    VStack(alignment: .leading) {
                        Text(player.name)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                        Text("\(player.points) pts")
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                    }

                    Spacer()

                    Text("\(player.wins)W \(player.losses)L")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textSecondary)
                }
                .padding(10)
                .background(DojoTheme.piuCard)
                .cornerRadius(8)
            }
        }
        .padding()
    }

    private func podiumCard(_ player: Player, rank: Int, height: CGFloat) -> some View {
        VStack(spacing: 6) {
            AvatarView(player.avatar, name: player.name, size: 48)
            Text(player.name)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(1)
            Text(DojoTheme.medalEmoji(for: rank))
                .font(.system(size: 24))
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .background(
            rank == 1 ? DojoTheme.piuGold.opacity(0.15) :
            rank == 2 ? DojoTheme.piuSilver.opacity(0.15) :
            DojoTheme.piuBronze.opacity(0.15)
        )
        .cornerRadius(10)
    }
}

// MARK: - Match Card (used in rounds)

struct MatchCardView: View {
    let match: Match
    let players: [Player]

    private func playerName(_ id: String?) -> String {
        guard let id else { return "?" }
        return players.first(where: { $0.id == id })?.name ?? "?"
    }

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(playerName(match.player1Id)) vs \(playerName(match.player2Id))")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)

                if match.status == "COMPLETED" {
                    if let scores = match.scores {
                        Text("\(scores.player1Wins ?? 0) - \(scores.player2Wins ?? 0)")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.piuGold)
                    }
                }
            }

            Spacer()

            StatusBadgeView(match.status, color: DojoTheme.statusColor(for: match.status))
        }
        .padding(12)
        .background(DojoTheme.piuCard)
        .cornerRadius(8)
        .padding(.horizontal)
    }
}
