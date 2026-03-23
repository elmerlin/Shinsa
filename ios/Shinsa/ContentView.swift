import SwiftUI

struct ContentView: View {
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var notificationPoller: NotificationPoller
    @State private var selectedTab = 0
    @State private var isDrawerOpen = false

    var body: some View {
        Group {
            if auth.isLoading {
                ZStack {
                    DojoTheme.piuBg.ignoresSafeArea()
                    VStack(spacing: 16) {
                        HStack(spacing: 0) {
                            Text("PUMP")
                                .font(.system(size: 28, weight: .bold))
                                .foregroundColor(DojoTheme.piuGold)
                            Text(" SHINSA")
                                .font(.system(size: 28, weight: .bold))
                                .foregroundColor(.white)
                        }
                        ProgressView()
                            .tint(DojoTheme.piuAccent)
                    }
                }
            } else if auth.isLoggedIn {
                ZStack {
                    TabView(selection: $selectedTab) {
                        NavigationStack {
                            DashboardView()
                                .navigationDestination(for: String.self) { route in
                                    routeDestination(route)
                                }
                                .toolbar {
                                    ToolbarItemGroup(placement: .navigationBarTrailing) {
                                        toolbarButtons
                                    }
                                }
                        }
                        .tabItem {
                            Image(systemName: "house.fill")
                            Text("Home")
                        }
                        .tag(0)

                        NavigationStack {
                            FeedView()
                                .navigationDestination(for: String.self) { route in
                                    routeDestination(route)
                                }
                                .toolbar {
                                    ToolbarItemGroup(placement: .navigationBarTrailing) {
                                        toolbarButtons
                                    }
                                }
                        }
                        .tabItem {
                            Image(systemName: "list.bullet")
                            Text("Feed")
                        }
                        .tag(1)

                        NavigationStack {
                            PostComposerView()
                                .toolbar {
                                    ToolbarItemGroup(placement: .navigationBarTrailing) {
                                        toolbarButtons
                                    }
                                }
                        }
                        .tabItem {
                            Image(systemName: "plus.circle.fill")
                            Text("Posts")
                        }
                        .tag(2)

                        NavigationStack {
                            TiersView()
                                .navigationDestination(for: String.self) { route in
                                    routeDestination(route)
                                }
                                .toolbar {
                                    ToolbarItemGroup(placement: .navigationBarTrailing) {
                                        toolbarButtons
                                    }
                                }
                        }
                        .tabItem {
                            Image(systemName: "chart.bar.fill")
                            Text("Tiers")
                        }
                        .tag(3)

                        NavigationStack {
                            ProfileView(userId: auth.userId)
                                .navigationDestination(for: String.self) { route in
                                    routeDestination(route)
                                }
                                .toolbar {
                                    ToolbarItemGroup(placement: .navigationBarTrailing) {
                                        toolbarButtons
                                    }
                                }
                        }
                        .tabItem {
                            Image(systemName: "person.fill")
                            Text("Profile")
                        }
                        .tag(4)
                    }
                    .tint(DojoTheme.piuAccent)

                    // Side drawer overlay
                    SideDrawerView(isOpen: $isDrawerOpen)
                }
            } else {
                NavigationStack {
                    LoginView()
                }
            }
        }
    }

    // MARK: - Toolbar Buttons

    @ViewBuilder
    private var toolbarButtons: some View {
        NavigationLink {
            MessagesListView()
        } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "bubble.left.and.bubble.right")
                    .font(.system(size: 15))
                    .foregroundColor(.white)
            }
        }

        NavigationLink {
            NotificationsView()
        } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "bell.fill")
                    .font(.system(size: 15))
                    .foregroundColor(.white)

                if notificationPoller.unreadCount + notificationPoller.invitationCount > 0 {
                    Text("\(notificationPoller.unreadCount + notificationPoller.invitationCount)")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.white)
                        .padding(3)
                        .background(DojoTheme.piuAccent)
                        .clipShape(Circle())
                        .offset(x: 6, y: -6)
                }
            }
        }

        Button {
            withAnimation(.easeInOut(duration: 0.25)) {
                isDrawerOpen = true
            }
        } label: {
            Image(systemName: "line.3.horizontal")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)
        }
    }

    // MARK: - Route Destination

    @ViewBuilder
    private func routeDestination(_ route: String) -> some View {
        let parts = route.split(separator: "/", maxSplits: 1).map(String.init)
        let prefix = parts.first ?? ""
        let param = parts.count > 1 ? parts[1] : ""

        switch prefix {
        case "tournament":
            if param == "new" {
                TournamentSetupView()
            } else {
                TournamentDetailView(tournamentId: param)
            }
        case "match":
            MatchDetailView(matchId: param)
        case "online-duel":
            if param == "new" {
                OnlineDuelSetupView()
            } else {
                OnlineDuelRoomView(duelId: param)
            }
        case "profile":
            ProfileView(userId: param)
        case "song-chart":
            SongChartView(chartId: Int(param) ?? 0)
        case "skill-charts":
            SkillChartsView(skillSlug: param)
        case "live-session":
            LiveSessionView(sessionId: param)
        case "world-max":
            WorldMaxMachineView(machineId: param)
        default:
            Text("Page not found")
                .foregroundColor(DojoTheme.textMuted)
        }
    }
}

