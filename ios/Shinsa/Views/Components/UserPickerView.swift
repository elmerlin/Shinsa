import SwiftUI

/// A picker sheet that shows recent conversations and squads for sending content to DMs
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
    @State private var sentTo: String?

    private var recentDMs: [Conversation] {
        conversations
            .filter { $0.kind != "squad" }
            .prefix(8)
            .map { $0 }
    }

    private var squads: [Conversation] {
        conversations
            .filter { $0.kind == "squad" }
            .prefix(12)
            .map { $0 }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Search bar
                        HStack(spacing: 8) {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 14))
                                .foregroundColor(DojoTheme.textMuted)
                            TextField("Search players...", text: $searchQuery)
                                .font(.system(size: 14))
                                .foregroundColor(.white)
                                .autocorrectionDisabled()
                                .textInputAutocapitalization(.never)
                            if isSearching {
                                ProgressView().tint(DojoTheme.piuAccent).scaleEffect(0.7)
                            }
                        }
                        .padding(10)
                        .background(DojoTheme.piuCard)
                        .cornerRadius(10)

                        if let sent = sentTo {
                            HStack {
                                Image(systemName: "checkmark.circle.fill").foregroundColor(.green)
                                Text("Sent to \(sent)").font(.system(size: 14, weight: .bold)).foregroundColor(.green)
                            }
                        }

                        // Search results
                        if !searchResults.isEmpty {
                            sectionLabel("SEARCH RESULTS")
                            ForEach(searchResults) { user in
                                Button {
                                    let partner = ConversationPartner(id: user.id, username: user.username, avatar: user.avatar)
                                    onSelectUser(partner)
                                    sentTo = user.username
                                } label: {
                                    userRow(avatar: user.avatar, name: user.username, subtitle: user.skillTitle)
                                }
                            }
                        }

                        // Recent DMs
                        if searchQuery.isEmpty && !recentDMs.isEmpty {
                            sectionLabel("RECENT")
                            ForEach(recentDMs) { convo in
                                Button {
                                    onSelectConversation(convo)
                                    sentTo = convo.displayName
                                } label: {
                                    userRow(avatar: convo.partnerAvatar, name: convo.displayName, subtitle: convo.lastMessagePreview)
                                }
                            }
                        }

                        // Squads
                        if searchQuery.isEmpty && !squads.isEmpty {
                            sectionLabel("SQUADS")
                            ForEach(squads) { squad in
                                Button {
                                    onSelectConversation(squad)
                                    sentTo = squad.displayName
                                } label: {
                                    HStack(spacing: 12) {
                                        if let av = squad.avatar, !av.isEmpty {
                                            AvatarView(av, name: squad.displayName, size: 40)
                                                .clipShape(Circle())
                                        } else {
                                            ZStack {
                                                Circle().fill(DojoTheme.piuAccent.opacity(0.2))
                                                Text(String(squad.displayName.prefix(2)).uppercased())
                                                    .font(.system(size: 13, weight: .bold))
                                                    .foregroundColor(DojoTheme.piuAccent)
                                            }
                                            .frame(width: 40, height: 40)
                                        }
                                        VStack(alignment: .leading, spacing: 2) {
                                            HStack(spacing: 6) {
                                                Text(squad.displayName)
                                                    .font(.system(size: 14, weight: .bold))
                                                    .foregroundColor(.white)
                                                Text("Squad")
                                                    .font(.system(size: 9, weight: .bold))
                                                    .foregroundColor(DojoTheme.piuAccent)
                                                    .padding(.horizontal, 5)
                                                    .padding(.vertical, 2)
                                                    .background(DojoTheme.piuAccent.opacity(0.15))
                                                    .cornerRadius(4)
                                            }
                                            if let count = squad.memberCount {
                                                Text("\(count) members")
                                                    .font(.system(size: 11))
                                                    .foregroundColor(DojoTheme.textMuted)
                                            }
                                        }
                                        Spacer()
                                        Image(systemName: "paperplane.fill")
                                            .font(.system(size: 12))
                                            .foregroundColor(.cyan)
                                    }
                                    .padding(.vertical, 6)
                                }
                            }
                        }

                        if isLoading {
                            HStack { Spacer(); ProgressView().tint(DojoTheme.piuAccent); Spacer() }
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { onDismiss() }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.cyan)
                }
            }
            .task { await loadConversations() }
            .onChange(of: searchQuery) { q in
                Task { await search(q) }
            }
        }
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(DojoTheme.textMuted)
            .tracking(1)
    }

    private func userRow(avatar: String?, name: String, subtitle: String?) -> some View {
        HStack(spacing: 12) {
            AvatarView(avatar, name: name, size: 40).clipShape(Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                if let sub = subtitle, !sub.isEmpty {
                    Text(sub)
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                        .lineLimit(1)
                }
            }
            Spacer()
            Image(systemName: "paperplane.fill")
                .font(.system(size: 12))
                .foregroundColor(.cyan)
        }
        .padding(.vertical, 6)
    }

    private func loadConversations() async {
        isLoading = true
        conversations = (try? await APIService.shared.getConversations()) ?? []
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
