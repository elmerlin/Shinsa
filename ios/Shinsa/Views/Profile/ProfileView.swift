import SwiftUI
import WebKit

private struct SVGImageView: UIViewRepresentable {
    let svgData: String

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.isUserInteractionEnabled = false
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let html = """
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{margin:0;background:transparent;display:flex;align-items:center;justify-content:center;height:100vh}
        img{max-width:100%;max-height:100%;object-fit:contain}</style></head>
        <body><img src="\(svgData)"></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}

private struct AchievementSeriesID: Identifiable {
    let id: String
}

struct ProfileView: View {
    @StateObject private var vm: ProfileViewModel
    @EnvironmentObject var auth: AuthManager

    init(userId: String) {
        _vm = StateObject(wrappedValue: ProfileViewModel(userId: userId))
    }

    private var isOwnProfile: Bool {
        auth.userId == vm.userId
    }

    @State private var selectedTab = "overview"
    @State private var selectedHeatmapDay: HeatmapDay?
    @State private var heatmapYear: Int = Calendar.current.component(.year, from: Date())
    @State private var selectedAchievementSeries: String?
    @State private var isSyncingPlays = false
    @State private var showSinglesPumbility = false

    private var tabs: [(String, String, String)] {
        var t: [(String, String, String)] = [
            ("overview", "Overview", "chart.xyaxis.line"),
            ("posts", "Posts", "square.and.pencil"),
            ("followers", "Followers", "person.2"),
            ("following", "Following", "person.badge.plus"),
        ]
        if vm.user?.pumbility != nil && (vm.user?.pumbility ?? 0) > 0 {
            t.append(("piu", "PIU Data", "gamecontroller"))
        }
        t.append(("stats", "Stats", "trophy"))
        return t
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if vm.isLoading && vm.user == nil {
                ProgressView().tint(DojoTheme.piuAccent)
            } else if let user = vm.user {
                ScrollView {
                    VStack(spacing: 0) {
                        profileHeader(user)
                        statsBar(user)
                        tabBar
                        tabContent(user)
                    }
                    .frame(maxWidth: .infinity)
                }
                .clipped()
                .refreshable { await vm.load() }
            } else {
                Text("User not found")
                    .foregroundColor(DojoTheme.textMuted)
            }
        }
        .navigationTitle(vm.user?.username ?? "Profile")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await JacketService.shared.loadIfNeeded()
            await vm.load()
            await vm.loadRecentPlays()
            await vm.loadAchievements()
        }
    }

    // MARK: - Profile Header

    private func profileHeader(_ user: User) -> some View {
        VStack(spacing: 0) {
            // Two-column layout: left (avatar + info), right (PIU stats + badges)
            HStack(alignment: .top, spacing: 12) {
                // LEFT COLUMN: Avatar + user info
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .top, spacing: 10) {
                        AvatarView(user.avatar, name: user.username, size: 52)

                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 4) {
                                if let nat = user.nationality, !nat.isEmpty {
                                    Text(CountryData.flag(for: nat))
                                        .font(.system(size: 13))
                                }
                                Text(user.username)
                                    .font(.system(size: 17, weight: .bold))
                                    .foregroundColor(.white)
                                    .lineLimit(1)

                                if let gender = user.gender, !gender.isEmpty {
                                    Text(gender == "male" ? "\u{2642}" : gender == "female" ? "\u{2640}" : "")
                                        .font(.system(size: 13))
                                        .foregroundColor(gender == "male" ? Color(hex: "#60a5fa") : Color(hex: "#f472b6"))
                                }
                            }

                            // Skill title badge
                            if let skill = user.skillTitle {
                                Text(skill)
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(DojoTheme.skillColor(for: skill))
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 2)
                                    .background(DojoTheme.skillColor(for: skill).opacity(0.15))
                                    .cornerRadius(3)
                            }

                            // Location row
                            HStack(spacing: 3) {
                                if let city = user.locationCity, !city.isEmpty {
                                    Text(city)
                                        .font(.system(size: 11))
                                        .foregroundColor(DojoTheme.textMuted)
                                }
                                if let country = user.locationCountry, !country.isEmpty {
                                    if user.locationCity != nil {
                                        Text("\u{00b7}")
                                            .font(.system(size: 11))
                                            .foregroundColor(DojoTheme.textMuted)
                                    }
                                    Text(country)
                                        .font(.system(size: 11))
                                        .foregroundColor(DojoTheme.textMuted)
                                }
                            }

                            // Member since
                            if let createdAt = user.createdAt {
                                let memberDate = formatMemberSince(createdAt)
                                if !memberDate.isEmpty {
                                    Text("Member since \(memberDate)")
                                        .font(.system(size: 9))
                                        .foregroundColor(DojoTheme.textMuted.opacity(0.7))
                                }
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                // RIGHT COLUMN: PIU stats card + badges
                VStack(spacing: 6) {
                    // Pumbility box (tap to toggle singles)
                    if let pumbility = user.pumbility, pumbility > 0 {
                        let singlesPumb = vm.songAnalytics?.singlesPumbility
                        let displayValue = showSinglesPumbility ? (singlesPumb ?? pumbility) : pumbility
                        let displayLabel = showSinglesPumbility ? "S. PUMBILITY" : "PUMBILITY"

                        VStack(spacing: 2) {
                            Text(displayLabel)
                                .font(.system(size: 8, weight: .bold))
                                .foregroundColor(DojoTheme.piuGold)
                            Text("\(displayValue)")
                                .font(.system(size: 18, weight: .black))
                                .foregroundColor(.white)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(DojoTheme.piuDark)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(DojoTheme.piuGold.opacity(0.3), lineWidth: 1)
                                )
                        )
                        .onTapGesture {
                            withAnimation(.easeInOut(duration: 0.15)) {
                                showSinglesPumbility.toggle()
                            }
                        }
                    }

                    // Best Clears
                    if let status = vm.piuStatus,
                       let hs = status.highestSingle, hs > 0,
                       let hd = status.highestDouble, hd > 0 {
                        VStack(spacing: 2) {
                            Text("BEST CLEARS")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundColor(DojoTheme.textMuted)
                            HStack(spacing: 2) {
                                Text("S")
                                    .font(.system(size: 11, weight: .black))
                                    .foregroundColor(DojoTheme.piuAccent)
                                Text("\(hs)")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(.white)
                                Text("/")
                                    .font(.system(size: 10))
                                    .foregroundColor(DojoTheme.textMuted)
                                Text("D")
                                    .font(.system(size: 11, weight: .black))
                                    .foregroundColor(DojoTheme.piuGreen)
                                Text("\(hd)")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(.white)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                        .background(
                            RoundedRectangle(cornerRadius: 6)
                                .fill(DojoTheme.piuDark)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 6)
                                        .stroke(DojoTheme.piuBorder, lineWidth: 1)
                                )
                        )
                    }

                    // Achievement + Group badges
                    let groupBadges = user.groupBadges ?? []
                    let achievementBadges = highestPerSeries
                    if !groupBadges.isEmpty || !achievementBadges.isEmpty {
                        HStack(spacing: 4) {
                            ForEach(achievementBadges.prefix(4)) { badge in
                                achievementBadgeImage(badge, size: 24)
                                    .onTapGesture {
                                        selectedAchievementSeries = badge.seriesId ?? badge.id
                                    }
                            }
                            ForEach(groupBadges.prefix(3)) { badge in
                                badgeCircle(url: badge.image, name: badge.name, size: 24, borderColor: DojoTheme.piuBorder)
                            }
                        }
                    }
                }
                .frame(width: 140)
            }

            // Achievement series sheet
            if !vm.achievements.isEmpty {
                Color.clear.frame(height: 0)
                    .sheet(item: Binding<AchievementSeriesID?>(
                        get: { selectedAchievementSeries.map { AchievementSeriesID(id: $0) } },
                        set: { selectedAchievementSeries = $0?.id }
                    )) { seriesID in
                        achievementSeriesSheet(seriesId: seriesID.id)
                    }
            }

            // Bio
            if let bio = user.description, !bio.isEmpty {
                Text(bio)
                    .font(.system(size: 12))
                    .foregroundColor(DojoTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 8)
            }

            // Action buttons
            HStack(spacing: 8) {
                if !isOwnProfile {
                    Button {
                        Task { await vm.toggleFollow() }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: vm.isFollowing ? "checkmark" : "plus")
                                .font(.system(size: 11))
                            Text(vm.isFollowing ? "Following" : "Follow")
                                .font(.system(size: 13, weight: .bold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(vm.isFollowing ? DojoTheme.piuCard : DojoTheme.piuAccent)
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(vm.isFollowing ? DojoTheme.piuBorder : Color.clear, lineWidth: 1)
                        )
                    }

                    NavigationLink {
                        MessagesListView()
                    } label: {
                        Image(systemName: "paperplane.fill")
                            .font(.system(size: 13))
                            .foregroundColor(.white)
                            .padding(8)
                            .background(DojoTheme.piuCard)
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(DojoTheme.piuBorder, lineWidth: 1)
                            )
                    }
                } else {
                    NavigationLink {
                        MyAccountView()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "gearshape")
                                .font(.system(size: 11))
                            Text("Edit Profile")
                                .font(.system(size: 13, weight: .bold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(DojoTheme.piuCard)
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(DojoTheme.piuBorder, lineWidth: 1)
                        )
                    }
                }

                Spacer()
            }
            .padding(.top, 10)
        }
        .padding(16)
        .background(DojoTheme.piuCard)
    }

    // MARK: - Badge Circle

    private func badgeCircle(url: String?, name: String?, size: CGFloat, borderColor: Color) -> some View {
        Group {
            if let urlStr = url, urlStr.hasPrefix("data:image/svg") {
                SVGImageView(svgData: urlStr)
            } else if let uiImage = decodeBase64Image(url) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else if let urlStr = url, let imageUrl = URL(string: urlStr), urlStr.hasPrefix("http") {
                AsyncImage(url: imageUrl) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFill()
                    default:
                        Circle().fill(DojoTheme.piuBorder)
                    }
                }
            } else {
                Circle().fill(DojoTheme.piuBorder)
                    .overlay(
                        Text(String((name ?? "?").prefix(1)))
                            .font(.system(size: size * 0.4, weight: .bold))
                            .foregroundColor(.white)
                    )
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(borderColor, lineWidth: 1.5))
    }

    // MARK: - Stats Bar

    private func statsBar(_ user: User) -> some View {
        HStack(spacing: 0) {
            statItem("\(vm.socialCounts?.followersCount ?? 0)", "Followers")
            statDivider
            statItem("\(vm.socialCounts?.postsCount ?? 0)", "Posts")
            statDivider
            statItem("\(vm.socialCounts?.pumpsReceived ?? 0)", "Pumps")
            statDivider
            statItem("\((vm.stats?.tournaments?.count ?? 0) + (vm.stats?.duels?.count ?? 0))", "Competitions")
        }
        .padding(.vertical, 10)
        .background(DojoTheme.piuCard)
        .overlay(alignment: .top) {
            Rectangle().fill(DojoTheme.piuBorder).frame(height: 1)
        }
    }

    private func statItem(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)
            Text(label)
                .font(.system(size: 9))
                .foregroundColor(DojoTheme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }

    private var statDivider: some View {
        Rectangle()
            .fill(DojoTheme.piuBorder)
            .frame(width: 1, height: 28)
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(tabs, id: \.0) { id, label, icon in
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) { selectedTab = id }
                        if id == "posts" && vm.posts.isEmpty {
                            Task { await vm.loadPosts(reset: true) }
                        }
                    } label: {
                        VStack(spacing: 6) {
                            HStack(spacing: 4) {
                                Image(systemName: icon)
                                    .font(.system(size: 11))
                                Text(label)
                                    .font(.system(size: 12, weight: .bold))
                            }
                            .foregroundColor(selectedTab == id ? DojoTheme.piuAccent : DojoTheme.textMuted)

                            Rectangle()
                                .fill(selectedTab == id ? DojoTheme.piuAccent : Color.clear)
                                .frame(height: 2)
                        }
                        .padding(.horizontal, 14)
                        .padding(.top, 10)
                    }
                }
            }
        }
        .background(DojoTheme.piuCard)
    }

    // MARK: - Tab Content

    @ViewBuilder
    private func tabContent(_ user: User) -> some View {
        switch selectedTab {
        case "overview":
            overviewTab(user)
        case "posts":
            postsTab
        case "followers":
            followersTab
        case "following":
            followingTab
        case "piu":
            piuDataTab(user)
        case "stats":
            statsTab
        default:
            EmptyView()
        }
    }

    // MARK: - Overview Tab

    private func overviewTab(_ user: User) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            // Activity Heatmap
            activityHeatmap

            // Selected day plays
            if let day = selectedHeatmapDay {
                selectedDayPlays(day)
            }

            // Pumbility card
            if let pumbility = user.pumbility, pumbility > 0 {
                NavigationLink {
                    PumbilityBreakdownView(userId: vm.userId)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("PUMBILITY")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(DojoTheme.piuGold)
                            Text("\(pumbility)")
                                .font(.system(size: 28, weight: .bold))
                                .foregroundColor(.white)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .foregroundColor(DojoTheme.textMuted)
                    }
                    .padding(16)
                    .background(
                        LinearGradient(colors: [DojoTheme.piuGold.opacity(0.1), DojoTheme.piuCard], startPoint: .leading, endPoint: .trailing)
                    )
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(DojoTheme.piuGold.opacity(0.2), lineWidth: 1)
                    )
                }
            }

            // Song analytics
            NavigationLink {
                SongAnalyticsView(userId: vm.userId)
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("SONG ANALYTICS")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.piuBlue)
                        Text("Play activity, grades, and stats")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .foregroundColor(DojoTheme.textMuted)
                }
                .padding(16)
                .background(DojoTheme.piuCard)
                .cornerRadius(12)
            }

            // Head to head (other profiles)
            if !isOwnProfile {
                NavigationLink {
                    HeadToHeadView()
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("HEAD TO HEAD")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(DojoTheme.piuAccent)
                            Text("Compare scores on shared songs")
                                .font(.system(size: 12))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .foregroundColor(DojoTheme.textMuted)
                    }
                    .padding(16)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(12)
                }
            }

            // Tournament/duel stats preview
            if let stats = vm.stats {
                if let tournaments = stats.tournaments, !tournaments.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("RECENT COMPETITIONS")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)

                        ForEach(tournaments.prefix(3)) { t in
                            HStack {
                                Image(systemName: "trophy.fill")
                                    .font(.system(size: 12))
                                    .foregroundColor(DojoTheme.piuGold)
                                    .frame(width: 24)

                                Text(t.tournamentName ?? "Tournament")
                                    .font(.system(size: 13))
                                    .foregroundColor(.white)
                                    .lineLimit(1)

                                Spacer()

                                Text("\(t.wins ?? 0)W \(t.losses ?? 0)L")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                            .padding(10)
                            .background(DojoTheme.piuCard)
                            .cornerRadius(8)
                        }
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Activity Heatmap

    private var activityHeatmap: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("ACTIVITY")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(DojoTheme.piuGreen)

                Spacer()

                // Year selector
                HStack(spacing: 12) {
                    Button {
                        heatmapYear -= 1
                        Task { await vm.loadRecentPlays(year: heatmapYear) }
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)
                    }

                    Text("\(String(heatmapYear))")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)

                    Button {
                        let currentYear = Calendar.current.component(.year, from: Date())
                        if heatmapYear < currentYear {
                            heatmapYear += 1
                            Task { await vm.loadRecentPlays(year: heatmapYear) }
                        }
                    } label: {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(heatmapYear < Calendar.current.component(.year, from: Date()) ? DojoTheme.textMuted : DojoTheme.textMuted.opacity(0.3))
                    }
                }

                if isOwnProfile {
                    Button {
                        Task {
                            isSyncingPlays = true
                            _ = try? await APIService.shared.syncRecentlyPlayed()
                            await vm.loadRecentPlays(year: heatmapYear)
                            isSyncingPlays = false
                        }
                    } label: {
                        if isSyncingPlays {
                            ProgressView()
                                .tint(DojoTheme.piuGreen)
                                .scaleEffect(0.7)
                        } else {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }
                    .disabled(isSyncingPlays)
                }
            }

            // Legend
            HStack(spacing: 12) {
                HStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(DojoTheme.piuGreen)
                        .frame(width: 8, height: 8)
                    Text("Doubles")
                        .font(.system(size: 9))
                        .foregroundColor(DojoTheme.textMuted)
                }
                HStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(DojoTheme.piuAccent)
                        .frame(width: 8, height: 8)
                    Text("Singles")
                        .font(.system(size: 9))
                        .foregroundColor(DojoTheme.textMuted)
                }
                Spacer()
                HStack(spacing: 2) {
                    Text("Less")
                        .font(.system(size: 9))
                        .foregroundColor(DojoTheme.textMuted)
                    ForEach([0.1, 0.3, 0.5, 0.8, 1.0], id: \.self) { opacity in
                        RoundedRectangle(cornerRadius: 1)
                            .fill(DojoTheme.piuGreen.opacity(opacity))
                            .frame(width: 8, height: 8)
                    }
                    Text("More")
                        .font(.system(size: 9))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            if vm.recentPlays.isEmpty && !vm.isLoading {
                Text("No play data for \(String(heatmapYear))")
                    .font(.system(size: 12))
                    .foregroundColor(DojoTheme.textMuted)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 20)
            } else {
                heatmapGrid
            }
        }
        .padding(12)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    private var heatmapGrid: some View {
        let weeks = buildWeeks(year: heatmapYear)
        let dayLabels = ["", "M", "", "W", "", "F", ""]
        let monthLabels = buildMonthLabels(year: heatmapYear, weeks: weeks)
        let maxPlays = vm.heatmapData.values.map(\.plays).max() ?? 1

        return ScrollView(.horizontal, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                // Month labels row
                HStack(spacing: 0) {
                    Text("").frame(width: 16) // spacer for day labels column
                    ForEach(Array(monthLabels.enumerated()), id: \.offset) { _, label in
                        Text(label)
                            .font(.system(size: 8))
                            .foregroundColor(DojoTheme.textMuted)
                            .frame(width: 12, alignment: .leading)
                    }
                }
                .padding(.bottom, 2)

                // Grid: day labels + week columns
                HStack(alignment: .top, spacing: 0) {
                    // Day labels column
                    VStack(spacing: 1) {
                        ForEach(0..<7, id: \.self) { dayIndex in
                            Text(dayLabels[dayIndex])
                                .font(.system(size: 7))
                                .foregroundColor(DojoTheme.textMuted)
                                .frame(width: 14, height: 10)
                        }
                    }

                    // Weeks
                    ForEach(Array(weeks.enumerated()), id: \.offset) { _, week in
                        VStack(spacing: 1) {
                            ForEach(0..<7, id: \.self) { dayIndex in
                                if dayIndex < week.count, let date = week[dayIndex] {
                                    let formatter = DateFormatter()
                                    let _ = formatter.dateFormat = "yyyy-MM-dd"
                                    let key = formatter.string(from: date)
                                    let dayData = vm.heatmapData[key]
                                    let plays = dayData?.plays ?? 0
                                    let doubleRatio = dayData?.doubleRatio ?? 0.5

                                    heatmapCell(plays: plays, maxPlays: maxPlays, doubleRatio: doubleRatio, key: key, dayData: dayData)
                                } else {
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(Color.clear)
                                        .frame(width: 10, height: 10)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func heatmapCell(plays: Int, maxPlays: Int, doubleRatio: Double, key: String, dayData: HeatmapDay?) -> some View {
        let intensity = plays == 0 ? 0.0 : max(0.15, min(1.0, Double(plays) / Double(max(maxPlays, 1))))
        let color: Color = plays == 0
            ? DojoTheme.piuBorder.opacity(0.3)
            : (doubleRatio > 0.5 ? DojoTheme.piuGreen.opacity(intensity) : DojoTheme.piuAccent.opacity(intensity))

        return RoundedRectangle(cornerRadius: 2)
            .fill(color)
            .frame(width: 10, height: 10)
            .overlay(
                selectedHeatmapDay?.key == key
                    ? RoundedRectangle(cornerRadius: 2).stroke(Color.white, lineWidth: 1)
                    : nil
            )
            .onTapGesture {
                if let data = dayData {
                    selectedHeatmapDay = selectedHeatmapDay?.key == key ? nil : data
                } else {
                    selectedHeatmapDay = nil
                }
            }
    }

    // MARK: - Selected Day Plays

    private func selectedDayPlays(_ day: HeatmapDay) -> some View {
        let playsForDay = vm.recentPlays.filter { play in
            guard let datePlayed = play.datePlayed else { return false }
            return datePlayed.hasPrefix(day.key)
        }

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(formatHeatmapDate(day.key))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                Spacer()
                Text("\(day.plays) plays")
                    .font(.system(size: 12))
                    .foregroundColor(DojoTheme.textMuted)
            }

            ForEach(Array(playsForDay.enumerated()), id: \.offset) { _, play in
                HStack(spacing: 10) {
                    // Jacket image
                    if let bgUrl = play.backgroundUrl, let url = URL(string: bgUrl) {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let img):
                                img.resizable().scaledToFill()
                            default:
                                RoundedRectangle(cornerRadius: 4).fill(DojoTheme.piuBorder)
                            }
                        }
                        .frame(width: 36, height: 36)
                        .cornerRadius(4)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(play.songTitle ?? "Unknown")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                            .lineLimit(1)

                        HStack(spacing: 6) {
                            modeBadge(play.mode ?? "S", level: play.level ?? 0)

                            if let grade = play.grade {
                                Text(grade)
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(gradeColor(grade))
                            }
                        }
                    }

                    Spacer()

                    Text("\(play.score ?? 0)")
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundColor(DojoTheme.textSecondary)
                }
                .padding(8)
                .background(DojoTheme.piuCard)
                .cornerRadius(8)
            }
        }
        .padding(12)
        .background(DojoTheme.piuBg)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Posts Tab

    private var postsTab: some View {
        LazyVStack(spacing: 12) {
            if vm.posts.isEmpty && !vm.isLoadingPosts {
                VStack(spacing: 8) {
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 28))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.4))
                    Text("No posts yet")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                }
                .frame(maxWidth: .infinity)
                .padding(40)
            } else {
                ForEach(vm.posts) { post in
                    postCard(post)
                }

                if vm.isLoadingPosts {
                    ProgressView().tint(DojoTheme.piuAccent)
                        .padding()
                } else if vm.hasMorePosts {
                    Color.clear
                        .frame(height: 1)
                        .onAppear {
                            Task { await vm.loadPosts() }
                        }
                }
            }
        }
        .padding(16)
        .task {
            if vm.posts.isEmpty {
                await vm.loadPosts(reset: true)
            }
        }
    }

    private func postCard(_ post: Post) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack(spacing: 8) {
                AvatarView(post.avatar, name: post.username ?? "User", size: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(post.username ?? "User")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                    if let date = post.createdAt {
                        Text(timeAgo(date))
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
                Spacer()
            }

            // Content
            Text(post.content)
                .font(.system(size: 13))
                .foregroundColor(DojoTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            // Images
            let urls = post.imageUrls
            if !urls.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(urls, id: \.self) { urlStr in
                            if let url = URL(string: urlStr) {
                                AsyncImage(url: url) { phase in
                                    switch phase {
                                    case .success(let img):
                                        img.resizable().scaledToFill()
                                    default:
                                        RoundedRectangle(cornerRadius: 8).fill(DojoTheme.piuBorder)
                                    }
                                }
                                .frame(width: 160, height: 120)
                                .cornerRadius(8)
                            }
                        }
                    }
                }
            }

            // Footer
            HStack(spacing: 16) {
                HStack(spacing: 4) {
                    Image(systemName: post.isPumped ? "flame.fill" : "flame")
                        .font(.system(size: 12))
                        .foregroundColor(post.isPumped ? DojoTheme.piuAccent : DojoTheme.textMuted)
                    Text("\(post.pumpCount ?? 0)")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                }

                HStack(spacing: 4) {
                    Image(systemName: "bubble.right")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("\(post.commentCount ?? 0)")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                }

                Spacer()
            }
        }
        .padding(12)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Followers Tab

    private var followersTab: some View {
        NavigationLink {
            FollowersListView(userId: vm.userId, listType: "followers")
        } label: {
            HStack {
                Text("View all followers")
                    .font(.system(size: 14))
                    .foregroundColor(.white)
                Spacer()
                Text("\(vm.user?.followerCount ?? 0)")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundColor(DojoTheme.textMuted)
            }
            .padding(16)
            .background(DojoTheme.piuCard)
            .cornerRadius(12)
        }
        .padding(16)
    }

    // MARK: - Following Tab

    private var followingTab: some View {
        NavigationLink {
            FollowersListView(userId: vm.userId, listType: "following")
        } label: {
            HStack {
                Text("View all following")
                    .font(.system(size: 14))
                    .foregroundColor(.white)
                Spacer()
                Text("\(vm.user?.followingCount ?? 0)")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundColor(DojoTheme.textMuted)
            }
            .padding(16)
            .background(DojoTheme.piuCard)
            .cornerRadius(12)
        }
        .padding(16)
    }

    // MARK: - PIU Data Tab

    private func piuDataTab(_ user: User) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            NavigationLink {
                PumbilityBreakdownView(userId: vm.userId)
            } label: {
                piuRow(icon: "chart.bar.fill", title: "Pumbility Breakdown", color: DojoTheme.piuGold)
            }

            NavigationLink {
                SongAnalyticsView(userId: vm.userId)
            } label: {
                piuRow(icon: "music.note.list", title: "Best Scores", color: DojoTheme.piuBlue)
            }

            NavigationLink {
                SkillsView()
            } label: {
                piuRow(icon: "star.fill", title: "Skills", color: Color.orange)
            }

            // Achievements
            if !vm.achievements.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("ACHIEVEMENTS")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(DojoTheme.piuGold)
                        .padding(.top, 8)

                    ForEach(vm.achievements) { badge in
                        achievementRow(badge)
                    }
                }
            }
        }
        .padding(16)
    }

    private func achievementRow(_ badge: AchievementBadge) -> some View {
        HStack(spacing: 12) {
            achievementBadgeImage(badge, size: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(badge.name ?? "Achievement")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)

                if let desc = badge.description {
                    Text(desc)
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                        .lineLimit(2)
                }

                // Progress bar if has threshold
                if let threshold = badge.threshold, let current = badge.currentValue, threshold > 0 {
                    let progress = min(1.0, Double(current) / Double(threshold))
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(DojoTheme.piuBorder)
                                .frame(height: 4)
                            RoundedRectangle(cornerRadius: 2)
                                .fill(DojoTheme.piuGold)
                                .frame(width: geo.size.width * progress, height: 4)
                        }
                    }
                    .frame(height: 4)

                    Text("\(current)/\(threshold)")
                        .font(.system(size: 9))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            Spacer()
        }
        .padding(12)
        .background(DojoTheme.piuCard)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(DojoTheme.piuGold.opacity(0.2), lineWidth: 1)
        )
    }

    private func piuRow(icon: String, title: String, color: Color) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(color)
                .frame(width: 32, height: 32)
                .background(color.opacity(0.15))
                .cornerRadius(8)

            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundColor(DojoTheme.textMuted)
        }
        .padding(14)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Stats Tab

    private var statsTab: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let stats = vm.stats {
                if let tournaments = stats.tournaments, !tournaments.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("TOURNAMENTS")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)

                        ForEach(tournaments) { t in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(t.tournamentName ?? "Tournament")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.white)
                                    if let date = t.tournamentDate {
                                        Text(date)
                                            .font(.system(size: 11))
                                            .foregroundColor(DojoTheme.textMuted)
                                    }
                                }
                                Spacer()
                                HStack(spacing: 8) {
                                    Text("\(t.wins ?? 0)W")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(DojoTheme.piuGreen)
                                    Text("\(t.losses ?? 0)L")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(DojoTheme.piuAccent)
                                }
                            }
                            .padding(12)
                            .background(DojoTheme.piuCard)
                            .cornerRadius(10)
                        }
                    }
                }

                if let duels = stats.duels, !duels.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("DUELS")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)

                        ForEach(duels) { d in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(d.name ?? "Duel")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.white)
                                    Text("\(d.player1Name ?? "?") vs \(d.player2Name ?? "?")")
                                        .font(.system(size: 11))
                                        .foregroundColor(DojoTheme.textMuted)
                                }
                                Spacer()
                                Text(d.winner != nil ? "Completed" : "Active")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(d.winner != nil ? DojoTheme.piuGreen : DojoTheme.piuGold)
                            }
                            .padding(12)
                            .background(DojoTheme.piuCard)
                            .cornerRadius(10)
                        }
                    }
                }
            }

            if (vm.stats?.tournaments?.isEmpty ?? true) && (vm.stats?.duels?.isEmpty ?? true) {
                VStack(spacing: 8) {
                    Image(systemName: "trophy")
                        .font(.system(size: 28))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.4))
                    Text("No competition history yet")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                }
                .frame(maxWidth: .infinity)
                .padding(40)
            }
        }
        .padding(16)
    }

    // MARK: - Achievement Helpers

    private var highestPerSeries: [AchievementBadge] {
        var seen: [String: AchievementBadge] = [:]
        for badge in vm.achievements {
            let key = badge.seriesId ?? badge.id
            let existing = seen[key]
            if existing == nil || (badge.threshold ?? 0) > (existing?.threshold ?? 0) {
                seen[key] = badge
            }
        }
        return Array(seen.values).sorted { ($0.seriesName ?? "") < ($1.seriesName ?? "") }
    }

    private func achievementBadgeImage(_ badge: AchievementBadge, size: CGFloat) -> some View {
        Group {
            if let img = badge.image, img.hasPrefix("data:image/svg") {
                SVGImageView(svgData: img)
            } else if let uiImage = decodeBase64Image(badge.image) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
            } else if let urlStr = badge.image, let url = URL(string: urlStr), urlStr.hasPrefix("http") {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFit()
                    default:
                        badgePlaceholder(badge.name, size: size)
                    }
                }
            } else {
                badgePlaceholder(badge.name, size: size)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(DojoTheme.piuGold, lineWidth: 1.5))
    }

    private func badgePlaceholder(_ name: String?, size: CGFloat) -> some View {
        Circle().fill(DojoTheme.piuBorder)
            .overlay(
                Text(String((name ?? "?").prefix(1)))
                    .font(.system(size: size * 0.4, weight: .bold))
                    .foregroundColor(.white)
            )
    }

    /// Decode base64 image, handling optional data URL prefix
    private func decodeBase64Image(_ str: String?) -> UIImage? {
        guard let str = str, !str.isEmpty else { return nil }
        // Strip data URL prefix if present
        let base64: String
        if let range = str.range(of: ";base64,") {
            base64 = String(str[range.upperBound...])
        } else {
            base64 = str
        }
        guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else { return nil }
        return UIImage(data: data)
    }

    private func achievementSeriesSheet(seriesId: String) -> some View {
        let badges = vm.achievements.filter { ($0.seriesId ?? $0.id) == seriesId }
        let seriesName = badges.first?.seriesName ?? "Achievements"

        return NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(badges) { badge in
                            achievementRow(badge)
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle(seriesName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { selectedAchievementSeries = nil }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: - Helpers

    private func modeBadge(_ mode: String, level: Int) -> some View {
        let isDouble = mode.lowercased().hasPrefix("d") || mode.lowercased() == "double"
        let label = isDouble ? "D" : "S"
        let color = isDouble ? DojoTheme.piuGreen : DojoTheme.piuAccent

        return HStack(spacing: 2) {
            Text(label)
                .font(.system(size: 9, weight: .bold))
            Text("\(level)")
                .font(.system(size: 10, weight: .bold))
        }
        .foregroundColor(color)
        .padding(.horizontal, 5)
        .padding(.vertical, 2)
        .background(color.opacity(0.15))
        .cornerRadius(4)
    }

    private func gradeColor(_ grade: String) -> Color {
        switch grade.uppercased() {
        case "SSS+", "SSS": return DojoTheme.piuGold
        case "SS+", "SS": return Color(hex: "#c0c0c0")
        case "S+", "S": return DojoTheme.piuBlue
        case "A+", "A": return DojoTheme.piuGreen
        default: return DojoTheme.textMuted
        }
    }

    private func formatMemberSince(_ dateStr: String) -> String {
        let formatter = DateFormatter()
        // Try ISO8601 first
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        if let date = formatter.date(from: dateStr) {
            let output = DateFormatter()
            output.dateFormat = "MMM yyyy"
            return output.string(from: date)
        }
        // Try simple date
        formatter.dateFormat = "yyyy-MM-dd"
        if let date = formatter.date(from: dateStr) {
            let output = DateFormatter()
            output.dateFormat = "MMM yyyy"
            return output.string(from: date)
        }
        return ""
    }

    private func formatHeatmapDate(_ key: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: key) else { return key }
        let output = DateFormatter()
        output.dateFormat = "EEEE, MMM d"
        return output.string(from: date)
    }

    private func timeAgo(_ dateStr: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        guard let date = formatter.date(from: dateStr) else { return dateStr }
        let interval = Date().timeIntervalSince(date)
        if interval < 60 { return "just now" }
        if interval < 3600 { return "\(Int(interval / 60))m ago" }
        if interval < 86400 { return "\(Int(interval / 3600))h ago" }
        if interval < 604800 { return "\(Int(interval / 86400))d ago" }
        let output = DateFormatter()
        output.dateFormat = "MMM d"
        return output.string(from: date)
    }

    // MARK: - Heatmap Data Helpers

    private func buildWeeks(year: Int) -> [[Date?]] {
        let calendar = Calendar.current
        var components = DateComponents()
        components.year = year
        components.month = 1
        components.day = 1
        guard let startOfYear = calendar.date(from: components) else { return [] }

        components.year = year
        components.month = 12
        components.day = 31
        guard let endOfYear = calendar.date(from: components) else { return [] }

        // Adjust to start from Sunday
        let startWeekday = calendar.component(.weekday, from: startOfYear) - 1 // 0 = Sunday

        var weeks: [[Date?]] = []
        var currentWeek: [Date?] = Array(repeating: nil, count: startWeekday)
        var currentDate = startOfYear

        while currentDate <= endOfYear {
            currentWeek.append(currentDate)
            if currentWeek.count == 7 {
                weeks.append(currentWeek)
                currentWeek = []
            }
            currentDate = calendar.date(byAdding: .day, value: 1, to: currentDate) ?? currentDate
        }

        // Pad last week
        if !currentWeek.isEmpty {
            while currentWeek.count < 7 {
                currentWeek.append(nil)
            }
            weeks.append(currentWeek)
        }

        return weeks
    }

    private func buildMonthLabels(year: Int, weeks: [[Date?]]) -> [String] {
        let calendar = Calendar.current
        let monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        var labels: [String] = []
        var lastMonth = -1

        for week in weeks {
            // Use the first non-nil date in the week
            if let date = week.compactMap({ $0 }).first {
                let month = calendar.component(.month, from: date)
                if month != lastMonth {
                    labels.append(monthNames[month - 1])
                    lastMonth = month
                } else {
                    labels.append("")
                }
            } else {
                labels.append("")
            }
        }

        return labels
    }
}
