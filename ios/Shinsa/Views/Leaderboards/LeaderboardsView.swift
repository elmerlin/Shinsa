import SwiftUI

struct LeaderboardsView: View {
    @State private var pumbilityEntries: [LeaderboardEntry] = []
    @State private var hopEntries: [HopLeaderboardEntry] = []
    @State private var selectedTab = 0
    @State private var isLoading = true

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Tab picker
                HStack(spacing: 0) {
                    tabButton("Pumbility", index: 0)
                    tabButton("Hour of Power", index: 1)
                }
                .background(DojoTheme.piuCard)

                if isLoading {
                    Spacer()
                    ProgressView()
                        .tint(DojoTheme.piuAccent)
                    Spacer()
                } else if selectedTab == 0 {
                    pumbilityList
                } else {
                    hopList
                }
            }
        }
        .navigationTitle("Leaderboards")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadData() }
    }

    // MARK: - Tab Button

    private func tabButton(_ title: String, index: Int) -> some View {
        Button {
            withAnimation { selectedTab = index }
        } label: {
            VStack(spacing: 6) {
                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(selectedTab == index ? DojoTheme.piuAccent : DojoTheme.textMuted)

                Rectangle()
                    .fill(selectedTab == index ? DojoTheme.piuAccent : Color.clear)
                    .frame(height: 2)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 12)
        }
    }

    // MARK: - Pumbility List

    private var pumbilityList: some View {
        Group {
            if pumbilityEntries.isEmpty {
                emptyState(icon: "trophy", message: "No pumbility data available")
            } else {
                ScrollView {
                    LazyVStack(spacing: 2) {
                        // Top 3
                        if pumbilityEntries.count >= 3 {
                            topThreeSection
                        }

                        ForEach(Array(pumbilityEntries.enumerated()), id: \.element.id) { index, entry in
                            let rank = entry.rank ?? (index + 1)
                            NavigationLink(value: "profile/\(entry.odUserId ?? "")") {
                                leaderboardRow(rank: rank, username: entry.username ?? "?", avatar: entry.avatar, score: "\(Int(entry.pumbility ?? 0))", nationality: entry.nationality)
                            }
                        }
                    }
                    .padding(.top, 4)
                }
                .refreshable { await loadData() }
            }
        }
    }

    // MARK: - Top 3

    private var topThreeSection: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if pumbilityEntries.count > 1 {
                podiumItem(entry: pumbilityEntries[1], rank: 2, height: 70)
            }
            if pumbilityEntries.count > 0 {
                podiumItem(entry: pumbilityEntries[0], rank: 1, height: 90)
            }
            if pumbilityEntries.count > 2 {
                podiumItem(entry: pumbilityEntries[2], rank: 3, height: 55)
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
    }

    private func podiumItem(entry: LeaderboardEntry, rank: Int, height: CGFloat) -> some View {
        VStack(spacing: 6) {
            AvatarView(entry.avatar, name: entry.username ?? "?", size: 44)

            Text(entry.username ?? "?")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(1)

            Text("\(Int(entry.pumbility ?? 0))")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(DojoTheme.piuGold)

            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(rank == 1 ? DojoTheme.piuGold.opacity(0.3) : rank == 2 ? DojoTheme.piuSilver.opacity(0.3) : DojoTheme.piuBronze.opacity(0.3))
                    .frame(height: height)
                Text(DojoTheme.medalEmoji(for: rank))
                    .font(.system(size: 20))
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - HoP List

    private var hopList: some View {
        Group {
            if hopEntries.isEmpty {
                emptyState(icon: "bolt.fill", message: "No Hour of Power data")
            } else {
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(Array(hopEntries.enumerated()), id: \.element.id) { index, entry in
                            leaderboardRow(
                                rank: index + 1,
                                username: entry.username ?? "?",
                                avatar: entry.avatar,
                                score: String(format: "%.0f", entry.totalRating ?? 0),
                                nationality: nil
                            )
                        }
                    }
                    .padding(.top, 4)
                }
            }
        }
    }

    // MARK: - Row

    private func leaderboardRow(rank: Int, username: String, avatar: String?, score: String, nationality: String?) -> some View {
        HStack(spacing: 10) {
            // Rank
            Group {
                if rank <= 3 {
                    Text(DojoTheme.medalEmoji(for: rank))
                        .font(.system(size: 16))
                } else {
                    Text("#\(rank)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }
            .frame(width: 36, alignment: .center)

            AvatarView(avatar, name: username, size: 36)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(username)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)

                    if let nat = nationality, !nat.isEmpty {
                        Text(CountryData.flag(for: nat))
                            .font(.system(size: 12))
                    }
                }
            }

            Spacer()

            Text(score)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(DojoTheme.piuGold)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(DojoTheme.piuCard)
    }

    // MARK: - Empty State

    private func emptyState(icon: String, message: String) -> some View {
        VStack(spacing: 8) {
            Spacer()
            Image(systemName: icon)
                .font(.system(size: 32))
                .foregroundColor(DojoTheme.textMuted.opacity(0.5))
            Text(message)
                .font(.system(size: 14))
                .foregroundColor(DojoTheme.textMuted)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func loadData() async {
        isLoading = true
        async let p = APIService.shared.getPumbilityLeaderboard()
        async let h = APIService.shared.getHopLeaderboard()
        pumbilityEntries = (try? await p)?.entries ?? []
        hopEntries = (try? await h) ?? []
        isLoading = false
    }
}
