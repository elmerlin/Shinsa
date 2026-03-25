import SwiftUI
import Combine

struct LiveVotePanel: View {
    let vote: LiveVote
    let sessionId: String
    @ObservedObject var vm: LiveViewModel
    let isHost: Bool

    @State private var remainingSeconds: Int = 0
    @State private var isCollapsed = false

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var modeLabel: String {
        let mode = vote.modeFilter ?? "All"
        let min = vote.minLevel ?? 1
        let max = vote.maxLevel ?? 28
        return "\(mode) Lv.\(min)-\(max)"
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header (always visible, tap to collapse)
            Button { withAnimation { isCollapsed.toggle() } } label: {
                HStack {
                    HStack(spacing: 6) {
                        Image(systemName: "chart.bar.fill")
                            .font(.system(size: 12))
                            .foregroundColor(Color(hex: "#d946ef"))
                        Text("LIVE VOTE")
                            .font(.system(size: 10, weight: .black))
                            .foregroundColor(Color(hex: "#d946ef"))
                            .tracking(1)
                        Text(modeLabel)
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                    }

                    Spacer()

                    // Status + countdown
                    if vote.isActive {
                        HStack(spacing: 4) {
                            Circle().fill(Color.green).frame(width: 6, height: 6)
                            Text("\(remainingSeconds)s")
                                .font(.system(size: 11, weight: .bold, design: .monospaced))
                                .foregroundColor(.green)
                        }
                    } else {
                        Text("CLOSED")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.orange)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.1))
                            .cornerRadius(3)
                    }

                    Image(systemName: isCollapsed ? "chevron.down" : "chevron.up")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }

            if !isCollapsed {
                // Options
                VStack(spacing: 6) {
                    ForEach(vote.options ?? []) { option in
                        voteOptionCard(option)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 10)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(hex: "#0e1421").opacity(0.98))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(hex: "#d946ef").opacity(0.2), lineWidth: 1)
                )
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
        .onReceive(timer) { _ in
            updateCountdown()
        }
        .onAppear {
            updateCountdown()
        }
    }

    private func voteOptionCard(_ option: LiveVoteOption) -> some View {
        let isWinner = option.isWinner == true
        let userVoted = option.userVoted == true
        let isDouble = (option.mode ?? "").lowercased().hasPrefix("d")
        let jacketURL = JacketService.shared.resolveJacketURL(
            title: option.songTitle, mode: option.mode, level: option.level,
            backgroundUrl: option.backgroundUrl ?? option.jacketUrl
        )

        return HStack(spacing: 10) {
            // Jacket
            if let url = jacketURL {
                AsyncImage(url: url) { phase in
                    if case .success(let img) = phase {
                        img.resizable().scaledToFill()
                    } else {
                        RoundedRectangle(cornerRadius: 4).fill(DojoTheme.piuCard)
                    }
                }
                .frame(width: 40, height: 24)
                .cornerRadius(4)
                .clipped()
            }

            // Song info
            VStack(alignment: .leading, spacing: 1) {
                Text(option.songTitle ?? "")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                if let level = option.level {
                    Text("\(isDouble ? "D" : "S")\(level)")
                        .font(.system(size: 8, weight: .black))
                        .foregroundColor(.white)
                        .padding(.horizontal, 3)
                        .padding(.vertical, 1)
                        .background(isDouble ? Color(hex: "#0b5d48") : Color(hex: "#7a1730"))
                        .cornerRadius(2)
                }
            }

            Spacer()

            // Vote count
            Text("\(option.voteCount ?? 0)")
                .font(.system(size: 14, weight: .black))
                .foregroundColor(.cyan)

            // Vote button
            if vote.isActive && !userVoted {
                Button {
                    Task { await vm.castVote(vote.id, optionId: option.id) }
                    HapticService.pump()
                } label: {
                    Text("Vote")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color(hex: "#d946ef"))
                        .cornerRadius(4)
                }
            } else if userVoted {
                Text("Your vote")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(Color(hex: "#d946ef"))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(Color(hex: "#d946ef").opacity(0.15))
                    .cornerRadius(3)
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(isWinner ? Color(hex: "#059669").opacity(0.1) : Color.white.opacity(0.04))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(isWinner ? Color(hex: "#34d399").opacity(0.4) : Color.white.opacity(0.06), lineWidth: 1)
                )
        )
    }

    private func updateCountdown() {
        guard vote.isActive, let endsAt = vote.endsAt else {
            remainingSeconds = 0
            return
        }
        // Parse ISO date
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let endDate = formatter.date(from: endsAt) ?? formatter.date(from: endsAt + "Z") ?? Date()
        remainingSeconds = max(0, Int(endDate.timeIntervalSinceNow))
    }
}

// MARK: - Create Vote Sheet (Host only)

struct CreateVoteSheet: View {
    let sessionId: String
    @ObservedObject var vm: LiveViewModel
    let onDismiss: () -> Void

    @State private var modeFilter = "All"
    @State private var minLevel = 16
    @State private var maxLevel = 22

    var body: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                VStack(spacing: 20) {
                    Text("Create a 30-second chart vote")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)

                    // Mode filter
                    HStack {
                        Text("Mode")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)
                        Spacer()
                        Picker("Mode", selection: $modeFilter) {
                            Text("All").tag("All")
                            Text("Singles").tag("Single")
                            Text("Doubles").tag("Double")
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 200)
                    }

                    // Level range
                    HStack {
                        Text("Level Range")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)
                        Spacer()
                        Stepper("\(minLevel)", value: $minLevel, in: 1...28)
                            .frame(width: 120)
                        Text("to")
                            .foregroundColor(DojoTheme.textMuted)
                        Stepper("\(maxLevel)", value: $maxLevel, in: 1...28)
                            .frame(width: 120)
                    }

                    Button {
                        Task {
                            await vm.createVote(sessionId, modeFilter: modeFilter, minLevel: minLevel, maxLevel: maxLevel)
                            onDismiss()
                        }
                    } label: {
                        Text("Open 30 second vote")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color(hex: "#d946ef"))
                            .cornerRadius(10)
                    }

                    Spacer()
                }
                .padding(20)
            }
            .navigationTitle("Chart Vote")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") { onDismiss() }
                        .foregroundColor(.gray)
                }
            }
        }
    }
}
