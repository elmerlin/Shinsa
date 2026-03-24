import SwiftUI

struct NewClearCardView: View {
    let item: FeedItem
    @State private var pumped: Bool
    @State private var pumpCount: Int
    @State private var showAll = false
    @State private var showComments = false
    @State private var selectedClear: FeedItem.ClearItem?
    @State private var showSendPicker = false

    init(item: FeedItem) {
        self.item = item
        _pumped = State(initialValue: item.isPumped)
        _pumpCount = State(initialValue: item.pumpCount ?? 0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header
            HStack(spacing: 10) {
                NavigationLink(value: "profile/\(item.userId ?? "")") {
                    AvatarView(item.avatar, name: item.username ?? "?", size: 36)
                }

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        if let nat = item.nationality, !nat.isEmpty {
                            Text(CountryData.flag(for: nat))
                                .font(.system(size: 12))
                        }
                        Text(item.username ?? "Unknown")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                        Text("new clear!")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(Color(hex: "#38bdf8"))

                        if let pb = item.pumbilityGain, pb.value > 0 {
                            Text("+\(Int(pb.value)) PB")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(Color(hex: "#67e8f9"))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Color.cyan.opacity(0.1))
                                .cornerRadius(3)
                        }
                    }
                    if let created = item.createdAt {
                        Text(created.timeAgo)
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
                Spacer()
            }

            // Clear rows
            let clears = item.clearItems
            if !clears.isEmpty {
                let visible = showAll ? clears : Array(clears.prefix(5))
                VStack(spacing: 0) {
                    ForEach(Array(visible.enumerated()), id: \.offset) { idx, clear in
                        clearRow(clear)
                        if idx < visible.count - 1 {
                            Divider().background(DojoTheme.piuBorder.opacity(0.2))
                        }
                    }
                }
                .background(DojoTheme.piuDark)
                .cornerRadius(8)

                if clears.count > 5 && !showAll {
                    Button {
                        showAll = true
                    } label: {
                        Text("Show \(clears.count - 5) more")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)
                    }
                }
            } else {
                // Fallback single clear
                singleClearRow
                    .background(DojoTheme.piuDark)
                    .cornerRadius(8)
            }

