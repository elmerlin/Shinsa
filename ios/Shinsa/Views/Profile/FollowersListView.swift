import SwiftUI

struct FollowersListView: View {
    let userId: String
    let listType: String // "followers" or "following"
    @EnvironmentObject var auth: AuthManager

    @State private var users: [User] = []
    @State private var isLoading = true
    @State private var followStates: [String: Bool] = [:]
    @State private var togglingFollow: Set<String> = []
    @State private var errorMessage: String?

    private var title: String {
        listType == "followers" ? "Followers" : "Following"
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if isLoading {
                ProgressView()
                    .tint(DojoTheme.piuAccent)
            } else if users.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: listType == "followers" ? "person.2" : "person.badge.plus")
                        .font(.system(size: 32))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.5))
                    Text(listType == "followers" ? "No followers yet" : "Not following anyone")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(users) { user in
                            userRow(user)
                        }
                    }
                    .padding(.top, 8)
                }
                .refreshable { await load() }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    // MARK: - User Row

    private func userRow(_ user: User) -> some View {
        HStack(spacing: 10) {
            NavigationLink(value: "profile/\(user.id)") {
                HStack(spacing: 10) {
                    AvatarView(user.avatar, name: user.username, size: 42)

                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text(user.username)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)

                            if let nat = user.nationality, !nat.isEmpty {
                                Text(CountryData.flag(for: nat))
                                    .font(.system(size: 12))
                            }
                        }

                        if let skill = user.skillTitle {
                            Text(skill)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(DojoTheme.skillColor(for: skill))
                        }
                    }
                }
            }

            Spacer()

            // Follow/unfollow button (hide for own profile)
            if user.id != auth.userId {
                followButton(for: user)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(DojoTheme.piuCard)
    }

    private func followButton(for user: User) -> some View {
        let isFollowing = followStates[user.id] ?? false
        let isToggling = togglingFollow.contains(user.id)

        return Button {
            Task { await toggleFollow(user) }
        } label: {
            Group {
                if isToggling {
                    ProgressView()
                        .tint(DojoTheme.piuAccent)
                        .scaleEffect(0.6)
                } else {
                    Text(isFollowing ? "Following" : "Follow")
                        .font(.system(size: 12, weight: .bold))
                }
            }
            .foregroundColor(.white)
            .frame(width: 80, height: 30)
            .background(isFollowing ? DojoTheme.piuCard : DojoTheme.piuAccent)
            .cornerRadius(15)
            .overlay(
                RoundedRectangle(cornerRadius: 15)
                    .stroke(isFollowing ? DojoTheme.piuBorder : Color.clear, lineWidth: 1)
            )
        }
        .disabled(isToggling)
    }

    // MARK: - Actions

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            if listType == "followers" {
                users = try await APIService.shared.getFollowers(userId)
            } else {
                users = try await APIService.shared.getFollowing(userId)
            }
            // Load follow status for each user
            await loadFollowStates()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func loadFollowStates() async {
        // Check follow status for each user (relative to logged-in user)
        for user in users where user.id != auth.userId {
            do {
                let status = try await APIService.shared.getFollowStatus(user.id)
                followStates[user.id] = status.isFollowing
            } catch {
                followStates[user.id] = false
            }
        }
    }

    private func toggleFollow(_ user: User) async {
        togglingFollow.insert(user.id)
        let wasFollowing = followStates[user.id] ?? false
        do {
            if wasFollowing {
                _ = try await APIService.shared.unfollowUser(user.id)
                followStates[user.id] = false
            } else {
                _ = try await APIService.shared.followUser(user.id)
                followStates[user.id] = true
                HapticService.impact(.light)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        togglingFollow.remove(user.id)
    }
}
