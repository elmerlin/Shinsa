import SwiftUI

/// Detail view for a single upscore, clear, or post accessed from activity links
struct FeedItemDetailView: View {
    let type: String // "upscore", "clear", "post"
    let itemId: String

    @State private var feedItem: FeedItem?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if isLoading {
                ProgressView().tint(DojoTheme.piuAccent)
            } else if let item = feedItem {
                ScrollView {
                    VStack(spacing: 16) {
                        switch item.type {
                        case "upscore":
                            UpscoreCardView(item: item)
                        case "clear":
                            NewClearCardView(item: item)
                        case "post":
                            PostCardView(item: item)
                        default:
                            Text("Unknown item type")
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 28))
                        .foregroundColor(DojoTheme.textMuted)
                    Text(errorMessage ?? "Item not found")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }
        }
        .navigationTitle(type.capitalized)
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadItem() }
    }

    private func loadItem() async {
        isLoading = true
        guard let id = Int(itemId) else {
            errorMessage = "Invalid ID"
            isLoading = false
            return
        }

        do {
            switch type {
            case "upscore":
                let upscore = try await APIService.shared.getUpscore(id)
                feedItem = FeedItem.from(upscore: upscore)
            case "clear":
                let clear = try await APIService.shared.getNewClear(id)
                feedItem = FeedItem.from(clear: clear)
            case "post":
                let post = try await APIService.shared.getPost(id)
                feedItem = FeedItem.from(post: post)
            default:
                errorMessage = "Unknown type"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - FeedItem factory from individual API responses
extension FeedItem {
    static func from(upscore: Upscore) -> FeedItem {
        FeedItem(
            type: "upscore",
            userId: upscore.userId,
            username: upscore.username,
            avatar: upscore.avatar,
            nationality: upscore.nationality,
            pumpCount: upscore.pumpCount,
            commentCount: upscore.commentCount,
            userPumped: upscore.userPumped,
            createdAt: upscore.createdAt,
            feedId: upscore.id,
            upscoresJson: upscore.upscoresJson
        )
    }

    static func from(clear: NewClear) -> FeedItem {
        FeedItem(
            type: "clear",
            userId: clear.userId,
            username: clear.username,
            avatar: clear.avatar,
            nationality: clear.nationality,
            pumpCount: clear.pumpCount,
            commentCount: clear.commentCount,
            userPumped: clear.userPumped,
            createdAt: clear.createdAt,
            feedId: clear.id,
            songTitle: clear.songTitle,
            mode: clear.mode,
            level: clear.level,
            score: clear.score,
            grade: clear.grade,
            plate: clear.plate,
            // clearsJson not available on single clear detail
            backgroundUrl: clear.backgroundUrl
        )
    }

    static func from(post: Post) -> FeedItem {
        FeedItem(
            type: "post",
            userId: post.userId,
            username: post.username,
            avatar: post.avatar,
            nationality: post.nationality,
            pumpCount: post.pumpCount,
            commentCount: post.commentCount,
            userPumped: post.userPumped,
            createdAt: post.createdAt,
            feedId: post.id,
            content: post.content,
            images: post.images,
            youtubeUrl: post.youtubeUrl
        )
    }
}
