import SwiftUI

struct DoubleElimBracketView: View {
    let matches: [Match]
    let players: [Player]
    let phasePlayers: [PhasePlayer]

    private var winnersMatches: [Match] {
        matches.filter { $0.bracket == "winners" }
    }

    private var losersMatches: [Match] {
        matches.filter { $0.bracket == "losers" }
    }

    private var grandFinalMatches: [Match] {
        matches.filter { $0.bracket == "grand_final" }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Winners Bracket
                bracketSection(
                    title: "WINNERS BRACKET",
                    color: DojoTheme.piuGreen,
                    icon: "arrow.up.circle.fill",
                    matches: winnersMatches
                )

                // Grand Final
                if !grandFinalMatches.isEmpty {
                    grandFinalSection
                }

                // Losers Bracket
                bracketSection(
                    title: "LOSERS BRACKET",
                    color: DojoTheme.piuAccent,
                    icon: "arrow.down.circle.fill",
                    matches: losersMatches
                )
            }
            .padding(.bottom, 20)
        }
    }

    // MARK: - Bracket Section

    private func bracketSection(title: String, color: Color, icon: String, matches: [Match]) -> some View {
        VStack(spacing: 12) {
            // Section header with divider
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                    .foregroundColor(color)
                Text(title)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(color)
                    .tracking(1)
                Rectangle()
                    .fill(color.opacity(0.3))
                    .frame(height: 1)
            }
            .padding(.horizontal)

            // Horizontal bracket
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 16) {
                    ForEach(roundGroups(for: matches), id: \.round) { group in
                        VStack(spacing: 10) {
                            Text(group.label)
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(color.opacity(0.7))
                                .padding(.vertical, 4)

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
                .padding(.horizontal)
            }
        }
    }

    // MARK: - Grand Final

    private var grandFinalSection: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "crown.fill")
                    .font(.system(size: 12))
                    .foregroundColor(DojoTheme.piuGold)
                Text("GRAND FINAL")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(DojoTheme.piuGold)
                    .tracking(1)
                Rectangle()
                    .fill(DojoTheme.piuGold.opacity(0.3))
                    .frame(height: 1)
            }
            .padding(.horizontal)

            ForEach(grandFinalMatches) { match in
                NavigationLink(value: "match/\(match.id)") {
                    BracketMatchCard(match: match, players: players, phasePlayers: phasePlayers)
                }
                .padding(.horizontal)
            }
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(DojoTheme.piuGold.opacity(0.3), lineWidth: 1)
                    .padding(.horizontal, 12)
            )
        }
    }

    // MARK: - Round Grouping

    private struct RoundGroup {
        let round: Int
        let label: String
        let matches: [Match]
    }

    private func roundGroups(for bracketMatches: [Match]) -> [RoundGroup] {
        let rounds = Set(bracketMatches.map { $0.bracketRound ?? $0.roundNumber })
        let sortedRounds = rounds.sorted()

        return sortedRounds.map { round in
            let roundMatches = bracketMatches
                .filter { ($0.bracketRound ?? $0.roundNumber) == round }
                .sorted { ($0.bracketPosition ?? 0) < ($1.bracketPosition ?? 0) }
            return RoundGroup(round: round, label: "Round \(round)", matches: roundMatches)
        }
    }
}
