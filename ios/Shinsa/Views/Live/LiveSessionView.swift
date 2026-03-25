import SwiftUI

struct LiveSessionView: View {
    let sessionId: String
    @StateObject private var vm = LiveViewModel()
    @EnvironmentObject var auth: AuthManager

    @State private var showEndConfirm = false
    @State private var showAddCohost = false
    @State private var showParticipants = false
    @State private var showCreateVote = false
    @State private var showYouTube = true

    private var isHost: Bool {
        vm.session?.isHost == true || vm.session?.hostId == auth.currentUser?.id
    }

    private var youtubeVideoId: String? {
        if let vid = vm.session?.youtubeVideoId, !vid.isEmpty { return vid }
        guard let url = vm.session?.streamUrl, !url.isEmpty else { return nil }
        return extractYouTubeVideoId(url)
    }

    private var availableTabs: [LiveTab] {
        var tabs: [LiveTab] = [.chat, .requests, .plays]
        if vm.session?.isActive == false && vm.summary != nil {
            tabs.append(.recap)
        }
        return tabs
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if vm.isLoading && vm.session == nil {
                ProgressView().tint(DojoTheme.piuAccent)
            } else if let session = vm.session {
                VStack(spacing: 0) {
                    // Session header
                    sessionHeader(session)

                    // YouTube embed (collapsible)
                    if let videoId = youtubeVideoId, showYouTube {
                        YouTubeEmbedView(videoId: videoId)
                            .frame(height: 200)
                            .transition(.opacity)
                    }

                    // Vote panel (pinned above tabs when active)
                    if let vote = vm.activeVote {
                        LiveVotePanel(vote: vote, sessionId: sessionId, vm: vm, isHost: isHost)
                    }

                    // Tab bar
                    tabBar

                    // Tab content
                    switch vm.selectedTab {
                    case .chat:
                        LiveChatTab(sessionId: sessionId, vm: vm, isHost: isHost)
                    case .requests:
                        LiveRequestsTab(sessionId: sessionId, vm: vm, isHost: isHost)
                    case .plays:
                        LivePlaysTab(vm: vm)
                    case .recap:
                        if let summary = vm.summary {
                            LiveRecapTab(summary: summary, session: vm.session)
                        } else {
                            Text("No recap available")
                                .foregroundColor(DojoTheme.textMuted)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
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
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if youtubeVideoId != nil {
                    Button {
                        withAnimation { showYouTube.toggle() }
                    } label: {
                        Image(systemName: showYouTube ? "rectangle.slash" : "play.rectangle")
                            .font(.system(size: 14))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
            }
        }
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
        .sheet(isPresented: $showParticipants) {
            if let session = vm.session {
                LiveParticipantsSheet(session: session, onDismiss: { showParticipants = false })
            }
        }
        .sheet(isPresented: $showCreateVote) {
            CreateVoteSheet(sessionId: sessionId, vm: vm, onDismiss: { showCreateVote = false })
        }
    }

    // MARK: - Session Header

    private func sessionHeader(_ session: LiveSession) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 12) {
                AvatarView(session.hostAvatar, name: session.hostUsername ?? "Host", size: 36)
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 2) {
                    Text(session.title ?? "Live Session")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Text("Hosted by \(session.hostUsername ?? "Unknown")")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textSecondary)
                }

                Spacer()

                // Viewer count (tappable for participant list)
                Button { showParticipants = true } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "eye.fill")
                            .font(.system(size: 11))
                        Text("\(session.viewerCount ?? 0)")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .foregroundColor(DojoTheme.textMuted)
                }

                if session.isActive {
                    Text("LIVE")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.red)
                        .cornerRadius(4)
                } else {
                    Text("ENDED")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white.opacity(0.6))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(DojoTheme.piuCard)
                        .cornerRadius(4)
                }
            }

            // Co-hosts
            if let cohosts = session.cohosts, !cohosts.isEmpty {
                HStack(spacing: 4) {
                    Text("Co-hosts:")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)

                    ForEach(cohosts) { cohost in
                        HStack(spacing: 3) {
                            AvatarView(cohost.avatar, name: cohost.username ?? "?", size: 16)
                                .clipShape(Circle())
                            Text(cohost.username ?? "?")
                                .font(.system(size: 10))
                                .foregroundColor(DojoTheme.textSecondary)
                        }
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(DojoTheme.piuDark)
                        .cornerRadius(4)
                    }
                }
            }

            // Last play ticker
            if let lastPlay = vm.lastPlay, session.isActive {
                HStack(spacing: 6) {
                    Image(systemName: "music.note")
                        .font(.system(size: 10))
                        .foregroundColor(Color(hex: "#6ee7b7"))
                    Text("Now playing: \(lastPlay.songTitle ?? "")")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Color(hex: "#6ee7b7"))
                        .lineLimit(1)
                    if let score = lastPlay.score, score > 0 {
                        Text(DojoTheme.gradeLabel(for: score))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.gradeColor(for: score))
                    }
                }
                .padding(.vertical, 4)
                .padding(.horizontal, 8)
                .background(Color(hex: "#059669").opacity(0.1))
                .cornerRadius(6)
            }
        }
        .padding(10)
        .background(DojoTheme.piuCard)
        .overlay(Rectangle().frame(height: 1).foregroundColor(DojoTheme.piuBorder), alignment: .bottom)
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(availableTabs, id: \.self) { tab in
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) { vm.selectedTab = tab }
                } label: {
                    VStack(spacing: 4) {
                        HStack(spacing: 4) {
                            Text(tab.rawValue)
                                .font(.system(size: 12, weight: .bold))

                            // Badge counts
                            if tab == .requests {
                                let openCount = vm.requests.filter { $0.effectiveStatus == "open" || $0.effectiveStatus == "queued" }.count
                                if openCount > 0 {
                                    Text("\(openCount)")
                                        .font(.system(size: 9, weight: .bold))
                                        .foregroundColor(.white)
                                        .frame(minWidth: 16, minHeight: 16)
                                        .background(Circle().fill(DojoTheme.piuAccent))
                                }
                            } else if tab == .plays && !vm.plays.isEmpty {
                                Text("\(vm.plays.count)")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundColor(.white)
                                    .frame(minWidth: 16, minHeight: 16)
                                    .background(Circle().fill(Color.cyan.opacity(0.6)))
                            }
                        }
                        .foregroundColor(vm.selectedTab == tab ? .white : DojoTheme.textMuted)

                        Rectangle()
                            .fill(vm.selectedTab == tab ? DojoTheme.piuAccent : Color.clear)
                            .frame(height: 2)
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 6)
        .background(DojoTheme.piuDark)
    }

    // MARK: - Host Controls

    private var hostControls: some View {
        HStack(spacing: 8) {
            Button { showAddCohost = true } label: {
                HStack(spacing: 4) {
                    Image(systemName: "person.badge.plus")
                    Text("Co-host")
                }
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(DojoTheme.piuBlue)
                .cornerRadius(6)
            }

            Button { showCreateVote = true } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chart.bar")
                    Text("Vote")
                }
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(hex: "#d946ef"))
                .cornerRadius(6)
            }

            Spacer()

            Button { showEndConfirm = true } label: {
                HStack(spacing: 4) {
                    Image(systemName: "stop.fill")
                    Text("End")
                }
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.red.opacity(0.8))
                .cornerRadius(6)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(DojoTheme.piuDark)
    }
}
