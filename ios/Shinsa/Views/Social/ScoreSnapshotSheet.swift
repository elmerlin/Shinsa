import SwiftUI
import SafariServices

// MARK: - Safari View (for YouTube replays)

struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let config = SFSafariViewController.Configuration()
        config.entersReaderIfAvailable = false
        let vc = SFSafariViewController(url: url, configuration: config)
        vc.preferredBarTintColor = UIColor(red: 0.04, green: 0.04, blue: 0.1, alpha: 1)
        vc.preferredControlTintColor = .white
        return vc
    }

    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}

func extractYouTubeVideoId(_ url: String) -> String? {
    // Handle embed URLs: youtube.com/embed/VIDEO_ID
    if let range = url.range(of: "embed/") {
        let afterEmbed = String(url[range.upperBound...])
        return afterEmbed.components(separatedBy: CharacterSet(charactersIn: "?&#")).first
    }
    // Handle watch URLs: youtube.com/watch?v=VIDEO_ID
    if let components = URLComponents(string: url),
       let vParam = components.queryItems?.first(where: { $0.name == "v" })?.value {
        return vParam
    }
    // Handle short URLs: youtu.be/VIDEO_ID
    if url.contains("youtu.be/") {
        let parts = url.components(separatedBy: "youtu.be/")
        if parts.count > 1 {
            return parts[1].components(separatedBy: CharacterSet(charactersIn: "?&#")).first
        }
    }
    return nil
}

// MARK: - Score Snapshot Sheet

struct ScoreSnapshotSheet: View {
    let songTitle: String
    let mode: String
    let level: Int
    let score: Int
    let grade: String
    var plate: String? = nil
    var backgroundUrl: String? = nil
    var perfect: Int? = nil
    var great: Int? = nil
    var good: Int? = nil
    var bad: Int? = nil
    var miss: Int? = nil
    var datePlayed: String? = nil
    var replayEmbedUrl: String? = nil
    var username: String? = nil

    @Environment(\.dismiss) var dismiss
    @State private var showReplay = false
    @State private var showSendToDM = false
    @State private var showShareToStory = false

    private var isDouble: Bool {
        mode.lowercased().hasPrefix("d") || mode.lowercased() == "double"
    }

    private var replayWatchURL: URL? {
        guard let replayUrl = replayEmbedUrl, !replayUrl.isEmpty else { return nil }
        if let videoId = extractYouTubeVideoId(replayUrl) {
            return URL(string: "https://www.youtube.com/watch?v=\(videoId)")
        }
        return URL(string: replayUrl)
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header bar
                headerBar

                Divider().background(DojoTheme.piuBorder)

                // Content
                ScrollView {
                    VStack(spacing: 16) {
                        // Rich score card (jacket background style)
                        richScoreCard

                        // YouTube Replay button
                        if replayWatchURL != nil {
                            Button {
                                showReplay = true
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "play.circle.fill")
                                        .font(.system(size: 18))
                                        .foregroundColor(.red)
                                    Text("Watch Replay")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(.white)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(Color.red.opacity(0.12))
                                .cornerRadius(10)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(Color.red.opacity(0.25), lineWidth: 1)
                                )
                            }
                        }

                        // Meta info
                        if let date = datePlayed, !date.isEmpty {
                            Text(date)
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }
                    .padding(16)
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .fullScreenCover(isPresented: $showReplay) {
            if let url = replayWatchURL {
                SafariView(url: url)
                    .ignoresSafeArea()
            }
        }
        .sheet(isPresented: $showSendToDM) {
            SendToDMView(
                songTitle: songTitle, mode: mode, level: level, score: score, grade: grade,
                onDismiss: { showSendToDM = false }
            )
        }
        .fullScreenCover(isPresented: $showShareToStory) {
            StoryComposerView(
                prefilledSnapshot: StorySnapshot(
                    songTitle: songTitle, mode: mode, level: level, score: score, grade: grade, plate: plate
                ),
                onDismiss: { showShareToStory = false }
            )
        }
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack {
            Text("SCORE DETAILS")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
                .tracking(1)

            Spacer()

            // Action buttons
            HStack(spacing: 16) {
                Button {
                    showShareToStory = true
                } label: {
                    Image(systemName: "diamond")
                        .font(.system(size: 16))
                        .foregroundColor(DojoTheme.piuBlue)
                }

                Button {
                    showSendToDM = true
                } label: {
                    Image(systemName: "checkmark.circle")
                        .font(.system(size: 16))
                        .foregroundColor(DojoTheme.piuGreen)
                }

                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white.opacity(0.7))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(DojoTheme.piuCard)
    }

    // MARK: - Rich Score Card

    private var richScoreCard: some View {
        let jacketURL = JacketService.shared.resolveJacketURL(title: songTitle, mode: mode, level: level, backgroundUrl: backgroundUrl)
        let gradeLabel = DojoTheme.gradeLabel(for: score)
        let gradeColor = DojoTheme.gradeColor(for: score)

        return ZStack(alignment: .topTrailing) {
            // Jacket background - use GeometryReader to fill without overflow
            GeometryReader { geo in
                ZStack {
                    if let url = jacketURL {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let img):
                                img.resizable()
                                    .scaledToFill()
                                    .frame(width: geo.size.width, height: geo.size.height)
                                    .clipped()
                            default:
                                Rectangle().fill(
                                    LinearGradient(colors: [Color(hex: "#152238"), Color(hex: "#090d18")], startPoint: .topLeading, endPoint: .bottomTrailing)
                                )
                            }
                        }
                    } else {
                        Rectangle().fill(
                            LinearGradient(colors: [Color(hex: "#152238"), Color(hex: "#090d18")], startPoint: .topLeading, endPoint: .bottomTrailing)
                        )
                    }

                    // Dark gradient overlay
                    LinearGradient(colors: [.black.opacity(0.2), .black.opacity(0.55), .black.opacity(0.9)], startPoint: .top, endPoint: .bottom)
                }
            }

