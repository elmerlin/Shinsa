import SwiftUI

struct ProfileView: View {
    @StateObject private var vm: ProfileViewModel
    @EnvironmentObject var auth: AuthManager

    init(userId: String) {
        _vm = StateObject(wrappedValue: ProfileViewModel(userId: userId))
    }

    private var isOwnProfile: Bool {
        auth.userId == vm.userId
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if vm.isLoading && vm.user == nil {
                ProgressView().tint(DojoTheme.piuAccent)
            } else if let user = vm.user {
                ScrollView {
                    VStack(spacing: 16) {
                        profileHeader(user)
                        socialStats(user)

                        if let stats = vm.stats {
                            statsSection(stats)
                        }
                    }
                    .padding()
                }
                .refreshable { await vm.load() }
            } else {
                Text("User not found")
                    .foregroundColor(DojoTheme.textMuted)
            }
        }
        .navigationTitle(vm.user?.username ?? "Profile")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
    }

    // MARK: - Header

    private func profileHeader(_ user: User) -> some View {
        VStack(spacing: 12) {
            AvatarView(user.avatar, name: user.username, size: 80)

            Text(user.username)
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(.white)

            HStack(spacing: 8) {
                if let nat = user.nationality, !nat.isEmpty {
                    Text(CountryData.flag(for: nat))
                        .font(.system(size: 16))
                }
                if let skill = user.skillTitle {
                    Text(skill)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(DojoTheme.skillColor(for: skill))
                }
                if let level = user.skillLevel {
                    Text("Lv.\(level)")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textMuted)
                }
                if let gender = user.gender, !gender.isEmpty {
                    Text(gender == "male" ? "\u{2642}" : gender == "female" ? "\u{2640}" : "")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            if let bio = user.description, !bio.isEmpty {
                Text(bio)
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textSecondary)
                    .multilineTextAlignment(.center)
            }

            if let pumbility = user.pumbility, pumbility > 0 {
                HStack(spacing: 4) {
                    Text("Pumbility")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("\(pumbility)")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(DojoTheme.piuGold)
                }
            }

            if !isOwnProfile {
                Button {
                    Task { await vm.toggleFollow() }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: vm.isFollowing ? "person.fill.checkmark" : "person.badge.plus")
                        Text(vm.isFollowing ? "Following" : "Follow")
                    }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(vm.isFollowing ? DojoTheme.piuCard : DojoTheme.piuAccent)
                    .cornerRadius(20)
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(vm.isFollowing ? DojoTheme.piuBorder : Color.clear, lineWidth: 1)
                    )
                }
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Social Stats

    private func socialStats(_ user: User) -> some View {
        HStack(spacing: 0) {
            socialStat("\(user.followerCount ?? 0)", "Followers")
            Divider().frame(height: 30).background(DojoTheme.piuBorder)
            socialStat("\(user.followingCount ?? 0)", "Following")
            Divider().frame(height: 30).background(DojoTheme.piuBorder)
            socialStat("\(user.postCount ?? 0)", "Posts")
        }
        .padding(.vertical, 12)
        .background(DojoTheme.piuCard)
        .cornerRadius(10)
    }

    private func socialStat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.white)
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(DojoTheme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Stats

    private func statsSection(_ stats: UserStats) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("STATS")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            if let tournaments = stats.tournaments, !tournaments.isEmpty {
                Text("Tournaments")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)

                ForEach(tournaments) { t in
                    HStack {
                        Text(t.tournamentName ?? "Tournament")
                            .font(.system(size: 13))
                            .foregroundColor(.white)
                        Spacer()
                        Text("\(t.wins ?? 0)W \(t.losses ?? 0)L")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                    .padding(8)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(6)
                }
            }

            if let duels = stats.duels, !duels.isEmpty {
                Text("Duels")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.top, 4)

                ForEach(duels) { d in
                    HStack {
                        Text(d.name ?? "Duel")
                            .font(.system(size: 13))
                            .foregroundColor(.white)
                        Spacer()
                        Text(d.winner != nil ? "Completed" : "Active")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                    .padding(8)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(6)
                }
            }
        }
    }
}
