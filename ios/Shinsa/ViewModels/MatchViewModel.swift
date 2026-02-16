import Foundation

@MainActor
class MatchViewModel: ObservableObject {
    @Published var match: Match?
    @Published var isLoading = false
    @Published var isDrawing = false
    @Published var isSubmitting = false
    @Published var errorMessage: String?
    @Published var scores: [Int: (p1: String, p2: String)] = [:]
    @Published var showCards = false

    let matchId: String

    init(matchId: String) {
        self.matchId = matchId
    }

    var isGauntlet: Bool {
        match?.matchType == "gauntlet"
    }

    var remainingSongs: [Song] {
        guard let match else { return [] }
        let vetoedIds = Set((match.vetoedSongs ?? []).compactMap(\.songId))
        return (match.drawnSongs ?? []).filter { !vetoedIds.contains($0.id) }
    }

    func load() async {
        isLoading = true
        do {
            match = try await APIService.shared.getMatch(matchId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func drawCards() async {
        isDrawing = true
        HapticService.cardDraw()
        do {
            match = try await APIService.shared.drawCards(matchId)
            showCards = true
        } catch {
            errorMessage = error.localizedDescription
        }
        isDrawing = false
    }

    func vetoSong(songId: Int, playerId: String) async {
        HapticService.veto()
        do {
            match = try await APIService.shared.vetoSong(matchId, data: VetoRequest(songId: songId, playerId: playerId))
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func submitResult() async {
        guard let match else { return }
        let songs = remainingSongs

        var playedSongs: [PlayedSongResult] = []
        var p1Wins = 0, p2Wins = 0

        for song in songs {
            let score = scores[song.id] ?? (p1: "0", p2: "0")
            let p1 = Int(score.p1) ?? 0
            let p2 = Int(score.p2) ?? 0
            if p1 > p2 { p1Wins += 1 } else if p2 > p1 { p2Wins += 1 }

            playedSongs.append(PlayedSongResult(
                songId: song.id,
                title: song.title,
                mode: song.mode,
                level: song.level,
                p1Score: p1,
                p2Score: p2
            ))
        }

        let winnerId: String
        if isGauntlet {
            let p1Total = playedSongs.reduce(0) { $0 + $1.p1Score }
            let p2Total = playedSongs.reduce(0) { $0 + $1.p2Score }
            winnerId = p1Total >= p2Total ? (match.player1Id ?? "") : (match.player2Id ?? "")
        } else {
            winnerId = p1Wins >= p2Wins ? (match.player1Id ?? "") : (match.player2Id ?? "")
        }

        let matchScores = MatchScores(
            player1Wins: p1Wins,
            player2Wins: p2Wins,
            p1Total: playedSongs.reduce(0) { $0 + $1.p1Score },
            p2Total: playedSongs.reduce(0) { $0 + $1.p2Score }
        )

        isSubmitting = true
        do {
            self.match = try await APIService.shared.submitResult(
                matchId,
                data: SubmitResultRequest(
                    winnerId: winnerId,
                    playedSongs: playedSongs,
                    scores: matchScores
                )
            )
            HapticService.matchWin()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
