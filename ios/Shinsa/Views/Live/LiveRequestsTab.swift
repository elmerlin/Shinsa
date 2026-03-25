import SwiftUI

struct LiveRequestsTab: View {
    let sessionId: String
    @ObservedObject var vm: LiveViewModel
    let isHost: Bool

    @State private var showSubmitSheet = false

    private var sortedRequests: [LiveRequest] {
        vm.requests.sorted { a, b in
            let order = ["queued": 0, "open": 1, "played": 2, "skipped": 3]
            return (order[a.effectiveStatus] ?? 4) < (order[b.effectiveStatus] ?? 4)
        }
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            if vm.requests.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "music.note.list")
                        .font(.system(size: 32))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.4))
                    Text("No requests yet")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("Be the first to request a song!")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.6))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(sortedRequests) { req in
                            requestCard(req)
                        }
                    }
                    .padding()
                }
            }

            // Submit request FAB
            if vm.session?.isActive == true && vm.session?.requestsEnabled != false {
                Button { showSubmitSheet = true } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 50, height: 50)
                        .background(Circle().fill(DojoTheme.piuAccent))
                        .shadow(color: DojoTheme.piuAccent.opacity(0.4), radius: 8)
                }
                .padding(20)
            }
        }
        .sheet(isPresented: $showSubmitSheet) {
            LiveRequestSubmitSheet(sessionId: sessionId, vm: vm, onDismiss: { showSubmitSheet = false })
        }
    }

    // MARK: - Request Card

    private func requestCard(_ req: LiveRequest) -> some View {
        let status = req.effectiveStatus
        let (statusColor, statusBg) = statusStyle(status)
        let isDouble = (req.songMode ?? "").lowercased().hasPrefix("d") || (req.songMode ?? "").lowercased() == "double"
        let jacketURL = JacketService.shared.resolveJacketURL(
            title: req.songTitle, mode: req.songMode, level: req.songLevel,
            backgroundUrl: req.backgroundUrl ?? req.jacketUrl
        )

        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                // Jacket
                if let url = jacketURL {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase {
                            img.resizable().scaledToFill()
                        } else {
                            RoundedRectangle(cornerRadius: 6).fill(DojoTheme.piuCard)
                        }
                    }
                    .frame(width: 44, height: 28)
                    .cornerRadius(6)
                    .clipped()
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(req.songTitle ?? "Unknown")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)

                    HStack(spacing: 6) {
                        if let level = req.songLevel {
                            Text("\(isDouble ? "D" : "S")\(level)")
                                .font(.system(size: 9, weight: .black))
                                .foregroundColor(.white)
                                .padding(.horizontal, 4)
                                .padding(.vertical, 1)
                                .background(isDouble ? Color(hex: "#0b5d48") : Color(hex: "#7a1730"))
                                .cornerRadius(3)
                        }

                        if let user = req.username {
                            HStack(spacing: 3) {
                                AvatarView(req.avatar, name: user, size: 14)
                                    .clipShape(Circle())
                                Text(user)
                                    .font(.system(size: 10))
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                        }
                    }
                }

                Spacer()

                // Status pill
                Text(status.uppercased())
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(statusColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(statusBg)
                    .cornerRadius(4)
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(statusColor.opacity(0.3), lineWidth: 1))
            }

            // Actions row
            HStack(spacing: 12) {
                // Vote button
                if status == "open" || status == "queued" {
                    Button {
                        Task { await vm.voteOnRequest(sessionId, requestId: req.id) }
                        HapticService.pump()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 10, weight: .bold))
                            Text("\(req.votes ?? 0)")
                                .font(.system(size: 11, weight: .bold))
                        }
                        .foregroundColor(.cyan)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color.cyan.opacity(0.1))
                        .cornerRadius(6)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.cyan.opacity(0.2), lineWidth: 1))
                    }
                }

                Spacer()

                // Host controls
                if isHost && vm.session?.isActive == true {
                    hostRequestControls(req, status: status)
                }
            }
        }
        .padding(10)
        .background(DojoTheme.piuCard)
        .cornerRadius(10)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(statusColor.opacity(0.15), lineWidth: 1))
    }

    @ViewBuilder
    private func hostRequestControls(_ req: LiveRequest, status: String) -> some View {
        HStack(spacing: 6) {
            if status == "open" {
                hostButton("Queue", color: Color(hex: "#d946ef")) {
                    Task { await vm.updateRequestStatus(sessionId, requestId: req.id, status: "queued") }
                }
            }
            if status == "open" || status == "queued" {
                hostButton("Played", color: Color(hex: "#10b981")) {
                    Task { await vm.updateRequestStatus(sessionId, requestId: req.id, status: "played") }
                }
                hostButton("Skip", color: Color(hex: "#f59e0b")) {
                    Task { await vm.updateRequestStatus(sessionId, requestId: req.id, status: "skipped") }
                }
            }
            if status == "played" || status == "skipped" {
                hostButton("Reopen", color: .cyan) {
                    Task { await vm.updateRequestStatus(sessionId, requestId: req.id, status: "open") }
                }
            }
        }
    }

    private func hostButton(_ label: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(color)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(color.opacity(0.1))
                .cornerRadius(4)
        }
    }

    private func statusStyle(_ status: String) -> (Color, Color) {
        switch status {
        case "queued": return (Color(hex: "#d946ef"), Color(hex: "#d946ef").opacity(0.1))
        case "open": return (Color(hex: "#38bdf8"), Color(hex: "#38bdf8").opacity(0.1))
        case "played": return (Color(hex: "#34d399"), Color(hex: "#34d399").opacity(0.1))
        case "skipped": return (Color(hex: "#fbbf24"), Color(hex: "#fbbf24").opacity(0.1))
        default: return (DojoTheme.textMuted, DojoTheme.piuCard)
        }
    }
}
