import SwiftUI

struct LiveDirectoryView: View {
    @StateObject private var vm = LiveViewModel()
    @State private var showCreate = false

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            VStack(spacing: 0) {
                if vm.isLoading {
                    Spacer()
                    ProgressView()
                        .tint(DojoTheme.piuAccent)
                    Spacer()
                } else if vm.sessions.isEmpty {
                    Spacer()
                    VStack(spacing: 12) {
                        Image(systemName: "antenna.radiowaves.left.and.right")
                            .font(.system(size: 40))
                            .foregroundColor(DojoTheme.textMuted.opacity(0.5))
                        Text("No active sessions")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(DojoTheme.textMuted)
                        Text("Start a live session to share your gameplay")
                            .font(.system(size: 13))
                            .foregroundColor(DojoTheme.textMuted.opacity(0.6))
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(vm.sessions) { session in
                                NavigationLink(value: "live-session/\(session.id)") {
                                    sessionCard(session)
                                }
                            }
                        }
                        .padding()
                    }
                    .refreshable { await vm.loadSessions() }
                }

                // Create session button
                Button {
                    showCreate = true
                } label: {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                        Text("Start Live Session")
                            .font(.system(size: 14, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(DojoTheme.piuAccent)
                    .cornerRadius(12)
                }
                .padding()
            }
        }
        .navigationTitle("Live Sessions")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.loadSessions() }
        .sheet(isPresented: $showCreate) {
            CreateLiveSessionSheet { await vm.loadSessions() }
        }
    }

    // MARK: - Session Card

    private func sessionCard(_ session: LiveSession) -> some View {
        HStack(spacing: 12) {
            AvatarView(session.hostAvatar, name: session.hostUsername ?? "Host", size: 48)

            VStack(alignment: .leading, spacing: 4) {
                Text(session.title ?? "Live Session")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text(session.hostUsername ?? "Unknown")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textSecondary)

                    if let mode = session.gameMode {
                        Text(mode)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(DojoTheme.piuAccent)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(DojoTheme.piuAccent.opacity(0.15))
                            .cornerRadius(4)
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                // Status badge
                Text(session.isActive ? "LIVE" : (session.status ?? "ended").uppercased())
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(session.isActive ? Color.red : DojoTheme.textMuted)
                    .cornerRadius(4)

                // Viewer count
                HStack(spacing: 3) {
                    Image(systemName: "eye.fill")
                        .font(.system(size: 10))
                    Text("\(session.viewerCount ?? 0)")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(DojoTheme.textMuted)
            }
        }
        .padding(14)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(session.isActive ? Color.red.opacity(0.3) : DojoTheme.piuBorder, lineWidth: 1)
        )
    }
}

// MARK: - Create Sheet

struct CreateLiveSessionSheet: View {
    @Environment(\.dismiss) var dismiss
    @State private var title = ""
    @State private var description = ""
    @State private var gameMode = "Singles"
    @State private var isCreating = false

    var onCreated: () async -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        formField("Title", text: $title, placeholder: "Session title")
                        formField("Description", text: $description, placeholder: "Optional description")

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Game Mode")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(DojoTheme.textMuted)

                            HStack(spacing: 8) {
                                ForEach(["Singles", "Doubles", "Both"], id: \.self) { mode in
                                    Button {
                                        gameMode = mode
                                    } label: {
                                        Text(mode)
                                            .font(.system(size: 12, weight: .bold))
                                            .foregroundColor(gameMode == mode ? .white : DojoTheme.textMuted)
                                            .padding(.horizontal, 14)
                                            .padding(.vertical, 8)
                                            .background(gameMode == mode ? DojoTheme.piuAccent : DojoTheme.piuCard)
                                            .cornerRadius(8)
                                    }
                                }
                            }
                        }

                        Button {
                            Task { await createSession() }
                        } label: {
                            Text(isCreating ? "Creating..." : "Go Live")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(title.isEmpty ? DojoTheme.textMuted : DojoTheme.piuAccent)
                                .cornerRadius(12)
                        }
                        .disabled(title.isEmpty || isCreating)
                    }
                    .padding()
                }
            }
            .navigationTitle("Start Live Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
    }

    private func formField(_ label: String, text: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)

            TextField(placeholder, text: text)
                .font(.system(size: 14))
                .foregroundColor(.white)
                .padding(10)
                .background(DojoTheme.piuCard)
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(DojoTheme.piuBorder, lineWidth: 1)
                )
        }
    }

    private func createSession() async {
        isCreating = true
        let data: [String: AnyCodable] = [
            "title": AnyCodable(title),
            "description": AnyCodable(description),
            "game_mode": AnyCodable(gameMode)
        ]
        _ = try? await APIService.shared.createLiveSession(data)
        await onCreated()
        isCreating = false
        dismiss()
    }
}
