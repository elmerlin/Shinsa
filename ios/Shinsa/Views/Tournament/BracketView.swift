import SwiftUI

struct BracketView: View {
    let matches: [Match]
    let players: [Player]
    let phasePlayers: [PhasePlayer]

    private var roundGroups: [(round: Int, label: String, matches: [Match])] {
        let bracketMatches = matches.filter { $0.bracket == nil || $0.bracket == "winners" }
        let maxRound = bracketMatches.map(\.bracketRound).compactMap { $0 }.max() ?? bracketMatches.map(\.roundNumber).max() ?? 1
        let minRound = bracketMatches.map(\.bracketRound).compactMap { $0 }.min() ?? bracketMatches.map(\.roundNumber).min() ?? 1

        return (minRound...maxRound).map { round in
            let roundMatches = bracketMatches.filter {
                ($0.bracketRound ?? $0.roundNumber) == round
            }.sorted { ($0.bracketPosition ?? 0) < ($1.bracketPosition ?? 0) }

            let label = roundLabel(round: round, maxRound: maxRound, totalRounds: maxRound - minRound + 1)
            return (round: round, label: label, matches: roundMatches)
        }
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 16) {
                ForEach(roundGroups, id: \.round) { group in
                    VStack(spacing: 12) {
                        // Round header
                        Text(group.label)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                            .background(DojoTheme.piuAccent.opacity(0.1))
                            .cornerRadius(6)

                        // Match cards
                        ForEach(group.matches) { match in
                            NavigationLink(value: "match/\(match.id)") {
                                BracketMatchCard(match: match, players: players, phasePlayers: phasePlayers)
                            }
                        }

                        if group.matches.isEmpty {
                            Text("TBD")
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.textMuted)
                                .frame(height: 60)
                        }

                        Spacer()
                    }
                    .frame(width: 180)
                }
            }
            .padding()
        }
    }

    private func roundLabel(round: Int, maxRound: Int, totalRounds: Int) -> String {
        let roundsFromEnd = maxRound - round
        switch roundsFromEnd {
        case 0: return "Final"
        case 1: return "Semifinals"
        case 2: return "Quarterfinals"
        default: return "Round \(round)"
        }
    }
}

// MARK: - Bracket Match Card

struct BracketMatchCard: View {
    let match: Match
    let players: [Player]
    let phasePlayers: [PhasePlayer]

    var body: some View {
        VStack(spacing: 0) {
            playerRow(playerId: match.player1Id, score: match.scores?.player1Wins, isWinner: match.winnerId == match.player1Id)

            Divider()
                .background(DojoTheme.piuBorder)

            playerRow(playerId: match.player2Id, score: match.scores?.player2Wins, isWinner: match.winnerId == match.player2Id)
        }
        .background(cardBackground)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(borderColor, lineWidth: 1)
        )
        .opacity(match.isByeMatch ? 0.5 : 1.0)
    }

    private func playerRow(playerId: String?, score: Int?, isWinner: Bool) -> some View {
        HStack(spacing: 8) {
            // Seed number
            if let pp = phasePlayer(for: playerId) {
                Text("\(pp.seed)")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(DojoTheme.textMuted)
                    .frame(width: 16)
            } else {
                Color.clear.frame(width: 16)
            }

            Text(playerName(playerId))
                .font(.system(size: 12, weight: isWinner ? .bold : .regular))
                .foregroundColor(isWinner ? .white : DojoTheme.textSecondary)
                .lineLimit(1)

            Spacer()

            if let score {
                Text("\(score)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(isWinner ? DojoTheme.piuGreen : DojoTheme.textMuted)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(isWinner && match.status == "COMPLETED" ? DojoTheme.piuGreen.opacity(0.08) : Color.clear)
    }

    private var cardBackground: Color {
        match.isByeMatch ? DojoTheme.piuBg : DojoTheme.piuCard
    }

    private var borderColor: Color {
        switch match.status {
        case "COMPLETED": return DojoTheme.piuGreen.opacity(0.4)
        case "DRAWING", "VETOING", "READY": return DojoTheme.piuAccent.opacity(0.5)
        default: return DojoTheme.piuBorder.opacity(0.3)
        }
    }

    private func playerName(_ id: String?) -> String {
        guard let id else { return "BYE" }
        if let pp = phasePlayers.first(where: { $0.playerId == id }), let name = pp.name {
            return name
        }
        return players.first(where: { $0.id == id })?.name ?? "TBD"
    }

    private func phasePlayer(for id: String?) -> PhasePlayer? {
        guard let id else { return nil }
        return phasePlayers.first { $0.playerId == id }
    }
}
