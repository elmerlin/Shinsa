import SwiftUI

struct PostCardView: View {
    let item: FeedItem
    @State private var pumped: Bool
    @State private var pumpCount: Int
    @State private var showComments = false
    @State private var showSendPicker = false

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

            // Content (parse live session markers)
            if let content = item.content, !content.isEmpty {
                let parsed = LiveSessionMarker.split(content)

                if let summary = parsed.summary {
                    LiveSessionCardView(summary: summary, username: item.username)
                }

                if !parsed.text.isEmpty {
                    Text(parsed.text)
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.9))
                        .lineSpacing(3)
                }
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

            // Footer: Pump + Comments + Share
            HStack(spacing: 16) {
                PumpButtonView(pumped: $pumped, count: $pumpCount) {
                    await togglePump()
                }

                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showComments.toggle()
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "bubble.left")
                            .font(.system(size: 12))
                        Text("\(item.commentCount ?? 0)")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .foregroundColor(showComments ? DojoTheme.piuAccent : DojoTheme.textMuted)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                }

                Button { showSendPicker = true } label: {
                    Image(systemName: "paperplane")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textMuted)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                }

                Spacer()
            }

            // Inline comments
            if showComments {
                CommentsView(itemType: "post", itemId: item.itemId)
                    .frame(maxHeight: 300)
                    .clipped()
            }
        }
        .padding(14)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .sheet(isPresented: $showSendPicker) {
            UserPickerSheet(
                title: "Send post",
                onSelectUser: { partner in
                    Task {
                        guard let pid = partner.id else { return }
                        let ls: [String: AnyCodable] = ["kind": AnyCodable("post"), "title": AnyCodable("\(item.username ?? "Player")'s post"), "subtitle": AnyCodable(String((item.content ?? "").prefix(100)))]
                        let convo = try? await APIService.shared.startDirectConversation(pid)
                        if let cid = convo?.id { _ = try? await APIService.shared.sendLinkShareMessage(cid, linkShare: ls) }
                    }
                },
                onSelectConversation: { convo in
                    Task {
                        let ls: [String: AnyCodable] = ["kind": AnyCodable("post"), "title": AnyCodable("\(item.username ?? "Player")'s post"), "subtitle": AnyCodable(String((item.content ?? "").prefix(100)))]
                        _ = try? await APIService.shared.sendLinkShareMessage(convo.id, linkShare: ls)
                    }
                },
                onDismiss: { showSendPicker = false }
            )
        }
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
