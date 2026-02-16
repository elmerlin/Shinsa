import Foundation
import Combine

@MainActor
class OnlineDuelViewModel: ObservableObject {
    @Published var duel: OnlineDuel?
    @Published var chatMessages: [ChatMessage] = []
    @Published var isLoading = true
    @Published var errorMessage: String?
    @Published var isDrawing = false
    @Published var isSubmitting = false

    let duelId: String

    private var duelTimer: AnyCancellable?
    private var chatTimer: AnyCancellable?
    private var lastChatTimestamp: String?

    init(duelId: String) {
        self.duelId = duelId
    }

    // MARK: - Computed Properties

    func isCreator(_ userId: String) -> Bool {
        duel?.creatorUserId == userId
    }

    func isMyTurn(_ userId: String) -> Bool {
        duel?.currentTurn == userId
    }

    func myPlayer(_ userId: String) -> String {
        if duel?.creatorUserId == userId { return "player1" }
        return "player2"
    }

    func opponentPlayer(_ userId: String) -> String {
        if duel?.creatorUserId == userId { return "player2" }
        return "player1"
    }

    var isActive: Bool {
        guard let status = duel?.status else { return false }
        return status != "COMPLETED"
    }

    var hasEndRequest: Bool {
        (duel?.player1EndRequested ?? 0) != 0 || (duel?.player2EndRequested ?? 0) != 0
    }

    func myEndRequested(_ userId: String) -> Bool {
        let player = myPlayer(userId)
        if player == "player1" { return (duel?.player1EndRequested ?? 0) != 0 }
        return (duel?.player2EndRequested ?? 0) != 0
    }

    // MARK: - Polling

    func startPolling() {
        loadDuel()
        loadChat()

        duelTimer = Timer.publish(every: 2.5, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.loadDuel()
            }

        chatTimer = Timer.publish(every: 2.0, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.loadChat()
            }
    }

    func stopPolling() {
        duelTimer?.cancel()
        duelTimer = nil
        chatTimer?.cancel()
        chatTimer = nil
    }

    // MARK: - Load

    func loadDuel() {
        Task {
            do {
                let result = try await APIService.shared.getOnlineDuel(duelId)
                duel = result
            } catch {
                if duel == nil {
                    errorMessage = error.localizedDescription
                }
            }
            isLoading = false
        }
    }

    func loadChat() {
        Task {
            do {
                let messages = try await APIService.shared.getOnlineDuelChat(duelId, after: lastChatTimestamp)
                if !messages.isEmpty {
                    chatMessages.append(contentsOf: messages)
                    lastChatTimestamp = messages.last?.createdAt
                }
            } catch {}
        }
    }

    // MARK: - Actions

    func sendMessage(_ text: String) async {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        do {
            let msg = try await APIService.shared.sendChatMessage(duelId, message: text)
            chatMessages.append(msg)
            lastChatTimestamp = msg.createdAt
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func drawSong(songId: Int, songTitle: String, songArtist: String, songMode: String, songLevel: Int, songBpm: String) async {
        isDrawing = true
        do {
            let data: [String: AnyCodable] = [
                "song_id": AnyCodable(songId),
                "song_title": AnyCodable(songTitle),
                "song_artist": AnyCodable(songArtist),
                "song_mode": AnyCodable(songMode),
                "song_level": AnyCodable(songLevel),
                "song_bpm": AnyCodable(songBpm),
            ]
            _ = try await APIService.shared.onlineDuelDraw(duelId, data: data)
            loadDuel()
        } catch {
            errorMessage = error.localizedDescription
        }
        isDrawing = false
    }

    func acceptSong(_ songId: String) async {
        do {
            _ = try await APIService.shared.onlineDuelAccept(duelId, songId: songId)
            loadDuel()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func declineSong(_ songId: String) async {
        do {
            _ = try await APIService.shared.onlineDuelDecline(duelId, songId: songId)
            loadDuel()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func submitScore(songId: String, score: Int, perfect: Int, great: Int, good: Int, bad: Int, miss: Int, maxCombo: Int, kcal: Double) async {
        isSubmitting = true
        do {
            let data: [String: AnyCodable] = [
                "song_id": AnyCodable(songId),
                "score": AnyCodable(score),
                "perfect": AnyCodable(perfect),
                "great": AnyCodable(great),
                "good": AnyCodable(good),
                "bad": AnyCodable(bad),
                "miss": AnyCodable(miss),
                "max_combo": AnyCodable(maxCombo),
                "kcal": AnyCodable(kcal),
            ]
            _ = try await APIService.shared.onlineDuelSubmitScore(duelId, data: data)
            loadDuel()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }

    func requestEnd() async {
        do {
            _ = try await APIService.shared.onlineDuelEndRequest(duelId)
            loadDuel()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func cancelEnd() async {
        do {
            _ = try await APIService.shared.onlineDuelCancelEnd(duelId)
            loadDuel()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func pumpPlayer(_ player: String) async {
        do {
            _ = try await APIService.shared.pumpPlayer(duelId, player: player)
            loadDuel()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
