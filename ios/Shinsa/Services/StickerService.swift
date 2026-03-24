import Foundation

/// Maps sticker shortcodes like `:buu_hop_sandbagging_3:` to image URLs hosted on the web app
@MainActor
struct StickerService {
    static var baseURL: String { APIService.shared.baseURL }

    // Regex matching sticker tokens like :buu_hop_sandbagging_3:
    private static let tokenPattern = try! NSRegularExpression(
        pattern: #":(?:dojocat_\d+_\d+|dojocat_pixiu_\d+|dojocat_pixiu_traditional_\d+|devit_[a-z0-9_]+|heavybreathing_chicken_\d+|buu_\d+|buuu_\d+|buu_hop_dressup_\d+|buu_hop_power_rangers_\d+|buu_hop_sandbagging_\d+|heavybreathing|vegetacat_[a-z0-9_]+|mope_flower_\d+):"#,
        options: [.caseInsensitive]
    )

    /// Pack-specific mappings: shortcode prefix → (directory, filename pattern)
    private static let packs: [(prefix: String, dir: String, filePrefix: String)] = [
        ("dojocat_pixiu_traditional_", "dojocat_pixiu_traditional", "dojocat-pixiu-traditional-"),
        ("dojocat_pixiu_", "dojocat_pixiu", "dojocat-pixiu-"),
        ("dojocat_", "dojocat", "dojocat-"),
        ("buu_hop_sandbagging_", "buu_hop_sandbagging", "buu-hop-sandbagging-"),
        ("buu_hop_power_rangers_", "buu_hop_power_rangers", "buu-hop-power-rangers-"),
        ("buu_hop_dressup_", "buu_hop_dressup", "buu-hop-dressup-"),
        ("buuu_", "buu", "buuu-"),
        ("buu_", "buu", "buu-"),
        ("heavybreathing_chicken_", "heavybreathing_chicken", "heavybreathing-chicken-"),
        ("devit_", "devit", ""),  // devit uses key directly as filename
        ("vegetacat_", "vegetacat", ""),  // vegetacat uses key directly
        ("mope_flower_", "mope_flower", "mope-flower-"),
    ]

    /// Convert a sticker token like `:buu_hop_sandbagging_3:` to a URL
    static func stickerURL(for token: String) -> URL? {
        let raw = token.trimmingCharacters(in: CharacterSet(charactersIn: ":")).lowercased()

        // Special cases
        if raw == "heavybreathing" {
            return URL(string: "\(baseURL)/emojis/heavybreathing/heavybreathing.png")
        }

        // dojocat uses "row-col" format: dojocat_1_3 → dojocat/dojocat-1-3.png
        if raw.hasPrefix("dojocat_") && !raw.hasPrefix("dojocat_pixiu") {
            let parts = raw.replacingOccurrences(of: "dojocat_", with: "").components(separatedBy: "_")
            if parts.count == 2 {
                return URL(string: "\(baseURL)/emojis/dojocat/dojocat-\(parts[0])-\(parts[1]).png")
            }
        }

        // devit uses key as filename (idle, scamper, etc.)
        if raw.hasPrefix("devit_") {
            let key = raw.replacingOccurrences(of: "devit_", with: "")
            return URL(string: "\(baseURL)/emojis/devit/\(key).png")
        }

        // vegetacat uses key as filename
        if raw.hasPrefix("vegetacat_") {
            let key = raw.replacingOccurrences(of: "vegetacat_", with: "")
            return URL(string: "\(baseURL)/emojis/vegetacat/\(key).gif")
        }

        // Standard packs: extract index number
        for pack in packs {
            if raw.hasPrefix(pack.prefix) {
                let index = raw.replacingOccurrences(of: pack.prefix, with: "")
                let filename = pack.filePrefix.isEmpty ? "\(index).png" : "\(pack.filePrefix)\(index).png"
                return URL(string: "\(baseURL)/emojis/\(pack.dir)/\(filename)")
            }
        }

        return nil
    }

    /// Check if a message is sticker-only (all content is sticker tokens)
    static func isStickerOnly(_ text: String) -> Bool {
        let raw = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return false }
        let tokens = extractTokens(raw)
        guard !tokens.isEmpty else { return false }
        var remaining = raw
        for token in tokens {
            remaining = remaining.replacingOccurrences(of: token, with: "")
        }
        return remaining.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Check if text contains any sticker tokens
    static func containsStickers(_ text: String) -> Bool {
        let range = NSRange(text.startIndex..., in: text)
        return tokenPattern.firstMatch(in: text, range: range) != nil
    }

    /// Extract all sticker tokens from text
    static func extractTokens(_ text: String) -> [String] {
        let range = NSRange(text.startIndex..., in: text)
        return tokenPattern.matches(in: text, range: range).compactMap { match in
            Range(match.range, in: text).map { String(text[$0]) }
        }
    }

    /// Split text into alternating text and sticker token parts
    static func splitContent(_ text: String) -> [String] {
        var parts: [String] = []
        let nsString = text as NSString
        let range = NSRange(location: 0, length: nsString.length)
        var lastEnd = 0

        for match in tokenPattern.matches(in: text, range: range) {
            let matchStart = match.range.location
            if matchStart > lastEnd {
                let textPart = nsString.substring(with: NSRange(location: lastEnd, length: matchStart - lastEnd))
                if !textPart.trimmingCharacters(in: .whitespaces).isEmpty {
                    parts.append(textPart)
                }
            }
            parts.append(nsString.substring(with: match.range))
            lastEnd = match.range.location + match.range.length
        }

        if lastEnd < nsString.length {
            let remaining = nsString.substring(from: lastEnd)
            if !remaining.trimmingCharacters(in: .whitespaces).isEmpty {
                parts.append(remaining)
            }
        }

        return parts
    }
}
