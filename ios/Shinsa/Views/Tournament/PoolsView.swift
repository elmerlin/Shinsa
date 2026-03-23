import SwiftUI

struct PoolsView: View {
    let matches: [Match]
    let players: [Player]
    let phasePlayers: [PhasePlayer]

    private static let poolColors: [Color] = [
        Color(hex: "#ff3366"), // Pink
        Color(hex: "#4488ff"), // Blue
        Color(hex: "#33ff66"), // Green
        Color(hex: "#ffd700"), // Gold
        Color(hex: "#ff8844"), // Orange
        Color(hex: "#aa44ff"), // Purple
        Color(hex: "#44ffdd"), // Teal
        Color(hex: "#ff44aa"), // Magenta
    ]

    private static let poolLetters = ["A", "B", "C", "D", "E", "F", "G", "H"]

    private var poolIds: [Int] {
        let ids = Set(phasePlayers.compactMap(\.poolId))
        return ids.sorted()
    }

    var body: some View {
        let columns = [
            GridItem(.flexible(), spacing: 12),
            GridItem(.flexible(), spacing: 12),
        ]

        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(poolIds, id: \.self) { poolId in
                poolCard(poolId: poolId)
            }
        }
        .padding()
    }

    // MARK: - Pool Card

    private func poolCard(poolId: Int) -> some View {
        let color = Self.poolColors[(poolId - 1) % Self.poolColors.count]
        let letter = poolId <= Self.poolLetters.count ? Self.poolLetters[poolId - 1] : "\(poolId)"
        let poolPlayers = phasePlayers.filter { $0.poolId == poolId }
            .sorted { a, b in
                if a.points != b.points { return a.points > b.points }
                if a.wins != b.wins { return a.wins > b.wins }
                return a.buchholz > b.buchholz
            }
        let poolMatches = matches.filter { $0.poolId == poolId }

        return VStack(spacing: 0) {
            // Pool header
            HStack {
                Text("Pool \(letter)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                Spacer()
                Text("\(poolPlayers.count) players")
                    .font(.system(size: 10))
                    .foregroundColor(color.opacity(0.8))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(color.opacity(0.2))

            // Mini standings header
            HStack(spacing: 0) {
                Text("#").frame(width: 20, alignment: .center)
                Text("Player").frame(maxWidth: .infinity, alignment: .leading)
                Text("W").frame(width: 22, alignment: .center)
                Text("L").frame(width: 22, alignment: .center)
            }
            .font(.system(size: 9, weight: .bold))
            .foregroundColor(DojoTheme.textMuted)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)

            // Player rows
            ForEach(Array(poolPlayers.enumerated()), id: \.element.id) { index, pp in
                HStack(spacing: 0) {
                    Text("\(index + 1)")
                        .frame(width: 20, alignment: .center)
                        .foregroundColor(index < 2 ? color : DojoTheme.textMuted)

                    Text(pp.name ?? playerName(pp.playerId))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .foregroundColor(.white)
                        .lineLimit(1)

                    Text("\(pp.wins)")
                        .frame(width: 22, alignment: .center)
                        .foregroundColor(DojoTheme.piuGreen)

                    Text("\(pp.losses)")
                        .frame(width: 22, alignment: .center)
                        .foregroundColor(DojoTheme.piuAccent)
                }
                .font(.system(size: 11))
                .padding(.horizontal, 10)
                .padding(.vertical, 3)
                .background(index % 2 == 0 ? DojoTheme.piuBg.opacity(0.3) : Color.clear)
            }

            // Pool matches
            if !poolMatches.isEmpty {
                Divider()
                    .background(DojoTheme.piuBorder)
                    .padding(.vertical, 4)

                VStack(spacing: 4) {
                    ForEach(poolMatches) { match in
                        NavigationLink(value: "match/\(match.id)") {
                            poolMatchRow(match)
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 8)
            }
        }
        .background(DojoTheme.piuCard)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(color.opacity(0.2), lineWidth: 1)
        )
    }

    // MARK: - Pool Match Row

    private func poolMatchRow(_ match: Match) -> some View {
        HStack(spacing: 4) {
            Text(shortName(match.player1Id))
                .font(.system(size: 10, weight: match.winnerId == match.player1Id ? .bold : .regular))
                .foregroundColor(match.winnerId == match.player1Id ? .white : DojoTheme.textSecondary)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .lineLimit(1)

            if match.status == "COMPLETED", let scores = match.scores {
                Text("\(scores.player1Wins ?? 0)-\(scores.player2Wins ?? 0)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(DojoTheme.piuGold)
                    .frame(width: 28)
            } else {
                Text("vs")
                    .font(.system(size: 9))
                    .foregroundColor(DojoTheme.textMuted)
                    .frame(width: 28)
            }

            Text(shortName(match.player2Id))
                .font(.system(size: 10, weight: match.winnerId == match.player2Id ? .bold : .regular))
                .foregroundColor(match.winnerId == match.player2Id ? .white : DojoTheme.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(1)
        }
        .padding(.vertical, 2)
    }

    // MARK: - Helpers

    private func playerName(_ id: String) -> String {
        players.first(where: { $0.id == id })?.name ?? "?"
    }

    private func shortName(_ id: String?) -> String {
        guard let id else { return "?" }
        if let pp = phasePlayers.first(where: { $0.playerId == id }), let name = pp.name {
            return name
        }
        return playerName(id)
    }
}
