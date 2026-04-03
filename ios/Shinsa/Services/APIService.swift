import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case serverError(String)
    case decodingError(String)
    case unauthorized
    case networkError(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .serverError(let msg): return msg
        case .decodingError(let msg): return "Decoding error: \(msg)"
        case .unauthorized: return "Please log in again"
        case .networkError(let msg): return msg
        }
    }
}

@MainActor
class APIService {
    static let shared = APIService()

    private(set) var baseURL: String {
        didSet { UserDefaults.standard.set(baseURL, forKey: "serverURL") }
    }

    var token: String? {
        get { KeychainHelper.read(key: "jwt_token") }
        set {
            if let v = newValue { KeychainHelper.save(key: "jwt_token", value: v) }
            else { KeychainHelper.delete(key: "jwt_token") }
        }
    }

    private init() {
        self.baseURL = UserDefaults.standard.string(forKey: "serverURL") ?? "http://localhost:3001"
    }

    func setBaseURL(_ url: String) {
        var u = url
        if u.hasSuffix("/") { u.removeLast() }
        baseURL = u
    }

    // MARK: - Generic Request

    private func request<T: Decodable>(_ path: String, method: String = "GET", body: Encodable? = nil, timeout: TimeInterval = 8) async throws -> T {
        guard let url = URL(string: "\(baseURL)/api\(path)") else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = timeout
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        if let body = body {
            req.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse {
            if http.statusCode == 401 { throw APIError.unauthorized }
            if http.statusCode >= 400 {
                if let err = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                    throw APIError.serverError(err.error)
                }
                throw APIError.serverError("Request failed (\(http.statusCode))")
            }
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            let preview = String(data: data.prefix(500), encoding: .utf8) ?? "(binary)"
            print("[API] Decode error for \(path): \(error)\nResponse preview: \(preview)")
            throw APIError.decodingError("\(error)")
        }
    }

    private func requestRaw(_ path: String, method: String = "GET", body: Encodable? = nil) async throws -> Data {
        guard let url = URL(string: "\(baseURL)/api\(path)") else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 8
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        if let body = body {
            req.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse {
            if http.statusCode == 401 { throw APIError.unauthorized }
            if http.statusCode >= 400 {
                throw APIError.serverError("Request failed (\(http.statusCode))")
            }
        }
        return data
    }

    private func requestVoid(_ path: String, method: String = "GET", body: Encodable? = nil) async throws {
        guard let url = URL(string: "\(baseURL)/api\(path)") else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 8
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        if let body = body {
            req.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            if let err = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw APIError.serverError(err.error)
            }
            throw APIError.serverError("Request failed (\(http.statusCode))")
        }
    }

    func uploadMultipart<T: Decodable>(_ path: String, fields: [String: String], images: [(String, Data)]) async throws -> T {
        guard let url = URL(string: "\(baseURL)/api\(path)") else { throw APIError.invalidURL }
        let boundary = UUID().uuidString
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 30
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }

