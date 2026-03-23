import SwiftUI

struct MarkdownContentView: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(parseLines().enumerated()), id: \.offset) { _, line in
                renderLine(line)
            }
        }
    }

    private func parseLines() -> [MarkdownLine] {
        text.components(separatedBy: "\n").map { raw in
            let trimmed = raw.trimmingCharacters(in: .whitespaces)

            if trimmed.hasPrefix("### ") {
                return MarkdownLine(type: .h3, content: String(trimmed.dropFirst(4)))
            } else if trimmed.hasPrefix("## ") {
                return MarkdownLine(type: .h2, content: String(trimmed.dropFirst(3)))
            } else if trimmed.hasPrefix("# ") {
                return MarkdownLine(type: .h1, content: String(trimmed.dropFirst(2)))
            } else if trimmed.hasPrefix("```") {
                return MarkdownLine(type: .codeBlock, content: String(trimmed.dropFirst(3)))
            } else if trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") {
                return MarkdownLine(type: .bullet, content: String(trimmed.dropFirst(2)))
            } else if trimmed.isEmpty {
                return MarkdownLine(type: .empty, content: "")
            } else {
                return MarkdownLine(type: .paragraph, content: trimmed)
            }
        }
    }

    @ViewBuilder
    private func renderLine(_ line: MarkdownLine) -> some View {
        switch line.type {
        case .h1:
            Text(renderInlineFormatting(line.content))
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.white)
                .padding(.top, 4)
        case .h2:
            Text(renderInlineFormatting(line.content))
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(.white)
                .padding(.top, 2)
        case .h3:
            Text(renderInlineFormatting(line.content))
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.white)
        case .bullet:
            HStack(alignment: .top, spacing: 6) {
                Text("\u{2022}")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.piuAccent)
                Text(renderInlineFormatting(line.content))
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.85))
            }
        case .codeBlock:
            Text(line.content)
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(DojoTheme.piuGreen)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.black.opacity(0.3))
                .cornerRadius(6)
        case .paragraph:
            Text(renderInlineFormatting(line.content))
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.85))
                .lineSpacing(4)
        case .empty:
            Spacer().frame(height: 4)
        }
    }

    private func renderInlineFormatting(_ text: String) -> AttributedString {
        // AttributedString(markdown:) handles bold, italic, inline code, and links
        if let parsed = try? AttributedString(markdown: text) {
            return parsed
        }
        return AttributedString(text)
    }
}

private struct MarkdownLine {
    enum LineType {
        case h1, h2, h3, bullet, codeBlock, paragraph, empty
    }

    let type: LineType
    let content: String
}
