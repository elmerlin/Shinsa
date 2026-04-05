import SwiftUI

struct CommentsView: View {
    let itemType: String // "post", "upscore", "new_clear"
    let itemId: Int
    @EnvironmentObject var auth: AuthManager

    @State private var comments: [Comment] = []
    @State private var isLoading = false
    @State private var commentText = ""
    @State private var isSending = false
    @State private var replyingTo: Comment?
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            // Comments list
            if isLoading && comments.isEmpty {
                ProgressView()
                    .tint(DojoTheme.piuAccent)
                    .frame(maxWidth: .infinity, minHeight: 80)
            } else if comments.isEmpty {
                Text("No comments yet")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .frame(maxWidth: .infinity, minHeight: 60)
            } else {
                VStack(spacing: 0) {
                    ForEach(comments) { comment in
                        commentRow(comment, isReply: false)

                        if let replies = comment.replies, !replies.isEmpty {
                            ForEach(replies) { reply in
                                commentRow(reply, isReply: true)
                            }
                        }
                    }
                }
            }

            // Reply indicator
            if let replying = replyingTo {
                HStack(spacing: 6) {
                    Text("Replying to @\(replying.username ?? "user")")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.piuBlue)
                    Spacer()
                    Button {
                        replyingTo = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(DojoTheme.piuDark)
            }

            // Input bar
            HStack(spacing: 8) {
                TextField("Add a comment...", text: $commentText)
                    .font(.system(size: 14))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(DojoTheme.piuDark)
                    .cornerRadius(20)

                Button {
                    Task { await sendComment() }
                } label: {
                    if isSending {
                        ProgressView()
                            .tint(DojoTheme.piuAccent)
                            .scaleEffect(0.8)
                    } else {
                        Image(systemName: "paperplane.fill")
                            .font(.system(size: 16))
                            .foregroundColor(commentText.trimmingCharacters(in: .whitespaces).isEmpty ? DojoTheme.textMuted : DojoTheme.piuAccent)
                    }
                }
                .disabled(commentText.trimmingCharacters(in: .whitespaces).isEmpty || isSending)
            }
            .padding(12)
            .background(DojoTheme.piuCard)

            if let err = errorMessage {
                Text(err)
                    .font(.system(size: 11))
                    .foregroundColor(.red)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 4)
            }
        }
        .task { await loadComments() }
    }

    // MARK: - Comment Row

    private func commentRow(_ comment: Comment, isReply: Bool) -> some View {
        HStack(alignment: .top, spacing: 8) {
            if isReply {
                Color.clear.frame(width: 24)
            }

            NavigationLink(value: "profile/\(comment.userId ?? "")") {
                AvatarView(comment.avatar, name: comment.username ?? "?", size: isReply ? 28 : 32)
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(comment.username ?? "Unknown")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)

                    if let created = comment.createdAt {
                        Text(created.timeAgo)
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }

                StickerTextView(text: comment.content, font: .system(size: 13), color: .white.opacity(0.9))

                // Actions
                HStack(spacing: 14) {
                    // Pump
                    CommentPumpButton(comment: comment, itemType: itemType)

                    // Reply
                    Button {
                        replyingTo = comment
                    } label: {
                        Text("Reply")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(DojoTheme.textMuted)
                    }

                    // Delete (own comments)
                    if comment.userId == auth.userId {
                        Button {
                            Task { await deleteComment(comment) }
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 10))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }
                }
                .padding(.top, 2)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    // MARK: - Actions

    private func loadComments() async {
        isLoading = true
        do {
            switch itemType {
            case "post":
                comments = try await APIService.shared.getPostComments(itemId)
            case "upscore":
                comments = try await APIService.shared.getUpscoreComments(itemId)
            case "new_clear", "clear":
                comments = try await APIService.shared.getNewClearComments(itemId)
            default:
                break
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func sendComment() async {
        let content = commentText.trimmingCharacters(in: .whitespaces)
        guard !content.isEmpty else { return }
        isSending = true
        errorMessage = nil

        do {
            let parentId = replyingTo?.id
            switch itemType {
            case "post":
                let newComment = try await APIService.shared.addPostComment(itemId, content: content, parentId: parentId)
                insertComment(newComment)
            case "upscore":
                let newComment = try await APIService.shared.addUpscoreComment(itemId, content: content, parentId: parentId)
                insertComment(newComment)
            case "new_clear", "clear":
                let newComment = try await APIService.shared.addNewClearComment(itemId, content: content, parentId: parentId)
                insertComment(newComment)
            default:
                break
            }
            commentText = ""
            replyingTo = nil
            HapticService.impact(.light)
        } catch {
            errorMessage = error.localizedDescription
        }
        isSending = false
    }

    private func insertComment(_ comment: Comment) {
        if let parentId = comment.parentId {
            // Insert as reply under parent
            if let idx = comments.firstIndex(where: { $0.id == parentId }) {
                var parent = comments[idx]
                var replies = parent.replies ?? []
                replies.append(comment)
                parent.replies = replies
                comments[idx] = parent
            } else {
                comments.append(comment)
            }
        } else {
            comments.append(comment)
        }
    }

    private func deleteComment(_ comment: Comment) async {
        do {
            switch itemType {
            case "post":
                try await APIService.shared.deletePostComment(comment.id)
            case "upscore":
                try await APIService.shared.deleteUpscoreComment(comment.id)
            case "new_clear", "clear":
                try await APIService.shared.deleteNewClearComment(comment.id)
            default:
                break
            }
            removeComment(comment.id)
            HapticService.impact(.light)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func removeComment(_ id: Int) {
        // Remove from top-level
        if let idx = comments.firstIndex(where: { $0.id == id }) {
            comments.remove(at: idx)
            return
        }
        // Remove from replies
        for i in comments.indices {
            if var replies = comments[i].replies,
               let rIdx = replies.firstIndex(where: { $0.id == id }) {
                replies.remove(at: rIdx)
                comments[i].replies = replies
                return
            }
        }
    }
}

// MARK: - Comment Pump Button

private struct CommentPumpButton: View {
    let comment: Comment
    let itemType: String

    @State private var pumped: Bool
    @State private var count: Int

    init(comment: Comment, itemType: String) {
        self.comment = comment
        self.itemType = itemType
        _pumped = State(initialValue: comment.isPumped)
        _count = State(initialValue: comment.pumpCount ?? 0)
    }

    var body: some View {
        PumpButtonView(pumped: $pumped, count: $count) {
            await togglePump()
        }
    }

    private func togglePump() async {
        let type: String
        switch itemType {
        case "post": type = "post"
        case "upscore": type = "upscore"
        case "new_clear", "clear": type = "clear"
        default: return
        }
        do {
            let response = try await APIService.shared.pumpComment(type: type, commentId: comment.id)
            pumped = response.pumped
            count = response.pumpCount ?? count
            if pumped { HapticService.pump() }
        } catch {}
    }
}
