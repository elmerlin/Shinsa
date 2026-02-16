import Foundation

@MainActor
class FeedViewModel: ObservableObject {
    @Published var items: [FeedItem] = []
    @Published var isLoading = false
    @Published var hasMore = true
    @Published var page = 1

    func loadInitial() async {
        page = 1
        isLoading = true
        do {
            let response = try await APIService.shared.getFeed(page: 1)
            items = response.items ?? []
            hasMore = response.hasMore ?? false
        } catch {
            items = []
        }
        isLoading = false
    }

    func loadMore() async {
        guard hasMore, !isLoading else { return }
        isLoading = true
        page += 1
        do {
            let response = try await APIService.shared.getFeed(page: page)
            items.append(contentsOf: response.items ?? [])
            hasMore = response.hasMore ?? false
        } catch {}
        isLoading = false
    }
}
