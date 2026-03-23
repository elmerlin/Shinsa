import Foundation

@MainActor
class LiveViewModel: ObservableObject {
    @Published var sessions: [LiveSession] = []
    @Published var session: LiveSession?
    @Published var messages: [LiveMessage] = []
    @Published var requests: [LiveRequest] = []
    @Published var isLoading = false
    @Published var messageText = ""

    private var pollingTask: Task<Void, Never>?

    func loadSessions() async {
        isLoading = true
        sessions = (try? await APIService.shared.getLiveSessions()) ?? []
        isLoading = false
    }

    func loadSession(_ id: String) async {
        isLoading = true
        session = try? await APIService.shared.getLiveSession(id)
        messages = (try? await APIService.shared.getLiveMessages(id)) ?? []
        isLoading = false
    }

    func startPolling(_ sessionId: String) {
        stopPolling()
        pollingTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                guard !Task.isCancelled else { break }
                let newMessages = (try? await APIService.shared.getLiveMessages(sessionId)) ?? []
                if !Task.isCancelled {
                    messages = newMessages
                }
                if let updated = try? await APIService.shared.getLiveSession(sessionId) {
                    if !Task.isCancelled { session = updated }
                }
            }
        }
    }

    func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    func sendMessage(_ sessionId: String) async {
        let text = messageText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        messageText = ""
        if let msg = try? await APIService.shared.sendLiveMessage(sessionId, content: text) {
            messages.append(msg)
        }
    }

    func createRequest(_ sessionId: String, title: String, mode: String, level: Int) async {
        let data: [String: AnyCodable] = [
            "song_title": AnyCodable(title),
            "song_mode": AnyCodable(mode),
            "song_level": AnyCodable(level)
        ]
        if let req = try? await APIService.shared.createLiveRequest(sessionId, data: data) {
            requests.append(req)
        }
    }

    func voteRequest(_ sessionId: String, requestId: String) async {
        _ = try? await APIService.shared.voteLiveRequest(sessionId, requestId: requestId, vote: 1)
    }

    func endSession(_ sessionId: String) async {
        _ = try? await APIService.shared.endLiveSession(sessionId)
        session?.status = "ended"
        stopPolling()
    }

    func addCohost(_ sessionId: String, userId: String) async {
        _ = try? await APIService.shared.addCohost(sessionId, userId: userId)
        await loadSession(sessionId)
    }

    func removeCohost(_ sessionId: String, userId: String) async {
        try? await APIService.shared.removeCohost(sessionId, userId: userId)
        await loadSession(sessionId)
    }
}
