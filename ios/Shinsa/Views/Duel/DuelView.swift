import SwiftUI

struct DuelView: View {
    let duelId: String
    @State private var duel: Duel?
    @State private var isLoading = true
    @State private var drawLevel = 15
    @State private var showEndConfirm = false
    @State private var p1ScoreInput = ""
    @State private var p2ScoreInput = ""
    @State private var selectedSongEntry: DuelSongEntry?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if isLoading {
                ProgressView()
                    .tint(DojoTheme.piuAccent)
            } else if let duel {
                ScrollView {
                    VStack(spacing: 16) {
                        // VS Header
                        vsHeader(duel)

                        // Song list
                        songList(duel)

                        // Draw song section
                        if duel.status != "completed" {
                            drawSection
                        }

                        // Winner display
                        if duel.status == "completed" {
                            winnerSection(duel)
                        }

                        // End duel
                        if duel.status != "completed" {
                            Button {
                                showEndConfirm = true
                            } label: {
                                HStack {
                                    Image(systemName: "flag.checkered")
                                    Text("End Duel")
                                        .font(.system(size: 14, weight: .bold))
                                }
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(Color.red.opacity(0.8))
                                .cornerRadius(10)
                            }
                        }
                    }
                    .padding()
                }
                .refreshable { await loadDuel() }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 32))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("Duel not found")
                        .foregroundColor(DojoTheme.textMuted)
                }
            }
        }
        .navigationTitle(duel?.name ?? "Duel")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadDuel() }
        .alert("End Duel", isPresented: $showEndConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("End Duel", role: .destructive) {
                Task { await endDuel() }
            }
        } message: {
            Text("Are you sure you want to end this duel? The winner will be determined by scores.")
        }
        .sheet(item: $selectedSongEntry) { entry in
            ScoreEntrySheet(entry: entry) { p1, p2 in
                Task { await submitScore(entry.id, p1: p1, p2: p2) }
            }
        }
    }

    // MARK: - VS Header

    private func vsHeader(_ duel: Duel) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 16) {
                // Player 1
                VStack(spacing: 6) {
                    AvatarView(duel.player1Avatar, name: duel.player1Name ?? "P1", size: 56)
                        .overlay(
                            RoundedRectangle(cornerRadius: 11)
                                .stroke(DojoTheme.piuAccent.opacity(0.5), lineWidth: 2)
                        )
                    Text(duel.player1Name ?? "Player 1")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Text(p1Total(duel))
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(DojoTheme.piuAccent)
                }
                .frame(maxWidth: .infinity)

                // VS badge
                VStack(spacing: 4) {
                    Text("VS")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(DojoTheme.piuGold)

                    if let mode = duel.mode {
                        Text(mode.uppercased())
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(DojoTheme.piuDark)
                            .cornerRadius(4)
                    }
                }

                // Player 2
                VStack(spacing: 6) {
                    AvatarView(duel.player2Avatar, name: duel.player2Name ?? "P2", size: 56)
                        .overlay(
                            RoundedRectangle(cornerRadius: 11)
                                .stroke(DojoTheme.piuBlue.opacity(0.5), lineWidth: 2)
                        )
                    Text(duel.player2Name ?? "Player 2")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Text(p2Total(duel))
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(DojoTheme.piuBlue)
                }
                .frame(maxWidth: .infinity)
            }

            // Location & Date
            HStack(spacing: 12) {
                if let loc = duel.location, !loc.isEmpty {
                    HStack(spacing: 3) {
                        Image(systemName: "mappin")
                            .font(.system(size: 10))
                        Text(loc)
                            .font(.system(size: 11))
                    }
                    .foregroundColor(DojoTheme.textMuted)
                }
                if let d = duel.date {
                    HStack(spacing: 3) {
                        Image(systemName: "calendar")
                            .font(.system(size: 10))
                        Text(d)
                            .font(.system(size: 11))
                    }
                    .foregroundColor(DojoTheme.textMuted)
                }
            }
        }
        .padding(16)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Song List

    private func songList(_ duel: Duel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let songs = duel.songs, !songs.isEmpty {
                Text("SONGS (\(songs.count))")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)

                ForEach(songs) { song in
                    Button {
                        selectedSongEntry = song
                    } label: {
                        songRow(song, duel: duel)
                    }
                }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "music.note.list")
                        .font(.system(size: 24))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.5))
                    Text("No songs drawn yet")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
            }
        }
    }

    private func songRow(_ song: DuelSongEntry, duel: Duel) -> some View {
        HStack(spacing: 10) {
            // Jacket
            jacketView(song.jacketUrl, title: song.title ?? "")

            VStack(alignment: .leading, spacing: 3) {
                Text(song.title ?? "Unknown")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                let isSingle = song.mode == "Single"
                Text("\(isSingle ? "S" : "D")\(song.level ?? 0)")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(isSingle ? Color.red.opacity(0.5) : Color.green.opacity(0.5))
                    .cornerRadius(4)
            }

            Spacer()

            // Scores
            VStack(spacing: 2) {
                if let s1 = song.player1Score {
                    let wins = s1 > (song.player2Score ?? 0)
                    Text("\(s1)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(wins ? DojoTheme.piuGreen : .white)
                } else {
                    Text("--")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }
            .frame(width: 50)

            Text("vs")
                .font(.system(size: 9))
                .foregroundColor(DojoTheme.textMuted)

            VStack(spacing: 2) {
                if let s2 = song.player2Score {
                    let wins = s2 > (song.player1Score ?? 0)
                    Text("\(s2)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(wins ? DojoTheme.piuGreen : .white)
                } else {
                    Text("--")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }
            .frame(width: 50)
        }
        .padding(10)
        .background(DojoTheme.piuCard)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Draw Section

    private var drawSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("DRAW SONG")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            HStack(spacing: 10) {
                Text("Level:")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textSecondary)

                Stepper("\(drawLevel)", value: $drawLevel, in: 1...28)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
            }

            Button {
                Task { await drawSong() }
            } label: {
                HStack {
                    Image(systemName: "shuffle")
                    Text("Draw Song")
                        .font(.system(size: 14, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(DojoTheme.piuGold)
                .cornerRadius(10)
            }
        }
        .padding(16)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Winner Section

    private func winnerSection(_ duel: Duel) -> some View {
        let p1 = totalScore(duel, player: 1)
        let p2 = totalScore(duel, player: 2)
        let winnerName: String
        let winnerColor: Color
        if p1 > p2 {
            winnerName = duel.player1Name ?? "Player 1"
            winnerColor = DojoTheme.piuAccent
        } else if p2 > p1 {
            winnerName = duel.player2Name ?? "Player 2"
            winnerColor = DojoTheme.piuBlue
        } else {
            winnerName = "TIE"
            winnerColor = DojoTheme.piuGold
        }

        return VStack(spacing: 8) {
            Text("WINNER")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)

            Text(winnerName)
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(winnerColor)

            Text("\(p1) - \(p2)")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.white)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(
            LinearGradient(colors: [winnerColor.opacity(0.2), DojoTheme.piuCard], startPoint: .top, endPoint: .bottom)
        )
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(winnerColor.opacity(0.4), lineWidth: 1)
        )
    }

    // MARK: - Jacket

    private func jacketView(_ url: String?, title: String) -> some View {
        Group {
            if let url, !url.isEmpty, let imgURL = fullURL(url) {
                AsyncImage(url: imgURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                            .frame(width: 40, height: 40)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    default:
                        jacketPlaceholder
                    }
                }
            } else {
                jacketPlaceholder
            }
        }
    }

    private var jacketPlaceholder: some View {
        ZStack {
            LinearGradient(colors: [DojoTheme.piuAccent.opacity(0.2), DojoTheme.piuCard], startPoint: .topLeading, endPoint: .bottomTrailing)
            Image(systemName: "music.note")
                .font(.system(size: 14))
                .foregroundColor(DojoTheme.textMuted)
        }
        .frame(width: 40, height: 40)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    // MARK: - Helpers

    private func totalScore(_ duel: Duel, player: Int) -> Int {
        (duel.songs ?? []).reduce(0) { sum, song in
            sum + (player == 1 ? (song.player1Score ?? 0) : (song.player2Score ?? 0))
        }
    }

    private func p1Total(_ duel: Duel) -> String {
        "\(totalScore(duel, player: 1))"
    }

    private func p2Total(_ duel: Duel) -> String {
        "\(totalScore(duel, player: 2))"
    }

    private func fullURL(_ path: String) -> URL? {
        if path.hasPrefix("http") { return URL(string: path) }
        let base = APIService.shared.baseURL
        let p = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: "\(base)\(p)")
    }

    private func loadDuel() async {
        isLoading = true
        duel = try? await APIService.shared.getDuel(duelId)
        isLoading = false
    }

    private func drawSong() async {
        _ = try? await APIService.shared.duelDraw(duelId, level: drawLevel)
        await loadDuel()
    }

    private func submitScore(_ songEntryId: String, p1: Int, p2: Int) async {
        _ = try? await APIService.shared.duelScore(duelId, songEntryId: songEntryId, p1Score: p1, p2Score: p2)
        await loadDuel()
    }

    private func endDuel() async {
        _ = try? await APIService.shared.endDuel(duelId)
        await loadDuel()
    }
}

// MARK: - Score Entry Sheet

struct ScoreEntrySheet: View {
    let entry: DuelSongEntry
    var onSubmit: (Int, Int) -> Void
    @Environment(\.dismiss) var dismiss
    @State private var p1Score = ""
    @State private var p2Score = ""

    var body: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                VStack(spacing: 20) {
                    Text(entry.title ?? "Unknown Song")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)

                    let isSingle = entry.mode == "Single"
                    Text("\(isSingle ? "S" : "D")\(entry.level ?? 0)")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(isSingle ? Color.red.opacity(0.5) : Color.green.opacity(0.5))
                        .cornerRadius(6)

                    VStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Player 1 Score")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(DojoTheme.piuAccent)
                            TextField("Score", text: $p1Score)
                                .font(.system(size: 16))
                                .foregroundColor(.white)
                                .keyboardType(.numberPad)
                                .padding(10)
                                .background(DojoTheme.piuCard)
                                .cornerRadius(8)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(DojoTheme.piuBorder, lineWidth: 1)
                                )
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            Text("Player 2 Score")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(DojoTheme.piuBlue)
                            TextField("Score", text: $p2Score)
                                .font(.system(size: 16))
                                .foregroundColor(.white)
                                .keyboardType(.numberPad)
                                .padding(10)
                                .background(DojoTheme.piuCard)
                                .cornerRadius(8)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(DojoTheme.piuBorder, lineWidth: 1)
                                )
                        }
                    }

                    Button {
                        let s1 = Int(p1Score) ?? 0
                        let s2 = Int(p2Score) ?? 0
                        onSubmit(s1, s2)
                        dismiss()
                    } label: {
                        Text("Submit Scores")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(DojoTheme.piuAccent)
                            .cornerRadius(12)
                    }

                    Spacer()
                }
                .padding()
            }
            .navigationTitle("Enter Scores")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
        .onAppear {
            if let s1 = entry.player1Score { p1Score = "\(s1)" }
            if let s2 = entry.player2Score { p2Score = "\(s2)" }
        }
    }
}