        var body = Data()
        for (key, value) in fields {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        for (index, (_, imageData)) in images.enumerated() {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"images\"; filename=\"image\(index).jpg\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
            body.append(imageData)
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        req.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            if let err = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw APIError.serverError(err.error)
            }
            throw APIError.serverError("Upload failed (\(http.statusCode))")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - Dashboard
    func getDashboard() async throws -> DashboardResponse { try await request("/dashboard") }

    // MARK: - Tournaments
    func getTournaments() async throws -> [Tournament] { try await request("/tournaments") }
    func getTournament(_ id: String) async throws -> Tournament { try await request("/tournaments/\(id)") }
    func createTournament(_ data: CreateTournamentRequest) async throws -> Tournament { try await request("/tournaments", method: "POST", body: data) }
    func updateTournament(_ id: String, _ data: [String: AnyCodable]) async throws -> Tournament { try await request("/tournaments/\(id)", method: "PUT", body: data) }
    func deleteTournament(_ id: String) async throws { try await requestVoid("/tournaments/\(id)", method: "DELETE") }
    func searchTournaments(_ q: String) async throws -> [Tournament] { try await request("/tournaments/search?q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q)") }
    func getArchivedTournaments() async throws -> [Tournament] { try await request("/tournaments/archived") }
    func archiveTournament(_ id: String, archived: Bool) async throws -> Tournament { try await request("/tournaments/\(id)/archive", method: "PUT", body: ["archived": archived]) }

    // MARK: - Players
    func getPlayers(_ tournamentId: String) async throws -> [Player] { try await request("/players/tournament/\(tournamentId)") }
    func createPlayer(_ data: CreatePlayerRequest) async throws -> Player { try await request("/players", method: "POST", body: data) }
    func updatePlayer(_ id: String, _ data: [String: AnyCodable]) async throws -> Player { try await request("/players/\(id)", method: "PUT", body: data) }
    func deletePlayer(_ id: String) async throws { try await requestVoid("/players/\(id)", method: "DELETE") }

    // MARK: - Matches
    func getMatches(_ tournamentId: String, round: Int? = nil) async throws -> [Match] {
        var path = "/matches/tournament/\(tournamentId)"
        if let r = round { path += "?round=\(r)" }
        return try await request(path)
    }
    func getMatch(_ id: String) async throws -> Match { try await request("/matches/\(id)") }
    func generateRoundRobin(_ tournamentId: String) async throws -> [Match] { try await request("/matches/tournament/\(tournamentId)/round-robin", method: "POST") }
    func generateGauntlet(_ tournamentId: String) async throws -> [Match] { try await request("/matches/tournament/\(tournamentId)/gauntlet", method: "POST") }
    func drawCards(_ matchId: String) async throws -> Match { try await request("/matches/\(matchId)/draw", method: "POST") }
    func vetoSong(_ matchId: String, data: VetoRequest) async throws -> Match { try await request("/matches/\(matchId)/veto", method: "POST", body: data) }
    func submitResult(_ matchId: String, data: SubmitResultRequest) async throws -> Match { try await request("/matches/\(matchId)/result", method: "POST", body: data) }

    // MARK: - Songs
    func getSongs(minLevel: Int? = nil, maxLevel: Int? = nil, mode: String? = nil, search: String? = nil) async throws -> [Song] {
        var params: [String] = []
        if let v = minLevel { params.append("min_level=\(v)") }
        if let v = maxLevel { params.append("max_level=\(v)") }
        if let v = mode { params.append("mode=\(v)") }
        if let v = search { params.append("search=\(v.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? v)") }
        let qs = params.isEmpty ? "" : "?\(params.joined(separator: "&"))"
        return try await request("/songs\(qs)")
    }

    // MARK: - Song Jackets
    func getJacketMap() async throws -> [String: String] { try await request("/songs/jacket-map") }

    // MARK: - Notices
    func getNotices() async throws -> [Notice] { try await request("/notices") }
    func createNotice(_ data: [String: AnyCodable]) async throws -> Notice { try await request("/notices", method: "POST", body: data) }
    func updateNotice(_ id: String, _ data: [String: AnyCodable]) async throws -> Notice { try await request("/notices/\(id)", method: "PUT", body: data) }
    func deleteNotice(_ id: String) async throws { try await requestVoid("/notices/\(id)", method: "DELETE") }

    // MARK: - Auth
    func register(username: String, password: String, email: String, avatar: String, skillTitle: String, skillLevel: Int, gender: String, nationality: String, description: String) async throws -> AuthResponse {
        try await request("/auth/register", method: "POST", body: [
            "username": AnyCodable(username), "password": AnyCodable(password), "email": AnyCodable(email),
            "avatar": AnyCodable(avatar), "skill_title": AnyCodable(skillTitle), "skill_level": AnyCodable(skillLevel),
            "gender": AnyCodable(gender), "nationality": AnyCodable(nationality), "description": AnyCodable(description),
        ])
    }
    func login(username: String, password: String) async throws -> AuthResponse {
        try await request("/auth/login", method: "POST", body: ["username": username, "password": password])
    }
    func getMe() async throws -> User { try await request("/auth/me") }
    func updateMe(_ data: [String: AnyCodable]) async throws -> User { try await request("/auth/me", method: "PUT", body: data) }
    func changePassword(currentPassword: String, newPassword: String) async throws -> GenericResponse {
        try await request("/auth/password", method: "PUT", body: ["current_password": currentPassword, "new_password": newPassword])
    }
    func searchUsers(_ q: String) async throws -> [User] { try await request("/auth/search?q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q)") }
    func getUserProfile(_ id: String) async throws -> User { try await request("/auth/user/\(id)") }
    func getUserStats(_ id: String) async throws -> UserStats { try await request("/auth/user/\(id)/stats") }
    func getUserAchievements(_ id: String) async throws -> [AchievementBadge] {
        let response: AchievementsWrapper = try await request("/auth/user/\(id)/achievements")
        return response.achievements ?? []
    }
    private struct AchievementsWrapper: Codable {
        var achievements: [AchievementBadge]?
    }
    func getInvitations() async throws -> [Invitation] { try await request("/auth/invitations") }
    func respondInvitation(_ id: String, status: String) async throws -> GenericResponse { try await request("/auth/invitations/\(id)", method: "PUT", body: ["status": status]) }
    func sendInvitation(_ data: [String: AnyCodable]) async throws -> GenericResponse { try await request("/auth/invite", method: "POST", body: data) }

    // MARK: - Online Duels
    func getOnlineDuels() async throws -> [OnlineDuel] { try await request("/online-duels") }
    func getOnlineDuel(_ id: String) async throws -> OnlineDuel { try await request("/online-duels/\(id)") }
    func createOnlineDuel(_ data: [String: AnyCodable]) async throws -> OnlineDuel { try await request("/online-duels", method: "POST", body: data) }
    func joinOnlineDuel(_ id: String) async throws -> GenericResponse { try await request("/online-duels/\(id)/join", method: "POST") }
    func deleteOnlineDuel(_ id: String) async throws { try await requestVoid("/online-duels/\(id)", method: "DELETE") }
    func getOnlineDuelChat(_ id: String, after: String? = nil) async throws -> [ChatMessage] {
        var path = "/online-duels/\(id)/chat"
        if let a = after { path += "?after=\(a.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? a)" }
        return try await request(path)
    }
    func sendChatMessage(_ id: String, message: String) async throws -> ChatMessage { try await request("/online-duels/\(id)/chat", method: "POST", body: ["message": message]) }
    func onlineDuelDraw(_ id: String, data: [String: AnyCodable]) async throws -> OnlineDuelSong { try await request("/online-duels/\(id)/draw", method: "POST", body: data) }
    func onlineDuelAccept(_ id: String, songId: String) async throws -> GenericResponse { try await request("/online-duels/\(id)/accept", method: "POST", body: ["song_id": songId]) }
    func onlineDuelDecline(_ id: String, songId: String) async throws -> GenericResponse { try await request("/online-duels/\(id)/decline", method: "POST", body: ["song_id": songId]) }
    func onlineDuelSubmitScore(_ id: String, data: [String: AnyCodable]) async throws -> GenericResponse { try await request("/online-duels/\(id)/submit-score", method: "POST", body: data) }
    func onlineDuelEndRequest(_ id: String) async throws -> GenericResponse { try await request("/online-duels/\(id)/end-request", method: "POST") }
    func onlineDuelCancelEnd(_ id: String) async throws -> GenericResponse { try await request("/online-duels/\(id)/cancel-end", method: "POST") }
    func pumpPlayer(_ id: String, player: String) async throws -> GenericResponse { try await request("/online-duels/\(id)/pump", method: "POST", body: ["player": player]) }
    func getMyPump(_ id: String) async throws -> MyPumpResponse { try await request("/online-duels/\(id)/my-pump") }

    // MARK: - PIUGame
    func getPiugameCredentialStatus() async throws -> PiugameCredentialStatus { try await request("/piugame/credentials/status") }
    func savePiugameCredentials(username: String, password: String) async throws -> GenericResponse { try await request("/piugame/credentials", method: "POST", body: ["username": username, "password": password]) }
    func deletePiugameCredentials() async throws -> GenericResponse { try await request("/piugame/credentials", method: "DELETE") }
    func syncPumbility() async throws -> PumbilityData { try await request("/piugame/sync/pumbility", method: "POST", timeout: 300) }
    func syncBestScores() async throws -> GenericResponse { try await request("/piugame/sync/best-scores", method: "POST", timeout: 300) }
    func syncRecentlyPlayed() async throws -> GenericResponse { try await request("/piugame/sync/recently-played", method: "POST", timeout: 300) }
    func getPiugamePumbility(_ userId: String) async throws -> PumbilityData { try await request("/piugame/pumbility/\(userId)") }
    func getPiugameBestScores(_ userId: String, mode: String? = nil) async throws -> [BestScore] {
        var path = "/piugame/best-scores/\(userId)"
        if let m = mode { path += "?mode=\(m)" }
        return try await request(path)
    }
    func getPiugameRecentlyPlayed(_ userId: String) async throws -> [RecentlyPlayed] {
        let response: RecentlyPlayedWrapper = try await request("/piugame/recently-played/\(userId)")
        return response.plays ?? []
    }
    func getPiugameRecentlyPlayed(_ userId: String, year: Int) async throws -> [RecentlyPlayed] {
        let response: RecentlyPlayedWrapper = try await request("/piugame/recently-played/\(userId)?year=\(year)")
        return response.plays ?? []
    }
    private struct RecentlyPlayedWrapper: Codable {
        var plays: [RecentlyPlayed]?
    }
    func getPiugameSyncStatus(_ userId: String) async throws -> PiugameSyncStatus { try await request("/piugame/sync-status/\(userId)") }
    func getSyncProgress() async throws -> SyncProgressResponse { try await request("/piugame/sync/progress") }
    func getPiuSyncStatus(_ userId: String) async throws -> PiuSyncStatus { try await request("/piugame/sync-status/\(userId)") }

    // MARK: - Notifications
    func getNotifications() async throws -> NotificationsResponse { try await request("/auth/notifications") }
    func markNotificationRead(_ id: Int) async throws -> GenericResponse { try await request("/auth/notifications/\(id)/read", method: "PUT") }
    func markAllNotificationsRead() async throws -> GenericResponse { try await request("/auth/notifications/read-all", method: "PUT") }
    func deleteNotification(_ id: Int) async throws { try await requestVoid("/auth/notifications/\(id)", method: "DELETE") }

    // MARK: - Social: Follows
    func followUser(_ userId: String) async throws -> GenericResponse { try await request("/social/follow/\(userId)", method: "POST") }
    func unfollowUser(_ userId: String) async throws -> GenericResponse { try await request("/social/follow/\(userId)", method: "DELETE") }
    func getFollowing(_ userId: String) async throws -> [User] { try await request("/social/following/\(userId)") }
    func getFollowers(_ userId: String) async throws -> [User] { try await request("/social/followers/\(userId)") }
    func getFollowStatus(_ userId: String) async throws -> FollowStatus { try await request("/social/follow-status/\(userId)") }
    func getSocialCounts(_ userId: String) async throws -> SocialCounts { try await request("/social/counts/\(userId)") }

    // MARK: - Social: Posts
    func createPost(content: String, imageData: [(String, Data)], youtubeUrl: String?, commentsDisabled: Bool) async throws -> Post {
        var fields: [String: String] = ["content": content]
        if let yt = youtubeUrl, !yt.isEmpty { fields["youtube_url"] = yt }
        if commentsDisabled { fields["comments_disabled"] = "true" }
        return try await uploadMultipart("/social/posts", fields: fields, images: imageData)
    }
    func getUserPosts(_ userId: String, page: Int = 1) async throws -> [Post] { try await request("/social/posts/user/\(userId)?page=\(page)") }
    func editPost(_ id: Int, data: [String: AnyCodable]) async throws -> Post { try await request("/social/posts/\(id)", method: "PUT", body: data) }
    func deletePost(_ id: Int) async throws { try await requestVoid("/social/posts/\(id)", method: "DELETE") }

    // MARK: - Social: Post Pumps
    func pumpPost(_ id: Int) async throws -> PumpResponse { try await request("/social/posts/\(id)/pump", method: "POST") }

    // MARK: - Social: Post Comments
    func getPostComments(_ postId: Int) async throws -> [Comment] { try await request("/social/posts/\(postId)/comments") }
    func addPostComment(_ postId: Int, content: String, parentId: Int? = nil) async throws -> Comment {
        var body: [String: AnyCodable] = ["content": AnyCodable(content)]
        if let p = parentId { body["parent_id"] = AnyCodable(p) }
        return try await request("/social/posts/\(postId)/comments", method: "POST", body: body)
    }
    func deletePostComment(_ id: Int) async throws { try await requestVoid("/social/posts/comments/\(id)", method: "DELETE") }
    func togglePostComments(_ postId: Int) async throws -> GenericResponse { try await request("/social/posts/\(postId)/comments-toggle", method: "PATCH") }

    // MARK: - Social: Upscore Interactions
    func pumpUpscore(_ id: Int) async throws -> PumpResponse { try await request("/social/upscores/\(id)/pump", method: "POST") }
    func getUpscoreComments(_ upscoreId: Int) async throws -> [Comment] { try await request("/social/upscores/\(upscoreId)/comments") }
    func addUpscoreComment(_ upscoreId: Int, content: String, parentId: Int? = nil) async throws -> Comment {
        var body: [String: AnyCodable] = ["content": AnyCodable(content)]
        if let p = parentId { body["parent_id"] = AnyCodable(p) }
        return try await request("/social/upscores/\(upscoreId)/comments", method: "POST", body: body)
    }
    func deleteUpscoreComment(_ id: Int) async throws { try await requestVoid("/social/upscores/comments/\(id)", method: "DELETE") }

    // MARK: - Social: New Clear Interactions
    func pumpNewClear(_ id: Int) async throws -> PumpResponse { try await request("/social/clears/\(id)/pump", method: "POST") }
    func getNewClearComments(_ clearId: Int) async throws -> [Comment] { try await request("/social/clears/\(clearId)/comments") }
    func addNewClearComment(_ clearId: Int, content: String, parentId: Int? = nil) async throws -> Comment {
        var body: [String: AnyCodable] = ["content": AnyCodable(content)]
        if let p = parentId { body["parent_id"] = AnyCodable(p) }
        return try await request("/social/clears/\(clearId)/comments", method: "POST", body: body)
    }
    func deleteNewClearComment(_ id: Int) async throws { try await requestVoid("/social/clears/comments/\(id)", method: "DELETE") }

    // MARK: - Social: Comment Pumps
    func pumpComment(type: String, commentId: Int) async throws -> PumpResponse { try await request("/social/comments/\(type)/\(commentId)/pump", method: "POST") }

    // MARK: - Social: Individual Items
    func getPost(_ id: Int) async throws -> Post { try await request("/social/posts/\(id)") }
    func getUpscore(_ id: Int) async throws -> Upscore { try await request("/social/upscores/\(id)") }
    func getNewClear(_ id: Int) async throws -> NewClear { try await request("/social/clears/\(id)") }

    // MARK: - Social: Feed
    func getFeed(page: Int = 1) async throws -> [FeedItem] {
        // Use lossy decoding so one bad item doesn't kill the whole feed
        let data = try await requestRaw("/social/feed?page=\(page)")
        guard let array = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }
        var items: [FeedItem] = []
        for dict in array {
            if let itemData = try? JSONSerialization.data(withJSONObject: dict),
               let item = try? JSONDecoder().decode(FeedItem.self, from: itemData) {
                items.append(item)
            } else {
                let type = dict["type"] as? String ?? "unknown"
                let id = dict["id"] ?? "?"
                print("[Feed] Failed to decode item type=\(type) id=\(id)")
            }
        }
        return items
    }
    func getRecentActivity() async throws -> [RecentActivity] { try await request("/social/recent-activity") }
    func getDailyHighlights() async throws -> DailyHighlightsData { try await request("/social/daily-highlights") }

