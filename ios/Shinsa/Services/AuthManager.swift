import Foundation

@MainActor
class AuthManager: ObservableObject {
    @Published var currentUser: User?
    @Published var isLoading = true

    var isLoggedIn: Bool { currentUser != nil }
    var userId: String { currentUser?.id ?? "" }

    func checkAuth() async {
        guard APIService.shared.token != nil else {
            isLoading = false
            return
        }
        do {
            currentUser = try await APIService.shared.getMe()
        } catch {
            APIService.shared.token = nil
            currentUser = nil
        }
        isLoading = false
    }

    func login(username: String, password: String) async throws {
        let response = try await APIService.shared.login(username: username, password: password)
        APIService.shared.token = response.token
        currentUser = response.user
    }

    func register(username: String, password: String, email: String, avatar: String, skillTitle: String, skillLevel: Int, gender: String, nationality: String, description: String) async throws {
        let response = try await APIService.shared.register(
            username: username, password: password, email: email, avatar: avatar,
            skillTitle: skillTitle, skillLevel: skillLevel, gender: gender,
            nationality: nationality, description: description
        )
        APIService.shared.token = response.token
        currentUser = response.user
    }

    func logout() {
        APIService.shared.token = nil
        currentUser = nil
    }

    func refreshUser() async {
        guard APIService.shared.token != nil else { return }
        currentUser = try? await APIService.shared.getMe()
    }
}
