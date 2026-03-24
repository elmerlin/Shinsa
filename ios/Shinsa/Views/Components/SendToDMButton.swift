import SwiftUI

// Send to DM view - user picker that sends a score as a link_share message
struct SendToDMView: View {
    let songTitle: String
    let mode: String
    let level: Int
    let score: Int
    let grade: String
    let onDismiss: () -> Void

    @State private var searchQuery = ""
    @State private var searchResults: [User] = []
    @State private var isSending = false
    @State private var sentTo: String?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                VStack(spacing: 16) {
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(DojoTheme.textMuted)
                        TextField("Search users...", text: $searchQuery)
                            .foregroundColor(.white)
                            .autocorrectionDisabled()
                            .onChange(of: searchQuery) { q in
                                Task { await search(q) }
                            }
                    }
                    .padding(12)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(10)
                    .padding(.horizontal, 16)

                    if let sent = sentTo {
                        HStack {
                            Image(systemName: "checkmark.circle.fill").foregroundColor(.green)
                            Text("Sent to \(sent)").font(.system(size: 14, weight: .bold)).foregroundColor(.green)
                        }.padding(.top, 8)
                    }

                    if let err = errorMessage {
                        Text(err).font(.system(size: 12)).foregroundColor(.red).padding(.horizontal, 16)
                    }

                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(searchResults) { user in
                                Button { Task { await sendToUser(user) } } label: {
                                    HStack(spacing: 12) {
                                        AvatarView(user.avatar, name: user.username, size: 40)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(user.username)
                                                .font(.system(size: 14, weight: .bold))
                                                .foregroundColor(.white)
                                            if let skill = user.skillTitle {
                                                Text(skill).font(.system(size: 11)).foregroundColor(DojoTheme.textMuted)
                                            }
                                        }
                                        Spacer()
                                        if isSending {
                                            ProgressView().scaleEffect(0.7).tint(.white)
                                        } else {
                                            Image(systemName: "paperplane.fill").foregroundColor(.cyan)
                                        }
                                    }
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 10)
                                }
                                .disabled(isSending)
                                Divider().background(DojoTheme.piuBorder.opacity(0.3))
                            }
                        }
                    }
                }
                .padding(.top, 8)
            }
            .navigationTitle("Send to...")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { onDismiss() } label: {
                        Text("Done").font(.system(size: 14, weight: .bold)).foregroundColor(.cyan)
                    }
                }
            }
        }
    }

    private func search(_ query: String) async {
        guard query.count >= 2 else { searchResults = []; return }
        do { searchResults = try await APIService.shared.searchUsers(query) } catch { searchResults = [] }
    }

    private func sendToUser(_ user: User) async {
        isSending = true
        errorMessage = nil
        do {
            let convo = try await APIService.shared.startDirectConversation(user.id)
            let linkShare: [String: AnyCodable] = [
                "kind": AnyCodable("score_snapshot"),
                "songTitle": AnyCodable(songTitle),
                "mode": AnyCodable(mode),
                "level": AnyCodable(level),
                "score": AnyCodable(score),
                "grade": AnyCodable(grade),
                "title": AnyCodable("\(songTitle) - \(mode) \(level)"),
            ]
            _ = try await APIService.shared.sendLinkShareMessage(convo.id, linkShare: linkShare)
            sentTo = user.username
        } catch {
            errorMessage = error.localizedDescription
        }
        isSending = false
    }
}

// Standalone share to story button
struct ShareToStoryButton: View {
    let snapshot: StorySnapshot
    @State private var showComposer = false

    var body: some View {
        Button { showComposer = true } label: {
            Image(systemName: "diamond")
                .font(.system(size: 14))
                .foregroundColor(.cyan)
        }
        .fullScreenCover(isPresented: $showComposer) {
            StoryComposerView(prefilledSnapshot: snapshot, onDismiss: { showComposer = false })
        }
    }
}
