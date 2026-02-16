import Foundation

@MainActor
class ProfileViewModel: ObservableObject {
    @Published var user: User?
    @Published var stats: UserStats?
    @Published var followStatus: FollowStatus?
    @Published var isLoading = false
    @Published var errorMessage: String?

    let userId: String

    init(userId: String) {
        self.userId = userId
    }

    func load() async {
        isLoading = true
        async let u = APIService.shared.getUserProfile(userId)
        async let s = APIService.shared.getUserStats(userId)
        async let f = APIService.shared.getFollowStatus(userId)

        user = try? await u
        stats = try? await s
        followStatus = try? await f
        isLoading = false
    }

    var isFollowing: Bool {
        followStatus?.isFollowing ?? false
    }

    func toggleFollow() async {
        do {
            if isFollowing {
                try await APIService.shared.unfollowUser(userId)
            } else {
                try await APIService.shared.followUser(userId)
            }
            followStatus = try? await APIService.shared.getFollowStatus(userId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
