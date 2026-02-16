import SwiftUI

@main
struct ShinsaApp: App {
    @StateObject private var authManager = AuthManager()
    @StateObject private var notificationPoller = NotificationPoller()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authManager)
                .environmentObject(notificationPoller)
                .preferredColorScheme(.dark)
                .task {
                    await authManager.checkAuth()
                    if authManager.isLoggedIn {
                        notificationPoller.start()
                    }
                }
                .onChange(of: authManager.isLoggedIn) { loggedIn in
                    if loggedIn { notificationPoller.start() }
                    else { notificationPoller.stop() }
                }
        }
    }
}
