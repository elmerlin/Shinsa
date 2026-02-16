import Foundation

@MainActor
class DashboardViewModel: ObservableObject {
    @Published var tournaments: [Tournament] = []
    @Published var onlineDuels: [OnlineDuel] = []
    @Published var notices: [Notice] = []
    @Published var recentActivity: [RecentActivity] = []
    @Published var searchResults: [Tournament]? = nil
    @Published var searchQuery = ""
    @Published var isSearching = false
    @Published var selectedNotice: Notice? = nil
    @Published var isLoading = false

    private var searchTask: Task<Void, Never>?

    var displayTournaments: [Tournament] {
        searchResults ?? tournaments
    }

    func load() async {
        isLoading = true
        async let t = APIService.shared.getTournaments()
        async let o = APIService.shared.getOnlineDuels()
        async let n = APIService.shared.getNotices()
        async let a = APIService.shared.getRecentActivity()

        tournaments = (try? await t) ?? []
        onlineDuels = (try? await o) ?? []
        notices = (try? await n) ?? []
        recentActivity = (try? await a) ?? []
        isLoading = false
    }

    func search(_ query: String) {
        searchQuery = query
        searchTask?.cancel()

        if query.trimmingCharacters(in: .whitespaces).isEmpty {
            searchResults = nil
            return
        }

        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            isSearching = true
            do {
                let results = try await APIService.shared.searchTournaments(query)
                if !Task.isCancelled { searchResults = results }
            } catch {
                if !Task.isCancelled { searchResults = [] }
            }
            isSearching = false
        }
    }

    func clearSearch() {
        searchQuery = ""
        searchResults = nil
        searchTask?.cancel()
    }

    func deleteTournament(_ id: String) async {
        do {
            try await APIService.shared.deleteTournament(id)
            tournaments.removeAll { $0.id == id }
            searchResults?.removeAll { $0.id == id }
        } catch {}
    }

    func deleteOnlineDuel(_ id: String) async {
        do {
            try await APIService.shared.deleteOnlineDuel(id)
            onlineDuels.removeAll { $0.id == id }
        } catch {}
    }
}
