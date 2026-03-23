import SwiftUI

struct DashboardView: View {
    @StateObject private var vm = DashboardViewModel()
    @EnvironmentObject var auth: AuthManager

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    headerSection

                    // Quick Action Buttons (2x2 grid)
                    quickActionsGrid

                    // Search
                    searchSection

                    // Notices
                    if !vm.notices.isEmpty {
                        noticesSection
                    }

                    // Recent Activity
                    if !vm.recentActivity.isEmpty && vm.searchResults == nil {
                        recentActivitySection
                    }

                    // Online Duels
                    if !vm.onlineDuels.isEmpty && vm.searchResults == nil {
                        onlineDuelsSection
                    }

                    // Tournaments
                    tournamentsSection

                    // Create buttons
                    if vm.searchResults == nil {
                        createButtonsSection
                    }
                }
                .padding()
            }
            .refreshable { await vm.load() }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .sheet(item: $vm.selectedNotice) { notice in
            NoticeDetailSheet(notice: notice)
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack(spacing: 0) {
            Text("PUMP")
                .font(.system(size: 36, weight: .black))
                .foregroundColor(DojoTheme.piuGold)
            Text(" SHINSA")
                .font(.system(size: 36, weight: .black))
                .foregroundColor(.white)
        }
    }

    // MARK: - Quick Actions Grid

    private var quickActionsGrid: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                NavigationLink {
                    LiveDirectoryView()
                } label: {
                    quickActionButton(
                        icon: "video.fill",
                        title: "Live",
                        gradientColors: [Color(hex: "#06b6d4"), Color(hex: "#3b82f6")]
                    )
                }

                NavigationLink {
                    SongsView()
                } label: {
                    quickActionButton(
                        icon: "music.note",
                        title: "Songs",
                        gradientColors: [Color(hex: "#10b981"), Color(hex: "#14b8a6")]
                    )
                }
            }

            HStack(spacing: 10) {
                NavigationLink {
                    ListsView()
                } label: {
                    quickActionButton(
                        icon: "checkmark.circle.fill",
                        title: "Lists",
                        gradientColors: [Color(hex: "#8b5cf6"), Color(hex: "#a855f7")]
                    )
                }

                NavigationLink {
                    HeadToHeadView()
                } label: {
                    quickActionButton(
                        icon: "person.2.fill",
                        title: "Rival",
                        gradientColors: [Color(hex: "#f59e0b"), Color(hex: "#f97316")]
                    )
                }
            }
        }
    }

    private func quickActionButton(icon: String, title: String, gradientColors: [Color]) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 24, weight: .semibold))
                .foregroundColor(.white)

            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 90)
        .background(
            LinearGradient(colors: gradientColors, startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .cornerRadius(14)
        .shadow(color: gradientColors[0].opacity(0.3), radius: 8, y: 4)
    }

    // MARK: - Search

    private var searchSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(DojoTheme.textMuted)
                TextField("Search tournaments, locations, players...", text: Binding(
                    get: { vm.searchQuery },
                    set: { vm.search($0) }
                ))
                .foregroundColor(.white)
                .autocorrectionDisabled()

                if vm.isSearching {
                    ProgressView()
                        .scaleEffect(0.7)
                        .tint(DojoTheme.textMuted)
                }

                if !vm.searchQuery.isEmpty {
                    Button { vm.clearSearch() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
            }
            .padding(12)
            .background(DojoTheme.piuCard)
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(DojoTheme.piuBorder, lineWidth: 1)
            )

            if let results = vm.searchResults {
                HStack {
                    Text("\(results.count) result\(results.count != 1 ? "s" : "") for \"\(vm.searchQuery)\"")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)

                    Spacer()

                    Button("Clear search") { vm.clearSearch() }
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
    }

    // MARK: - Notices

    private var noticesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("NOTICE BOARD")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            VStack(spacing: 6) {
                ForEach(vm.notices) { notice in
                    Button { vm.selectedNotice = notice } label: {
                        HStack(spacing: 10) {
                            if notice.isPinned {
                                Image(systemName: "pin.fill")
                                    .font(.system(size: 12))
                                    .foregroundColor(DojoTheme.piuGold)
                            }

                            VStack(alignment: .leading, spacing: 2) {
                                Text(notice.title)
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundColor(notice.isPinned ? DojoTheme.piuGold : .white)
                                    .lineLimit(1)

                                if let created = notice.createdAt {
                                    Text(created.asDate?.formatted(date: .abbreviated, time: .omitted) ?? "")
                                        .font(.system(size: 10))
                                        .foregroundColor(DojoTheme.textMuted)
                                }
                            }

                            Spacer()

                            Image(systemName: "chevron.right")
                                .font(.system(size: 10))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                        .padding(12)
                        .background(
                            notice.isPinned
                                ? DojoTheme.piuGold.opacity(0.08)
                                : DojoTheme.piuCard
                        )
                        .cornerRadius(10)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(
                                    notice.isPinned ? DojoTheme.piuGold.opacity(0.3) : DojoTheme.piuBorder,
                                    lineWidth: 1
                                )
                        )
                    }
                }
            }
        }
    }

    // MARK: - Recent Activity

    private var recentActivitySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("RECENT ACTIVITY")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            VStack(spacing: 0) {
                ForEach(Array(vm.recentActivity.prefix(10).enumerated()), id: \.offset) { index, activity in
                    NavigationLink(value: activity.link) {
                        HStack(spacing: 10) {
                            Text(activity.icon)
                                .font(.system(size: 14))
                                .frame(width: 24)

                            if let avatar = activity.avatar {
                                AvatarView(avatar, name: activity.username ?? "?", size: 24)
                            }

                            VStack(alignment: .leading) {
                                HStack(spacing: 4) {
                                    if let nat = activity.nationality {
                                        Text(CountryData.flag(for: nat))
                                            .font(.system(size: 12))
                                    }
                                    Text(activity.message)
                                        .font(.system(size: 12))
                                        .foregroundColor(.white.opacity(0.85))
                                        .lineLimit(1)
                                }
                            }

                            Spacer()

                            if let created = activity.createdAt {
                                Text(created.timeAgo)
                                    .font(.system(size: 10))
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 4)
                    }

                    if index < min(vm.recentActivity.count, 10) - 1 {
                        Divider()
                            .background(DojoTheme.piuBorder.opacity(0.3))
                    }
                }
            }
            .padding(10)
            .background(DojoTheme.piuCard)
            .cornerRadius(12)
        }
    }

    // MARK: - Online Duels

    private var onlineDuelsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("ONLINE DUELS")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            ForEach(vm.onlineDuels) { duel in
                NavigationLink(value: "online-duel/\(duel.id)") {
                    HStack(spacing: 10) {
                        // VS avatars
                        HStack(spacing: -6) {
                            AvatarView(duel.creatorAvatar, name: duel.creatorUsername ?? "?", size: 36)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 7)
                                        .stroke(Color.red.opacity(0.4), lineWidth: 1)
                                )

                            ZStack {
                                Circle()
                                    .fill(DojoTheme.piuCard)
                                    .frame(width: 20, height: 20)
                                Text("\u{2694}")
                                    .font(.system(size: 10))
                            }
                            .zIndex(1)

                            AvatarView(duel.opponentAvatar, name: duel.opponentUsername ?? "?", size: 36)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 7)
                                        .stroke(Color.blue.opacity(0.4), lineWidth: 1)
                                )
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(duel.name)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)

                            Text("\(duel.creatorUsername ?? "?") vs \(duel.opponentUsername ?? "Waiting...")")
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.textMuted)
                        }

                        Spacer()

                        StatusBadgeView(duelStatus: duel.status)
                    }
                    .padding(12)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(12)
                }
            }
        }
    }

    // MARK: - Tournaments

    private var tournamentsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("TOURNAMENTS")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            if vm.displayTournaments.isEmpty {
                VStack(spacing: 8) {
                    if vm.searchResults != nil {
                        Text("No tournaments found")
                            .foregroundColor(DojoTheme.textMuted)
                    } else {
                        Text("No tournaments yet")
                            .foregroundColor(DojoTheme.textMuted)
                        Text("Create your first tournament to get started")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted.opacity(0.6))
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 30)
            } else {
                ForEach(vm.displayTournaments) { tournament in
                    NavigationLink(value: "tournament/\(tournament.id)") {
                        TournamentCardView(tournament: tournament)
                    }
                }
            }
        }
    }

    // MARK: - Create Buttons

    private var createButtonsSection: some View {
        HStack(spacing: 10) {
            NavigationLink(value: "tournament/new") {
                Text("+ Tournament")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(DojoTheme.piuAccent)
                    .cornerRadius(10)
            }

            NavigationLink(value: "online-duel/new") {
                Text("+ Online Duel")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        LinearGradient(
                            colors: [DojoTheme.piuAccent, DojoTheme.piuGold],
                            startPoint: .leading, endPoint: .trailing
                        )
                    )
                    .cornerRadius(10)
            }
        }
    }
}

// MARK: - Notice Detail Sheet

struct NoticeDetailSheet: View {
    let notice: Notice
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if notice.isPinned {
                            Text("PINNED")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(DojoTheme.piuAccent)
                        }

                        Text(notice.title)
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.white)

                        if let created = notice.createdAt {
                            Text(created.asDate?.formatted(date: .long, time: .omitted) ?? "")
                                .font(.system(size: 12))
                                .foregroundColor(DojoTheme.textMuted)
                        }

                        Divider().background(DojoTheme.piuBorder)

                        Text(notice.content)
                            .foregroundColor(.white.opacity(0.85))
                            .lineSpacing(4)
                    }
                    .padding()
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .foregroundColor(.white)
                    }
                }
            }
        }
    }
}
