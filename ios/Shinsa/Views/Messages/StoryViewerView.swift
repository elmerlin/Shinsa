import SwiftUI

struct StoryViewerView: View {
    let highlight: UserHighlight
    @Environment(\.dismiss) var dismiss

    @State private var stories: [StoryItem] = []
    @State private var storyUser: StoryUser?
    @State private var currentIndex = 0
    @State private var isLoading = true
    @State private var progress: CGFloat = 0
    @State private var timer: Timer?

    private let storyDuration: TimeInterval = 5

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if isLoading {
                ProgressView().tint(DojoTheme.piuAccent)
            } else if stories.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "photo.on.rectangle.angled")
                        .font(.system(size: 32))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("No stories available")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)
                }
            } else {
                // Story content
                VStack(spacing: 0) {
                    // Progress bars
                    progressBars
                        .padding(.horizontal, 12)
                        .padding(.top, 8)

                    // User info
                    userInfoBar
                        .padding(.horizontal, 16)
                        .padding(.top, 10)

                    Spacer()

                    // Story content
                    if currentIndex < stories.count {
                        storyContent(stories[currentIndex])
                    }

                    Spacer()

                    // Bottom bar
                    bottomBar
                        .padding(.horizontal, 16)
                        .padding(.bottom, 20)
                }

                // Tap zones
                HStack(spacing: 0) {
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture { previousStory() }
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture { nextStory() }
                }
            }

            // Close button
            VStack {
                HStack {
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 36, height: 36)
                            .background(Color.white.opacity(0.2))
                            .clipShape(Circle())
                    }
                    .padding(.trailing, 16)
                    .padding(.top, 50)
                }
                Spacer()
            }
        }
        .task {
            await loadStories()
        }
        .onDisappear {
            timer?.invalidate()
        }
    }

    // MARK: - Progress Bars

    private var progressBars: some View {
        HStack(spacing: 3) {
            ForEach(0..<stories.count, id: \.self) { index in
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Rectangle()
                            .fill(Color.white.opacity(0.3))
                            .cornerRadius(1.5)

                        Rectangle()
                            .fill(Color.white)
                            .cornerRadius(1.5)
                            .frame(width: barWidth(for: index, totalWidth: geo.size.width))
                    }
                }
                .frame(height: 3)
            }
        }
    }

    private func barWidth(for index: Int, totalWidth: CGFloat) -> CGFloat {
        if index < currentIndex { return totalWidth }
        if index > currentIndex { return 0 }
        return totalWidth * progress
    }

    // MARK: - User Info

    private var userInfoBar: some View {
        HStack(spacing: 10) {
            AvatarView(storyUser?.avatar ?? highlight.avatar, name: storyUser?.username ?? highlight.username ?? "?", size: 32)

            VStack(alignment: .leading, spacing: 1) {
                Text(storyUser?.username ?? highlight.username ?? "")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)

                if currentIndex < stories.count, let createdAt = stories[currentIndex].createdAt {
                    Text(createdAt.timeAgo)
                        .font(.system(size: 10))
                        .foregroundColor(.white.opacity(0.6))
                }
            }

            Spacer()
        }
    }

    // MARK: - Story Content

    @ViewBuilder
    private func storyContent(_ story: StoryItem) -> some View {
        if story.storyType == "score_snapshot", let snap = story.snapshot {
            scoreSnapshotView(snap)
        } else if let text = story.text {
            textStoryView(text, gradient: story.backgroundGradient)
        } else {
            Text("Story")
                .foregroundColor(.white)
        }
    }

    private func scoreSnapshotView(_ snap: StorySnapshot) -> some View {
        VStack(spacing: 16) {
            // Jacket image
            if let jacketUrl = snap.jacketUrl {
                AsyncImage(url: imageURL(jacketUrl)) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 180, height: 180)
                            .cornerRadius(12)
                    default:
                        RoundedRectangle(cornerRadius: 12)
                            .fill(DojoTheme.piuCard)
                            .frame(width: 180, height: 180)
                    }
                }
            }

            // Song title
            if let title = snap.songTitle {
                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
            }

            // Mode & Level badge
            if let mode = snap.mode, let level = snap.level {
                Text("\(mode.uppercased()) \(level)")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(
                        LinearGradient(
                            colors: [DojoTheme.piuAccent, Color(hex: "ff6699")],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .cornerRadius(16)
            }

            // Grade and Score
            HStack(spacing: 24) {
                if let grade = snap.grade {
                    VStack(spacing: 4) {
                        Text(grade)
                            .font(.system(size: 28, weight: .black))
                            .foregroundColor(DojoTheme.piuGold)
                        Text("Grade")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.6))
                    }
                }

                if let score = snap.score {
                    VStack(spacing: 4) {
                        Text("\(score)")
                            .font(.system(size: 28, weight: .black))
                            .foregroundColor(.white)
                        Text("Score")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.6))
                    }
                }

                if let plate = snap.plate {
                    VStack(spacing: 4) {
                        Text(plate)
                            .font(.system(size: 28, weight: .black))
                            .foregroundColor(DojoTheme.piuGreen)
                        Text("Plate")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.6))
                    }
                }
            }
        }
        .padding(24)
    }

    private func textStoryView(_ text: String, gradient: String?) -> some View {
        VStack {
            Text(text)
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .padding(32)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 300)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(
                    LinearGradient(
                        colors: parseGradient(gradient),
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        )
        .padding(.horizontal, 24)
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        HStack(spacing: 20) {
            Spacer()

            if currentIndex < stories.count {
                let story = stories[currentIndex]

                // View count
                HStack(spacing: 4) {
                    Image(systemName: "eye")
                        .font(.system(size: 12))
                    Text("\(story.viewCount ?? 0)")
                        .font(.system(size: 12))
                }
                .foregroundColor(.white.opacity(0.7))

                // Pump button
                Button {
                    Task { await pumpCurrentStory() }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: story.isPumped == true ? "flame.fill" : "flame")
                            .font(.system(size: 16))
                            .foregroundColor(story.isPumped == true ? DojoTheme.piuAccent : .white.opacity(0.7))
                        Text("\(story.pumpCount ?? 0)")
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.7))
                    }
                }
            }

            Spacer()
        }
    }

    // MARK: - Navigation

    private func previousStory() {
        if currentIndex > 0 {
            currentIndex -= 1
            resetTimer()
        }
    }

    private func nextStory() {
        if currentIndex < stories.count - 1 {
            currentIndex += 1
            resetTimer()
        } else {
            dismiss()
        }
    }

    // MARK: - Timer

    private func startTimer() {
        progress = 0
        timer?.invalidate()
        let interval: TimeInterval = 0.05
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { _ in
            Task { @MainActor in
                progress += CGFloat(interval / storyDuration)
                if progress >= 1 {
                    nextStory()
                }
            }
        }
    }

    private func resetTimer() {
        progress = 0
        startTimer()
        markViewed()
    }

    // MARK: - API

    private func loadStories() async {
        isLoading = true
        guard let userId = highlight.userId else {
            isLoading = false
            return
        }
        do {
            let response = try await APIService.shared.getUserStories(userId)
            stories = response.stories ?? []
            storyUser = response.user
            if !stories.isEmpty {
                startTimer()
                markViewed()
            }
        } catch {
            stories = []
        }
        isLoading = false
    }

    private func markViewed() {
        guard currentIndex < stories.count, let userId = highlight.userId else { return }
        let storyId = stories[currentIndex].id
        Task {
            _ = try? await APIService.shared.viewStory(userId, storyId: storyId)
        }
    }

    private func pumpCurrentStory() async {
        guard currentIndex < stories.count, let userId = highlight.userId else { return }
        let storyId = stories[currentIndex].id
        _ = try? await APIService.shared.pumpStory(userId, storyId: storyId)
        stories[currentIndex].isPumped = true
        stories[currentIndex].pumpCount = (stories[currentIndex].pumpCount ?? 0) + 1
        HapticService.pump()
    }

    // MARK: - Helpers

    private func imageURL(_ path: String) -> URL? {
        if path.hasPrefix("http") { return URL(string: path) }
        let base = APIService.shared.baseURL
        let fullPath = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: "\(base)\(fullPath)")
    }

    private func parseGradient(_ gradient: String?) -> [Color] {
        guard let gradient = gradient else {
            return [DojoTheme.piuAccent, Color(hex: "ff6699")]
        }
        let parts = gradient.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        let colors = parts.compactMap { hex -> Color? in
            let cleaned = hex.replacingOccurrences(of: "#", with: "")
            return Color(hex: cleaned)
        }
        return colors.count >= 2 ? colors : [DojoTheme.piuAccent, Color(hex: "ff6699")]
    }
}
