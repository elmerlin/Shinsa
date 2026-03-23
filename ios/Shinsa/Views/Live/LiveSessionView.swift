import SwiftUI

struct LiveSessionView: View {
    let sessionId: String
    @StateObject private var vm = LiveViewModel()
    @EnvironmentObject var auth: AuthManager

    @State private var showEndConfirm = false
    @State private var showAddCohost = false
    @State private var cohostQuery = ""

    private var isHost: Bool {
        vm.session?.hostId == auth.currentUser?.id
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if vm.isLoading && vm.session == nil {
                ProgressView()
                    .tint(DojoTheme.piuAccent)
            } else if let session = vm.session {
                VStack(spacing: 0) {
                    // Session header
                    sessionHeader(session)

                    // Chat messages
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 6) {
                                ForEach(vm.messages) { msg in
                                    messageRow(msg)
                                        .id(msg.id)
                                }
                            }
                            .padding(.horizontal)
                            .padding(.vertical, 8)
                        }
                        .onChange(of: vm.messages.count) { _ in
                            if let last = vm.messages.last {
                                withAnimation {
                                    proxy.scrollTo(last.id, anchor: .bottom)
                                }
                            }
                        }
                    }

                    // Emote row
                    emoteRow

                    // Message input
                    if session.isActive {
                        messageInput
                    }

                    // Host controls
                    if isHost && session.isActive {
                        hostControls
                    }
                }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 32))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("Session not found")
                        .foregroundColor(DojoTheme.textMuted)
                }
            }
        }
        .navigationTitle(vm.session?.title ?? "Live Session")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await vm.loadSession(sessionId)
            vm.startPolling(sessionId)
        }
        .onDisappear {
            vm.stopPolling()
        }
        .alert("End Session", isPresented: $showEndConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("End Session", role: .destructive) {
                Task { await vm.endSession(sessionId) }
            }
        } message: {
            Text("Are you sure you want to end this live session?")
        }
    }

    // MARK: - Session Header

    private func sessionHeader(_ session: LiveSession) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                AvatarView(session.hostAvatar, name: session.hostUsername ?? "Host", size: 36)

                VStack(alignment: .leading, spacing: 2) {
                    Text(session.title ?? "Live Session")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)
                    Text("Hosted by \(session.hostUsername ?? "Unknown")")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textSecondary)
                }

                Spacer()

                HStack(spacing: 4) {
                    Image(systemName: "eye.fill")
                        .font(.system(size: 11))
                    Text("\(session.viewerCount ?? 0)")
                        .font(.system(size: 12, weight: .bold))
                }
                .foregroundColor(DojoTheme.textMuted)

                if session.isActive {
                    Text("LIVE")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.red)
                        .cornerRadius(4)
                }
            }

            // Cohosts
            if let cohosts = session.cohosts, !cohosts.isEmpty {
                HStack(spacing: 4) {
                    Text("Co-hosts:")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)

                    ForEach(cohosts) { cohost in
                        HStack(spacing: 4) {
                            AvatarView(cohost.avatar, name: cohost.username ?? "?", size: 18)
                            Text(cohost.username ?? "?")
                                .font(.system(size: 10))
                                .foregroundColor(DojoTheme.textSecondary)

                            if isHost {
                                Button {
                                    Task { await vm.removeCohost(sessionId, userId: cohost.userId ?? "") }
                                } label: {
                                    Image(systemName: "xmark")
                                        .font(.system(size: 8))
                                        .foregroundColor(DojoTheme.textMuted)
                                }
                            }
                        }
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(DojoTheme.piuDark)
                        .cornerRadius(4)
                    }
                }
            }
        }
        .padding(12)
        .background(DojoTheme.piuCard)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(DojoTheme.piuBorder),
            alignment: .bottom
        )
    }

    // MARK: - Message Row

    private func messageRow(_ msg: LiveMessage) -> some View {
        HStack(alignment: .top, spacing: 8) {
            if msg.type == "system" {
                Text(msg.content ?? "")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(DojoTheme.piuGold)
                    .italic()
                    .frame(maxWidth: .infinity, alignment: .center)
            } else if msg.type == "emote" {
                HStack(spacing: 4) {
                    Text(msg.username ?? "")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(DojoTheme.piuAccent)
                    Text(msg.content ?? "")
                        .font(.system(size: 16))
                }
            } else {
                AvatarView(msg.avatar, name: msg.username ?? "?", size: 24)

                VStack(alignment: .leading, spacing: 2) {
                    Text(msg.username ?? "Unknown")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(DojoTheme.piuAccent)
                    Text(msg.content ?? "")
                        .font(.system(size: 13))
                        .foregroundColor(.white)
                }
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: - Emote Row

    private var emoteRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(["fire", "heart.fill", "hand.thumbsup.fill", "star.fill", "bolt.fill"], id: \.self) { icon in
                    Button {
                        Task {
                            let content = icon == "fire" ? "!fire" : icon == "heart.fill" ? "!heart" : icon == "hand.thumbsup.fill" ? "!thumbsup" : icon == "star.fill" ? "!star" : "!bolt"
                            vm.messageText = content
                            await vm.sendMessage(sessionId)
                        }
                    } label: {
                        Image(systemName: icon)
                            .font(.system(size: 18))
                            .foregroundColor(DojoTheme.piuGold)
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .background(DojoTheme.piuCard.opacity(0.5))
    }

    // MARK: - Message Input

    private var messageInput: some View {
        HStack(spacing: 8) {
            TextField("Send a message...", text: $vm.messageText)
                .font(.system(size: 14))
                .foregroundColor(.white)
                .padding(10)
                .background(DojoTheme.piuCard)
                .cornerRadius(8)

            Button {
                Task { await vm.sendMessage(sessionId) }
            } label: {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 16))
                    .foregroundColor(.white)
                    .frame(width: 40, height: 40)
                    .background(DojoTheme.piuAccent)
                    .cornerRadius(8)
            }
            .disabled(vm.messageText.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(DojoTheme.piuDark)
    }

    // MARK: - Host Controls

    private var hostControls: some View {
        HStack(spacing: 10) {
            Button {
                showAddCohost = true
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "person.badge.plus")
                    Text("Co-host")
                }
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(DojoTheme.piuBlue)
                .cornerRadius(8)
            }

            Spacer()

            Button {
                showEndConfirm = true
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "stop.fill")
                    Text("End Session")
                }
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.red.opacity(0.8))
                .cornerRadius(8)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(DojoTheme.piuDark)
    }
}
