import SwiftUI

enum TextFormatter {
    /// Parses basic markdown-like formatting into an AttributedString.
    /// Supports **bold**, *italic*, and ~~strikethrough~~.
    static func format(_ text: String) -> AttributedString {
        var result = AttributedString()
        var remaining = text[text.startIndex...]

        while !remaining.isEmpty {
            // Try to find the next formatting marker
            if let (match, consumed) = parseBold(from: remaining) {
                result.append(match)
                remaining = remaining[consumed...]
            } else if let (match, consumed) = parseStrikethrough(from: remaining) {
                result.append(match)
                remaining = remaining[consumed...]
            } else if let (match, consumed) = parseItalic(from: remaining) {
                result.append(match)
                remaining = remaining[consumed...]
            } else {
                // No formatting marker found at this position; consume one character
                let char = remaining[remaining.startIndex]
                var plain = AttributedString(String(char))
                plain.foregroundColor = .white.opacity(0.9)
                result.append(plain)
                remaining = remaining[remaining.index(after: remaining.startIndex)...]
            }
        }

        return result
    }

    // MARK: - Bold (**text**)

    private static func parseBold(from input: Substring) -> (AttributedString, String.Index)? {
        guard input.hasPrefix("**") else { return nil }
        let after = input[input.index(input.startIndex, offsetBy: 2)...]
        guard let endRange = after.range(of: "**") else { return nil }
        let content = after[after.startIndex..<endRange.lowerBound]
        guard !content.isEmpty else { return nil }
        var attr = AttributedString(String(content))
        attr.font = .boldSystemFont(ofSize: 14)
        attr.foregroundColor = .white
        let consumed = endRange.upperBound
        return (attr, consumed)
    }

    // MARK: - Strikethrough (~~text~~)

    private static func parseStrikethrough(from input: Substring) -> (AttributedString, String.Index)? {
        guard input.hasPrefix("~~") else { return nil }
        let after = input[input.index(input.startIndex, offsetBy: 2)...]
        guard let endRange = after.range(of: "~~") else { return nil }
        let content = after[after.startIndex..<endRange.lowerBound]
        guard !content.isEmpty else { return nil }
        var attr = AttributedString(String(content))
        attr.strikethroughStyle = .single
        attr.foregroundColor = .white.opacity(0.6)
        let consumed = endRange.upperBound
        return (attr, consumed)
    }

    // MARK: - Italic (*text*) — single asterisk, not double

    private static func parseItalic(from input: Substring) -> (AttributedString, String.Index)? {
        guard input.hasPrefix("*") else { return nil }
        // Make sure it's not bold (**)
        if input.count >= 2 {
            let secondIdx = input.index(input.startIndex, offsetBy: 1)
            if input[secondIdx] == "*" { return nil }
        }
        let after = input[input.index(after: input.startIndex)...]
        // Find closing * that is NOT followed by another *
        var searchFrom = after.startIndex
        while searchFrom < after.endIndex {
            guard let starIdx = after[searchFrom...].firstIndex(of: "*") else { return nil }
            // Check it's not part of **
            let nextAfterStar = after.index(after: starIdx)
            if nextAfterStar < after.endIndex && after[nextAfterStar] == "*" {
                // Skip past **
                searchFrom = after.index(after: nextAfterStar)
                continue
            }
            let content = after[after.startIndex..<starIdx]
            guard !content.isEmpty else { return nil }
            var attr = AttributedString(String(content))
            attr.font = .italicSystemFont(ofSize: 14)
            attr.foregroundColor = .white.opacity(0.9)
            let consumed = after.index(after: starIdx)
            return (attr, consumed)
        }
        return nil
    }
}
