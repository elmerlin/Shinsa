import SwiftUI

/// Feed card for session plan posts (/plan command)
struct SessionPlanCardView: View {
    let plan: SessionPlanMarker

    @State private var showScoring = false
    @State private var showPassing = false

    private var feelingEmoji: String {
        switch plan.feeling?.lowercased() {
        case "ambitious": return "🔥"
        case "lethargic": return "😴"
        default: return "👍"
        }
    }

    private var feelingLabel: String {
        switch plan.feeling?.lowercased() {
        case "ambitious": return "Ambitious"
        case "lethargic": return "Lethargic"
        default: return "Normal"
        }
    }

    private var modeLabel: String {
        switch plan.chartMode?.lowercased() {
        case "single": return "Singles"
        case "double": return "Doubles"
        default: return "Both"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack(spacing: 8) {
                Image(systemName: "list.bullet.clipboard.fill")
                    .font(.system(size: 14))
                    .foregroundColor(Color(hex: "#aa88ff"))

                Text("Session Plan")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)

                Spacer()

                // Feeling badge
                Text("\(feelingEmoji) \(feelingLabel)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white.opacity(0.8))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color(hex: "#aa88ff").opacity(0.2))
                    .cornerRadius(6)
            }

            // Mode + stats row
            HStack(spacing: 0) {
                statCell(value: modeLabel, label: "Mode")
                if let p = plan.pumbility, p > 0 {
                    statCell(value: "\(p)", label: "Pumbility")
                }
                if let sl = plan.adjustedScoringLevel, sl > 0 {
                    statCell(value: "Lv.\(sl)", label: "Scoring")
                }
                if let pl = plan.adjustedPassingLevel, pl > 0 {
                    statCell(value: "Lv.\(pl)", label: "Passing")
                }
            }

            // Skills to train
            if let skills = plan.skillsTrain, !skills.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Skills to Train")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(DojoTheme.textMuted)

                    FlowLayout(spacing: 4) {
                        ForEach(skills, id: \.self) { skill in
                            Text(skill.replacingOccurrences(of: "_", with: " ").capitalized)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(Color(hex: "#aa88ff"))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Color(hex: "#aa88ff").opacity(0.1))
                                .cornerRadius(4)
                        }
                    }
                }
            }

            // Activation section (always visible)
            if let activation = plan.activation, !activation.isEmpty {
                songSection(title: "Activation", icon: "flame", color: Color(hex: "#ff8844"), songs: activation, expanded: .constant(true), alwaysOpen: true)
            }

            // Scoring section (collapsible)
            if let scoring = plan.scoring, !scoring.isEmpty {
                songSection(title: "Scoring", icon: "target", color: Color(hex: "#44ccff"), songs: scoring, expanded: $showScoring, alwaysOpen: false)
            }

            // Passing section (collapsible)
            if let passing = plan.passing, !passing.isEmpty {
                songSection(title: "Passing", icon: "bolt.fill", color: Color(hex: "#44ff88"), songs: passing, expanded: $showPassing, alwaysOpen: false)
            }
        }
        .padding(14)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(hex: "#aa88ff").opacity(0.3), lineWidth: 1)
        )
    }

    // MARK: - Song Section

    private func songSection(title: String, icon: String, color: Color, songs: [SessionPlanSong], expanded: Binding<Bool>, alwaysOpen: Bool) -> some View {
        VStack(spacing: 0) {
            Button {
                if !alwaysOpen {
                    withAnimation { expanded.wrappedValue.toggle() }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: icon)
                        .font(.system(size: 10))
                        .foregroundColor(color)
                    Text("\(title) (\(songs.count))")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                    Spacer()
                    if !alwaysOpen {
                        Image(systemName: expanded.wrappedValue ? "chevron.up" : "chevron.down")
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
                .padding(.vertical, 4)
            }
            .disabled(alwaysOpen)

            if expanded.wrappedValue || alwaysOpen {
                ForEach(songs) { song in
                    planSongRow(song)
                }
            }
        }
    }

    private func planSongRow(_ song: SessionPlanSong) -> some View {
        HStack(spacing: 8) {
            // Jacket
            if let urlStr = song.jacketUrl, !urlStr.isEmpty,
               let url = URL(string: urlStr.hasPrefix("http") ? urlStr : "\(APIService.shared.baseURL)\(urlStr)") {
                AsyncImage(url: url) { phase in
                    if case .success(let img) = phase {
                        img.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        Color(hex: "#2a2a4a")
                    }
                }
                .frame(width: 28, height: 28)
                .cornerRadius(4)
                .clipped()
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(song.title ?? "Unknown")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    let letter = song.mode == "Single" ? "S" : song.mode == "Double" ? "D" : "C"
                    let color = song.mode == "Single" ? Color(hex: "#ff6688") : Color(hex: "#44cc88")
                    Text("\(letter)\(song.level ?? 0)")
                        .font(.system(size: 8, weight: .black))
                        .foregroundColor(.white)
                        .padding(.horizontal, 3)
                        .padding(.vertical, 1)
                        .background(color.opacity(0.8))
                        .cornerRadius(2)
                }
            }

            Spacer()

            if let score = song.bestScore, score > 0 {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(formatScore(score))
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(DojoTheme.gradeColor(for: score))
                    if let grade = song.bestGrade, !grade.isEmpty {
                        Text(grade)
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(DojoTheme.gradeColor(for: score))
                    }
                }
            } else {
                Text("New!")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(Color(hex: "#aa88ff"))
            }
        }
        .padding(.vertical, 3)
    }

    // MARK: - Helpers

    private func statCell(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
            Text(label)
                .font(.system(size: 9))
                .foregroundColor(DojoTheme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(DojoTheme.piuDark.opacity(0.5))
        .cornerRadius(6)
    }

    private func formatScore(_ score: Int) -> String {
        let s = String(score)
        if s.count > 3 {
            let idx = s.index(s.endIndex, offsetBy: -3)
            return s[s.startIndex..<idx] + "," + s[idx...]
        }
        return s
    }
}

