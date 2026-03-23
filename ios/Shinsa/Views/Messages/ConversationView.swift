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
            DojoTheme.piuBg.ignoresSafeArea()

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
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // Profile link (direct chats only)
                        if !conversation.isSquad, let _ = conversation.partner?.id {
                            NavigationLink {
                                // Navigate to profile
                                Text("Profile") // Placeholder - uses existing navigation
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

                        // Pin/Unpin
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

                        // Theme picker
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

                        // Search messages placeholder
                        Button {
                            // Future: implement search
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "magnifyingglass")
                                    .font(.system(size: 20))
                                    .foregroundColor(DojoTheme.textMuted)
                                Text("Search Messages")
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
                    .padding(20)
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
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: - Message Bubble

    @ViewBuilder
    private func messageBubble(_ msg: DirectMessage) -> some View {
        let isMe = msg.isOwn ?? (msg.senderId == auth.userId)
        let bubbleBg = isMe ? theme.ownBubble : theme.otherBubble
        let bubbleBorder = isMe ? theme.ownBubbleBorder : theme.otherBubbleBorder
        let textColor: Color = theme.isLight && !isMe ? .black : .white

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

                Text(msg.content ?? "")
                    .font(.system(size: 13))
                    .foregroundColor(textColor)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(bubbleBg)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(bubbleBorder, lineWidth: 1)
                    )
                    .cornerRadius(16)

                if let ts = msg.createdAt {
                    Text(formatTimestamp(ts))
                        .font(.system(size: 9))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            if !isMe { Spacer(minLength: 48) }
        }
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
