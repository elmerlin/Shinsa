import SwiftUI

/// User's weekly challenge history — can be embedded in profile tabs
struct WCHistoryView: View {
    let userId: String
    @StateObject private var vm = WeeklyChallengesViewModel()

    var body: some View {
        VStack(spacing: 0) {
            if vm.userHistory.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "trophy")
                        .font(.system(size: 28))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("No weekly challenge history yet")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 32)
            } else {
                LazyVStack(spacing: 6) {
                    ForEach(vm.userHistory) { entry in
                        historyRow(entry)
                    }
                }
            }
        }
        .task {
            await vm.loadUserHistory(userId: userId)
        }
    }

    private func historyRow(_ entry: WCUserHistory) -> some View {
        NavigationLink(value: "weekly-challenges") {
            HStack(spacing: 12) {
                // Rank
                VStack(spacing: 1) {
                    if let rank = entry.rank {
                        if rank <= 3 {
                            Text(DojoTheme.medalEmoji(for: rank))
                                .font(.system(size: 18))
                        } else {
                            Text("#\(rank)")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(DojoTheme.textSecondary)
                        }
                    } else {
                        Text("-")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
                .frame(width: 36)

                // Week info
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.weekKey)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)

                    if let starts = entry.startsAtUtc {
                        Text(formatWeekDate(starts))
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }

                Spacer()

                // Stats
                VStack(alignment: .trailing, spacing: 3) {
                    if let pts = entry.points {
                        Text(String(format: "%.1f pts", pts))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(DojoTheme.piuGold)
                    }

                    if let clears = entry.clears {
                        Text("\(clears) clears")
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.piuGreen)
                    }
                }

                if let count = entry.participantCount, count > 0, let rank = entry.rank {
                    Text("\(rank)/\(count)")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)
                        .frame(width: 40, alignment: .trailing)
                }
            }
            .padding(10)
            .background(DojoTheme.piuCard)
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(DojoTheme.piuBorder, lineWidth: 0.5)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }

    private func formatWeekDate(_ iso: String) -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        let fmtAlt = DateFormatter()
        fmtAlt.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZ"

        guard let date = fmt.date(from: iso) ?? fmtAlt.date(from: iso) else { return iso }
        let display = DateFormatter()
        display.dateFormat = "MMM d, yyyy"
        return display.string(from: date)
    }
}