            // Level badge top right
            Text("\(level)")
                .font(.system(size: 13, weight: .black))
                .foregroundColor(.white)
                .frame(width: 32, height: 32)
                .background(
                    Circle().fill(
                        LinearGradient(
                            colors: isDouble
                                ? [Color(hex: "#4cf4aa"), Color(hex: "#0b5d48")]
                                : [Color(hex: "#ff7a7a"), Color(hex: "#7a1730")],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )
                )
                .padding(12)

            // Content
            VStack(alignment: .leading, spacing: 8) {
                Spacer()

                // Song title
                Text(songTitle)
                    .font(.system(size: 18, weight: .black))
                    .foregroundColor(.white)
                    .lineLimit(2)

                // Username + mode badge
                HStack(spacing: 8) {
                    if let user = username, !user.isEmpty {
                        Text(user)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white.opacity(0.8))
                    }

                    let prefix = mode.lowercased().hasPrefix("c") ? "C" : (isDouble ? "D" : "S")
                    let colors: [Color] = isDouble
                        ? [Color(hex: "#4cf4aa"), Color(hex: "#0b5d48")]
                        : [Color(hex: "#ff7a7a"), Color(hex: "#7a1730")]
                    Text("\(prefix)\(level)")
                        .font(.system(size: 10, weight: .black))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing))
                        .cornerRadius(4)
                }

                // Score + Grade
                HStack(alignment: .bottom, spacing: 8) {
                    Text(formatScore(score))
                        .font(.system(size: 32, weight: .black, design: .monospaced))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)

                    Spacer()

                    Text(gradeLabel)
                        .font(.system(size: 28, weight: .black))
                        .foregroundColor(gradeColor)
                        .lineLimit(1)
                }

                if let plate = plate, !plate.isEmpty {
                    Text(plate)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(DojoTheme.piuGold)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(DojoTheme.piuGold.opacity(0.1))
                        .cornerRadius(4)
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(DojoTheme.piuGold.opacity(0.3), lineWidth: 1))
                }

                // Judgments
                if hasJudgments {
                    judgmentsSection
                }
            }
            .padding(14)
        }
        .frame(minHeight: 280)
        .cornerRadius(12)
        .clipped()
    }

    private var hasJudgments: Bool {
        [perfect, great, good, bad, miss].contains(where: { ($0 ?? 0) > 0 })
    }

    private var judgmentsSection: some View {
        let items: [(String, Int, Color)] = [
            ("PERFECT", perfect ?? 0, Color(hex: "#7dd3fc")),
            ("GREAT", great ?? 0, Color(hex: "#6ee7b7")),
            ("GOOD", good ?? 0, Color(hex: "#fde68a")),
            ("BAD", bad ?? 0, Color(hex: "#f0abfc")),
            ("MISS", miss ?? 0, Color(hex: "#fca5a5")),
        ]

        return HStack(spacing: 0) {
            ForEach(items, id: \.0) { label, count, color in
                VStack(spacing: 4) {
                    Text(label)
                        .font(.system(size: 8, weight: .heavy))
                        .foregroundColor(color)
                    Text(formatJudgmentCount(count))
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 8)
        .background(Color.black.opacity(0.45))
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }

    private func formatJudgmentCount(_ count: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: count)) ?? "\(count)"
    }

    private func formatScore(_ score: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: score)) ?? "\(score)"
    }
}