// MARK: - Side Drawer

struct SideDrawerView: View {
    @Binding var isOpen: Bool
    @EnvironmentObject var auth: AuthManager

    private let drawerWidth: CGFloat = 300

    var body: some View {
        ZStack {
            // Semi-transparent overlay
            if isOpen {
                Color.black.opacity(0.5)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            isOpen = false
                        }
                    }
            }

            // Drawer panel from the right
            HStack {
                Spacer()

                if isOpen {
                    drawerContent
                        .frame(width: drawerWidth)
                        .background(DojoTheme.piuDark)
                        .transition(.move(edge: .trailing))
                }
            }
        }
        .animation(.easeInOut(duration: 0.25), value: isOpen)
    }

    private var drawerContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            // User header
            HStack(spacing: 12) {
                AvatarView(auth.currentUser?.avatar, name: auth.currentUser?.username ?? "?", size: 44)

                VStack(alignment: .leading, spacing: 2) {
                    Text(auth.currentUser?.username ?? "User")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)

                    if let skill = auth.currentUser?.skillTitle {
                        Text(skill)
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.piuGold)
                    }
                }

                Spacer()

                Button {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        isOpen = false
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(DojoTheme.textMuted)
                        .padding(8)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 12)

            Divider().background(DojoTheme.piuBorder)

            // Menu items
            ScrollView {
                VStack(spacing: 2) {
                    drawerLink(icon: "person.fill", title: "My Profile") {
                        ProfileView(userId: auth.userId)
                    }
                    drawerLink(icon: "square.and.pencil", title: "Posts") {
                        PostComposerView()
                    }
                    drawerLink(icon: "video.fill", title: "Shinsa Live") {
                        LiveDirectoryView()
                    }
                    drawerLink(icon: "globe", title: "World Max") {
                        WorldMaxView()
                    }
                    drawerLink(icon: "music.note", title: "Songs") {
                        SongsView()
                    }
                    drawerLink(icon: "checklist", title: "Lists") {
                        ListsView()
                    }
                    drawerLink(icon: "trophy.fill", title: "Leaderboards") {
                        LeaderboardsView()
                    }
                    drawerLink(icon: "figure.walk", title: "Shoes") {
                        ShoesView()
                    }
                    drawerLink(icon: "wand.and.stars", title: "Optimise") {
                        OptimiseView()
                    }
                    drawerLink(icon: "chart.bar.fill", title: "Tiers") {
                        TiersView()
                    }
                    drawerLink(icon: "person.2.fill", title: "Rivals") {
                        HeadToHeadView()
                    }
                    drawerLink(icon: "mappin.circle.fill", title: "Check In") {
                        CheckinView()
                    }
                    drawerLink(icon: "person.3.fill", title: "Communities") {
                        CommunitiesListView()
                    }
                    drawerLink(icon: "bubble.left.and.bubble.right.fill", title: "Messages") {
                        MessagesListView()
                    }
                    drawerLink(icon: "doc.text.fill", title: "Changelog") {
                        ChangelogView()
                    }
                    drawerLink(icon: "gearshape.fill", title: "Profile Settings") {
                        MyAccountView()
                    }

                    // Admin link (show for all for now, view itself checks permissions)
                    drawerLink(icon: "shield.fill", title: "Admin") {
                        AdminPanelView()
                    }
                }
                .padding(.vertical, 8)
            }

            Divider().background(DojoTheme.piuBorder)

            // Logout button
            Button {
                withAnimation(.easeInOut(duration: 0.25)) {
                    isOpen = false
                }
                auth.logout()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 15))
                        .foregroundColor(.red)

                    Text("Logout")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.red)

                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
        }
    }

    private func drawerLink<Destination: View>(icon: String, title: String, @ViewBuilder destination: @escaping () -> Destination) -> some View {
        NavigationLink {
            destination()
                .onAppear {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        isOpen = false
                    }
                }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 15))
                    .foregroundColor(DojoTheme.textSecondary)
                    .frame(width: 24)

                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 10))
                    .foregroundColor(DojoTheme.textMuted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
    }
}