            // Footer
            HStack(spacing: 16) {
                PumpButtonView(pumped: $pumped, count: $pumpCount) {
                    await togglePump()
                }

                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showComments.toggle()
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "bubble.left")
                            .font(.system(size: 12))
                        Text("\(item.commentCount ?? 0)")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .foregroundColor(showComments ? DojoTheme.piuAccent : DojoTheme.textMuted)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                }

                Button { showSendPicker = true } label: {
                    Image(systemName: "paperplane")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textMuted)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                }

                Spacer()
            }

            // Inline comments
            if showComments {
                CommentsView(itemType: "clear", itemId: item.itemId)
                    .frame(maxHeight: 300)
                    .clipped()
            }
        }
        .padding(14)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .sheet(item: $selectedClear) { c in
            ScoreSnapshotSheet(
                songTitle: c.songTitle ?? "Unknown",
                mode: c.mode ?? "S",
                level: c.level ?? 0,
                score: c.score ?? 0,
                grade: DojoTheme.gradeLabel(for: c.score ?? 0),
                plate: c.plate,
                backgroundUrl: c.backgroundUrl,
                perfect: c.perfect,
                great: c.great,
                good: c.good,
                bad: c.bad,
                miss: c.miss,
                datePlayed: c.datePlayed,
                replayEmbedUrl: c.replayEmbedUrl,
                username: item.username
            )
        }
        .sheet(isPresented: $showSendPicker) {
            UserPickerSheet(
                title: "Send clear",
                onSelectUser: { partner in sendClearTo(partnerId: partner.id) },
                onSelectConversation: { convo in sendClearToConvo(convo.id) },
                onDismiss: { showSendPicker = false }
            )
        }
    }

    private func sendClearTo(partnerId: String?) {
        Task {
            guard let pid = partnerId else { return }
            let ls = buildClearLinkShare()
            let convo = try? await APIService.shared.startDirectConversation(pid)
            if let cid = convo?.id { _ = try? await APIService.shared.sendLinkShareMessage(cid, linkShare: ls) }
        }
    }

    private func sendClearToConvo(_ convoId: String) {
        Task { _ = try? await APIService.shared.sendLinkShareMessage(convoId, linkShare: buildClearLinkShare()) }
    }

    private func buildClearLinkShare() -> [String: AnyCodable] {
        ["kind": AnyCodable("clear"), "title": AnyCodable("\(item.username ?? "Player")'s clear"), "songTitle": AnyCodable(item.songTitle ?? ""), "mode": AnyCodable(item.mode ?? ""), "level": AnyCodable(item.level ?? 0), "score": AnyCodable(item.score ?? 0)]
    }

    // MARK: - Clear Row

    private func clearRow(_ c: FeedItem.ClearItem) -> some View {
        HStack(spacing: 8) {
            // Jacket
            jacketView(backgroundUrl: c.backgroundUrl, songTitle: c.songTitle, mode: c.mode, level: c.level)

            // Song info
            VStack(alignment: .leading, spacing: 2) {
                Text(c.songTitle ?? "Unknown")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    if let pb = c.pumbilityGain, pb.value > 0 {
                        Text("+\(Int(pb.value)) PB")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(Color(hex: "#67e8f9"))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Color.cyan.opacity(0.1))
                            .cornerRadius(3)
                    }
                }
            }

            Spacer()

            // Replay badge (opens score sheet with in-app player)
            if let replayUrl = c.replayEmbedUrl, !replayUrl.isEmpty {
                Button {
                    selectedClear = c
                } label: {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.red)
                }
            }

            // Score + Grade + Plate (tappable)
            VStack(alignment: .trailing, spacing: 2) {
                if let score = c.score, score > 0 {
                    Text(DojoTheme.gradeLabel(for: score))
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(DojoTheme.gradeColor(for: score))

                    Text(formatScore(score))
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                }

                if let plate = c.plate, !plate.isEmpty {
                    Text(plate)
                        .font(.system(size: 9, weight: .medium, design: .monospaced))
                        .foregroundColor(DojoTheme.textMuted)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(DojoTheme.piuDark)
                        .cornerRadius(3)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { selectedClear = c }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
    }

    // MARK: - Fallback single clear

    private var singleClearRow: some View {
        HStack(spacing: 10) {
            jacketView(backgroundUrl: item.backgroundUrl, songTitle: item.songTitle, mode: item.mode, level: item.level)

            VStack(alignment: .leading, spacing: 3) {
                Text(item.songTitle ?? "Unknown Song")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    if let score = item.score {
                        Text(DojoTheme.gradeLabel(for: score))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.gradeColor(for: score))

                        Text(formatScore(score))
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                    }
                    if let plate = item.plate, !plate.isEmpty {
                        Text(plate)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(DojoTheme.piuGold)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(DojoTheme.piuGold.opacity(0.1))
                            .cornerRadius(3)
                    }
                }
            }

            Spacer()
        }
        .padding(10)
    }

    // MARK: - Song Jacket

    private func jacketView(backgroundUrl: String?, songTitle: String?, mode: String?, level: Int?) -> some View {
        let jacketURL = JacketService.shared.resolveJacketURL(title: songTitle, mode: mode, level: level, backgroundUrl: backgroundUrl)

        return ZStack(alignment: .bottomTrailing) {
            if let url = jacketURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFill()
                    default:
                        jacketFallback(songTitle: songTitle, mode: mode)
                    }
                }
            } else {
                jacketFallback(songTitle: songTitle, mode: mode)
            }

            // Gradient overlay
            LinearGradient(
                colors: [.clear, .black.opacity(0.5)],
                startPoint: .top,
                endPoint: .bottom
            )

            // Mode + Level badge
            if let mode = mode, let level = level {
                let isDouble = mode.lowercased().hasPrefix("d") || mode.lowercased() == "double"
                let isCoop = mode.lowercased().hasPrefix("c") || mode.lowercased() == "coop"
                let prefix = isCoop ? "C" : (isDouble ? "D" : "S")
                let colors: [Color] = isCoop
                    ? [Color(hex: "#69c8ff"), Color(hex: "#12457c")]
                    : isDouble
                        ? [Color(hex: "#4cf4aa"), Color(hex: "#0b5d48")]
                        : [Color(hex: "#ff7a7a"), Color(hex: "#7a1730")]

                Text("\(prefix)\(level)")
                    .font(.system(size: 8, weight: .black))
                    .foregroundColor(.white)
                    .padding(.horizontal, 3)
                    .padding(.vertical, 1)
                    .background(
                        LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
                    .cornerRadius(2)
                    .padding(2)
            }
        }
        .frame(width: 50, height: 28)
        .cornerRadius(6)
        .clipped()
    }

    private func jacketFallback(songTitle: String?, mode: String?) -> some View {
        let isDouble = (mode ?? "").lowercased().hasPrefix("d")
        return Rectangle()
            .fill(
                LinearGradient(
                    colors: isDouble
                        ? [Color(hex: "#0b5d48"), Color(hex: "#16b77f")]
                        : [Color(hex: "#7a1730"), Color(hex: "#d93d62")],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                Text(String((songTitle ?? "?").prefix(1)).uppercased())
                    .font(.system(size: 12, weight: .black))
                    .foregroundColor(.white.opacity(0.4))
            )
    }

    private func formatScore(_ score: Int) -> String {
        let str = String(format: "%06d", score)
        if str.count >= 3 {
            let idx = str.index(str.endIndex, offsetBy: -3)
            return str[str.startIndex..<idx] + "," + str[idx...]
        }
        return str
    }

    private func togglePump() async {
        do {
            let response = try await APIService.shared.pumpNewClear(item.itemId)
            pumped = response.pumped
            pumpCount = response.pumpCount ?? pumpCount
            if pumped { HapticService.pump() }
        } catch {}
    }
}
