import Foundation

@MainActor
class ProfileViewModel: ObservableObject {
    @Published var user: User?
    @Published var stats: UserStats?
    @Published var followStatus: FollowStatus?
    @Published var socialCounts: SocialCounts?
    @Published var isLoading = false
    @Published var errorMessage: String?

    // New data
    @Published var recentPlays: [RecentlyPlayed] = []
    @Published var achievements: [AchievementBadge] = []
    @Published var posts: [Post] = []
    @Published var heatmapData: [String: HeatmapDay] = [:]
    @Published var piuStatus: PiuSyncStatus?
    @Published var songAnalytics: SongAnalytics?
    @Published var postsPage = 1
    @Published var hasMorePosts = true
    @Published var isLoadingPosts = false
    @Published var followers: [User] = []
    @Published var following: [User] = []
    @Published var profileLive: ProfileLiveResponse?
    @Published var activityItems: [ActivityItem] = []
    @Published var shoeCabinet: ShoeCabinet?
    @Published var shoeLoading = false

    let userId: String

    init(userId: String) {
        self.userId = userId
    }

    func load() async {
        isLoading = true
        async let u = APIService.shared.getUserProfile(userId)
        async let s = APIService.shared.getUserStats(userId)
        async let f = APIService.shared.getFollowStatus(userId)
        async let c = APIService.shared.getSocialCounts(userId)

        user = try? await u
        stats = try? await s
        followStatus = try? await f
        socialCounts = try? await c
        piuStatus = try? await APIService.shared.getPiuSyncStatus(userId)
        songAnalytics = try? await APIService.shared.getSongAnalytics(userId)

        // Load achievements from user profile
        if let badges = user?.achievementBadges {
            achievements = badges
        }

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

    func loadRecentPlays(year: Int? = nil) async {
        do {
            let plays: [RecentlyPlayed]
            if let y = year {
                plays = try await APIService.shared.getPiugameRecentlyPlayed(userId, year: y)
            } else {
                plays = try await APIService.shared.getPiugameRecentlyPlayed(userId)
            }
            recentPlays = plays
            buildHeatmapData(from: plays)
        } catch {
            // Silently fail - heatmap will be empty
        }
    }

    func loadAchievements() async {
        // Badges come from user profile response, not a separate endpoint
        if let badges = user?.achievementBadges {
            achievements = badges
        }
    }

    func loadPosts(reset: Bool = false) async {
        guard !isLoadingPosts else { return }
        if reset {
            postsPage = 1
            hasMorePosts = true
            posts = []
        }
        guard hasMorePosts else { return }
        isLoadingPosts = true
        do {
            let newPosts = try await APIService.shared.getUserPosts(userId, page: postsPage)
            if reset {
                posts = newPosts
            } else {
                posts.append(contentsOf: newPosts)
            }
            hasMorePosts = newPosts.count >= 10
            postsPage += 1
        } catch {
            // Silently fail
        }
        isLoadingPosts = false
    }

    private func buildHeatmapData(from plays: [RecentlyPlayed]) {
        var map: [String: (plays: Int, singlesLevels: [Int], doublesLevels: [Int])] = [:]

        for play in plays {
            guard let datePlayed = play.effectiveDate else { continue }
            // Extract just the date portion (YYYY-MM-DD), normalizing dots/slashes to dashes
            let rawKey = String(datePlayed.prefix(10))
                .replacingOccurrences(of: ".", with: "-")
                .replacingOccurrences(of: "/", with: "-")
            // Pad single-digit month/day (e.g. "2026-3-5" → "2026-03-05")
            let parts = rawKey.split(separator: "-")
            let dateKey: String
            if parts.count == 3, let y = parts.first, y.count == 4 {
                dateKey = "\(y)-\(parts[1].count == 1 ? "0" : "")\(parts[1])-\(parts[2].count == 1 ? "0" : "")\(parts[2])"
            } else {
                dateKey = rawKey
            }
            guard dateKey.count == 10 else { continue }

            var entry = map[dateKey] ?? (plays: 0, singlesLevels: [], doublesLevels: [])
            entry.plays += 1
            let mode = (play.mode ?? "").lowercased()
            let level = play.level ?? 0
            if mode.hasPrefix("s") || mode == "single" {
                entry.singlesLevels.append(level)
            } else {
                entry.doublesLevels.append(level)
            }
            map[dateKey] = entry
        }

        var result: [String: HeatmapDay] = [:]
        for (key, val) in map {
            let singlesAvg = val.singlesLevels.isEmpty ? 0.0 : Double(val.singlesLevels.reduce(0, +)) / Double(val.singlesLevels.count)
            let doublesAvg = val.doublesLevels.isEmpty ? 0.0 : Double(val.doublesLevels.reduce(0, +)) / Double(val.doublesLevels.count)
            let total = val.singlesLevels.count + val.doublesLevels.count
            let doubleRatio = total == 0 ? 0.0 : Double(val.doublesLevels.count) / Double(total)
            result[key] = HeatmapDay(key: key, plays: val.plays, singlesAvgLevel: singlesAvg, doublesAvgLevel: doublesAvg, doubleRatio: doubleRatio)
        }
        heatmapData = result
    }

    func loadProfileLive() async {
        profileLive = try? await APIService.shared.getProfileLiveSessions(userId)
    }

    func loadActivity() async {
        activityItems = (try? await APIService.shared.getUserActivity(userId)) ?? []
    }

    func loadShoes() async {
        shoeLoading = true
        shoeCabinet = try? await APIService.shared.getProfileShoes(userId)
        shoeLoading = false
    }

    func wearShoe(_ shoeId: String) async {
        _ = try? await APIService.shared.wearShoe(shoeId)
        await loadShoes()
    }

    func loadFollowers() async {
        isLoading = true
        followers = (try? await APIService.shared.getFollowers(userId)) ?? []
        isLoading = false
    }

    func loadFollowing() async {
        isLoading = true
        following = (try? await APIService.shared.getFollowing(userId)) ?? []
        isLoading = false
    }
}
