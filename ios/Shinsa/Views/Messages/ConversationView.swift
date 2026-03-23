import SwiftUI

struct ConversationView: View {
    let conversation: Conversation
    @ObservedObject var messagesVM: MessagesViewModel
    @EnvironmentObject var auth: AuthManager

    @State private var messageText = ""
    @State private var scrollProxy: ScrollViewProxy?

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
        conversation.partnerUsername ?? "Chat"
    }

    // MARK: - Message Bubble

    @ViewBuilder
    private func messageBubble(_ msg: DirectMessage) -> some View {
        let isMe = msg.isOwn ?? (msg.senderId == auth.userId)
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
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(isMe ? DojoTheme.piuAccent.opacity(0.3) : DojoTheme.piuCard)
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
