import SwiftUI

struct WCLeaderboardView: View {
    let entries: [WCLeaderboardEntry]
    let viewerUserId: String?
    var maxRows: Int = 20

    var body: some View {
        VStack(spacing: 0) {
            // Section header
            HStack {
                Text("LEADERBOARD")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(DojoTheme.textMuted)
                    .tracking(1.5)

                Spacer()

                Text("\(entries.count) players")
                    .font(.system(size: 11))
                    .foregroundColor(DojoTheme.textMuted)
            }
            .padding(.bottom, 8)

            // Column headers
            HStack(spacing: 0) {
                Text("#")
                    .frame(width: 30, alignment: .center)
                Text("Player")
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Points")
                    .frame(width: 60, alignment: .trailing)
                Text("Clears")
                    .frame(width: 50, alignment: .trailing)
            }
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(DojoTheme.textMuted)
            .padding(.vertical, 6)
            .padding(.horizontal, 8)

            Divider().background(DojoTheme.piuBorder)

            // Top entries
            let topEntries = Array(entries.prefix(maxRows))
            ForEach(topEntries) { entry in
                leaderboardRow(entry, isViewer: entry.userId == viewerUserId)
            }

            // Viewer entry if outside top N
            if let viewerId = viewerUserId,
               !topEntries.contains(where: { $0.userId == viewerId }),
               let viewerEntry = entries.first(where: { $0.userId == viewerId }) {

                // Gap indicator
                HStack {
                    Spacer()
                    Text("···")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(DojoTheme.textMuted)
                    Spacer()
                }
                .padding(.vertical, 4)

                leaderboardRow(viewerEntry, isViewer: true)
            }
        }
        .padding(12)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Row

    private func leaderboardRow(_ entry: WCLeaderboardEntry, isViewer: Bool) -> some View {
        HStack(spacing: 0) {
            // Rank
            Group {
                if entry.rank <= 3 {
                    Text(DojoTheme.medalEmoji(for: entry.rank))
                        .font(.system(size: 14))
                } else {
                    Text("\(entry.rank)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(DojoTheme.textSecondary)
                }
            }
            .frame(width: 30, alignment: .center)

            // Player
            HStack(spacing: 8) {
                NavigationLink(value: "profile/\(entry.userId)") {
                    AvatarView(entry.avatar, name: entry.username, size: 28)
                }

                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 3) {
                        if let nat = entry.nationality, !nat.isEmpty {
                            Text(flagEmoji(for: nat))
                                .font(.system(size: 10))
                        }
                        Text(entry.username)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.white)
                            .lineLimit(1)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // Points
            Text(String(format: "%.1f", entry.points))
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuGold)
                .frame(width: 60, alignment: .trailing)

            // Clears
            Text("\(entry.clears)")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(DojoTheme.piuGreen)
                .frame(width: 50, alignment: .trailing)
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 8)
        .background(
            isViewer
                ? DojoTheme.piuGold.opacity(0.08)
                : Color.clear
        )
        .cornerRadius(6)
        .overlay(
            isViewer
                ? RoundedRectangle(cornerRadius: 6)
                    .stroke(DojoTheme.piuGold.opacity(0.3), lineWidth: 1)
                : nil
        )
    }

    private func flagEmoji(for code: String) -> String {
        let base: UInt32 = 127397
        let upper = code.uppercased()
        var result = ""
        for scalar in upper.unicodeScalars {
            if let flag = Unicode.Scalar(base + scalar.value) {
                result.append(String(flag))
            }
        }
        return result.isEmpty ? "" : result
    }
}
