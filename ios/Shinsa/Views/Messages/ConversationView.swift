import SwiftUI

struct ConversationView: View {
    let conversation: Conversation
    @ObservedObject var messagesVM: MessagesViewModel
    @EnvironmentObject var auth: AuthManager

    @State private var messageText = ""
    @State private var scrollProxy: ScrollViewProxy?
    @State private var showOptions = false
    @State private var currentThemeKey: String
    @State private var isPinned: Bool
    @State private var selectedOptionsTab = 0
    @State private var squadMembers: [SquadMember] = []
    @State private var isLoadingSquad = false

    init(conversation: Conversation, messagesVM: MessagesViewModel) {
        self.conversation = conversation
        self.messagesVM = messagesVM
        _currentThemeKey = State(initialValue: conversation.theme ?? "default")
        _isPinned = State(initialValue: conversation.isPinned ?? false)
    }

    private var theme: ChatTheme {
        ChatTheme.get(currentThemeKey)
    }

    var body: some View {
        ZStack {
            theme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                // Messages
                if messagesVM.isLoadingMessages && messagesVM.messages.isEmpty {
                    Spacer()
                    ProgressView().tint(DojoTheme.piuAccent)
                    Spacer()
                } else if messagesVM.messages.isEmpty {
                    Spacer()
                    VStack(spacing: 8) {
                        Image(systemName: "bubble.left")
                            .font(.system(size: 28))
                            .foregroundColor(DojoTheme.textMuted.opacity(0.5))
                        Text("No messages yet")
                            .font(.system(size: 13))
                            .foregroundColor(DojoTheme.textMuted)
                        Text("Say hello!")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted.opacity(0.6))
                    }
                    Spacer()
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 6) {
                                ForEach(messagesVM.messages) { msg in
                                    messageBubble(msg)
                                        .id(msg.id)
                                }
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                        }
                        .onAppear {
                            scrollProxy = proxy
                            scrollToBottom(proxy: proxy)
                        }
                        .onChange(of: messagesVM.messages.count) { _ in
                            scrollToBottom(proxy: proxy)
                        }
                    }
                }

                Divider()
                    .background(DojoTheme.piuBorder)

                // Input bar
                HStack(spacing: 10) {
                    TextField("Type a message...", text: $messageText)
                        .padding(10)
                        .background(DojoTheme.piuCard)
                        .foregroundColor(.white)
                        .cornerRadius(20)

                    Button {
                        let text = messageText
                        messageText = ""
                        Task {
                            await messagesVM.sendMessage(conversationId: conversation.id, content: text)
                            if let proxy = scrollProxy {
                                scrollToBottom(proxy: proxy)
                            }
                        }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 32))
                            .foregroundColor(
                                messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                ? DojoTheme.textMuted
                                : DojoTheme.piuAccent
                            )
                    }
                    .disabled(messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || messagesVM.isSending)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(DojoTheme.piuDark)
            }
        }
        .navigationTitle(conversationTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { showOptions = true } label: {
                    Image(systemName: "ellipsis.circle")
                        .foregroundColor(DojoTheme.textMuted)
                }
            }
        }
        .sheet(isPresented: $showOptions) { optionsSheet }
        .task {
            await JacketService.shared.loadIfNeeded()
            await messagesVM.loadMessages(conversationId: conversation.id)
            messagesVM.startPolling(conversationId: conversation.id)
        }
        .onDisappear {
            messagesVM.stopPolling()
        }
    }

    // MARK: - Title

    private var conversationTitle: String {
        conversation.displayName
    }

    // MARK: - Options Sheet

    private var optionsSheet: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()
                VStack(spacing: 0) {
                    // Tab bar
                    optionsTabBar

                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            if conversation.isSquad {
                                squadOptionsContent
                            } else {
                                directOptionsContent
                            }
                        }
                        .padding(20)
                    }
                }
            }
            .navigationTitle("Options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showOptions = false }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
            .task {
                if conversation.isSquad {
                    await loadSquadMembers()
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var optionsTabBar: some View {
        let tabs: [(String, String)] = conversation.isSquad
            ? [("person.3", "Members"), ("paintbrush", "Theme"), ("clock", "Activity")]
            : [("person.circle", "Profile"), ("paintbrush", "Theme"), ("magnifyingglass", "Search")]

        return HStack(spacing: 0) {
            ForEach(Array(tabs.enumerated()), id: \.offset) { index, tab in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { selectedOptionsTab = index }
                } label: {
                    VStack(spacing: 6) {
                        Image(systemName: tab.0)
                            .font(.system(size: 18))
                        Text(tab.1)
                            .font(.system(size: 12, weight: .bold))
                    }
                    .foregroundColor(selectedOptionsTab == index ? DojoTheme.piuAccent : DojoTheme.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(selectedOptionsTab == index ? DojoTheme.piuAccent.opacity(0.08) : .clear)
                    .overlay(alignment: .bottom) {
                        if selectedOptionsTab == index {
                            Rectangle()
                                .fill(DojoTheme.piuAccent)
                                .frame(height: 2)
                        }
                    }
                }
            }
        }
        .background(DojoTheme.piuCard)
    }

    // MARK: - Squad Options

    @ViewBuilder
    private var squadOptionsContent: some View {
        switch selectedOptionsTab {
        case 0: squadMembersTab
        case 1: themeTab
        case 2: activityTab
        default: EmptyView()
        }
    }

    private var squadMembersTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("MEMBERS")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(DojoTheme.textMuted)
                Spacer()
                if !squadMembers.isEmpty {
                    Text("\(squadMembers.count)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }

            if isLoadingSquad {
                HStack { Spacer(); ProgressView().tint(DojoTheme.piuAccent); Spacer() }
                    .padding(.vertical, 20)
            } else if squadMembers.isEmpty {
                HStack { Spacer()
                    Text("No members found")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                    Spacer()
                }.padding(.vertical, 20)
            } else {
                ForEach(squadMembers) { member in
                    HStack(spacing: 12) {
                        AvatarView(member.avatar, name: member.username ?? "?", size: 36)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(member.username ?? "Unknown")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                            if let role = member.role, role != "member" {
                                Text(role.capitalized)
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(role == "creator" ? DojoTheme.piuGold : DojoTheme.piuBlue)
                            }
                        }

                        Spacer()

                        if let role = member.role {
                            roleBadge(role)
                        }
                    }
                    .padding(12)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(10)
                }
            }

            pinButton
        }
    }

    private func roleBadge(_ role: String) -> some View {
        let color: Color = role == "creator" ? DojoTheme.piuGold : role == "moderator" ? DojoTheme.piuBlue : DojoTheme.textMuted
        return Text(role.capitalized)
            .font(.system(size: 9, weight: .bold))
            .foregroundColor(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.15))
            .cornerRadius(6)
    }

    private var activityTab: some View {
        let urls = extractURLsFromMessages()
        let videoURLs = urls.filter { $0.contains("youtube.com") || $0.contains("youtu.be") }
        let linkURLs = urls.filter { !$0.contains("youtube.com") && !$0.contains("youtu.be") }

        return VStack(alignment: .leading, spacing: 16) {
            // Videos
            VStack(alignment: .leading, spacing: 8) {
                Text("VIDEOS")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(DojoTheme.textMuted)

                if videoURLs.isEmpty {
                    Text("No videos shared yet")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.6))
                        .padding(.vertical, 8)
                } else {
                    ForEach(videoURLs, id: \.self) { url in
                        Link(destination: URL(string: url)!) {
                            HStack(spacing: 10) {
                                Image(systemName: "play.rectangle.fill")
                                    .font(.system(size: 14))
                                    .foregroundColor(.red)
                                Text(url)
                                    .font(.system(size: 12))
                                    .foregroundColor(DojoTheme.piuBlue)
                                    .lineLimit(1)
                                Spacer()
                            }
                            .padding(10)
                            .background(DojoTheme.piuDark)
                            .cornerRadius(8)
                        }
                    }
                }
            }

            // Links
            VStack(alignment: .leading, spacing: 8) {
                Text("SHARED LINKS")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(DojoTheme.textMuted)

                if linkURLs.isEmpty {
                    Text("No links shared yet")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.6))
                        .padding(.vertical, 8)
                } else {
                    ForEach(linkURLs.prefix(20), id: \.self) { url in
                        Link(destination: URL(string: url)!) {
                            HStack(spacing: 10) {
                                Image(systemName: "link")
                                    .font(.system(size: 12))
                                    .foregroundColor(DojoTheme.piuBlue)
                                Text(url)
                                    .font(.system(size: 12))
                                    .foregroundColor(DojoTheme.piuBlue)
                                    .lineLimit(1)
                                Spacer()
                            }
                            .padding(10)
                            .background(DojoTheme.piuDark)
                            .cornerRadius(8)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func extractURLsFromMessages() -> [String] {
        let urlRegex = try? NSRegularExpression(pattern: "https?://[^\\s<>()]+", options: [])
        var urls: [String] = []
        var seen = Set<String>()
        for msg in messagesVM.messages {
            guard let content = msg.content else { continue }
            let range = NSRange(content.startIndex..., in: content)
            let matches = urlRegex?.matches(in: content, range: range) ?? []
            for match in matches {
                if let r = Range(match.range, in: content) {
                    let url = String(content[r])
                    if !seen.contains(url) {
                        seen.insert(url)
                        urls.append(url)
                    }
                }
            }
        }
        return urls
    }

    // MARK: - Direct Chat Options

    @ViewBuilder
    private var directOptionsContent: some View {
        switch selectedOptionsTab {
        case 0: profileTab
        case 1: themeTab
        case 2: searchTab
        default: EmptyView()
        }
    }

    private var profileTab: some View {
        VStack(spacing: 16) {
            // Partner avatar and name
            VStack(spacing: 10) {
                AvatarView(conversation.partnerAvatar, name: conversation.partnerUsername ?? "User", size: 64)
                Text(conversation.partnerUsername ?? "User")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)

            if let partnerId = conversation.partner?.id {
                NavigationLink {
                    ProfileView(userId: partnerId)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "person.circle")
                            .font(.system(size: 20))
                            .foregroundColor(DojoTheme.piuBlue)
                        Text("Visit Profile")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.white)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                    .padding(14)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(10)
                }
            }

            pinButton
        }
    }

    private var searchTab: some View {
        VStack(spacing: 16) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 32))
                .foregroundColor(DojoTheme.textMuted.opacity(0.5))
            Text("Search messages coming soon")
                .font(.system(size: 13))
                .foregroundColor(DojoTheme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    // MARK: - Shared Option Components

    private var pinButton: some View {
        Button {
            Task {
                let newPin = !isPinned
                _ = try? await APIService.shared.pinConversation(conversation.id, pin: newPin)
                isPinned = newPin
            }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: isPinned ? "pin.slash.fill" : "pin.fill")
                    .font(.system(size: 20))
                    .foregroundColor(DojoTheme.piuGold)
                Text(isPinned ? "Unpin Conversation" : "Pin Conversation")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)
                Spacer()
            }
            .padding(14)
            .background(DojoTheme.piuCard)
            .cornerRadius(10)
        }
    }

    private var themeTab: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("CHAT THEME")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                ForEach(ChatTheme.orderedKeys, id: \.self) { key in
                    let t = ChatTheme.themes[key]!
                    Button {
                        currentThemeKey = key
                        Task {
                            _ = try? await APIService.shared.updateConversationTheme(conversation.id, theme: key)
                        }
                    } label: {
                        VStack(spacing: 6) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(t.headerBg)
                                    .frame(height: 36)
                                HStack(spacing: 4) {
                                    Circle().fill(t.ownBubble)
                                        .frame(width: 12, height: 12)
                                        .overlay(Circle().stroke(t.ownBubbleBorder, lineWidth: 1))
                                    Circle().fill(t.otherBubble)
                                        .frame(width: 12, height: 12)
                                        .overlay(Circle().stroke(t.otherBubbleBorder, lineWidth: 1))
                                }
                            }
                            Text(t.name)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(currentThemeKey == key ? .white : DojoTheme.textMuted)
                        }
                        .padding(8)
                        .background(currentThemeKey == key ? DojoTheme.piuAccent.opacity(0.2) : DojoTheme.piuCard)
                        .cornerRadius(10)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(currentThemeKey == key ? DojoTheme.piuAccent : DojoTheme.piuBorder, lineWidth: currentThemeKey == key ? 2 : 1)
                        )
                    }
                }
            }
        }
    }

    private func loadSquadMembers() async {
        isLoadingSquad = true
        do {
            let info = try await APIService.shared.getSquadInfo(conversation.id)
            // API returns members at top level, not nested under squad
            squadMembers = info.members ?? info.squad?.members ?? []
        } catch {
            print("[Squad] Failed to load members: \(error)")
            squadMembers = []
        }
        isLoadingSquad = false
    }

    // MARK: - Message Bubble

    @ViewBuilder
    private func messageBubble(_ msg: DirectMessage) -> some View {
        let isMe = msg.isOwn ?? (msg.senderId == auth.userId)
        let bubbleBg = isMe ? theme.ownBubble : theme.otherBubble
        let bubbleBorder = isMe ? theme.ownBubbleBorder : theme.otherBubbleBorder
        let textColor: Color = {
            if isMe && (currentThemeKey == "skype" || currentThemeKey == "line") {
                return .white
            }
            return theme.isLight ? .black : theme.textColor
        }()
        let msgFont: Font = theme.useMonospace
            ? .system(size: 13, weight: .regular, design: .monospaced)
            : .system(size: 13)

        HStack(alignment: .top, spacing: 0) {
            if isMe { Spacer(minLength: 48) }

            if !isMe {
                AvatarView(msg.senderAvatar, name: msg.senderUsername ?? "?", size: 28)
                    .padding(.trailing, 6)
            }

            VStack(alignment: isMe ? .trailing : .leading, spacing: 2) {
                if !isMe {
                    Text(msg.senderUsername ?? "Unknown")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(DojoTheme.piuBlue)
                }

                // Rich content based on message type
                if msg.messageType == "link_share", let ls = msg.linkShare {
                    linkShareCard(ls)
                        .frame(maxWidth: 320)
                } else if msg.messageType == "challenge_card", let cc = msg.challengeCard {
                    challengeCardView(cc)
                        .frame(maxWidth: 280)
                } else if msg.messageType == "stomp" {
                    stompBubble()
                } else if msg.messageType == "nudge" {
                    nudgeBubble()
                } else if let content = msg.content, StickerService.isStickerOnly(content) {
                    // Sticker-only message: render as large sticker image
                    let tokens = StickerService.extractTokens(content)
                    VStack(spacing: 4) {
                        ForEach(tokens, id: \.self) { token in
                            if let url = StickerService.stickerURL(for: token) {
                                AsyncImage(url: url) { phase in
                                    if case .success(let img) = phase {
                                        img.resizable().scaledToFit()
                                    } else {
                                        Text(token).font(.system(size: 13)).foregroundColor(DojoTheme.textMuted)
                                    }
                                }
                                .frame(width: 120, height: 120)
                            }
                        }
                    }
                } else {
                    // Regular text message (with inline sticker support)
                    let content = msg.content ?? ""
                    if StickerService.containsStickers(content) {
                        stickerTextBubble(content, font: msgFont, textColor: textColor, bg: bubbleBg, border: bubbleBorder)
                    } else {
                        Text(content)
                            .font(msgFont)
                            .foregroundColor(textColor)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(bubbleBg)
                            .overlay(
                                RoundedRectangle(cornerRadius: 16)
                                    .stroke(bubbleBorder, lineWidth: 1)
                            )
                            .cornerRadius(16)
                    }
                }

                if let ts = msg.createdAt {
                    Text(formatTimestamp(ts))
                        .font(.system(size: 9))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            if !isMe { Spacer(minLength: 48) }
        }
    }

    // MARK: - Link Share Card
    private func linkShareCard(_ ls: MessageLinkShare) -> some View {
        let kind = ls.kind ?? ""
        let hasScore = ["upscore", "clear", "score_snapshot"].contains(kind)
        let score = ls.score ?? ls.oldScore ?? 0
        let gradeLabel = ls.grade ?? DojoTheme.gradeLabel(for: score)
        let gradeColor = DojoTheme.gradeColor(for: score)
        let jacketURL = JacketService.shared.resolveJacketURL(
            title: ls.songTitle, mode: ls.mode, level: ls.level,
            backgroundUrl: ls.backgroundUrl ?? ls.jacketUrl
        )
        let isDouble: Bool = {
            guard let m = ls.mode else { return false }
            return m.lowercased().hasPrefix("d") || m.lowercased() == "double"
        }()

        return VStack(alignment: .leading, spacing: 0) {
            if hasScore, let songTitle = ls.songTitle {
                // Score snapshot card with jacket background
                ZStack(alignment: .topTrailing) {
                    // Full jacket background
                    GeometryReader { geo in
                        ZStack {
                            if let url = jacketURL {
                                AsyncImage(url: url) { phase in
                                    if case .success(let img) = phase {
                                        img.resizable().scaledToFill()
                                            .frame(width: geo.size.width, height: geo.size.height)
                                            .clipped()
                                    } else {
                                        Rectangle().fill(LinearGradient(colors: [Color(hex: "#152238"), Color(hex: "#090d18")], startPoint: .topLeading, endPoint: .bottomTrailing))
                                    }
                                }
                            } else {
                                Rectangle().fill(LinearGradient(colors: [Color(hex: "#152238"), Color(hex: "#090d18")], startPoint: .topLeading, endPoint: .bottomTrailing))
                            }

                            // Dark gradient overlay from top to bottom
                            LinearGradient(colors: [.black.opacity(0.3), .black.opacity(0.6), .black.opacity(0.92)], startPoint: .top, endPoint: .bottom)
                        }
                    }

                    // Level badge top right
                    if let level = ls.level, level > 0 {
                        Text("\(level)")
                            .font(.system(size: 11, weight: .black))
                            .foregroundColor(.white)
                            .frame(width: 28, height: 28)
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
                            .padding(10)
                    }

                    // Content overlaid
                    VStack(alignment: .leading, spacing: 6) {
                        Spacer()

                        // Song title
                        Text(songTitle)
                            .font(.system(size: 16, weight: .black))
                            .foregroundColor(.white)
                            .lineLimit(2)

                        // Player + date
                        HStack(spacing: 6) {
                            if let avatar = ls.playerAvatar, !avatar.isEmpty {
                                AvatarView(avatar, name: ls.playerName ?? "?", size: 22)
                            }
                            if let player = ls.playerName, !player.isEmpty {
                                Text(player)
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(.white.opacity(0.8))
                            }
                            if let playedAt = ls.playedAt, !playedAt.isEmpty {
                                Text(playedAt)
                                    .font(.system(size: 10))
                                    .foregroundColor(.white.opacity(0.5))
                            }
                            if let _ = ls.mode, let level = ls.level, level > 0 {
                                Text("\(isDouble ? "D" : "S")\(level)")
                                    .font(.system(size: 9, weight: .black))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 2)
                                    .background(
                                        LinearGradient(
                                            colors: isDouble
                                                ? [Color(hex: "#4cf4aa"), Color(hex: "#0b5d48")]
                                                : [Color(hex: "#ff7a7a"), Color(hex: "#7a1730")],
                                            startPoint: .leading, endPoint: .trailing
                                        )
                                    )
                                    .cornerRadius(4)
                            }
                        }

                        // Score (large left) + Grade (large right)
                        HStack(alignment: .bottom, spacing: 6) {
                            Text(score > 0 ? score.formattedScore : "")
                                .font(.system(size: 28, weight: .black, design: .monospaced))
                                .foregroundColor(.white)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)

                            Spacer()

                            Text(gradeLabel)
                                .font(.system(size: 24, weight: .black))
                                .foregroundColor(gradeColor)
                                .lineLimit(1)
                        }

                        // Old score for upscores
                        if kind == "upscore", let oldScore = ls.oldScore, oldScore > 0, let newScore = ls.score, newScore > oldScore {
                            HStack(spacing: 6) {
                                let oldGrade = ls.oldGrade ?? DojoTheme.gradeLabel(for: oldScore)
                                Text("Prev \(oldScore.formattedScore) \(oldGrade)")
                                    .font(.system(size: 10))
                                    .foregroundColor(.white.opacity(0.5))
                                Text("+\((newScore - oldScore).formattedScore)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(DojoTheme.piuGreen)
                            }
                        }

                        // Judgments breakdown
                        if hasJudgments(ls) {
                            HStack(spacing: 0) {
                                judgmentColumn("PERFECT", ls.perfect ?? 0, Color(hex: "#7dd3fc"))
                                judgmentColumn("GREAT", ls.great ?? 0, Color(hex: "#6ee7b7"))
                                judgmentColumn("GOOD", ls.good ?? 0, Color(hex: "#fde68a"))
                                judgmentColumn("BAD", ls.bad ?? 0, Color(hex: "#f0abfc"))
                                judgmentColumn("MISS", ls.miss ?? 0, Color(hex: "#fca5a5"))
                            }
                            .padding(.vertical, 6)
                            .padding(.horizontal, 6)
                            .background(Color.black.opacity(0.4))
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
                            )
                        }
                    }
                    .padding(12)
                }
                .frame(minHeight: 220)
                .clipped()
                .cornerRadius(12)

                // "Open upscore/clear" button below the card
                let buttonLabel = kind == "upscore" ? "Open upscore" : kind == "clear" ? "Open clear" : "Open score"
                Text(buttonLabel)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(DojoTheme.piuAccent.opacity(0.4), lineWidth: 1)
                    )
                    .cornerRadius(8)
                    .padding(.top, 4)
            } else {
                // Generic link share (post, live_session, etc)
                VStack(alignment: .leading, spacing: 0) {
                    // Badge
                    Text(linkShareBadgeLabel(kind))
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(.cyan.opacity(0.8))
                        .textCase(.uppercase)
                        .tracking(1)
                        .padding(.horizontal, 10)
                        .padding(.top, 8)
                        .padding(.bottom, 4)

                    VStack(alignment: .leading, spacing: 4) {
                        if let title = ls.title, !title.isEmpty {
                            Text(title)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white)
                                .lineLimit(2)
                        }
                        if let subtitle = ls.subtitle, !subtitle.isEmpty {
                            Text(subtitle)
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.textMuted)
                                .lineLimit(2)
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.bottom, 8)
                }
                .background(DojoTheme.piuDark)
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(DojoTheme.piuBorder, lineWidth: 1)
                )
            }
        }
    }

    private func hasJudgments(_ ls: MessageLinkShare) -> Bool {
        (ls.perfect ?? 0) + (ls.great ?? 0) + (ls.good ?? 0) + (ls.bad ?? 0) + (ls.miss ?? 0) > 0
    }

    private func judgmentColumn(_ label: String, _ value: Int, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 7, weight: .bold))
                .foregroundColor(color)
                .lineLimit(1)
            Text("\(value)")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
        }
        .frame(maxWidth: .infinity)
    }

    private func linkShareBadgeLabel(_ kind: String) -> String {
        switch kind {
        case "upscore": return "Upscore"
        case "clear": return "Clear"
        case "score_snapshot": return "Score"
        case "chart_compare": return "Compare"
        case "post": return "Post"
        case "live_session": return "Live Session"
        case "story": return "Story"
        default: return "Shared"
        }
    }

    // MARK: - Challenge Card
    private func challengeCardView(_ cc: MessageChallengeCard) -> some View {
        let kind = cc.kind ?? ""
        let isAccepted = cc.statusKind == "accepted"
        let isExpired = cc.statusKind == "expired"

        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: kind == "beat_score" ? "trophy.fill" : "star.fill")
                    .font(.system(size: 10))
                    .foregroundColor(isAccepted ? DojoTheme.piuGreen : isExpired ? DojoTheme.textMuted : DojoTheme.piuGold)
                Text(kind == "beat_score" ? "Score Challenge" : "Clear Challenge")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(isAccepted ? DojoTheme.piuGreen : isExpired ? DojoTheme.textMuted : DojoTheme.piuGold)
            }

            if let target = cc.targetLabel, !target.isEmpty {
                Text(target)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
            }

            if let subtitle = cc.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: 11))
                    .foregroundColor(DojoTheme.textMuted)
            }

            if let status = cc.statusLabel, !status.isEmpty {
                Text(status)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(isAccepted ? DojoTheme.piuGreen : isExpired ? .red : DojoTheme.piuGold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background((isAccepted ? DojoTheme.piuGreen : isExpired ? Color.red : DojoTheme.piuGold).opacity(0.12))
                    .cornerRadius(6)
            }
        }
        .padding(12)
        .background(DojoTheme.piuDark)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke((isAccepted ? DojoTheme.piuGreen : isExpired ? Color.red : DojoTheme.piuGold).opacity(0.3), lineWidth: 1)
        )
    }

    // MARK: - Sticker Text Bubble (mixed text + stickers)
    @ViewBuilder
    private func stickerTextBubble(_ content: String, font: Font, textColor: Color, bg: Color, border: Color) -> some View {
        let parts = StickerService.splitContent(content)
        HStack(spacing: 2) {
            ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                if part.hasPrefix(":") && part.hasSuffix(":"), let url = StickerService.stickerURL(for: part) {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase {
                            img.resizable().scaledToFit()
                        } else {
                            Text(part).font(.system(size: 13)).foregroundColor(DojoTheme.textMuted)
                        }
                    }
                    .frame(width: 28, height: 28)
                } else {
                    Text(part).font(font).foregroundColor(textColor)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(bg)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(border, lineWidth: 1))
        .cornerRadius(16)
    }

    // MARK: - Stomp & Nudge
    private func stompBubble() -> some View {
        HStack(spacing: 4) {
            Image(systemName: "figure.dance")
                .font(.system(size: 14))
                .foregroundColor(DojoTheme.piuGold)
            Text("STOMP!")
                .font(.system(size: 12, weight: .black))
                .foregroundColor(DojoTheme.piuGold)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(DojoTheme.piuGold.opacity(0.1))
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(DojoTheme.piuGold.opacity(0.3), lineWidth: 1)
        )
    }

    private func nudgeBubble() -> some View {
        HStack(spacing: 4) {
            Image(systemName: "hand.point.right.fill")
                .font(.system(size: 14))
                .foregroundColor(DojoTheme.piuAccent)
            Text("Nudge!")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(DojoTheme.piuAccent.opacity(0.1))
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(DojoTheme.piuAccent.opacity(0.3), lineWidth: 1)
        )
    }

    // MARK: - Helpers

    private func scrollToBottom(proxy: ScrollViewProxy) {
        guard let lastId = messagesVM.messages.last?.id else { return }
        withAnimation(.easeOut(duration: 0.2)) {
            proxy.scrollTo(lastId, anchor: .bottom)
        }
    }

    private func formatTimestamp(_ ts: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: ts) ?? ISO8601DateFormatter().date(from: ts) else {
            return ""
        }
        let display = DateFormatter()
        display.dateFormat = "h:mm a"
        return display.string(from: date)
    }
}
