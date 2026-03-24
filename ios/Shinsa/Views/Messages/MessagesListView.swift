import SwiftUI

struct MessagesListView: View {
    @StateObject private var vm = MessagesViewModel()
    @EnvironmentObject var auth: AuthManager

    @State private var showNewMessage = false
    @State private var showNoteComposer = false
    @State private var showStoryComposer = false

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if vm.isLoading && vm.conversations.isEmpty {
                ProgressView().tint(DojoTheme.piuAccent)
            } else if vm.conversations.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .font(.system(size: 36))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.5))

                    Text("No conversations yet")
                        .font(.system(size: 15))
                        .foregroundColor(DojoTheme.textMuted)

                    Text("Start a conversation with another player")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.6))

                    Button {
                        showNewMessage = true
                    } label: {
                        Text("New Message")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(DojoTheme.piuAccent)
                            .cornerRadius(10)
                    }
                }
            } else {
                ScrollView {
                    if !vm.highlights.isEmpty {
                        HighlightsStripView(
                            highlights: vm.highlights,
                            currentUserId: auth.userId,
                            onTapAddStory: { showStoryComposer = true },
                            onTapShareNote: { showNoteComposer = true }
                        )
                        .padding(.vertical, 8)
                    }

                    LazyVStack(spacing: 0) {
                        ForEach(vm.conversations) { conversation in
                            NavigationLink {
                                ConversationView(conversation: conversation, messagesVM: vm)
                            } label: {
                                conversationRow(conversation)
                            }

                            Divider()
                                .background(DojoTheme.piuBorder.opacity(0.3))
                        }
                    }
                }
                .refreshable { await vm.loadConversations() }
            }
        }
        .navigationTitle("Messages")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showNewMessage = true
                } label: {
                    Image(systemName: "square.and.pencil")
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
        .sheet(isPresented: Binding(
            get: {
                showNewMessage || showNoteComposer
            },
            set: { newValue in
                if !newValue {
                    showNewMessage = false
                    showNoteComposer = false
                }
            }
        )) {
            if showNoteComposer {
                let selfNote = vm.highlights.first(where: { $0.isSelf == true })?.note
                NoteComposerView(
                    existingNote: selfNote,
                    onDismiss: {
                        showNoteComposer = false
                        Task { await vm.loadConversations() }
                    }
                )
            } else {
                NavigationStack {
                    NewMessageView(vm: vm) { conversation in
                        showNewMessage = false
                    }
                }
            }
        }
        .task { await vm.loadConversations() }
        .fullScreenCover(isPresented: $showStoryComposer) {
            StoryComposerView(onDismiss: {
                showStoryComposer = false
                Task { await vm.loadConversations() }
            })
        }
    }

    // MARK: - Conversation Row

    private func conversationRow(_ conversation: Conversation) -> some View {
        HStack(spacing: 12) {
            // Avatar
            if conversation.isSquad {
                if let avatarPath = conversation.avatar, !avatarPath.isEmpty {
                    AvatarView(avatarPath, name: conversation.displayName, size: 44)
                } else {
                    ZStack {
                        Circle()
                            .fill(DojoTheme.piuAccent.opacity(0.2))
                            .frame(width: 44, height: 44)
                        Text(String(conversation.displayName.prefix(2)).uppercased())
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)
                    }
                }
            } else {
                AvatarView(
                    conversation.partnerAvatar,
                    name: conversation.partnerUsername ?? "Chat",
                    size: 44
                )
            }

            // Info
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    if conversation.isPinned == true {
                        Image(systemName: "pin.fill")
                            .font(.system(size: 9))
                            .foregroundColor(DojoTheme.piuGold)
                    }

                    Text(conversation.displayName)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)

                    if conversation.isSquad {
                        Text("Squad")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(DojoTheme.piuAccent.opacity(0.15))
                            .cornerRadius(4)
                    }

                    Spacer()

                    if let lastAt = conversation.lastMessageAt {
                        Text(lastAt.timeAgo)
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }

                HStack {
                    Text(conversation.lastMessagePreview ?? "No messages yet")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textSecondary)
                        .lineLimit(1)

                    Spacer()

                    if let unread = conversation.unreadCount, unread > 0 {
                        Text("\(unread)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                            .frame(minWidth: 20, minHeight: 20)
                            .background(DojoTheme.piuAccent)
                            .clipShape(Circle())
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(DojoTheme.piuBg)
    }
}

// MARK: - New Message View

struct NewMessageView: View {
    @ObservedObject var vm: MessagesViewModel
    var onConversationCreated: ((Conversation) -> Void)?

    @Environment(\.dismiss) var dismiss
    @State private var query = ""
    @State private var results: [User] = []
    @State private var isSearching = false
    @State private var searchTask: Task<Void, Never>?
    @State private var isStarting = false

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Search bar
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)

                    TextField("Search users...", text: $query)
                        .font(.system(size: 14))
                        .foregroundColor(.white)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)

                    if isSearching {
                        ProgressView()
                            .tint(DojoTheme.piuAccent)
                            .scaleEffect(0.7)
                    }
                }
                .padding(10)
                .background(DojoTheme.piuCard)
                .cornerRadius(10)
                .padding(.horizontal)
                .padding(.top, 8)

                // Results
                if !results.isEmpty {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(results) { user in
                                Button {
                                    Task { await startConversation(with: user) }
                                } label: {
                                    userRow(user)
                                }
                                Divider()
                                    .background(DojoTheme.piuBorder.opacity(0.3))
                            }
                        }
                    }
                } else if query.count >= 2 && !isSearching {
                    Text("No users found")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                        .frame(maxWidth: .infinity, minHeight: 80)
                } else {
                    Spacer()
                    Text("Search for a user to message")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                    Spacer()
                }
            }
        }
        .navigationTitle("New Message")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("Cancel") { dismiss() }
                    .foregroundColor(DojoTheme.piuAccent)
            }
        }
        .onChange(of: query) { _ in
            debouncedSearch()
        }
        .overlay {
            if isStarting {
                ZStack {
                    Color.black.opacity(0.5)
                    ProgressView()
                        .tint(DojoTheme.piuAccent)
                }
                .ignoresSafeArea()
            }
        }
    }

    private func userRow(_ user: User) -> some View {
        HStack(spacing: 10) {
            AvatarView(user.avatar, name: user.username, size: 40)

            Text(user.username)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundColor(DojoTheme.textMuted)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private func startConversation(with user: User) async {
        isStarting = true
        if let conv = await vm.startConversation(userId: user.id) {
            onConversationCreated?(conv)
        }
        isStarting = false
    }

    private func debouncedSearch() {
        searchTask?.cancel()
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2 else {
            results = []
            isSearching = false
            return
        }

        searchTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            isSearching = true
            do {
                results = try await APIService.shared.searchUsers(trimmed)
            } catch {
                results = []
            }
            isSearching = false
        }
    }
}
