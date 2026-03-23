import SwiftUI

struct PostCardView: View {
    let item: FeedItem
    @State private var pumped: Bool
    @State private var pumpCount: Int

    init(item: FeedItem) {
        self.item = item
        _pumped = State(initialValue: item.isPumped)
        _pumpCount = State(initialValue: item.pumpCount ?? 0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header
            HStack(spacing: 10) {
                NavigationLink(value: "profile/\(item.userId ?? "")") {
                    AvatarView(item.avatar, name: item.username ?? "?", size: 36)
                }

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text(item.username ?? "Unknown")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                        if let nat = item.nationality, !nat.isEmpty {
                            Text(CountryData.flag(for: nat))
                                .font(.system(size: 12))
                        }
                    }
                    if let created = item.createdAt {
                        Text(created.timeAgo)
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }

                Spacer()
            }

            // Content
            if let content = item.content, !content.isEmpty {
                Text(content)
                    .font(.system(size: 14))
                    .foregroundColor(.white.opacity(0.9))
                    .lineSpacing(3)
            }

            // Images
            if !item.imageUrls.isEmpty {
                ImageGridView(urls: item.imageUrls)
            }

            // YouTube
            if let ytUrl = item.youtubeUrl, !ytUrl.isEmpty {
                Link(destination: URL(string: ytUrl)!) {
                    HStack(spacing: 6) {
                        Image(systemName: "play.fill")
                            .foregroundColor(.red)
                        Text("Watch on YouTube")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(DojoTheme.piuBlue)
                    }
                    .padding(10)
                    .background(DojoTheme.piuDark)
                    .cornerRadius(8)
                }
            }

            // Footer: Pump + Comments
            HStack(spacing: 16) {
                PumpButtonView(pumped: $pumped, count: $pumpCount) {
                    await togglePump()
                }

                HStack(spacing: 4) {
                    Image(systemName: "bubble.left")
                        .font(.system(size: 12))
                    Text("\(item.commentCount ?? 0)")
                        .font(.system(size: 12))
                }
                .foregroundColor(DojoTheme.textMuted)

                Spacer()
            }
        }
        .padding(14)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    private func togglePump() async {
        do {
            let response = try await APIService.shared.pumpPost(item.itemId)
            pumped = response.pumped
            pumpCount = response.pumpCount ?? pumpCount
            if pumped { HapticService.pump() }
        } catch {}
    }

}
