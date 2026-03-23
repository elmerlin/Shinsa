import SwiftUI

struct ScoreSnapshotSheet: View {
    let songTitle: String
    let mode: String
    let level: Int
    let score: Int
    let grade: String
    var plate: String? = nil
    var backgroundUrl: String? = nil
    var perfect: Int? = nil
    var great: Int? = nil
    var good: Int? = nil
    var bad: Int? = nil
    var miss: Int? = nil
    var datePlayed: String? = nil
    var replayEmbedUrl: String? = nil
    var username: String? = nil

    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        // Jacket with overlay
                        jacketSection

                        // Grade + Score
                        gradeScoreSection

                        // Judgments
                        if hasJudgments {
                            judgmentsSection
                        }

                        // Replay button
                        if let replayUrl = replayEmbedUrl, !replayUrl.isEmpty,
                           let url = URL(string: replayUrl) {
                            Link(destination: url) {
                                HStack(spacing: 8) {
                                    Image(systemName: "play.circle.fill")
                                        .font(.system(size: 16))
                                        .foregroundColor(.red)
                                    Text("Watch Replay")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.white)
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(Color.red.opacity(0.15))
                                .cornerRadius(8)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.red.opacity(0.3), lineWidth: 1))
                            }
                        }

                        // Meta info
                        if let date = datePlayed, !date.isEmpty {
                            Text(date)
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Score Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
    }

    // jacket with mode badge
    private var jacketSection: some View {
        let jacketURL = JacketService.shared.resolveJacketURL(title: songTitle, mode: mode, level: level, backgroundUrl: backgroundUrl)
        let isDouble = mode.lowercased().hasPrefix("d") || mode.lowercased() == "double"

        return ZStack(alignment: .bottom) {
            if let url = jacketURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFill()
                    default:
                        Rectangle().fill(isDouble ? Color.green.opacity(0.15) : Color.red.opacity(0.15))
                    }
                }
            } else {
                Rectangle().fill(isDouble ? Color.green.opacity(0.15) : Color.red.opacity(0.15))
            }

            // Gradient
            LinearGradient(colors: [.clear, DojoTheme.piuBg], startPoint: .center, endPoint: .bottom)

            // Song title + mode
            VStack(spacing: 4) {
                Text(songTitle)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)

                // Mode badge
                let prefix = mode.lowercased().hasPrefix("c") ? "C" : (isDouble ? "D" : "S")
                let colors: [Color] = isDouble
                    ? [Color(hex: "#4cf4aa"), Color(hex: "#0b5d48")]
                    : [Color(hex: "#ff7a7a"), Color(hex: "#7a1730")]
                Text("\(prefix)\(level)")
                    .font(.system(size: 11, weight: .black))
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing))
                    .cornerRadius(6)
            }
            .padding(.bottom, 16)
        }
        .frame(height: 180)
        .cornerRadius(12)
        .clipped()
    }

    private var gradeScoreSection: some View {
        VStack(spacing: 8) {
            Text(DojoTheme.gradeLabel(for: score))
                .font(.system(size: 36, weight: .black))
                .foregroundColor(DojoTheme.gradeColor(for: score))

            Text(formatScore(score))
                .font(.system(size: 20, weight: .bold, design: .monospaced))
                .foregroundColor(.white)

            if let plate = plate, !plate.isEmpty {
                Text(plate)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.piuGold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(DojoTheme.piuGold.opacity(0.1))
                    .cornerRadius(4)
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(DojoTheme.piuGold.opacity(0.3), lineWidth: 1))
            }
        }
    }

    private var hasJudgments: Bool {
        [perfect, great, good, bad, miss].contains(where: { ($0 ?? 0) > 0 })
    }

    private var judgmentsSection: some View {
        let items: [(String, Int, Color)] = [
            ("PERFECT", perfect ?? 0, Color(hex: "#7dd3fc")),
            ("GREAT", great ?? 0, Color(hex: "#6ee7b7")),
            ("GOOD", good ?? 0, Color(hex: "#fde68a")),
            ("BAD", bad ?? 0, Color(hex: "#f0abfc")),
            ("MISS", miss ?? 0, Color(hex: "#fca5a5")),
        ]
        let total = items.reduce(0) { $0 + $1.1 }

        return VStack(spacing: 6) {
            ForEach(items, id: \.0) { label, count, color in
                HStack(spacing: 8) {
                    Text(label)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(color)
                        .frame(width: 55, alignment: .leading)

                    GeometryReader { geo in
                        let fraction = total > 0 ? CGFloat(count) / CGFloat(total) : 0
                        RoundedRectangle(cornerRadius: 3)
                            .fill(color.opacity(0.7))
                            .frame(width: max(geo.size.width * fraction, 2), height: 14)
                    }
                    .frame(height: 14)

                    Text("\(count)")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                        .frame(width: 40, alignment: .trailing)
                }
            }
        }
        .padding(12)
        .background(DojoTheme.piuCard)
        .cornerRadius(8)
    }

    private func formatScore(_ score: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: score)) ?? "\(score)"
    }
}
