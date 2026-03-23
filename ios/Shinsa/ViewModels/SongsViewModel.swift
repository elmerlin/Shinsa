import Foundation

@MainActor
class SongsViewModel: ObservableObject {
    @Published var songs: [SongLibraryEntry] = []
    @Published var totalSongs: Int = 0
    @Published var totalCharts: Int = 0
    @Published var searchQuery = ""
    @Published var isLoading = false

    private var allSongs: [SongLibraryEntry] = []

    var filteredSongs: [SongLibraryEntry] {
        guard !searchQuery.isEmpty else { return allSongs }
        let q = searchQuery.lowercased()
        return allSongs.filter { song in
            (song.title?.lowercased().contains(q) ?? false) ||
            (song.artist?.lowercased().contains(q) ?? false)
        }
    }

    func load() async {
        isLoading = true
        do {
            let response = try await APIService.shared.getSongLibrary()
            allSongs = response.songs ?? []
            totalSongs = response.totalSongs ?? allSongs.count
            totalCharts = response.totalCharts ?? 0
        } catch {
            allSongs = []
            totalSongs = 0
            totalCharts = 0
        }
        isLoading = false
    }

    func search(_ query: String) {
        searchQuery = query
    }

    func clearSearch() {
        searchQuery = ""
    }
}
