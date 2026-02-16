import SwiftUI

struct MatchDetailView: View {
    @StateObject private var vm: MatchViewModel

    init(matchId: String) {
        _vm = StateObject(wrappedValue: MatchViewModel(matchId: matchId))
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if vm.isLoading && vm.match == nil {
                ProgressView().tint(DojoTheme.piuAccent)
            } else if let match = vm.match {
                ScrollView {
                    VStack(spacing: 16) {
                        matchHeader(match)
                        matchContent(match)
                    }
                    .padding()
                }
            } else {
                Text("Match not found")
                    .foregroundColor(DojoTheme.textMuted)
            }
        }
        .navigationTitle("Match")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .alert("Error", isPresented: .constant(vm.errorMessage != nil)) {
            Button("OK") { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
    }

    // MARK: - Header

    private func matchHeader(_ match: Match) -> some View {
        VStack(spacing: 12) {
            StatusBadgeView(match.status, color: DojoTheme.statusColor(for: match.status))

            HStack(spacing: 20) {
                playerColumn(match.player1, name: match.player1Id)
                Text("VS")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
                playerColumn(match.player2, name: match.player2Id)
            }

            if match.status == "COMPLETED", let scores = match.scores {
                HStack(spacing: 16) {
                    Text("\(scores.player1Wins ?? 0)")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(scores.player1Wins ?? 0 > scores.player2Wins ?? 0 ? DojoTheme.piuGold : .white)
                    Text("-")
                        .font(.system(size: 20))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("\(scores.player2Wins ?? 0)")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(scores.player2Wins ?? 0 > scores.player1Wins ?? 0 ? DojoTheme.piuGold : .white)
                }
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    private func playerColumn(_ player: Player?, name: String?) -> some View {
        VStack(spacing: 6) {
            AvatarView(player?.avatar, name: player?.name ?? "?", size: 48)
            Text(player?.name ?? "Player")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(1)
            if let nat = player?.nationality, !nat.isEmpty {
                Text(CountryData.flag(for: nat))
                    .font(.system(size: 14))
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Content

    @ViewBuilder
    private func matchContent(_ match: Match) -> some View {
        switch match.status {
        case "PENDING":
            drawPhase(match)
        case "DRAWING", "VETOING":
            vetoPhase(match)
        case "READY":
            scorePhase(match)
        case "COMPLETED":
            resultsPhase(match)
        default:
            EmptyView()
        }
    }

    // MARK: - Draw Phase

    private func drawPhase(_ match: Match) -> some View {
        VStack(spacing: 16) {
            Text("Ready to draw cards")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.white)

            if let min = match.difficultyMin, let max = match.difficultyMax {
                Text("Difficulty: Lv.\(min) - Lv.\(max)")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
            }

            Button {
                Task { await vm.drawCards() }
            } label: {
                HStack {
                    if vm.isDrawing {
                        ProgressView().tint(.white).scaleEffect(0.8)
                    }
                    Text("DRAW CARDS")
                        .font(.system(size: 16, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(DojoTheme.piuAccent)
                .cornerRadius(12)
            }
            .disabled(vm.isDrawing)
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Veto Phase

    private func vetoPhase(_ match: Match) -> some View {
        VStack(spacing: 12) {
            Text("SELECT A SONG TO BAN")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)
                .tracking(1)

            let songs = match.drawnSongs ?? []
            let vetoedIds = Set((match.vetoedSongs ?? []).compactMap(\.songId))
            let vetoCount = vetoedIds.count

            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible()),
                GridItem(.flexible()),
            ], spacing: 10) {
                ForEach(songs) { song in
                    let isVetoed = vetoedIds.contains(song.id)
                    let canVeto = !isVetoed && vetoCount < 2

                    SongCardView(
                        song: song,
                        isVetoed: isVetoed,
                        canVeto: canVeto
                    ) {
                        let playerId = vetoCount == 0 ? match.player2Id : match.player1Id
                        if let pid = playerId {
                            Task { await vm.vetoSong(songId: song.id, playerId: pid) }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Score Phase

    private func scorePhase(_ match: Match) -> some View {
        VStack(spacing: 16) {
            Text("ENTER SCORES")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)
                .tracking(1)

            ForEach(vm.remainingSongs) { song in
                VStack(spacing: 8) {
                    SongCardView(song: song, isVetoed: false, canVeto: false, onVeto: {})

                    HStack(spacing: 12) {
                        scoreInput(label: "P1", songId: song.id, isP1: true)
                        Text("vs")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted)
                        scoreInput(label: "P2", songId: song.id, isP1: false)
                    }
                }
                .padding(10)
                .background(DojoTheme.piuCard)
                .cornerRadius(10)
            }

            Button {
                Task { await vm.submitResult() }
            } label: {
                HStack {
                    if vm.isSubmitting {
                        ProgressView().tint(.white).scaleEffect(0.8)
                    }
                    Text("SUBMIT RESULT")
                        .font(.system(size: 16, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(DojoTheme.piuAccent)
                .cornerRadius(12)
            }
            .disabled(vm.isSubmitting)
        }
    }

    private func scoreInput(label: String, songId: Int, isP1: Bool) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)
            TextField("0", text: Binding(
                get: {
                    let s = vm.scores[songId] ?? (p1: "", p2: "")
                    return isP1 ? s.p1 : s.p2
                },
                set: { val in
                    var s = vm.scores[songId] ?? (p1: "", p2: "")
                    if isP1 { s.p1 = val } else { s.p2 = val }
                    vm.scores[songId] = s
                }
            ))
            .keyboardType(.numberPad)
            .multilineTextAlignment(.center)
            .padding(8)
            .background(DojoTheme.piuDark)
            .foregroundColor(.white)
            .cornerRadius(6)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Results Phase

    private func resultsPhase(_ match: Match) -> some View {
        VStack(spacing: 12) {
            Text("RESULTS")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)
                .tracking(1)

            ForEach(match.playedSongs ?? [], id: \.songId) { played in
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(played.title ?? played.song?.title ?? "Unknown")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                        if let mode = played.mode, let level = played.level {
                            Text("\(mode == "Single" ? "S" : "D")\(level)")
                                .font(.system(size: 11))
                                .foregroundColor(mode == "Single" ? .red : .green)
                        }
                    }

                    Spacer()

                    HStack(spacing: 8) {
                        Text("\(played.p1Score ?? 0)")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor((played.p1Score ?? 0) > (played.p2Score ?? 0) ? DojoTheme.piuGreen : .white)
                        Text("-")
                            .foregroundColor(DojoTheme.textMuted)
                        Text("\(played.p2Score ?? 0)")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor((played.p2Score ?? 0) > (played.p1Score ?? 0) ? DojoTheme.piuGreen : .white)
                    }
                }
                .padding(10)
                .background(DojoTheme.piuCard)
                .cornerRadius(8)
            }
        }
    }
}
