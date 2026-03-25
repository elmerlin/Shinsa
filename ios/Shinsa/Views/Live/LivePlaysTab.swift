import SwiftUI

struct LivePlaysTab: View {
    @ObservedObject var vm: LiveViewModel
    @State private var modeFilter = "All"

    private var filteredPlays: [LivePlay] {
        vm.plays.filter { play in
            guard modeFilter != "All" else { return true }
            let mode = (play.mode ?? "").lowercased()
            if modeFilter == "Singles" { return mode.hasPrefix("s") || mode == "single" }
            if modeFilter == "Doubles" { return mode.hasPrefix("d") || mode == "double" }
            return true
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Mode filter
            HStack(spacing: 8) {
                ForEach(["All", "Singles", "Doubles"], id: \.self) { mode in
                    Button {
                        modeFilter = mode
                    } label: {
                        Text(mode)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(modeFilter == mode ? .white : DojoTheme.textMuted)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(modeFilter == mode ? DojoTheme.piuAccent.opacity(0.3) : DojoTheme.piuCard)
                            .cornerRadius(6)
                            .overlay(
                                RoundedRectangle(cornerRadius: 6)
                                    .stroke(modeFilter == mode ? DojoTheme.piuAccent.opacity(0.5) : Color.clear, lineWidth: 1)
                            )
                    }
                }
                Spacer()
                Text("\(filteredPlays.count) plays")
                    .font(.system(size: 11))
                    .foregroundColor(DojoTheme.textMuted)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)

            if filteredPlays.isEmpty {
                Spacer()
                VStack(spacing: 8) {
                    Image(systemName: "music.note")
                        .font(.system(size: 28))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.4))
                    Text("No plays yet")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)
                }
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 6) {
                        ForEach(filteredPlays) { play in
                            playCard(play)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 8)
                }
            }
        }
    }

    private func playCard(_ play: LivePlay) -> some View {
        let score = play.score ?? 0
        let gradeLabel = play.grade ?? DojoTheme.gradeLabel(for: score)
        let gradeColor = DojoTheme.gradeColor(for: score)
        let isDouble = (play.mode ?? "").lowercased().hasPrefix("d")
        let jacketURL = JacketService.shared.resolveJacketURL(
            title: play.songTitle, mode: play.mode, level: play.level,
            backgroundUrl: play.backgroundUrl ?? play.jacketUrl
        )

        return HStack(spacing: 10) {
            // Jacket
            ZStack(alignment: .bottomLeading) {
                if let url = jacketURL {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase {
                            img.resizable().scaledToFill()
                        } else {
                            RoundedRectangle(cornerRadius: 6).fill(DojoTheme.piuCard)
                        }
                    }
                    .frame(width: 52, height: 32)
                    .cornerRadius(6)
                    .clipped()
                } else {
                    RoundedRectangle(cornerRadius: 6).fill(DojoTheme.piuCard)
                        .frame(width: 52, height: 32)
                }

                if let level = play.level {
                    Text("\(isDouble ? "D" : "S")\(level)")
                        .font(.system(size: 7, weight: .black))
                        .foregroundColor(.white)
                        .padding(.horizontal, 3)
                        .padding(.vertical, 1)
                        .background(isDouble ? Color(hex: "#0b5d48") : Color(hex: "#7a1730"))
                        .cornerRadius(2)
                        .offset(x: 2, y: -2)
                }
            }

            // Song info
            VStack(alignment: .leading, spacing: 2) {
                Text(play.songTitle ?? "Unknown")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                if let user = play.username {
                    Text(user)
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            Spacer()

            // Score + Grade
            VStack(alignment: .trailing, spacing: 2) {
                Text(gradeLabel)
                    .font(.system(size: 14, weight: .black))
                    .foregroundColor(gradeColor)

                if score > 0 {
                    Text(score.formattedScore)
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundColor(.cyan)
                }
            }

            // Pass/fail indicator
            if play.isPass == true {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "#34d399"))
            } else if play.isPass == false {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "#f87171"))
            }
        }
        .padding(10)
        .background(DojoTheme.piuCard)
        .cornerRadius(8)
    }
}
