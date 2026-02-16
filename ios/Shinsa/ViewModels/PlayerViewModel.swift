import Foundation

@MainActor
class PlayerViewModel: ObservableObject {
    @Published var name = ""
    @Published var skillTitle = "Beginner"
    @Published var skillLevel = 1
    @Published var pumbility = ""
    @Published var avatar = ""
    @Published var gender = ""
    @Published var nationality = ""
    @Published var description = ""
    @Published var userId: String?
    @Published var saving = false
    @Published var errorMessage: String?
    @Published var userSearchQuery = ""
    @Published var userSearchResults: [User] = []
    @Published var isSearching = false

    let tournamentId: String
    var editingPlayer: Player?

    private var searchTask: Task<Void, Never>?

    static let skillTitles = ["Beginner", "Intermediate", "Advanced", "Expert"]
    static let genderOptions = [("", "Not specified"), ("male", "Male"), ("female", "Female")]

    init(tournamentId: String, player: Player? = nil) {
        self.tournamentId = tournamentId
        self.editingPlayer = player
        if let p = player {
            name = p.name
            skillTitle = p.skillTitle ?? "Beginner"
            skillLevel = p.skillLevel
            pumbility = p.pumbility > 0 ? "\(p.pumbility)" : ""
            avatar = p.avatar ?? ""
            gender = p.gender ?? ""
            nationality = p.nationality ?? ""
            description = p.description ?? ""
            userId = p.userId
        }
    }

    func searchUsers(_ query: String) {
        userSearchQuery = query
        searchTask?.cancel()
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
            userSearchResults = []
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            isSearching = true
            userSearchResults = (try? await APIService.shared.searchUsers(query)) ?? []
            isSearching = false
        }
    }

    func selectUser(_ user: User) {
        userId = user.id
        name = user.username
        avatar = user.avatar ?? ""
        skillTitle = user.skillTitle ?? "Beginner"
        skillLevel = user.skillLevel ?? 1
        gender = user.gender ?? ""
        nationality = user.nationality ?? ""
        description = user.description ?? ""
        userSearchQuery = ""
        userSearchResults = []
    }

    func save() async -> Player? {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorMessage = "Player name is required"
            return nil
        }

        saving = true
        errorMessage = nil

        do {
            if let editing = editingPlayer {
                var data: [String: AnyCodable] = [
                    "name": AnyCodable(name),
                    "skill_title": AnyCodable(skillTitle),
                    "skill_level": AnyCodable(skillLevel),
                    "avatar": AnyCodable(avatar),
                    "gender": AnyCodable(gender),
                    "nationality": AnyCodable(nationality),
                    "description": AnyCodable(description),
                ]
                if let uid = userId { data["user_id"] = AnyCodable(uid) }
                let player = try await APIService.shared.updatePlayer(editing.id, data)
                saving = false
                return player
            } else {
                let pumb = Int(pumbility) ?? 0
                let request = CreatePlayerRequest(
                    tournamentId: tournamentId,
                    name: name,
                    pumbility: pumb,
                    avatar: avatar,
                    skillTitle: skillTitle,
                    skillLevel: skillLevel,
                    gender: gender,
                    nationality: nationality,
                    description: description,
                    userId: userId
                )
                let player = try await APIService.shared.createPlayer(request)
                saving = false
                return player
            }
        } catch {
            errorMessage = error.localizedDescription
            saving = false
            return nil
        }
    }
}
