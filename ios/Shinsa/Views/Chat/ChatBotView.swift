import SwiftUI

struct ChatBotMessage: Identifiable {
    let id = UUID()
    let content: String
    let isUser: Bool
    let timestamp: Date
}

struct ChatBotView: View {
    @State private var messages: [ChatBotMessage] = []
    @State private var inputText = ""
    @State private var isLoading = false
    @State private var scrollProxy: ScrollViewProxy?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Messages
                if messages.isEmpty && !isLoading {
                    Spacer()
                    VStack(spacing: 12) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 36))
                            .foregroundColor(DojoTheme.piuGold)

                        Text("SHINSA BOT")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.white)

                        Text("Ask me anything about PIU, songs, scores, or strategies")
                            .font(.system(size: 13))
                            .foregroundColor(DojoTheme.textMuted)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)

                        // Quick suggestions
                        VStack(spacing: 8) {
                            ForEach(suggestions, id: \.self) { suggestion in
                                Button {
                                    inputText = suggestion
                                    sendMessage()
                                } label: {
                                    Text(suggestion)
                                        .font(.system(size: 13))
                                        .foregroundColor(DojoTheme.piuBlue)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 8)
                                        .background(DojoTheme.piuCard)
                                        .cornerRadius(20)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 20)
                                                .stroke(DojoTheme.piuBorder, lineWidth: 1)
                                        )
                                }
                            }
                        }
                        .padding(.top, 8)
                    }
                    Spacer()
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 8) {
                                ForEach(messages) { msg in
                                    chatBubble(msg)
                                        .id(msg.id)
                                }

                                if isLoading {
                                    loadingBubble
                                        .id("loading")
                                }
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                        }
                        .onAppear { scrollProxy = proxy }
                        .onChange(of: messages.count) { _ in
                            scrollToBottom(proxy: proxy)
                        }
                        .onChange(of: isLoading) { _ in
                            scrollToBottom(proxy: proxy)
                        }
                    }
                }

                Divider()
                    .background(DojoTheme.piuBorder)

                // Input bar
                HStack(spacing: 10) {
                    TextField("Ask anything...", text: $inputText)
                        .padding(10)
                        .background(DojoTheme.piuCard)
                        .foregroundColor(.white)
                        .cornerRadius(20)
                        .onSubmit { sendMessage() }

                    Button {
                        sendMessage()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 32))
                            .foregroundColor(
                                inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                ? DojoTheme.textMuted
                                : DojoTheme.piuAccent
                            )
                    }
                    .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isLoading)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(DojoTheme.piuDark)
            }
        }
        .navigationTitle("Shinsa Bot")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Suggestions

    private var suggestions: [String] {
        [
            "What are the hardest S-level charts?",
            "Tips for improving accuracy",
            "How does the ranking system work?"
        ]
    }

    // MARK: - Chat Bubble

    @ViewBuilder
    private func chatBubble(_ msg: ChatBotMessage) -> some View {
        HStack(alignment: .top, spacing: 0) {
            if msg.isUser { Spacer(minLength: 48) }

            if !msg.isUser {
                // Bot avatar
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [DojoTheme.piuGold, DojoTheme.piuAccent],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 28, height: 28)

                    Image(systemName: "sparkles")
                        .font(.system(size: 12))
                        .foregroundColor(.white)
                }
                .padding(.trailing, 6)
            }

            VStack(alignment: msg.isUser ? .trailing : .leading, spacing: 2) {
                if !msg.isUser {
                    Text("Shinsa Bot")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(DojoTheme.piuGold)
                }

                // Content - render markdown-like for bot
                if msg.isUser {
                    Text(msg.content)
                        .font(.system(size: 13))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(DojoTheme.piuAccent.opacity(0.3))
                        .cornerRadius(16)
                } else {
                    markdownText(msg.content)
                        .font(.system(size: 13))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(DojoTheme.piuCard)
                        .cornerRadius(16)
                }

                Text(timeString(msg.timestamp))
                    .font(.system(size: 9))
                    .foregroundColor(DojoTheme.textMuted)
            }

            if !msg.isUser { Spacer(minLength: 48) }
        }
    }

    // MARK: - Loading Bubble

    private var loadingBubble: some View {
        HStack(alignment: .top, spacing: 0) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [DojoTheme.piuGold, DojoTheme.piuAccent],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 28, height: 28)

                Image(systemName: "sparkles")
                    .font(.system(size: 12))
                    .foregroundColor(.white)
            }
            .padding(.trailing, 6)

            HStack(spacing: 6) {
                ForEach(0..<3) { i in
                    Circle()
                        .fill(DojoTheme.textMuted)
                        .frame(width: 6, height: 6)
                        .opacity(0.6)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(DojoTheme.piuCard)
            .cornerRadius(16)

            Spacer(minLength: 48)
        }
    }

    // MARK: - Markdown Text

    private func markdownText(_ text: String) -> Text {
        // Simple bold handling: **text** -> bold
        var result = Text("")
        var remaining = text

        while let boldStart = remaining.range(of: "**") {
            let before = String(remaining[remaining.startIndex..<boldStart.lowerBound])
            if !before.isEmpty {
                result = result + Text(before)
            }

            remaining = String(remaining[boldStart.upperBound...])

            if let boldEnd = remaining.range(of: "**") {
                let boldText = String(remaining[remaining.startIndex..<boldEnd.lowerBound])
                result = result + Text(boldText).bold()
                remaining = String(remaining[boldEnd.upperBound...])
            } else {
                result = result + Text("**")
            }
        }

        if !remaining.isEmpty {
            result = result + Text(remaining)
        }

        return result
    }

    // MARK: - Helpers

    private func timeString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""

        let userMsg = ChatBotMessage(content: text, isUser: true, timestamp: Date())
        messages.append(userMsg)

        isLoading = true
        Task {
            do {
                let response = try await APIService.shared.sendChatbotMessage(text)
                let reply = (response["reply"]?.value as? String)
                    ?? (response["message"]?.value as? String)
                    ?? "I couldn't process that request."

                let botMsg = ChatBotMessage(content: reply, isUser: false, timestamp: Date())
                messages.append(botMsg)
            } catch {
                let errorMsg = ChatBotMessage(
                    content: "Sorry, something went wrong. Please try again.",
                    isUser: false,
                    timestamp: Date()
                )
                messages.append(errorMsg)
            }
            isLoading = false
        }
    }

    private func scrollToBottom(proxy: ScrollViewProxy) {
        if isLoading {
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo("loading", anchor: .bottom)
            }
        } else if let lastId = messages.last?.id {
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo(lastId, anchor: .bottom)
            }
        }
    }
}