    // MARK: - Phases
    func getPhases(_ tournamentId: String) async throws -> [Phase] { try await request("/phases/tournament/\(tournamentId)") }
    func getPhase(_ id: String) async throws -> Phase { try await request("/phases/\(id)") }
    func createPhase(_ data: CreatePhaseRequest) async throws -> Phase { try await request("/phases", method: "POST", body: data) }
    func updatePhase(_ id: String, _ data: [String: AnyCodable]) async throws -> Phase { try await request("/phases/\(id)", method: "PUT", body: data) }
    func deletePhase(_ id: String) async throws { try await requestVoid("/phases/\(id)", method: "DELETE") }
    func activatePhase(_ id: String) async throws -> Phase { try await request("/phases/\(id)/activate", method: "POST") }
    func completePhase(_ id: String) async throws -> Phase { try await request("/phases/\(id)/complete", method: "POST") }
    func generatePhaseMatches(_ phaseId: String) async throws -> [Match] { try await request("/matches/phase/\(phaseId)/generate", method: "POST") }

    // MARK: - Communities
    func getCommunities() async throws -> [Community] { try await request("/communities") }
    func getFeaturedCommunities() async throws -> [Community] { try await request("/communities/featured") }
    func getCommunityByName(_ name: String) async throws -> Community { try await request("/communities/name/\(name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name)") }
    func createCommunity(_ data: [String: AnyCodable]) async throws -> Community { try await request("/communities", method: "POST", body: data) }
    func updateCommunity(_ id: String, _ data: [String: AnyCodable]) async throws -> Community { try await request("/communities/\(id)", method: "PUT", body: data) }
    func deleteCommunity(_ id: String) async throws { try await requestVoid("/communities/\(id)", method: "DELETE") }
    func joinCommunity(_ id: String) async throws -> GenericResponse { try await request("/communities/\(id)/join", method: "POST") }
    func leaveCommunity(_ id: String) async throws -> GenericResponse { try await request("/communities/\(id)/leave", method: "DELETE") }
    func getCommunityMembers(_ id: String) async throws -> [CommunityMember] { try await request("/communities/\(id)/members") }
    func getCommunityPosts(_ id: String) async throws -> [CommunityPost] { try await request("/communities/\(id)/posts") }
    func createCommunityPost(_ communityId: String, content: String) async throws -> CommunityPost { try await request("/communities/\(communityId)/posts", method: "POST", body: ["content": content]) }
    func deleteCommunityPost(_ communityId: String, postId: Int) async throws { try await requestVoid("/communities/\(communityId)/posts/\(postId)", method: "DELETE") }
    func pumpCommunityPost(_ communityId: String, postId: Int) async throws -> PumpResponse { try await request("/communities/\(communityId)/posts/\(postId)/pump", method: "POST") }
    func getCommunityPostComments(_ communityId: String, postId: Int) async throws -> [Comment] { try await request("/communities/\(communityId)/posts/\(postId)/comments") }
    func addCommunityPostComment(_ communityId: String, postId: Int, content: String) async throws -> Comment { try await request("/communities/\(communityId)/posts/\(postId)/comments", method: "POST", body: ["content": content]) }

