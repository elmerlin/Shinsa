import SwiftUI
import UIKit

/// Renders a beautiful 1080×1920 score card image for sharing to social media
@MainActor
enum ScoreCardImageRenderer {

    // MARK: - Public

    struct ScoreData {
        var songTitle: String = ""
        var mode: String = ""
        var level: Int = 0
        var score: Int = 0
        var grade: String = ""
        var plate: String? = nil
        var oldScore: Int? = nil
        var oldGrade: String? = nil
        var perfect: Int? = nil
        var great: Int? = nil
        var good: Int? = nil
        var bad: Int? = nil
        var miss: Int? = nil
        var datePlayed: String? = nil
        var machineName: String? = nil
        var playerName: String? = nil
        var playerAvatar: String? = nil
        var jacketUrl: String? = nil
        var overTop100Rank: Int? = nil
        var isStageBreak: Bool = false
    }

    static func render(_ data: ScoreData) async -> UIImage? {
        let width: CGFloat = 1080
        let height: CGFloat = 1920

        // Load images concurrently
        async let jacketImage = loadImage(data.jacketUrl)
        async let avatarImage = loadImage(data.playerAvatar)

        let jacket = await jacketImage
        let avatar = await avatarImage

        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height))
        let image = renderer.image { ctx in
            let c = ctx.cgContext

            // Background
            drawBackground(c, width: width, height: height, jacket: jacket, data: data)

            // Card
            let cardX: CGFloat = 62
            let cardY: CGFloat = 72
            let cardW = width - 124
            let cardH = height - 144
            drawCard(c, x: cardX, y: cardY, w: cardW, h: cardH, jacket: jacket)

            // Content within card
            let pad: CGFloat = 38
            let heroX = cardX + pad
            let heroW = cardW - pad * 2
            var contentY = cardY + pad + 8

            // Song title
            contentY = drawSongTitle(c, data.songTitle, x: heroX, y: contentY, maxWidth: heroW - 170)

            // Mode + level subtitle
            let chartLine = "\(data.songTitle) • \(data.mode) \(data.level)"
            drawText(c, chartLine, x: heroX, y: contentY + 18, font: .systemFont(ofSize: 28, weight: .semibold), color: UIColor.white.withAlphaComponent(0.88))
            contentY += 44

            // Level badge (top right of card)
            drawLevelBadge(c, level: data.level, mode: data.mode, x: heroX + heroW - 132, y: cardY + pad + 6, size: 132)

            // Top rank badge
            if let rank = data.overTop100Rank, rank > 0 {
                drawPill(c, text: "TOP #\(rank)", x: heroX, y: contentY + 12, fontSize: 22,
                         fill: UIColor(hex: "#ffd75a")!.withAlphaComponent(0.15),
                         stroke: UIColor(hex: "#ffe286")!.withAlphaComponent(0.48),
                         textColor: UIColor(hex: "#fde68a")!)
                contentY += 60
            }

            // Player info
            contentY = drawPlayerInfo(c, data: data, avatar: avatar, x: heroX, y: contentY + 70, maxWidth: heroW)

            // Jacket artwork
            let jacketY = contentY + 26
            let jacketH: CGFloat = 572
            drawJacketArt(c, jacket: jacket, x: heroX, y: jacketY, w: heroW, h: jacketH)

            // Score box
            let scoreBoxY = jacketY + jacketH + 34
            let scoreBoxH: CGFloat = 248
            drawScoreBox(c, data: data, x: heroX, y: scoreBoxY, w: heroW, h: scoreBoxH)

            // Judgments
            let judgmentY = scoreBoxY + scoreBoxH + 30
            drawJudgments(c, data: data, x: heroX, y: judgmentY, w: heroW)

            // Footer
            drawText(c, "Shared from Shinsa", x: heroX, y: cardY + cardH - 92, font: .systemFont(ofSize: 26, weight: .semibold), color: UIColor.white.withAlphaComponent(0.78))
        }

        return image
    }

    // MARK: - Drawing Helpers

    private static func drawBackground(_ c: CGContext, width: CGFloat, height: CGFloat, jacket: UIImage?, data: ScoreData) {
        // Base
        UIColor(hex: "#07111f")!.setFill()
        c.fill(CGRect(x: 0, y: 0, width: width, height: height))

        // Jacket as background blur
        if let jacket = jacket {
            c.saveGState()
            c.setAlpha(0.2)
            drawCover(c, image: jacket, rect: CGRect(x: 0, y: 0, width: width, height: height))
            c.restoreGState()
        }

        // Gradient overlay
        let colors: [CGColor] = [
            UIColor(white: 0.02, alpha: 0.18).cgColor,
            UIColor(white: 0.02, alpha: 0.56).cgColor,
            UIColor(white: 0.015, alpha: 0.98).cgColor,
        ]
        let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors as CFArray, locations: [0, 0.45, 1])!
        c.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: height), options: [])

        // Glow
        let glowColors: [CGColor] = [
            UIColor(red: 56/255, green: 189/255, blue: 248/255, alpha: 0.24).cgColor,
            UIColor(red: 56/255, green: 189/255, blue: 248/255, alpha: 0).cgColor,
        ]
        let glowGradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: glowColors as CFArray, locations: [0, 1])!
        c.drawRadialGradient(glowGradient, startCenter: CGPoint(x: width * 0.18, y: height * 0.16), startRadius: 0, endCenter: CGPoint(x: width * 0.18, y: height * 0.16), endRadius: width * 0.58, options: [])
    }

    private static func drawCard(_ c: CGContext, x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, jacket: UIImage?) {
        let path = UIBezierPath(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: 56)

        // Card fill
        c.saveGState()
        UIColor(red: 8/255, green: 14/255, blue: 24/255, alpha: 0.82).setFill()
        path.fill()
        c.restoreGState()

        // Card jacket overlay
        if let jacket = jacket {
            c.saveGState()
            path.addClip()
            c.setAlpha(0.18)
            drawCover(c, image: jacket, rect: CGRect(x: x, y: y, width: w, height: h))

            // Inner gradient
            let colors: [CGColor] = [
                UIColor(white: 0.03, alpha: 0.16).cgColor,
                UIColor(white: 0.03, alpha: 0.36).cgColor,
                UIColor(white: 0.03, alpha: 0.74).cgColor,
            ]
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors as CFArray, locations: [0, 0.38, 1])!
            c.setAlpha(1)
            c.drawLinearGradient(gradient, start: CGPoint(x: x, y: y), end: CGPoint(x: x, y: y + h), options: [])
            c.restoreGState()
        }

        // Card border
        UIColor.white.withAlphaComponent(0.16).setStroke()
        path.lineWidth = 2
        path.stroke()
    }

    private static func drawSongTitle(_ c: CGContext, _ title: String, x: CGFloat, y: CGFloat, maxWidth: CGFloat) -> CGFloat {
        let font = UIFont.systemFont(ofSize: 66, weight: .black)
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
        let text = title.isEmpty ? "Score details" : title

        // Word wrap
        let words = text.split(separator: " ").map(String.init)
        var lines: [String] = []
        var current = ""

        for word in words {
            let candidate = current.isEmpty ? word : "\(current) \(word)"
            let size = (candidate as NSString).size(withAttributes: attrs)
            if size.width > maxWidth && !current.isEmpty {
                lines.append(current)
                current = word
            } else {
                current = candidate
            }
        }
        if !current.isEmpty { lines.append(current) }
        lines = Array(lines.prefix(3))

        var curY = y
        for line in lines {
            (line as NSString).draw(at: CGPoint(x: x, y: curY), withAttributes: attrs)
            curY += 70
        }

        return y + 58 + CGFloat(max(lines.count - 1, 0)) * 70 + 26
    }

    private static func drawLevelBadge(_ c: CGContext, level: Int, mode: String, x: CGFloat, y: CGFloat, size: CGFloat) {
        guard level > 0 else { return }

        let cx = x + size / 2
        let cy = y + size / 2
        let modeColors = getModeColors(mode)

        // Outer circle
        c.saveGState()
        let outerColors = [modeColors.from.cgColor, modeColors.to.cgColor] as CFArray
        let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: outerColors, locations: [0, 1])!
        c.addEllipse(in: CGRect(x: x, y: y, width: size, height: size))
        c.clip()
        c.drawLinearGradient(gradient, start: CGPoint(x: x, y: y), end: CGPoint(x: x + size, y: y + size), options: [])
        c.restoreGState()

        // White ring
        c.saveGState()
        UIColor.white.withAlphaComponent(0.42).setStroke()
        c.setLineWidth(4)
        c.addEllipse(in: CGRect(x: x, y: y, width: size, height: size))
        c.strokePath()
        c.restoreGState()

        // Inner circle
        let innerR = size / 2 - 12
        UIColor(white: 0.03, alpha: 0.34).setFill()
        c.fillEllipse(in: CGRect(x: cx - innerR, y: cy - innerR, width: innerR * 2, height: innerR * 2))

        // "LEVEL" label
        let levelLabelFont = UIFont.systemFont(ofSize: 20, weight: .bold)
        let levelLabelAttrs: [NSAttributedString.Key: Any] = [.font: levelLabelFont, .foregroundColor: UIColor.white.withAlphaComponent(0.88)]
        let levelLabel = "LEVEL" as NSString
        let labelSize = levelLabel.size(withAttributes: levelLabelAttrs)
        levelLabel.draw(at: CGPoint(x: cx - labelSize.width / 2, y: y + 24), withAttributes: levelLabelAttrs)

        // Level number
        let numFont = UIFont.systemFont(ofSize: size >= 120 ? 54 : 44, weight: .black)
        let numAttrs: [NSAttributedString.Key: Any] = [.font: numFont, .foregroundColor: UIColor.white]
        let numStr = "\(level)" as NSString
        let numSize = numStr.size(withAttributes: numAttrs)
        numStr.draw(at: CGPoint(x: cx - numSize.width / 2, y: cy - numSize.height / 2 + 12), withAttributes: numAttrs)
    }

    private static func drawPlayerInfo(_ c: CGContext, data: ScoreData, avatar: UIImage?, x: CGFloat, y: CGFloat, maxWidth: CGFloat) -> CGFloat {
        guard avatar != nil || (data.playerName != nil && !data.playerName!.isEmpty) || data.datePlayed != nil || data.machineName != nil else {
            return y
        }

        // Avatar
        if let avatar = avatar {
            c.saveGState()
            let avatarRect = CGRect(x: x, y: y, width: 70, height: 70)
            let avatarPath = UIBezierPath(roundedRect: avatarRect, cornerRadius: 35)
            avatarPath.addClip()
            drawCover(c, image: avatar, rect: avatarRect)
            c.restoreGState()

            UIColor.white.withAlphaComponent(0.18).setStroke()
            UIBezierPath(roundedRect: CGRect(x: x, y: y, width: 70, height: 70), cornerRadius: 35).lineWidth = 2
            UIBezierPath(roundedRect: CGRect(x: x, y: y, width: 70, height: 70), cornerRadius: 35).stroke()
        }

        let textX = x + (avatar != nil ? 92 : 0)

        // Player name
        let nameFont = UIFont.systemFont(ofSize: 36, weight: .heavy)
        let nameAttrs: [NSAttributedString.Key: Any] = [.font: nameFont, .foregroundColor: UIColor.white]
        let name = (data.playerName ?? "Player") as NSString
        name.draw(at: CGPoint(x: textX, y: y + 4), withAttributes: nameAttrs)

        // Meta line
        let metaParts = [data.datePlayed, data.machineName].compactMap { $0?.isEmpty == false ? $0 : nil }
        if !metaParts.isEmpty {
            let metaFont = UIFont.systemFont(ofSize: 24, weight: .medium)
            let metaAttrs: [NSAttributedString.Key: Any] = [.font: metaFont, .foregroundColor: UIColor.white.withAlphaComponent(0.82)]
            let metaStr = metaParts.joined(separator: " • ") as NSString
            metaStr.draw(at: CGPoint(x: textX, y: y + 44), withAttributes: metaAttrs)
        }

        return y + 94
    }

    private static func drawJacketArt(_ c: CGContext, jacket: UIImage?, x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat) {
        let path = UIBezierPath(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: 40)

        c.saveGState()
        path.addClip()

        if let jacket = jacket {
            // Dark backdrop
            UIColor(red: 15/255, green: 26/255, blue: 44/255, alpha: 0.96).setFill()
            c.fill(CGRect(x: x, y: y, width: w, height: h))

            // Contain image with padding
            drawContain(c, image: jacket, rect: CGRect(x: x + 24, y: y + 24, width: w - 48, height: h - 48), alpha: 0.98)
        } else {
            // Gradient placeholder
            let colors = [UIColor(hex: "#13253f")!.cgColor, UIColor(hex: "#0a1222")!.cgColor] as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
            c.drawLinearGradient(gradient, start: CGPoint(x: x, y: y), end: CGPoint(x: x + w, y: y + h), options: [])
        }

        // Subtle overlay
        let overlayColors = [
            UIColor(white: 0.02, alpha: 0.02).cgColor,
            UIColor(white: 0.03, alpha: 0.14).cgColor,
            UIColor(white: 0.02, alpha: 0.28).cgColor,
        ] as CFArray
        let overlayGradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: overlayColors, locations: [0, 0.7, 1])!
        c.drawLinearGradient(overlayGradient, start: CGPoint(x: 0, y: y), end: CGPoint(x: 0, y: y + h), options: [])

        c.restoreGState()
    }

    private static func drawScoreBox(_ c: CGContext, data: ScoreData, x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat) {
        let path = UIBezierPath(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: 34)

        // Fill
        UIColor.white.withAlphaComponent(0.04).setFill()
        path.fill()
        UIColor.white.withAlphaComponent(0.08).setStroke()
        path.lineWidth = 2
        path.stroke()

        // "Score" label
        drawText(c, "Score", x: x + 30, y: y + 16, font: .systemFont(ofSize: 24, weight: .bold), color: UIColor.white.withAlphaComponent(0.74))

        // Score number
        let scoreStr = data.isStageBreak ? "STAGE BREAK" : formatNumber(data.score)
        let scoreFont = UIFont.systemFont(ofSize: data.isStageBreak ? 72 : 94, weight: .black)
        let scoreColor = data.isStageBreak ? UIColor(hex: "#fda4af")! : UIColor.white
        drawText(c, scoreStr, x: x + 30, y: y + 55, font: scoreFont, color: scoreColor)

        // Plate
        if let plate = data.plate, !plate.isEmpty {
            drawText(c, plate, x: x + 30, y: y + 155, font: .systemFont(ofSize: 28, weight: .bold), color: UIColor(hex: "#fde68a")!)
        }

        // Grade (right-aligned)
        let gradeLabel = data.grade.isEmpty ? DojoTheme.gradeLabel(for: data.score) : data.grade
        let gradeColor = UIColor(DojoTheme.gradeColor(for: data.score))
        let gradeFont = UIFont.systemFont(ofSize: 92, weight: .black)
        let gradeAttrs: [NSAttributedString.Key: Any] = [.font: gradeFont, .foregroundColor: gradeColor]
        let gradeStr = gradeLabel as NSString
        let gradeSize = gradeStr.size(withAttributes: gradeAttrs)
        gradeStr.draw(at: CGPoint(x: x + w - 28 - gradeSize.width, y: y + 32), withAttributes: gradeAttrs)

        // Previous score + delta
        if let oldScore = data.oldScore, oldScore > 0 {
            let prevLabel = "Prev \(formatNumber(oldScore))"
            drawText(c, prevLabel, x: x + w - 274, y: y + 133, font: .systemFont(ofSize: 24, weight: .medium), color: UIColor.white.withAlphaComponent(0.78))

            let delta = data.score - oldScore
            if delta != 0 {
                let deltaStr = delta > 0 ? "+\(formatNumber(delta))" : formatNumber(delta)
                let deltaColor = delta > 0 ? UIColor(hex: "#86efac")! : UIColor(hex: "#fca5a5")!
                drawText(c, deltaStr, x: x + w - 274, y: y + 167, font: .systemFont(ofSize: 42, weight: .heavy), color: deltaColor)
            }
        }
    }

    private static func drawJudgments(_ c: CGContext, data: ScoreData, x: CGFloat, y: CGFloat, w: CGFloat) {
        let judgments: [(String, Int, UIColor)] = [
            ("PERFECT", data.perfect ?? 0, UIColor(hex: "#7dd3fc")!),
            ("GREAT", data.great ?? 0, UIColor(hex: "#86efac")!),
            ("GOOD", data.good ?? 0, UIColor(hex: "#fde047")!),
            ("BAD", data.bad ?? 0, UIColor(hex: "#f5a5ff")!),
            ("MISS", data.miss ?? 0, UIColor(hex: "#fda4af")!),
        ]

        let hasAny = judgments.contains { $0.1 > 0 }

        if hasAny {
            let boxH: CGFloat = 214
            let path = UIBezierPath(roundedRect: CGRect(x: x, y: y, width: w, height: boxH), cornerRadius: 32)
            UIColor.black.withAlphaComponent(0.3).setFill()
            path.fill()

            let itemW = w / CGFloat(judgments.count)
            for (i, item) in judgments.enumerated() {
                let itemX = x + CGFloat(i) * itemW
                let centerX = itemX + itemW / 2

                // Label
                let labelFont = UIFont.systemFont(ofSize: 22, weight: .bold)
                let labelAttrs: [NSAttributedString.Key: Any] = [.font: labelFont, .foregroundColor: item.2]
                let labelStr = item.0 as NSString
                let labelSize = labelStr.size(withAttributes: labelAttrs)
                labelStr.draw(at: CGPoint(x: centerX - labelSize.width / 2, y: y + 36), withAttributes: labelAttrs)

                // Value
                let valFont = UIFont.systemFont(ofSize: 42, weight: .heavy)
                let valAttrs: [NSAttributedString.Key: Any] = [.font: valFont, .foregroundColor: UIColor.white]
                let valStr = formatNumber(item.1) as NSString
                let valSize = valStr.size(withAttributes: valAttrs)
                valStr.draw(at: CGPoint(x: centerX - valSize.width / 2, y: y + 82), withAttributes: valAttrs)
            }
        } else {
            let boxH: CGFloat = 120
            let path = UIBezierPath(roundedRect: CGRect(x: x, y: y, width: w, height: boxH), cornerRadius: 32)
            UIColor(hex: "#f59e0b")!.withAlphaComponent(0.08).setFill()
            path.fill()
            UIColor(hex: "#f59e0b")!.withAlphaComponent(0.18).setStroke()
            path.lineWidth = 2
            path.stroke()

            drawText(c, "Judgment breakdown unavailable for this score.", x: x + 28, y: y + 42, font: .systemFont(ofSize: 24, weight: .bold), color: UIColor(hex: "#fcd34d")!)
        }
    }

    // MARK: - Low-level drawing

    private static func drawText(_ c: CGContext, _ text: String, x: CGFloat, y: CGFloat, font: UIFont, color: UIColor) {
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        (text as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: attrs)
    }

    private static func drawPill(_ c: CGContext, text: String, x: CGFloat, y: CGFloat, fontSize: CGFloat, fill: UIColor, stroke: UIColor, textColor: UIColor) {
        let font = UIFont.systemFont(ofSize: fontSize, weight: .bold)
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: textColor]
        let textSize = (text as NSString).size(withAttributes: attrs)
        let padX: CGFloat = 18
        let padY: CGFloat = 9
        let pillW = textSize.width + padX * 2
        let pillH = textSize.height + padY * 2

        let path = UIBezierPath(roundedRect: CGRect(x: x, y: y, width: pillW, height: pillH), cornerRadius: 999)
        fill.setFill()
        path.fill()
        stroke.setStroke()
        path.lineWidth = 2
        path.stroke()

        (text as NSString).draw(at: CGPoint(x: x + padX, y: y + padY), withAttributes: attrs)
    }

    private static func drawCover(_ c: CGContext, image: UIImage, rect: CGRect) {
        let imageAspect = image.size.width / image.size.height
        let targetAspect = rect.width / rect.height

        var drawRect = rect
        if imageAspect > targetAspect {
            let scaledW = rect.height * imageAspect
            drawRect = CGRect(x: rect.minX - (scaledW - rect.width) / 2, y: rect.minY, width: scaledW, height: rect.height)
        } else {
            let scaledH = rect.width / imageAspect
            drawRect = CGRect(x: rect.minX, y: rect.minY - (scaledH - rect.height) / 2, width: rect.width, height: scaledH)
        }
        image.draw(in: drawRect)
    }

    private static func drawContain(_ c: CGContext, image: UIImage, rect: CGRect, alpha: CGFloat = 1) {
        let imageAspect = image.size.width / image.size.height
        let targetAspect = rect.width / rect.height

        var drawRect = rect
        if imageAspect > targetAspect {
            let h = rect.width / imageAspect
            drawRect = CGRect(x: rect.minX, y: rect.minY + (rect.height - h) / 2, width: rect.width, height: h)
        } else {
            let w = rect.height * imageAspect
            drawRect = CGRect(x: rect.minX + (rect.width - w) / 2, y: rect.minY, width: w, height: rect.height)
        }

        c.saveGState()
        c.setAlpha(alpha)
        image.draw(in: drawRect)
        c.restoreGState()
    }

    // MARK: - Data Helpers

    private static func getModeColors(_ mode: String) -> (from: UIColor, to: UIColor) {
        let m = mode.lowercased()
        if m == "single" || m.hasPrefix("s") {
            return (UIColor(hex: "#f97316")!, UIColor(hex: "#b91c1c")!)
        }
        if m == "double" || m.hasPrefix("d") {
            return (UIColor(hex: "#34d399")!, UIColor(hex: "#166534")!)
        }
        return (UIColor(hex: "#38bdf8")!, UIColor(hex: "#1d4ed8")!)
    }

    private static func formatNumber(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    private static func loadImage(_ urlString: String?) async -> UIImage? {
        guard let urlString = urlString, !urlString.isEmpty else { return nil }

        let resolved: String
        if urlString.hasPrefix("http") {
            resolved = urlString
        } else {
            resolved = "\(APIService.shared.baseURL)\(urlString)"
        }

        guard let url = URL(string: resolved) else { return nil }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            return UIImage(data: data)
        } catch {
            return nil
        }
    }
}

// MARK: - UIColor hex extension

extension UIColor {
    convenience init?(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            return nil
        }
        self.init(red: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: CGFloat(a) / 255)
    }
}
