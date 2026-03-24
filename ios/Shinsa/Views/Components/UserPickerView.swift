import SwiftUI

/// Unified recipient: either a user (from search) or an existing conversation
struct PickerRecipient: Identifiable, Hashable {
    let id: String
    let name: String
    let avatar: String?
    let isSquad: Bool
    let conversationId: String? // nil for search results (will create DM)
    let userId: String? // nil for squads

    static func fromConversation(_ c: Conversation) -> PickerRecipient {
        PickerRecipient(
            id: c.id, name: c.displayName,
            avatar: c.isSquad ? c.avatar : c.partnerAvatar,
            isSquad: c.isSquad, conversationId: c.id,
            userId: c.partner?.id
        )
    }

    static func fromUser(_ u: User) -> PickerRecipient {
        PickerRecipient(
            id: "user_\(u.id)", name: u.username,
            avatar: u.avatar, isSquad: false,
            conversationId: nil, userId: u.id
        )
    }
}

/// Multi-select picker that shows recent DMs, squads, and search results
struct UserPickerSheet: View {
    let title: String
    let onSelectUser: (ConversationPartner) -> Void
    let onSelectConversation: (Conversation) -> Void
    let onDismiss: () -> Void

    @State private var conversations: [Conversation] = []
    @State private var isLoading = true
    @State private var searchQuery = ""
    @State private var searchResults: [User] = []
    @State private var isSearching = false
    @State private var selected = Set<String>() // PickerRecipient ids
    @State private var allRecipients: [PickerRecipient] = []
    @State private var isSending = false
    @State private var sentCount = 0

    private var recentDMs: [Conversation] {
        Array(conversations.filter { $0.kind != "squad" }.prefix(8))
    }

    private var squads: [Conversation] {
        Array(conversations.filter { $0.kind == "squad" }.prefix(12))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Selected pills bar
                    if !selected.isEmpty {
                        selectedBar
                    }

                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            // Search
                            searchBar

                            if sentCount > 0 {
                                HStack {
                                    Image(systemName: "checkmark.circle.fill").foregroundColor(.green)
                                    Text("Sent to \(sentCount) recipient\(sentCount == 1 ? "" : "s")")
                                        .font(.system(size: 14, weight: .bold)).foregroundColor(.green)
                                }
                            }

                            // Search results
                            if !searchResults.isEmpty {
                                sectionLabel("SEARCH RESULTS")
                                ForEach(searchResults) { user in
                                    let r = PickerRecipient.fromUser(user)
                                    recipientRow(r)
                                }
                            }

                            // Recent DMs
                            if searchQuery.isEmpty && !recentDMs.isEmpty {
                                sectionLabel("RECENT")
                                ForEach(recentDMs) { convo in
                                    let r = PickerRecipient.fromConversation(convo)
                                    recipientRow(r)
                                }
                            }

                            // Squads
                            if searchQuery.isEmpty && !squads.isEmpty {
                                sectionLabel("SQUADS")
                                ForEach(squads) { squad in
                                    let r = PickerRecipient.fromConversation(squad)
                                    recipientRow(r)
                                }
                            }

                            if isLoading {
                                HStack { Spacer(); ProgressView().tint(DojoTheme.piuAccent); Spacer() }
                            }
                        }
                        .padding(16)
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { onDismiss() }
                        .font(.system(size: 14)).foregroundColor(.gray)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    if !selected.isEmpty {
                        Button {
                            Task { await sendToSelected() }
                        } label: {
                            if isSending {
                                ProgressView().tint(.white).scaleEffect(0.7)
                            } else {
                                Text("Send (\(selected.count))")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(Capsule().fill(Color.cyan))
                            }
                        }
                        .disabled(isSending)
                    }
                }
            }
            .task { await loadConversations() }
            .onChange(of: searchQuery) { q in
                Task { await search(q) }
            }
        }
    }

    // MARK: - Selected pills bar
    private var selectedBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(allRecipients.filter { selected.contains($0.id) }) { r in
                    HStack(spacing: 4) {
                        AvatarView(r.avatar, name: r.name, size: 20).clipShape(Circle())
                        Text(r.name)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                            .lineLimit(1)
                        Button { selected.remove(r.id) } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 12))
                                .foregroundColor(.white.opacity(0.5))
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(Color.cyan.opacity(0.2)).overlay(Capsule().stroke(Color.cyan.opacity(0.4), lineWidth: 1)))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(DojoTheme.piuCard)
    }

    // MARK: - Components
    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").font(.system(size: 14)).foregroundColor(DojoTheme.textMuted)
            TextField("Search players or squads...", text: $searchQuery)
                .font(.system(size: 14)).foregroundColor(.white)
                .autocorrectionDisabled().textInputAutocapitalization(.never)
            if isSearching { ProgressView().tint(DojoTheme.piuAccent).scaleEffect(0.7) }
        }
        .padding(10).background(DojoTheme.piuCard).cornerRadius(10)
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text).font(.system(size: 11, weight: .bold)).foregroundColor(DojoTheme.textMuted).tracking(1)
    }

    private func recipientRow(_ r: PickerRecipient) -> some View {
        Button {
            toggleRecipient(r)
        } label: {
            HStack(spacing: 12) {
                // Selection indicator
                Image(systemName: selected.contains(r.id) ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18))
                    .foregroundColor(selected.contains(r.id) ? .cyan : DojoTheme.textMuted.opacity(0.4))

                AvatarView(r.avatar, name: r.name, size: 40).clipShape(Circle())

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(r.name)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                        if r.isSquad {
                            Text("Squad")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(DojoTheme.piuAccent)
                                .padding(.horizontal, 5).padding(.vertical, 2)
                                .background(DojoTheme.piuAccent.opacity(0.15)).cornerRadius(4)
                        }
                    }
                }
                Spacer()
            }
            .padding(.vertical, 6)
        }
    }

    // MARK: - Logic
    private func toggleRecipient(_ r: PickerRecipient) {
        if selected.contains(r.id) {
            selected.remove(r.id)
        } else {
            selected.insert(r.id)
            if !allRecipients.contains(where: { $0.id == r.id }) {
                allRecipients.append(r)
            }
        }
    }

    private func sendToSelected() async {
        isSending = true
        let recipients = allRecipients.filter { selected.contains($0.id) }
        for r in recipients {
            if let convoId = r.conversationId {
                onSelectConversation(conversations.first(where: { $0.id == convoId }) ?? Conversation(id: convoId))
            } else if let uid = r.userId {
                onSelectUser(ConversationPartner(id: uid, username: r.name, avatar: r.avatar))
            }
        }
        sentCount = recipients.count
        selected.removeAll()
        isSending = false
    }

    private func loadConversations() async {
        isLoading = true
        conversations = (try? await APIService.shared.getConversations()) ?? []
        // Pre-populate allRecipients from conversations
        for c in recentDMs + squads {
            let r = PickerRecipient.fromConversation(c)
            if !allRecipients.contains(where: { $0.id == r.id }) {
                allRecipients.append(r)
            }
        }
        isLoading = false
    }

    private func search(_ query: String) async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { searchResults = []; isSearching = false; return }
        isSearching = true
        searchResults = (try? await APIService.shared.searchUsers(q)) ?? []
        isSearching = false
    }
}