    // MARK: - Messages & Conversations
    func getHighlights() async throws -> [HighlightCircle] {
        let response: HighlightsResponse = try await request("/messages/highlights")
        // circles already includes self with is_self=true
        return response.circles ?? []
    }
    func getUserStories(_ userId: String) async throws -> UserStoryResponse { try await request("/messages/highlights/\(userId)/story") }
    func viewStory(_ userId: String, storyId: String) async throws -> GenericResponse { try await request("/messages/highlights/\(userId)/story/\(storyId)/view", method: "POST") }
    func pumpStory(_ userId: String, storyId: String) async throws -> GenericResponse { try await request("/messages/highlights/\(userId)/story/\(storyId)/pump", method: "POST") }

    // MARK: - Notes
    func createNote(content: String) async throws -> GenericResponse { try await request("/messages/highlights/note", method: "POST", body: ["content": content]) }
    func clearNote() async throws -> GenericResponse { try await request("/messages/highlights/note", method: "DELETE") }

    // MARK: - Story Creation
    func createStoryText(caption: String) async throws -> GenericResponse { try await request("/messages/highlights/story", method: "POST", body: ["story_type": "link", "caption": caption]) }
    func createStorySnapshot(caption: String, snapshotJson: String) async throws -> GenericResponse {
        let body: [String: AnyCodable] = ["story_type": AnyCodable("score_snapshot"), "caption": AnyCodable(caption), "snapshot_json": AnyCodable(snapshotJson)]
        return try await request("/messages/highlights/story", method: "POST", body: body)
    }

