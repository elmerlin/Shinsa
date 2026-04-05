import SwiftUI

/// Renders text with inline sticker images, replacing `:shortcode:` tokens
struct StickerTextView: View {
    let text: String
    var font: Font = .system(size: 14)
    var color: Color = .white.opacity(0.9)
    var stickerSize: CGFloat = 24
    var lineLimit: Int? = nil

    var body: some View {
        if StickerService.isStickerOnly(text) {
            // Pure sticker message — show large
            let tokens = StickerService.extractTokens(text)
            HStack(spacing: 4) {
                ForEach(tokens, id: \.self) { token in
                    if let url = StickerService.stickerURL(for: token) {
                        AsyncImage(url: url) { phase in
                            if case .success(let img) = phase {
                                img.resizable().scaledToFit()
                            } else {
                                Text(token).font(.system(size: 11)).foregroundColor(DojoTheme.textMuted)
                            }
                        }
                        .frame(width: stickerSize * 2, height: stickerSize * 2)
                    }
                }
            }
        } else if StickerService.containsStickers(text) {
            // Mixed text + stickers — inline
            let parts = StickerService.splitContent(text)
            wrappedContent(parts)
        } else {
            Text(text)
                .font(font)
                .foregroundColor(color)
                .lineLimit(lineLimit)
        }
    }

    private func wrappedContent(_ parts: [String]) -> some View {
        HStack(spacing: 2) {
            ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                if part.hasPrefix(":") && part.hasSuffix(":"), let url = StickerService.stickerURL(for: part) {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase {
                            img.resizable().scaledToFit()
                        } else {
                            Text(part).font(.system(size: 11)).foregroundColor(DojoTheme.textMuted)
                        }
                    }
                    .frame(width: stickerSize, height: stickerSize)
                } else {
                    Text(part)
                        .font(font)
                        .foregroundColor(color)
                        .lineLimit(lineLimit)
                }
            }
        }
    }
}
