import SwiftUI

struct OnlineDuelRoomView: View {
    @EnvironmentObject var auth: AuthManager
    @StateObject private var vm: OnlineDuelViewModel

    @State private var showSongSearch = false
    @State private var songSearchQuery = ""
    @State private var songSearchResults: [Song] = []
    @State private var isSearchingSongs = false
    @State private var scoreInput = ""
    @State private var perfectInput = ""
    @State private var greatInput = ""
    @State private var goodInput = ""
    @State private var badInput = ""
    @State private var missInput = ""
    @State private var maxComboInput = ""
    @State private var kcalInput = ""
    @State private var scoreSongId: String?
    @State private var showChat = false
    @State private var songSearchTask: Task<Void, Never>?

    init(duelId: String) {
        _vm = StateObject(wrappedValue: OnlineDuelViewModel(duelId: duelId))
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if vm.isLoading && vm.duel == nil {
                ProgressView().tint(DojoTheme.piuAccent)
            } else if let duel = vm.duel {
                ScrollView {
                    VStack(spacing: 16) {
                        duelHeader(duel)
                        statusSection(duel)
                        songList(duel)
                        actionSection(duel)
                        endSection(duel)
                    }
                    .padding()
                }
            } else {
                VStack(spacing: 8) {
                    Text("Duel not found")
                        .foregroundColor(DojoTheme.textMuted)
                    if let err = vm.errorMessage {
                        Text(err)
                            .font(.system(size: 12))
                            .foregroundColor(.red)
                    }
                }
            }
        }
        .navigationTitle(vm.duel?.name ?? "Online Duel")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showChat = true
                } label: {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
        .sheet(isPresented: $showChat) {
            NavigationView {
                DuelChatView(vm: vm)
                    .environmentObject(auth)
                    .navigationTitle("Chat")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarLeading) {
                            Button("Close") { showChat = false }
                                .foregroundColor(DojoTheme.piuAccent)
                        }
                    }
            }
        }
        .sheet(isPresented: $showSongSearch) {
            songSearchSheet
        }
        .onAppear { vm.startPolling() }
        .onDisappear { vm.stopPolling() }
        .alert("Error", isPresented: .constant(vm.errorMessage != nil)) {
            Button("OK") { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
    }

    // MARK: - Header (VS Layout)

    private func duelHeader(_ duel: OnlineDuel) -> some View {
        VStack(spacing: 12) {
            StatusBadgeView(duelStatus: duel.status)

            HStack(spacing: 16) {
                // Creator (Player 1)
                playerColumn(
                    avatar: duel.creatorAvatar,
                    name: duel.creatorUsername ?? "Creator",
                    nationality: duel.creatorNationality,
                    pumpCount: duel.player1PumpCount ?? 0,
                    playerKey: "player1"
                )

                VStack(spacing: 4) {
                    Text("VS")
                        .font(.system(size: 16, weight: .black))
                        .foregroundColor(DojoTheme.piuAccent)

                    if let mode = duel.mode {
                        Text(mode)
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }

                // Opponent (Player 2)
                if duel.opponentUserId != nil {
                    playerColumn(
                        avatar: duel.opponentAvatar,
                        name: duel.opponentUsername ?? "Opponent",
                        nationality: duel.opponentNationality,
                        pumpCount: duel.player2PumpCount ?? 0,
                        playerKey: "player2"
                    )
                } else {
                    VStack(spacing: 6) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 10)
                                .fill(DojoTheme.piuBorder)
                                .frame(width: 48, height: 48)
                            Image(systemName: "person.badge.plus")
                                .foregroundColor(DojoTheme.textMuted)
                        }
                        Text("Waiting...")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                }
            }

            // Score summary
            if duel.status == "COMPLETED", let songs = duel.songs {
                let p1Wins = songs.filter { $0.winner == duel.creatorUserId }.count
                let p2Wins = songs.filter { $0.winner == duel.opponentUserId }.count
                HStack(spacing: 16) {
                    Text("\(p1Wins)")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(p1Wins > p2Wins ? DojoTheme.piuGold : .white)
                    Text("-")
                        .font(.system(size: 20))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("\(p2Wins)")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(p2Wins > p1Wins ? DojoTheme.piuGold : .white)
                }
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    private func playerColumn(avatar: String?, name: String, nationality: String?, pumpCount: Int, playerKey: String) -> some View {
        VStack(spacing: 6) {
            AvatarView(avatar, name: name, size: 48)

            Text(name)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(1)

            if let nat = nationality, !nat.isEmpty {
                Text(CountryData.flag(for: nat))
                    .font(.system(size: 14))
            }

            // Pump button
            Button {
                Task { await vm.pumpPlayer(playerKey) }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 10))
                    Text("\(pumpCount)")
                        .font(.system(size: 11))
                }
                .foregroundColor(DojoTheme.piuAccent)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(DojoTheme.piuAccent.opacity(0.15))
                .cornerRadius(10)
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Status Section

    @ViewBuilder
    private func statusSection(_ duel: OnlineDuel) -> some View {
        if duel.status == "WAITING" {
            HStack(spacing: 8) {
                Image(systemName: "clock")
                    .foregroundColor(DojoTheme.piuGold)
                Text("Waiting for opponent to join...")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.piuGold)
            }
            .frame(maxWidth: .infinity)
            .padding(12)
            .background(DojoTheme.piuGold.opacity(0.1))
            .cornerRadius(8)
        } else if duel.status != "COMPLETED" {
            if let turnId = duel.currentTurn {
                let isMe = turnId == auth.userId
                HStack(spacing: 8) {
                    Image(systemName: isMe ? "hand.point.right.fill" : "hourglass")
                        .foregroundColor(isMe ? DojoTheme.piuGreen : DojoTheme.piuGold)
                    Text(isMe ? "Your turn to pick a song!" : "Waiting for opponent's turn...")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(isMe ? DojoTheme.piuGreen : DojoTheme.piuGold)
                }
                .frame(maxWidth: .infinity)
                .padding(12)
                .background((isMe ? DojoTheme.piuGreen : DojoTheme.piuGold).opacity(0.1))
                .cornerRadius(8)
            }
        } else if duel.status == "COMPLETED" {
            if let winner = duel.winner {
                let isWinner = winner == auth.userId
                HStack(spacing: 8) {
                    Image(systemName: isWinner ? "trophy.fill" : "flag.fill")
                        .foregroundColor(isWinner ? DojoTheme.piuGold : DojoTheme.textMuted)
                    Text(isWinner ? "You won!" : "You lost")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(isWinner ? DojoTheme.piuGold : DojoTheme.textMuted)
                }
                .frame(maxWidth: .infinity)
                .padding(12)
                .background((isWinner ? DojoTheme.piuGold : DojoTheme.textMuted).opacity(0.1))
                .cornerRadius(8)
            }
        }
    }

    // MARK: - Song List

    @ViewBuilder
    private func songList(_ duel: OnlineDuel) -> some View {
        if let songs = duel.songs, !songs.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("SONGS")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
                    .tracking(1)

                ForEach(songs) { song in
                    songRow(song, duel: duel)
                }
            }
        }
    }

    private func songRow(_ song: OnlineDuelSong, duel: OnlineDuel) -> some View {
        VStack(spacing: 8) {
            // Song info
            HStack(spacing: 10) {
                // Level badge
                if let mode = song.songMode, let level = song.songLevel {
                    Text("\(mode == "Single" ? "S" : "D")\(level)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(mode == "Single" ? .red : .green)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.black.opacity(0.5))
                        .cornerRadius(4)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(song.songTitle ?? "Unknown")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    if let artist = song.songArtist {
                        Text(artist)
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                            .lineLimit(1)
                    }
                }

                Spacer()

                // Song status
                songStatusBadge(song)
            }

            // Scores row (when both submitted)
            if (song.player1Submitted ?? 0) != 0 && (song.player2Submitted ?? 0) != 0 {
                HStack(spacing: 8) {
                    Text(duel.creatorUsername ?? "P1")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("\(song.player1Score ?? 0)")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor((song.player1Score ?? 0) > (song.player2Score ?? 0) ? DojoTheme.piuGreen : .white)
                    Text("-")
                        .foregroundColor(DojoTheme.textMuted)
                    Text("\(song.player2Score ?? 0)")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor((song.player2Score ?? 0) > (song.player1Score ?? 0) ? DojoTheme.piuGreen : .white)
                    Text(duel.opponentUsername ?? "P2")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            // Accept/Decline buttons
            if needsMyResponse(song, duel: duel) {
                HStack(spacing: 12) {
                    Button {
                        Task { await vm.acceptSong(song.id) }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "checkmark")
                            Text("Accept")
                        }
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(DojoTheme.piuGreen)
                        .cornerRadius(6)
                    }

                    Button {
                        Task { await vm.declineSong(song.id) }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "xmark")
                            Text("Decline")
                        }
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Color.red)
                        .cornerRadius(6)
                    }
                }
            }

            // Submit score button
            if needsMyScore(song, duel: duel) {
                Button {
                    scoreSongId = song.id
                    clearScoreInputs()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "square.and.pencil")
                        Text("Submit Score")
                    }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(DojoTheme.piuBlue)
                    .cornerRadius(6)
                }
            }

            // Score submission form
            if scoreSongId == song.id {
                scoreForm(songId: song.id)
            }
        }
        .padding(12)
        .background(DojoTheme.piuCard)
        .cornerRadius(10)
    }

    private func songStatusBadge(_ song: OnlineDuelSong) -> some View {
        Group {
            if let status = song.status {
                switch status {
                case "pending":
                    StatusBadgeView("Pending", color: DojoTheme.piuGold)
                case "accepted":
                    StatusBadgeView("Accepted", color: DojoTheme.piuGreen)
                case "declined":
                    StatusBadgeView("Declined", color: .red)
                case "played":
                    StatusBadgeView("Played", color: DojoTheme.piuBlue)
                case "completed":
                    StatusBadgeView("Done", color: DojoTheme.piuGreen)
                default:
                    StatusBadgeView(status.capitalized, color: DojoTheme.textMuted)
                }
            }
        }
    }

    // MARK: - Helpers for Song State

    private func needsMyResponse(_ song: OnlineDuelSong, duel: OnlineDuel) -> Bool {
        guard song.status == "pending" else { return false }
        let isCreator = vm.isCreator(auth.userId)
        if isCreator {
            return (song.player1Accepted ?? 0) == 0 && (song.player1Declined ?? 0) == 0
        } else {
            return (song.player2Accepted ?? 0) == 0 && (song.player2Declined ?? 0) == 0
        }
    }

    private func needsMyScore(_ song: OnlineDuelSong, duel: OnlineDuel) -> Bool {
        guard song.status == "accepted" || song.status == "playing" else { return false }
        let isCreator = vm.isCreator(auth.userId)
        if isCreator {
            return (song.player1Submitted ?? 0) == 0
        } else {
            return (song.player2Submitted ?? 0) == 0
        }
    }

    // MARK: - Score Form

    private func scoreForm(songId: String) -> some View {
        VStack(spacing: 10) {
            Text("ENTER YOUR SCORE")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)
                .tracking(1)

            scoreField("Score", text: $scoreInput)

            HStack(spacing: 8) {
                scoreField("Perfect", text: $perfectInput)
                scoreField("Great", text: $greatInput)
                scoreField("Good", text: $goodInput)
            }

            HStack(spacing: 8) {
                scoreField("Bad", text: $badInput)
                scoreField("Miss", text: $missInput)
                scoreField("Max Combo", text: $maxComboInput)
            }

            scoreField("Kcal", text: $kcalInput)

            HStack(spacing: 10) {
                Button {
                    scoreSongId = nil
                } label: {
                    Text("Cancel")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(DojoTheme.textMuted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(DojoTheme.piuBorder)
                        .cornerRadius(6)
                }

                Button {
                    Task { await submitCurrentScore(songId: songId) }
                } label: {
                    HStack {
                        if vm.isSubmitting {
                            ProgressView().tint(.white).scaleEffect(0.7)
                        }
                        Text("Submit")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(DojoTheme.piuAccent)
                    .cornerRadius(6)
                }
                .disabled(vm.isSubmitting)
            }
        }
        .padding(10)
        .background(DojoTheme.piuDark)
        .cornerRadius(8)
    }

    private func scoreField(_ label: String, text: Binding<String>) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(DojoTheme.textMuted)
            TextField("0", text: text)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(.system(size: 13))
                .padding(6)
                .background(DojoTheme.piuCard)
                .foregroundColor(.white)
                .cornerRadius(4)
        }
    }

    private func clearScoreInputs() {
        scoreInput = ""
        perfectInput = ""
        greatInput = ""
        goodInput = ""
        badInput = ""
        missInput = ""
        maxComboInput = ""
        kcalInput = ""
    }

    private func submitCurrentScore(songId: String) async {
        await vm.submitScore(
            songId: songId,
            score: Int(scoreInput) ?? 0,
            perfect: Int(perfectInput) ?? 0,
            great: Int(greatInput) ?? 0,
            good: Int(goodInput) ?? 0,
            bad: Int(badInput) ?? 0,
            miss: Int(missInput) ?? 0,
            maxCombo: Int(maxComboInput) ?? 0,
            kcal: Double(kcalInput) ?? 0
        )
        scoreSongId = nil
    }

    // MARK: - Action Section (Draw Song)

    @ViewBuilder
    private func actionSection(_ duel: OnlineDuel) -> some View {
        if duel.status != "COMPLETED" && duel.status != "WAITING" && vm.isMyTurn(auth.userId) {
            Button {
                songSearchQuery = ""
                songSearchResults = []
                showSongSearch = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "music.note")
                    Text("DRAW A SONG")
                        .font(.system(size: 14, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(DojoTheme.piuAccent)
                .cornerRadius(12)
            }
            .disabled(vm.isDrawing)
        }
    }

    // MARK: - End Section

    @ViewBuilder
    private func endSection(_ duel: OnlineDuel) -> some View {
        if duel.status != "COMPLETED" && duel.status != "WAITING" && duel.opponentUserId != nil {
            VStack(spacing: 8) {
                if vm.hasEndRequest {
                    if vm.myEndRequested(auth.userId) {
                        HStack(spacing: 8) {
                            Image(systemName: "clock")
                                .foregroundColor(DojoTheme.piuGold)
                            Text("You requested to end the duel. Waiting for opponent...")
                                .font(.system(size: 12))
                                .foregroundColor(DojoTheme.piuGold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(10)
                        .background(DojoTheme.piuGold.opacity(0.1))
                        .cornerRadius(8)

                        Button {
                            Task { await vm.cancelEnd() }
                        } label: {
                            Text("Cancel End Request")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(DojoTheme.textMuted)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .background(DojoTheme.piuBorder)
                                .cornerRadius(8)
                        }
                    } else {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle")
                                .foregroundColor(DojoTheme.piuGold)
                            Text("Opponent wants to end the duel. Accept by clicking End Duel.")
                                .font(.system(size: 12))
                                .foregroundColor(DojoTheme.piuGold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(10)
                        .background(DojoTheme.piuGold.opacity(0.1))
                        .cornerRadius(8)

                        Button {
                            Task { await vm.requestEnd() }
                        } label: {
                            Text("End Duel")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(Color.red)
                                .cornerRadius(8)
                        }
                    }
                } else {
                    Button {
                        Task { await vm.requestEnd() }
                    } label: {
                        Text("Request End Duel")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.red)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(Color.red.opacity(0.1))
                            .cornerRadius(8)
                    }
                }
            }
        }
    }

    // MARK: - Song Search Sheet

    private var songSearchSheet: some View {
        NavigationView {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Search bar
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(DojoTheme.textMuted)
                        TextField("Search songs...", text: $songSearchQuery)
                            .foregroundColor(.white)
                            .onChange(of: songSearchQuery) { newValue in
                                songSearchTask?.cancel()
                                guard newValue.count >= 2 else {
                                    songSearchResults = []
                                    return
                                }
                                songSearchTask = Task {
                                    try? await Task.sleep(nanoseconds: 300_000_000)
                                    guard !Task.isCancelled else { return }
                                    await searchSongs(newValue)
                                }
                            }
                    }
                    .padding(12)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(8)
                    .padding()

                    if isSearchingSongs {
                        ProgressView()
                            .tint(DojoTheme.piuAccent)
                            .padding()
                    }

                    // Results
                    ScrollView {
                        LazyVStack(spacing: 1) {
                            ForEach(songSearchResults) { song in
                                Button {
                                    Task {
                                        await vm.drawSong(
                                            songId: song.id,
                                            songTitle: song.title,
                                            songArtist: song.artist,
                                            songMode: song.mode,
                                            songLevel: song.level,
                                            songBpm: song.bpm ?? ""
                                        )
                                        showSongSearch = false
                                    }
                                } label: {
                                    HStack(spacing: 10) {
                                        Text(song.levelBadge)
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundColor(song.isSingle ? .red : .green)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(Color.black.opacity(0.5))
                                            .cornerRadius(4)

                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(song.title)
                                                .font(.system(size: 13, weight: .medium))
                                                .foregroundColor(.white)
                                                .lineLimit(1)
                                            Text(song.artist)
                                                .font(.system(size: 11))
                                                .foregroundColor(DojoTheme.textMuted)
                                                .lineLimit(1)
                                        }

                                        Spacer()

                                        if let bpm = song.bpm {
                                            Text("\(bpm) BPM")
                                                .font(.system(size: 10))
                                                .foregroundColor(DojoTheme.textMuted)
                                        }
                                    }
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 10)
                                    .background(DojoTheme.piuCard)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Pick a Song")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { showSongSearch = false }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
    }

    private func searchSongs(_ query: String) async {
        isSearchingSongs = true
        do {
            let mode = vm.duel?.mode
            songSearchResults = try await APIService.shared.getSongs(mode: mode, search: query)
        } catch {
            songSearchResults = []
        }
        isSearchingSongs = false
    }
}