    // MARK: - Stomp & Nudge
    func sendStomp(_ conversationId: String) async throws -> GenericResponse { try await request("/messages/conversations/\(conversationId)/stomp", method: "POST", body: [String: String]()) }
    func sendNudge(_ conversationId: String) async throws -> GenericResponse { try await request("/messages/conversations/\(conversationId)/nudge", method: "POST", body: [String: String]()) }

    // MARK: - Send link_share message
    func sendLinkShareMessage(_ conversationId: String, linkShare: [String: AnyCodable]) async throws -> DirectMessage { try await request("/messages/conversations/\(conversationId)/messages", method: "POST", body: ["content": AnyCodable(""), "link_share": AnyCodable(linkShare)]) }

    func getConversations() async throws -> [Conversation] {
        let response: ConversationsResponse = try await request("/messages/conversations")
        return response.conversations ?? []
    }
    func getConversation(_ id: String) async throws -> Conversation { try await request("/messages/conversations/\(id)") }
    func getMessages(_ conversationId: String) async throws -> [DirectMessage] {
        let response: ConversationDetailResponse = try await request("/messages/conversations/\(conversationId)?limit=50")
        return response.messages ?? []
    }
    func sendMessage(_ conversationId: String, content: String) async throws -> DirectMessage { try await request("/messages/conversations/\(conversationId)/messages", method: "POST", body: ["content": content]) }
    func deleteMessage(_ conversationId: String, messageId: String) async throws { try await requestVoid("/messages/conversations/\(conversationId)/messages/\(messageId)", method: "DELETE") }
    func markConversationRead(_ conversationId: String) async throws -> GenericResponse { try await request("/messages/conversations/\(conversationId)/read", method: "POST") }
    func updateConversationTheme(_ conversationId: String, theme: String) async throws -> GenericResponse { try await request("/messages/conversations/\(conversationId)/theme", method: "PUT", body: ["theme": theme]) }
    func pinConversation(_ conversationId: String, pin: Bool) async throws -> GenericResponse { try await request("/messages/conversations/\(conversationId)/pin", method: "PUT", body: ["pinned": AnyCodable(pin)]) }
    func startDirectConversation(_ userId: String) async throws -> Conversation { try await request("/messages/direct/\(userId)", method: "POST") }
    func createSquad(_ data: SquadCreateRequest) async throws -> Conversation { try await request("/messages/squads", method: "POST", body: data) }
    func getSquadInfo(_ conversationId: String) async throws -> SquadInfo { try await request("/messages/conversations/\(conversationId)/squad") }

