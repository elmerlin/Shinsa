import Foundation

enum LiveTab: String, CaseIterable {
    case chat = "Chat"
    case requests = "Requests"
    case plays = "Plays"
    case recap = "Recap"
}

@MainActor
class LiveViewModel: ObservableObject {
    @Published var sessions: [LiveSession] = []
    @Published var session: LiveSession?
    @Published var messages: [LiveMessage] = []
    @Published var requests: [LiveRequest] = []
    @Published var plays: [LivePlay] = []
    @Published var activeVote: LiveVote?
    @Published var viewerState: LiveViewerState?
    @Published var summary: LiveRecapSummary?
    @Published var lastPlay: LivePlay?
    @Published var isLoading = false
    @Published var messageText = ""
    @Published var selectedTab: LiveTab = .chat

    // Song search for requests
    @Published var songSearchResults: [Song] = []
    @Published var isSearchingSongs = false

    private var pollingTask: Task<Void, Never>?
    private var presenceTask: Task<Void, Never>?

    var isHost: Bool {
        session?.isHost == true
    }

    // MARK: - Load

    func loadSessions() async {
        isLoading = true
        sessions = (try? await APIService.shared.getLiveSessions()) ?? []
        isLoading = false
    }

    func loadSession(_ id: String) async {
        isLoading = true
        await loadSnapshot(id)
        isLoading = false
    }

    private func loadSnapshot(_ id: String) async {
        guard let snapshot = try? await APIService.shared.getLiveSessionSnapshot(id) else { return }
        session = snapshot.session
        messages = snapshot.messages ?? []
        requests = snapshot.requests ?? []
        plays = snapshot.plays ?? []
        activeVote = snapshot.activeVote
        viewerState = snapshot.viewerState
        summary = snapshot.summary
        lastPlay = snapshot.lastPlay

        // Auto-switch to recap when session ended
        if session?.isActive == false && summary != nil {
            selectedTab = .recap
        }
    }

    // MARK: - Polling

    func startPolling(_ sessionId: String) {
        stopPolling()
        pollingTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                guard !Task.isCancelled else { break }
                await loadSnapshot(sessionId)
            }
        }
        // Presence heartbeat every 20s
        presenceTask = Task {
            while !Task.isCancelled {
                _ = try? await APIService.shared.sendLivePresence(sessionId)
                try? await Task.sleep(nanoseconds: 20_000_000_000)
            }
        }
    }

    func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
        presenceTask?.cancel()
        presenceTask = nil
    }

    // MARK: - Chat

    func sendMessage(_ sessionId: String) async {
        let text = messageText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        messageText = ""
        if let msg = try? await APIService.shared.sendLiveMessage(sessionId, content: text) {
            messages.append(msg)
        }
    }

    func pumpMessage(_ sessionId: String, messageId: String) async {
        _ = try? await APIService.shared.pumpLiveMessage(sessionId, messageId: messageId)
    }

    func deleteMessage(_ sessionId: String, messageId: String) async {
        _ = try? await APIService.shared.deleteLiveMessage(sessionId, messageId: messageId)
        messages.removeAll { $0.id == messageId }
    }

    // MARK: - Requests

    func submitRequest(_ sessionId: String, songTitle: String, mode: String, level: Int) async {
        let data: [String: AnyCodable] = [
            "song_title": AnyCodable(songTitle),
            "song_mode": AnyCodable(mode),
            "song_level": AnyCodable(level)
        ]
        _ = try? await APIService.shared.createLiveRequest(sessionId, data: data)
    }

    func voteOnRequest(_ sessionId: String, requestId: String) async {
        _ = try? await APIService.shared.voteLiveRequest(sessionId, requestId: requestId, vote: 1)
    }

    func updateRequestStatus(_ sessionId: String, requestId: String, status: String) async {
        _ = try? await APIService.shared.updateRequestStatus(sessionId, requestId: requestId, status: status)
    }

    // MARK: - Voting

    func createVote(_ sessionId: String, modeFilter: String, minLevel: Int, maxLevel: Int) async {
        _ = try? await APIService.shared.createLiveVote(sessionId, modeFilter: modeFilter, minLevel: minLevel, maxLevel: maxLevel)
    }

    func castVote(_ voteId: String, optionId: String) async {
        _ = try? await APIService.shared.castLiveVote(voteId, optionId: optionId)
    }

    // MARK: - Session Controls

    func endSession(_ sessionId: String) async {
        _ = try? await APIService.shared.endLiveSession(sessionId)
        session?.status = "ended"
        stopPolling()
        // Load final snapshot for recap
        await loadSnapshot(sessionId)
    }

    func addCohost(_ sessionId: String, userId: String) async {
        _ = try? await APIService.shared.addCohost(sessionId, userId: userId)
        await loadSnapshot(sessionId)
    }

    func removeCohost(_ sessionId: String, userId: String) async {
        try? await APIService.shared.removeCohost(sessionId, userId: userId)
        await loadSnapshot(sessionId)
    }

    // MARK: - Song Search

    func searchSongs(_ query: String) async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { songSearchResults = []; return }
        isSearchingSongs = true
        songSearchResults = (try? await APIService.shared.getSongs(search: q)) ?? []
        isSearchingSongs = false
    }
}
