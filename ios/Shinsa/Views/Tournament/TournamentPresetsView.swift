import SwiftUI

struct TournamentPresetsView: View {
    var onSelect: (TournamentPreset) -> Void

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("PRESETS")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)
                .tracking(1)

            Text("Quick-start with a proven tournament format")
                .font(.system(size: 11))
                .foregroundColor(DojoTheme.textMuted)

            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(Array(TournamentPreset.presets.enumerated()), id: \.offset) { index, preset in
                    PresetCard(preset: preset, index: index) {
                        onSelect(preset)
                    }
                }
            }
        }
    }
}

// MARK: - Preset Card

struct PresetCard: View {
    let preset: TournamentPreset
    let index: Int
    var onTap: () -> Void

    private var accentColor: Color {
        let colors: [Color] = [
            DojoTheme.piuAccent,
            DojoTheme.piuBlue,
            DojoTheme.piuGold,
            DojoTheme.piuGreen,
            Color(hex: "#ff8844"),
            Color(hex: "#aa44ff"),
        ]
        return colors[index % colors.count]
    }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                // Icon
                Image(systemName: preset.icon)
                    .font(.system(size: 20))
                    .foregroundColor(accentColor)
                    .frame(width: 36, height: 36)
                    .background(accentColor.opacity(0.15))
                    .cornerRadius(8)

                // Name
                Text(preset.name)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                // Description
                Text(preset.description)
                    .font(.system(size: 10))
                    .foregroundColor(DojoTheme.textMuted)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                // Phase count
                HStack(spacing: 4) {
                    Image(systemName: "square.stack.3d.up")
                        .font(.system(size: 9))
                    Text("\(preset.phases.count) phase\(preset.phases.count == 1 ? "" : "s")")
                        .font(.system(size: 9, weight: .medium))
                }
                .foregroundColor(accentColor.opacity(0.8))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(DojoTheme.piuCard)
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(accentColor.opacity(0.2), lineWidth: 1)
            )
        }
    }
}