    // MARK: - Live Sessions
    func getLiveSessions() async throws -> [LiveSession] { try await request("/live/sessions") }
    func getMyActiveSession() async throws -> LiveSession? { try await request("/live/sessions/mine/active") }
    func createLiveSession(_ data: [String: AnyCodable]) async throws -> LiveSession { try await request("/live/sessions", method: "POST", body: data) }
    func getLiveSession(_ id: String) async throws -> LiveSession { try await request("/live/sessions/\(id)") }
    func getLiveSessionSnapshot(_ id: String) async throws -> LiveSessionSnapshot { try await request("/live/sessions/\(id)") }
    func updateLiveSession(_ id: String, _ data: [String: AnyCodable]) async throws -> LiveSession { try await request("/live/sessions/\(id)", method: "PATCH", body: data) }
    func addCohost(_ sessionId: String, userId: String) async throws -> GenericResponse { try await request("/live/sessions/\(sessionId)/cohosts", method: "POST", body: ["user_id": userId]) }
    func removeCohost(_ sessionId: String, userId: String) async throws { try await requestVoid("/live/sessions/\(sessionId)/cohosts/\(userId)", method: "DELETE") }
    func endLiveSession(_ id: String) async throws -> GenericResponse { try await request("/live/sessions/\(id)/end", method: "POST") }
    func getLiveMessages(_ sessionId: String) async throws -> [LiveMessage] { try await request("/live/sessions/\(sessionId)/messages") }
    func sendLiveMessage(_ sessionId: String, content: String) async throws -> LiveMessage { try await request("/live/sessions/\(sessionId)/messages", method: "POST", body: ["content": content]) }
    func createLiveRequest(_ sessionId: String, data: [String: AnyCodable]) async throws -> LiveRequest { try await request("/live/sessions/\(sessionId)/requests", method: "POST", body: data) }
    func voteLiveRequest(_ sessionId: String, requestId: String, vote: Int) async throws -> GenericResponse { try await request("/live/sessions/\(sessionId)/votes", method: "POST", body: ["request_id": AnyCodable(requestId), "vote": AnyCodable(vote)]) }
    func updateRequestStatus(_ sessionId: String, requestId: String, status: String) async throws -> GenericResponse { try await request("/live/sessions/\(sessionId)/requests/\(requestId)/status", method: "POST", body: ["status": status]) }
    func createLiveVote(_ sessionId: String, modeFilter: String, minLevel: Int, maxLevel: Int) async throws -> GenericResponse { try await request("/live/sessions/\(sessionId)/votes", method: "POST", body: ["mode_filter": AnyCodable(modeFilter), "min_level": AnyCodable(minLevel), "max_level": AnyCodable(maxLevel)]) }
    func castLiveVote(_ voteId: String, optionId: String) async throws -> GenericResponse { try await request("/live/votes/\(voteId)/cast", method: "POST", body: ["option_id": optionId]) }
    func sendLivePresence(_ sessionId: String) async throws -> GenericResponse { try await request("/live/sessions/\(sessionId)/presence", method: "POST", body: [String: String]()) }
    func pumpLiveMessage(_ sessionId: String, messageId: String) async throws -> GenericResponse { try await request("/live/sessions/\(sessionId)/messages/\(messageId)/pump", method: "POST", body: [String: String]()) }
    func deleteLiveMessage(_ sessionId: String, messageId: String) async throws -> GenericResponse { try await request("/live/sessions/\(sessionId)/messages/\(messageId)/delete", method: "POST", body: [String: String]()) }
    func getLiveProfile(_ userId: String) async throws -> [String: AnyCodable] { try await request("/live/profile/\(userId)") }
    func getHopLeaderboard() async throws -> [HopLeaderboardEntry] { try await request("/live/hop/leaderboard") }
    func getHopAttempts() async throws -> [HopLeaderboardEntry] { try await request("/live/hop/attempts") }

    // MARK: - Profile Live Sessions
    func getProfileLiveSessions(_ userId: String) async throws -> ProfileLiveResponse { try await request("/live/profile/\(userId)") }

    // MARK: - User Activity
    func getUserActivity(_ userId: String) async throws -> [ActivityItem] { try await request("/auth/user/\(userId)/activity") }

    // MARK: - Shoes
    func getProfileShoes(_ userId: String) async throws -> ShoeCabinet { try await request("/piugame/shoes/\(userId)") }
    func wearShoe(_ shoeId: String) async throws -> GenericResponse { try await request("/piugame/shoes/\(shoeId)/wear", method: "POST") }

    // MARK: - Duels (offline)
    func getDuels() async throws -> [Duel] { try await request("/duels") }
    func getDuel(_ id: String) async throws -> Duel { try await request("/duels/\(id)") }
    func createDuel(_ data: [String: AnyCodable]) async throws -> Duel { try await request("/duels", method: "POST", body: data) }
    func duelDraw(_ id: String, level: Int, drawMode: String? = nil) async throws -> [String: AnyCodable] {
        var body: [String: AnyCodable] = ["level": AnyCodable(level)]
        if let dm = drawMode { body["draw_mode"] = AnyCodable(dm) }
        return try await request("/duels/\(id)/draw", method: "POST", body: body)
    }
    func duelScore(_ id: String, songEntryId: String, p1Score: Int, p2Score: Int) async throws -> GenericResponse { try await request("/duels/\(id)/score", method: "POST", body: ["song_entry_id": AnyCodable(songEntryId), "player1_score": AnyCodable(p1Score), "player2_score": AnyCodable(p2Score)]) }
    func deleteDuelSong(_ id: String, songEntryId: String) async throws { try await requestVoid("/duels/\(id)/song/\(songEntryId)", method: "DELETE") }
    func endDuel(_ id: String) async throws -> GenericResponse { try await request("/duels/\(id)/end", method: "POST") }
    func deleteDuel(_ id: String) async throws { try await requestVoid("/duels/\(id)", method: "DELETE") }

    // MARK: - Online Duel Additions
    func getOnlineDuelHistory(_ userId: String) async throws -> [OnlineDuel] { try await request("/online-duels/user/\(userId)/history") }
    func predictOnlineDuel(_ id: String, prediction: String) async throws -> GenericResponse { try await request("/online-duels/\(id)/predict", method: "POST", body: ["prediction": prediction]) }
    func getOnlineDuelPredictions(_ id: String) async throws -> [String: AnyCodable] { try await request("/online-duels/\(id)/predictions") }

