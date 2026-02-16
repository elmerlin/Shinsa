import SwiftUI

struct ContentView: View {
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var notificationPoller: NotificationPoller
    @State private var selectedTab = 0

    var body: some View {
        Group {
            if auth.isLoading {
                ZStack {
                    DojoTheme.piuBg.ignoresSafeArea()
                    VStack(spacing: 16) {
                        Text("PUMP SHINSA")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)
                        ProgressView()
                            .tint(DojoTheme.piuAccent)
                    }
                }
            } else if auth.isLoggedIn {
                TabView(selection: $selectedTab) {
                    NavigationStack {
                        DashboardView()
                    }
                    .tabItem {
                        Image(systemName: "house.fill")
                        Text("Home")
                    }
                    .tag(0)

                    NavigationStack {
                        FeedView()
                    }
                    .tabItem {
                        Image(systemName: "list.bullet")
                        Text("Feed")
                    }
                    .tag(1)

                    NavigationStack {
                        PostComposerView()
                    }
                    .tabItem {
                        Image(systemName: "plus.circle.fill")
                        Text("Post")
                    }
                    .tag(2)

                    NavigationStack {
                        NotificationsView()
                    }
                    .tabItem {
                        Image(systemName: "bell.fill")
                        Text("Alerts")
                    }
                    .badge(notificationPoller.unreadCount + notificationPoller.invitationCount)
                    .tag(3)

                    NavigationStack {
                        ProfileView(userId: auth.userId)
                    }
                    .tabItem {
                        Image(systemName: "person.fill")
                        Text("Profile")
                    }
                    .tag(4)
                }
                .tint(DojoTheme.piuAccent)
            } else {
                NavigationStack {
                    LoginView()
                }
            }
        }
    }
}

// All views moved to dedicated files:
// DashboardView → Views/Dashboard/DashboardView.swift
// FeedView → Views/Social/FeedView.swift
// PostComposerView → Views/Social/PostComposerView.swift
// NotificationsView → Views/Social/NotificationsView.swift
// ProfileView → Views/Profile/ProfileView.swift
