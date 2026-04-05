import SwiftUI

struct WCPodiumStripView: View {
    let categories: [(key: String, label: String, awards: [WCAward])]
    var compact: Bool = false

    var body: some View {
        if compact {
            compactPodium
        } else {
            fullPodiumStrip
        }
    }

    // MARK: - Full Podium Strip (horizontal scroll with all categories)

    private var fullPodiumStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(categories, id: \.key) { category in
                    podiumCategory(category)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func podiumCategory(_ category: (key: String, label: String, awards: [WCAward])) -> some View {
        VStack(spacing: 8) {
            // Category header
            HStack(spacing: 4) {
                categoryIcon(category.key)
                Text(category.label)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(DojoTheme.textSecondary)
            }

            // Podium entries
            VStack(spacing: 4) {
                ForEach(category.awards) { award in
                    podiumEntry(award)
                }
            }
        }
        .padding(10)
        .frame(width: 160)
        .background(DojoTheme.piuCard)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Compact Podium (top 3 overall only, vertical)

    private var compactPodium: some View {
        let overall = categories.first { $0.key == "overall" }?.awards ?? []
        return VStack(spacing: 6) {
            Text("TOP 3")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)
                .tracking(1)

            ForEach(overall.prefix(3)) { award in
                podiumEntry(award)
            }
        }
        .padding(10)
        .background(DojoTheme.piuCard)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Single Podium Entry

    private func podiumEntry(_ award: WCAward) -> some View {
        HStack(spacing: 8) {
            // Medal
            Text(DojoTheme.medalEmoji(for: award.rank))
                .font(.system(size: 14))

            // Avatar
            AvatarView(award.avatarSnapshot, name: award.usernameSnapshot, size: 24)

            // Name & Points
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 3) {
                    if let nat = award.nationalitySnapshot, !nat.isEmpty {
                        Text(flagEmoji(for: nat))
                            .font(.system(size: 10))
                    }
                    Text(award.usernameSnapshot)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                }

                if let pts = award.points {
                    Text(String(format: "%.1f pts", pts))
                        .font(.system(size: 9))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            Spacer()
        }
        .padding(.vertical, 2)
    }

    // MARK: - Category Icon

    @ViewBuilder
    private func categoryIcon(_ key: String) -> some View {
        switch key {
        case "overall":
            Image(systemName: "trophy.fill")
                .font(.system(size: 10))
                .foregroundColor(DojoTheme.piuGold)
        case "singles":
            Text("S")
                .font(.system(size: 10, weight: .black))
                .foregroundColor(Color(hex: "#ff6688"))
        case "doubles":
            Text("D")
                .font(.system(size: 10, weight: .black))
                .foregroundColor(Color(hex: "#44cc88"))
        case "advanced":
            Image(systemName: "star.fill")
                .font(.system(size: 10))
                .foregroundColor(DojoTheme.piuSilver)
        case "intermediate":
            Image(systemName: "star.fill")
                .font(.system(size: 10))
                .foregroundColor(DojoTheme.piuBronze)
        default:
            EmptyView()
        }
    }

    // MARK: - Flag Emoji Helper

    private func flagEmoji(for code: String) -> String {
        let base: UInt32 = 127397
        let upper = code.uppercased()
        var result = ""
        for scalar in upper.unicodeScalars {
            if let flag = Unicode.Scalar(base + scalar.value) {
                result.append(String(flag))
            }
        }
        return result.isEmpty ? "" : result
    }
}