    // MARK: - Songs (Extended)
    func getSongLibrary() async throws -> SongLibraryResponse { try await request("/songs/library") }
    func getChartDetail(_ chartId: Int) async throws -> ChartDetailResponse { try await request("/songs/chart/\(chartId)") }
    func resolveChartId(title: String, mode: String, level: Int) async throws -> Int? {
        let lib: SongLibraryResponse = try await request("/songs/library")
        for song in lib.songs ?? [] {
            if song.title?.lowercased() == title.lowercased() {
                for chart in song.charts ?? [] {
                    if chart.mode?.lowercased() == mode.lowercased() && chart.level == level {
                        return chart.chartId
                    }
                }
            }
        }
        return nil
    }
    func getSkillsMeta() async throws -> [ChartSkill] { try await request("/songs/skills/meta") }
    func getSkillCharts(_ skillSlug: String) async throws -> [ChartDetail] { try await request("/songs/skill/\(skillSlug)") }
    func updateChartSkills(_ chartId: Int, skills: [String]) async throws -> GenericResponse { try await request("/songs/chart/\(chartId)/skills", method: "PUT", body: ["skills": AnyCodable(skills)]) }
    func getSongAnalytics(_ userId: String) async throws -> SongAnalytics { try await request("/songs/analytics/user/\(userId)") }
    func getTiers(mode: String? = nil, level: Int? = nil) async throws -> TiersResponse {
        var params: [String] = ["tier_list_type=Pass"]
        if let m = mode { params.append("mode=\(m)") }
        if let l = level { params.append("level=\(l)") }
        let qs = params.joined(separator: "&")
        return try await request("/songs/tiers?\(qs)")
    }
    func getTiersMeta() async throws -> TiersMetaResponse { try await request("/songs/tiers/meta?tier_list_type=Pass") }
    func getSongLists() async throws -> [SongList] { try await request("/songs/lists") }
    func createSongList(name: String, description: String?) async throws -> SongList {
        var body: [String: AnyCodable] = ["name": AnyCodable(name)]
        if let d = description { body["description"] = AnyCodable(d) }
        return try await request("/songs/lists", method: "POST", body: body)
    }
    func updateSongList(_ listId: String, name: String?, description: String?) async throws -> SongList {
        var body: [String: AnyCodable] = [:]
        if let n = name { body["name"] = AnyCodable(n) }
        if let d = description { body["description"] = AnyCodable(d) }
        return try await request("/songs/lists/\(listId)", method: "PUT", body: body)
    }
    func deleteSongList(_ listId: String) async throws { try await requestVoid("/songs/lists/\(listId)", method: "DELETE") }
    func addToSongList(_ listId: String, chartId: Int) async throws -> GenericResponse { try await request("/songs/lists/\(listId)/items", method: "POST", body: ["chart_id": chartId]) }
    func removeFromSongList(_ listId: String, itemId: String) async throws { try await requestVoid("/songs/lists/\(listId)/items/\(itemId)", method: "DELETE") }

    // MARK: - Checkins
    func getVenues() async throws -> [Venue] { try await request("/checkins/venues") }
    func getVenue(_ slug: String) async throws -> Venue { try await request("/checkins/venue/\(slug)") }
    func checkin(venueId: String, lat: Double, lng: Double) async throws -> GenericResponse { try await request("/checkins/checkin", method: "POST", body: ["venue_id": AnyCodable(venueId), "location_lat": AnyCodable(lat), "location_lng": AnyCodable(lng)]) }
    func checkout() async throws -> GenericResponse { try await request("/checkins/checkout", method: "POST") }
    func getCheckinStatus() async throws -> CheckinStatus { try await request("/checkins/my-status") }
    func getActiveCheckins(_ venueSlug: String) async throws -> [String: AnyCodable] { try await request("/checkins/active/\(venueSlug)") }
    func getCheckinHistory() async throws -> [CheckinHistory] { try await request("/checkins/history") }
    func updatePlayingStatus(_ status: String) async throws -> GenericResponse { try await request("/checkins/playing-status", method: "PUT", body: ["status": status]) }

    // MARK: - Venue Access
    func getVenueAccessConfig() async throws -> [String: AnyCodable] { try await request("/venue-access/config") }
    func getVenuePlans(_ venueSlug: String) async throws -> [VenuePlan] { try await request("/venue-access/plans/\(venueSlug)") }
    func getMyVenueAccess(_ venueSlug: String) async throws -> VenueAccessStatus { try await request("/venue-access/my-access/\(venueSlug)") }
    func getMyMembership(_ venueSlug: String) async throws -> VenueMembership { try await request("/venue-access/my-membership/\(venueSlug)") }
    func purchaseDayPass(venueSlug: String, date: String) async throws -> [String: AnyCodable] { try await request("/venue-access/purchase/day-pass", method: "POST", body: ["venue_slug": AnyCodable(venueSlug), "date": AnyCodable(date)]) }
    func purchaseSubscription(venueSlug: String, planId: String, cadenceKey: String) async throws -> [String: AnyCodable] { try await request("/venue-access/purchase/subscription", method: "POST", body: ["venue_slug": AnyCodable(venueSlug), "plan_id": AnyCodable(planId), "cadence_key": AnyCodable(cadenceKey)]) }
    func cancelSubscription(_ subscriptionId: String) async throws -> GenericResponse { try await request("/venue-access/cancel-subscription", method: "POST", body: ["subscription_id": subscriptionId]) }
    func getMyPayments() async throws -> [[String: AnyCodable]] { try await request("/venue-access/my-payments") }

    // MARK: - World Max
    func getWorldMaxMeta() async throws -> WorldMaxMeta { try await request("/world-max/meta") }
    func getWorldMaxMachines() async throws -> [WorldMaxMachine] { try await request("/world-max/machines") }
    func getWorldMaxMachine(_ id: String) async throws -> WorldMaxMachine { try await request("/world-max/machines/\(id)") }
    func createWorldMaxMachine(_ data: [String: AnyCodable]) async throws -> WorldMaxMachine { try await request("/world-max/machines", method: "POST", body: data) }
    func updateWorldMaxMachine(_ id: String, _ data: [String: AnyCodable]) async throws -> WorldMaxMachine { try await request("/world-max/machines/\(id)", method: "PUT", body: data) }
    func searchWorldMaxMachines(_ q: String) async throws -> [WorldMaxMachine] { try await request("/world-max/search?q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q)") }

    // MARK: - Changelog
    func getChangelog() async throws -> [ChangelogEntry] { try await request("/changelog") }
    func createChangelogEntry(_ data: [String: AnyCodable]) async throws -> ChangelogEntry { try await request("/changelog", method: "POST", body: data) }
    func updateChangelogEntry(_ id: String, _ data: [String: AnyCodable]) async throws -> ChangelogEntry { try await request("/changelog/\(id)", method: "PUT", body: data) }
    func deleteChangelogEntry(_ id: String) async throws { try await requestVoid("/changelog/\(id)", method: "DELETE") }

