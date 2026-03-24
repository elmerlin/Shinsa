import SwiftUI

struct DashboardView: View {
    @StateObject private var vm = DashboardViewModel()
    @EnvironmentObject var auth: AuthManager
    @State private var selectedHighlight: HighlightItem?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Quick Action Buttons (4-column row)
                    quickActionsGrid

                    // Notices
                    if !vm.notices.isEmpty {
                        noticesSection
                    }

                    // Recent Activity
                    if !vm.recentActivity.isEmpty && vm.searchResults == nil {
                        recentActivitySection
                    }

                    // Daily Highlights
                    if let highlights = vm.dailyHighlights, vm.searchResults == nil {
                        dailyHighlightsSection(highlights)
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
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                HStack(spacing: 4) {
                    if let logoImage = UIImage(named: "pump-shinsa-logo") ?? UIImage(contentsOfFile: Bundle.main.path(forResource: "pump-shinsa-logo", ofType: "png") ?? "") {
                        Image(uiImage: logoImage)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 28, height: 28)
                            .cornerRadius(6)
                    }
                    Text("PUMP")
                        .font(.system(size: 13, weight: .black))
                        .foregroundColor(DojoTheme.piuGold)
                    Text("SHINSA")
                        .font(.system(size: 13, weight: .black))
                        .foregroundColor(.white)
                }
                .fixedSize()
            }
        }
        .task { await vm.load() }
        .sheet(item: $vm.selectedNotice) { notice in
            NoticeDetailSheet(notice: notice)
        }
        .sheet(item: $selectedHighlight) { item in
            ScoreSnapshotSheet(
                songTitle: item.songTitle ?? "Unknown",
                mode: item.mode ?? "S",
                level: item.level ?? 0,
                score: item.newScore ?? item.score ?? 0,
                grade: DojoTheme.gradeLabel(for: item.newScore ?? item.score ?? 0),
                backgroundUrl: item.backgroundUrl,
                replayEmbedUrl: item.replayEmbedUrl,
                username: item.username
            )
        }
    }

    // MARK: - Header (moved to toolbar)

    // MARK: - Quick Actions Grid

    private var quickActionsGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
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

    private func quickActionButton(icon: String, title: String, gradientColors: [Color]) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(.white)

            Text(title)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 72)
        .background(
            LinearGradient(colors: gradientColors, startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .cornerRadius(12)
        .shadow(color: gradientColors[0].opacity(0.3), radius: 6, y: 3)
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

    // MARK: - Daily Highlights

    private func dailyHighlightsSection(_ data: DailyHighlightsData) -> some View {
        let replays = data.topReplays ?? []
        let upscores = data.topUpscores ?? []
        let clears = data.topClears ?? []

        let hasContent = !replays.isEmpty || !upscores.isEmpty || !clears.isEmpty
        guard hasContent else { return AnyView(EmptyView()) }

        return AnyView(VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Text("TODAY'S HIGHLIGHTS")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
                Rectangle()
                    .fill(DojoTheme.piuAccent.opacity(0.3))
                    .frame(height: 1)
            }

            if !replays.isEmpty {
                highlightRow(title: "🎬 Top Replays", items: replays, isReplay: true, accentColor: .red)
            }

            if !upscores.isEmpty {
                highlightRow(title: "📈 Best Upscores", items: upscores, isReplay: false, accentColor: DojoTheme.piuGreen)
            }

            if !clears.isEmpty {
                highlightRow(title: "🎯 Best New Clears", items: clears, isReplay: false, accentColor: Color(hex: "#38bdf8"))
            }
        })
    }

    private func highlightRow(title: String, items: [HighlightItem], isReplay: Bool, accentColor: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(title)
                    .font(.system(size: 10, weight: .black))
                    .foregroundColor(.white.opacity(0.8))
                    .textCase(.uppercase)
                    .tracking(1)
                Rectangle()
                    .fill(accentColor.opacity(0.3))
                    .frame(height: 1)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        highlightCard(item: item, rank: index + 1, isReplay: isReplay)
                    }
                }
                .padding(.horizontal, 2)
            }
        }
    }

    private func highlightCard(item: HighlightItem, rank: Int, isReplay: Bool) -> some View {
        let jacketURL = JacketService.shared.resolveJacketURL(title: item.songTitle, mode: item.mode, level: item.level, backgroundUrl: item.backgroundUrl)
        let displayScore = item.newScore ?? item.score ?? 0
        let gradeLabel = DojoTheme.gradeLabel(for: displayScore)
        let gradeColor = DojoTheme.gradeColor(for: displayScore)

        let rankColors: [Color] = {
            switch rank {
            case 1: return [Color(hex: "#ffd700"), Color(hex: "#ffb300")]
            case 2: return [Color(hex: "#e0e0e0"), Color(hex: "#9e9e9e")]
            case 3: return [Color(hex: "#cd7f32"), Color(hex: "#8b4513")]
            default: return [Color(hex: "#38bdf8"), Color(hex: "#0284c7")]
            }
        }()

        return Button {
            selectedHighlight = item
        } label: {
            ZStack(alignment: .topLeading) {
                // Jacket background
                if let url = jacketURL {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img):
                            img.resizable().scaledToFill()
                        default:
                            Rectangle().fill(
                                LinearGradient(colors: [Color(hex: "#152238"), Color(hex: "#090d18")], startPoint: .topLeading, endPoint: .bottomTrailing)
                            )
                        }
                    }
                } else {
                    Rectangle().fill(
                        LinearGradient(colors: [Color(hex: "#152238"), Color(hex: "#090d18")], startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
                }

                // Dark gradient overlay
                LinearGradient(colors: [.black.opacity(0.15), .black.opacity(0.5), .black.opacity(0.9)], startPoint: .top, endPoint: .bottom)

                // Rank badge
                Text("\(rank)")
                    .font(.system(size: 9, weight: .black))
                    .foregroundColor(rank <= 3 ? .black : .white)
                    .frame(width: 18, height: 18)
                    .background(
                        Circle().fill(LinearGradient(colors: rankColors, startPoint: .topLeading, endPoint: .bottomTrailing))
                    )
                    .padding(4)

                // Mode badge top-right
                if let mode = item.mode, let level = item.level {
                    let isDouble = mode.lowercased().hasPrefix("d") || mode.lowercased() == "double"
                    let prefix = isDouble ? "D" : "S"
                    let badgeColors: [Color] = isDouble
                        ? [Color(hex: "#4cf4aa"), Color(hex: "#0b5d48")]
                        : [Color(hex: "#ff7a7a"), Color(hex: "#7a1730")]

                    Text("\(prefix)\(level)")
                        .font(.system(size: 8, weight: .black))
                        .foregroundColor(.white)
                        .padding(.horizontal, 3)
                        .padding(.vertical, 1)
                        .background(LinearGradient(colors: badgeColors, startPoint: .topLeading, endPoint: .bottomTrailing))
                        .cornerRadius(4)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.trailing, 4)
                        .padding(.top, 4)
                }

                // Replay pill (for replays)
                if isReplay {
                    HStack(spacing: 2) {
                        Image(systemName: "play.fill")
                            .font(.system(size: 6))
                        Text("Replay")
                            .font(.system(size: 7, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(Color.red.opacity(0.85))
                    .cornerRadius(8)
                    .padding(.top, 24)
                    .padding(.trailing, 4)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                }

                // Bottom content
                VStack(alignment: .leading, spacing: 2) {
                    Spacer()

                    // Player
                    HStack(spacing: 3) {
                        if let avatar = item.avatar, !avatar.isEmpty {
                            AvatarView(avatar, name: item.username ?? "?", size: 14)
                        }
                        if let nat = item.nationality, !nat.isEmpty {
                            Text(CountryData.flag(for: nat))
                                .font(.system(size: 8))
                        }
                        Text(item.username ?? "")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.white)
                            .lineLimit(1)
                            .shadow(radius: 2)
                    }

                    // Song title
                    Text(item.songTitle ?? "Unknown")
                        .font(.system(size: 10, weight: .black))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .shadow(radius: 2)

                    // Score + Grade
                    HStack {
                        Text(displayScore > 0 ? displayScore.formattedScore : "")
                            .font(.system(size: 12, weight: .black))
                            .foregroundColor(.white)
                            .shadow(radius: 2)
                        Spacer()
                        Text(gradeLabel)
                            .font(.system(size: 11, weight: .black))
                            .foregroundColor(gradeColor)
                            .shadow(radius: 2)
                    }

                    // Delta for upscores
                    if let old = item.oldScore, let new = item.newScore, new > old {
                        HStack {
                            Text(old.formattedScore)
                                .font(.system(size: 8, design: .monospaced))
                                .foregroundColor(.white.opacity(0.6))
                            Spacer()
                            Text("+\((new - old).formattedScore)")
                                .font(.system(size: 9, weight: .bold, design: .monospaced))
                                .foregroundColor(DojoTheme.piuGreen)
                        }
                    }
                }
                .padding(6)
            }
            .frame(width: 140, height: 105)
            .cornerRadius(10)
            .clipped()
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(DojoTheme.piuBorder.opacity(0.5), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
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
