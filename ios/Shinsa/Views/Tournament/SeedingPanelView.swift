import SwiftUI

struct SeedingPanelView: View {
    @Binding var phasePlayers: [PhasePlayer]
    var onAutoSeed: () async -> Void
    var onSave: () async -> Void

    @State private var isSaving = false

    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                Text("SEEDING")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
                    .tracking(1)
                Spacer()
                Text("\(phasePlayers.count) players")
                    .font(.system(size: 11))
                    .foregroundColor(DojoTheme.textMuted)
            }

            // Auto-seed button
            Button {
                Task { await onAutoSeed() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "wand.and.stars")
                        .font(.system(size: 13))
                    Text("Auto-Seed by Pumbility")
                        .font(.system(size: 13, weight: .bold))
                }
                .foregroundColor(DojoTheme.piuBlue)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(DojoTheme.piuBlue.opacity(0.12))
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(DojoTheme.piuBlue.opacity(0.3), lineWidth: 1)
                )
            }

            // Player list with drag to reorder
            List {
                ForEach(Array(phasePlayers.enumerated()), id: \.element.id) { index, pp in
                    HStack(spacing: 12) {
                        // Seed number
                        ZStack {
                            Circle()
                                .fill(seedColor(index + 1).opacity(0.2))
                                .frame(width: 28, height: 28)
                            Text("\(index + 1)")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(seedColor(index + 1))
                        }

                        // Player info
                        VStack(alignment: .leading, spacing: 2) {
                            Text(pp.name ?? "Player")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.white)

                            if let pumb = pp.pumbility {
                                Text("Pumbility: \(pumb)")
                                    .font(.system(size: 10))
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                        }

                        Spacer()

                        Image(systemName: "line.3.horizontal")
                            .font(.system(size: 14))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                    .padding(.vertical, 4)
                    .listRowBackground(DojoTheme.piuCard)
                    .listRowSeparatorTint(DojoTheme.piuBorder)
                }
                .onMove { source, destination in
                    phasePlayers.move(fromOffsets: source, toOffset: destination)
                    // Update seed numbers
                    for i in phasePlayers.indices {
                        phasePlayers[i].seed = i + 1
                    }
                }
            }
            .listStyle(.plain)
            .environment(\.editMode, .constant(.active))
            .frame(maxHeight: .infinity)

            // Save button
            Button {
                isSaving = true
                Task {
                    await onSave()
                    isSaving = false
                }
            } label: {
                HStack {
                    if isSaving {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.8)
                    }
                    Text("Save Seeding")
                        .font(.system(size: 14, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(DojoTheme.piuAccent)
                .cornerRadius(10)
            }
            .disabled(isSaving)
        }
        .padding()
    }

    private func seedColor(_ seed: Int) -> Color {
        switch seed {
        case 1: return DojoTheme.piuGold
        case 2: return DojoTheme.piuSilver
        case 3: return DojoTheme.piuBronze
        default: return DojoTheme.textMuted
        }
    }
}