    // MARK: - Chatbot
    func sendChatbotMessage(_ message: String) async throws -> [String: AnyCodable] { try await request("/chatbot/message", method: "POST", body: ["message": message], timeout: 30) }

    // MARK: - Shoes
    func getShoeTopStats(limit: Int = 24) async throws -> [Shoe] { try await request("/piugame/shoes/stats/top?limit=\(limit)") }
    func getUserShoes(_ userId: String) async throws -> [Shoe] { try await request("/piugame/shoes/\(userId)") }

    // MARK: - Auth Admin
    func getAdminFeatures() async throws -> [[String: AnyCodable]] { try await request("/auth/admin/features") }
    func getFeatureUsers(_ featureKey: String) async throws -> [User] { try await request("/auth/admin/features/\(featureKey)/users") }
    func addFeatureUser(_ featureKey: String, userId: String) async throws -> GenericResponse { try await request("/auth/admin/features/\(featureKey)/users", method: "POST", body: ["user_id": userId]) }
    func removeFeatureUser(_ featureKey: String, userId: String) async throws { try await requestVoid("/auth/admin/features/\(featureKey)/users/\(userId)", method: "DELETE") }
    func getAdminGroups() async throws -> [[String: AnyCodable]] { try await request("/auth/admin/groups") }
    func createAdminGroup(_ data: [String: AnyCodable]) async throws -> [String: AnyCodable] { try await request("/auth/admin/groups", method: "POST", body: data) }
    func getUserByUsername(_ username: String) async throws -> User { try await request("/auth/user/username/\(username.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? username)") }
    func getUserActivity(_ userId: String) async throws -> [RecentActivity] { try await request("/auth/user/\(userId)/activity") }

    // MARK: - QR Login
    func createQRLoginChallenge() async throws -> [String: AnyCodable] { try await request("/auth/qr-login/challenges", method: "POST") }
    func getQRLoginChallenge(_ id: String) async throws -> [String: AnyCodable] { try await request("/auth/qr-login/challenges/\(id)") }
    func approveQRLogin(_ id: String) async throws -> GenericResponse { try await request("/auth/qr-login/challenges/\(id)/approve", method: "POST") }
    func pollQRLogin(_ id: String) async throws -> [String: AnyCodable] { try await request("/auth/qr-login/challenges/\(id)/poll") }

    // MARK: - Leaderboards
    func getPumbilityLeaderboard(metric: String = "overall") async throws -> PumbilityLeaderboardResponse { try await request("/piugame/leaderboards/pumbility?metric=\(metric)") }

    // MARK: - Head to Head
    func getHeadToHead(userId1: String, userId2: String) async throws -> [[String: AnyCodable]] { try await request("/songs/analytics/head-to-head?user1=\(userId1)&user2=\(userId2)") }

    // MARK: - Weekly Challenges
    func getWeeklyChallengesHome() async throws -> WCHomeResponse { try await request("/weekly-challenges/home") }
    func getWeeklyChallengeWeeks() async throws -> [WCWeek] { try await request("/weekly-challenges/weeks") }
    func getWeeklyChallengeWeek(weekKey: String, chartMode: String = "both", leaderboardMode: String = "both", skillFamily: String = "all") async throws -> WCWeekDetailResponse {
        var path = "/weekly-challenges/week/\(weekKey)?chart_mode=\(chartMode)&leaderboard_mode=\(leaderboardMode)&skill_family=\(skillFamily)"
        return try await request(path)
    }
    func getWeeklyChallengeChartScores(chartId: Int) async throws -> WCChartScoresResponse { try await request("/weekly-challenges/charts/\(chartId)/scores") }
    func getWeeklyChallengeUserHistory(userId: String) async throws -> [WCUserHistory] { try await request("/weekly-challenges/users/\(userId)/history") }

    // MARK: - Weekly Challenge Play Posts
    func getWeeklyChallengePlay(id: Int) async throws -> [String: AnyCodable] { try await request("/social/weekly-challenge-plays/\(id)") }
    func pumpWeeklyChallengePlay(id: Int) async throws -> PumpResponse { try await request("/social/weekly-challenge-plays/\(id)/pump", method: "POST") }
    func getWeeklyChallengePlayComments(playId: Int) async throws -> [Comment] { try await request("/social/weekly-challenge-plays/\(playId)/comments") }
    func addWeeklyChallengePlayComment(playId: Int, content: String, parentId: Int? = nil) async throws -> Comment {
        var body: [String: AnyCodable] = ["content": AnyCodable(content)]
        if let pid = parentId { body["parent_id"] = AnyCodable(pid) }
        return try await request("/social/weekly-challenge-plays/\(playId)/comments", method: "POST", body: body)
    }
    func deleteWeeklyChallengePlayComment(commentId: Int) async throws { try await requestVoid("/social/weekly-challenge-plays/comments/\(commentId)", method: "DELETE") }
}

// MARK: - Helper Types

struct ErrorResponse: Codable {
    let error: String
}

struct GenericResponse: Codable {
    var message: String?
    var success: Bool?
}

struct MyPumpResponse: Codable {
    var player: String?
}

struct DashboardResponse: Codable {
    var tournaments: [Tournament]?
    var notices: [Notice]?
}

// Type-erased Codable for flexible dictionaries
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let v = try? container.decode(String.self) { value = v }
        else if let v = try? container.decode(Int.self) { value = v }
        else if let v = try? container.decode(Double.self) { value = v }
        else if let v = try? container.decode(Bool.self) { value = v }
        else { value = "" }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let v = value as? String { try container.encode(v) }
        else if let v = value as? Int { try container.encode(v) }
        else if let v = value as? Double { try container.encode(v) }
        else if let v = value as? Bool { try container.encode(v) }
        else { try container.encode("\(value)") }
    }
}

