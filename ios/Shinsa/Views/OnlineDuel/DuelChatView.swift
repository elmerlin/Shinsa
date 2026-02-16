import SwiftUI

struct DuelChatView: View {
    @EnvironmentObject var auth: AuthManager
    @ObservedObject var vm: OnlineDuelViewModel

    @State private var messageText = ""
    @State private var scrollProxy: ScrollViewProxy?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 6) {
                            ForEach(vm.chatMessages) { msg in
                                chatBubble(msg)
                                    .id(msg.id)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                    }
                    .onAppear { scrollProxy = proxy }
                    .onChange(of: vm.chatMessages.count) { _ in
                        scrollToBottom(proxy: proxy)
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
                            await vm.sendMessage(text)
                            if let proxy = scrollProxy {
                                scrollToBottom(proxy: proxy)
                            }
                        }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 32))
                            .foregroundColor(messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                ? DojoTheme.textMuted
                                : DojoTheme.piuAccent)
                    }
                    .disabled(messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(DojoTheme.piuDark)
            }
        }
    }

    // MARK: - Chat Bubble

    @ViewBuilder
    private func chatBubble(_ msg: ChatMessage) -> some View {
        if msg.isSystemMessage {
            // System message
            Text(msg.message)
                .font(.system(size: 11))
                .foregroundColor(DojoTheme.textMuted)
                .italic()
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
        } else {
            let isMe = msg.userId == auth.userId
            HStack(alignment: .top, spacing: 0) {
                if isMe { Spacer(minLength: 48) }

                VStack(alignment: isMe ? .trailing : .leading, spacing: 2) {
                    // Username
                    Text(msg.username)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(usernameColor(msg))

                    // Message bubble
                    Text(msg.message)
                        .font(.system(size: 13))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(isMe ? DojoTheme.piuAccent.opacity(0.3) : DojoTheme.piuCard)
                        .cornerRadius(16)

                    // Timestamp
                    if let ts = msg.createdAt {
                        Text(formatTimestamp(ts))
                            .font(.system(size: 9))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }

                if !isMe { Spacer(minLength: 48) }
            }
        }
    }

    // MARK: - Helpers

    private func usernameColor(_ msg: ChatMessage) -> Color {
        if msg.isParticipantMessage {
            // Participant (player in the duel)
            if msg.userId == vm.duel?.creatorUserId {
                return DojoTheme.piuAccent
            } else {
                return DojoTheme.piuBlue
            }
        }
        return DojoTheme.textSecondary
    }

    private func scrollToBottom(proxy: ScrollViewProxy) {
        guard let lastId = vm.chatMessages.last?.id else { return }
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
