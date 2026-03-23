import SwiftUI

struct PhaseCardView: View {
    let phase: Phase
    let isSelected: Bool
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Phase order badge
                ZStack {
                    Circle()
                        .fill(statusColor.opacity(0.2))
                        .frame(width: 32, height: 32)
                    Text("\(phase.phaseOrder)")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(statusColor)
                }

                // Format icon and label
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Image(systemName: phase.formatIcon)
                            .font(.system(size: 11))
                            .foregroundColor(statusColor)
                        Text(phase.name ?? phase.formatLabel)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                            .lineLimit(1)
                    }

                    // Config summary
                    if let summary = configSummary {
                        Text(summary)
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                            .lineLimit(1)
                    }
                }

                Spacer()

                // Status badge
                statusBadge
            }
            .padding(12)
            .background(isSelected ? statusColor.opacity(0.1) : DojoTheme.piuCard)
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isSelected ? statusColor.opacity(0.5) : DojoTheme.piuBorder.opacity(0.3), lineWidth: 1)
            )
        }
    }

    private var statusColor: Color {
        switch phase.status {
        case "ACTIVE": return DojoTheme.piuAccent
        case "COMPLETED": return DojoTheme.piuGreen
        default: return DojoTheme.textMuted
        }
    }

    private var statusBadge: some View {
        Text(phase.status)
            .font(.system(size: 9, weight: .bold))
            .foregroundColor(statusColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(statusColor.opacity(0.15))
            .clipShape(Capsule())
    }

    private var configSummary: String? {
        guard let cfg = phase.config else { return nil }
        var parts: [String] = []

        if let rounds = cfg.rounds {
            parts.append("\(rounds) rounds")
        }
        if let poolCount = cfg.poolCount {
            parts.append("\(poolCount) pools")
        }
        if let dMin = cfg.difficultyMin, let dMax = cfg.difficultyMax {
            parts.append("Lv\(dMin)-\(dMax)")
        }
        if let dur = cfg.durationMinutes {
            parts.append("\(dur) min")
        }
        if let startLvl = cfg.startSingleLevel, let endLvl = cfg.finalSingleLevel {
            parts.append("Lv\(startLvl)-\(endLvl)")
        }
        if let bestOf = cfg.bestOf {
            parts.append("Bo\(bestOf)")
        }

        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }
}

// MARK: - Phase Action Buttons

struct PhaseActionButtons: View {
    let phase: Phase
    let playerCount: Int
    var onActivate: () async -> Void
    var onComplete: () async -> Void
    var onGenerate: () async -> Void

    var body: some View {
        HStack(spacing: 10) {
            if phase.isPending && playerCount >= 2 {
                asyncButton("Activate Phase", color: DojoTheme.piuBlue) {
                    await onActivate()
                }
            }

            if phase.isActive {
                asyncButton("Generate Matches", color: DojoTheme.piuAccent) {
                    await onGenerate()
                }

                asyncButton("Complete Phase", color: DojoTheme.piuGreen) {
                    await onComplete()
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private func asyncButton(_ text: String, color: Color, action: @escaping () async -> Void) -> some View {
        Button {
            Task { await action() }
        } label: {
            Text(text)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(color)
                .cornerRadius(8)
        }
    }
}
