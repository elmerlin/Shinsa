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
            throw APIError.decodingError(error.localizedDescription)
        }
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
    func getPiugameRecentlyPlayed(_ userId: String) async throws -> [RecentlyPlayed] { try await request("/piugame/recently-played/\(userId)") }
    func getPiugameSyncStatus(_ userId: String) async throws -> PiugameSyncStatus { try await request("/piugame/sync-status/\(userId)") }
    func getSyncProgress() async throws -> SyncProgressResponse { try await request("/piugame/sync/progress") }

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
    func getFeed(page: Int = 1) async throws -> FeedResponse { try await request("/social/feed?page=\(page)") }
    func getRecentActivity() async throws -> [RecentActivity] { try await request("/social/recent-activity") }
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

