import Foundation

@MainActor
class MessagesViewModel: ObservableObject {
    @Published var conversations: [Conversation] = []
    @Published var messages: [DirectMessage] = []
    @Published var highlights: [UserHighlight] = []
    @Published var isLoading = false
    @Published var isLoadingMessages = false
    @Published var isSending = false

    private var pollTimer: Timer?
    private var currentConversationId: String?

    func loadConversations() async {
        isLoading = true
        do {
            conversations = try await APIService.shared.getConversations()
        } catch {
            conversations = []
        }
        isLoading = false
        await loadHighlights()
    }

    func loadHighlights() async {
        do {
            highlights = try await APIService.shared.getHighlights()
        } catch {
            highlights = []
        }
    }

    func loadMessages(conversationId: String) async {
        currentConversationId = conversationId
        isLoadingMessages = true
        do {
            messages = try await APIService.shared.getMessages(conversationId)
            _ = try? await APIService.shared.markConversationRead(conversationId)
        } catch {
            messages = []
        }
        isLoadingMessages = false
    }

    func sendMessage(conversationId: String, content: String) async {
        guard !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        isSending = true
        do {
            let msg = try await APIService.shared.sendMessage(conversationId, content: content)
            messages.append(msg)
            // Update conversation preview
            if let idx = conversations.firstIndex(where: { $0.id == conversationId }) {
                conversations[idx].lastMessage = ConversationLastMessage(id: msg.id, preview: content)
                conversations[idx].lastMessageAt = msg.createdAt
            }
            HapticService.pump()
        } catch {}
        isSending = false
    }

    func startConversation(userId: String) async -> Conversation? {
        do {
            let conv = try await APIService.shared.startDirectConversation(userId)
            if !conversations.contains(where: { $0.id == conv.id }) {
                conversations.insert(conv, at: 0)
            }
            return conv
        } catch {
            return nil
        }
    }

    func startPolling(conversationId: String) {
        stopPolling()
        currentConversationId = conversationId
        pollTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.pollMessages()
            }
        }
    }

    func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    private func pollMessages() async {
        guard let id = currentConversationId else { return }
        do {
            let latest = try await APIService.shared.getMessages(id)
            if latest.count != messages.count {
                messages = latest
            }
        } catch {}
    }
}
