import SwiftUI
import UIKit
import UserNotifications

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in
            await NativePushRegistration.shared.storeDeviceToken(deviceToken)
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[Push] Failed to register for remote notifications: \(error.localizedDescription)")
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound, .badge]
    }
}

@MainActor
final class NativePushRegistration {
    static let shared = NativePushRegistration()

    private var deviceToken: String?
    private var hasRequestedPermission = false

    func requestAuthorizationAndRegister() {
        guard !hasRequestedPermission else {
            UIApplication.shared.registerForRemoteNotifications()
            return
        }
        hasRequestedPermission = true

        Task {
            do {
                let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
                guard granted else { return }
                UIApplication.shared.registerForRemoteNotifications()
            } catch {
                print("[Push] Notification permission request failed: \(error.localizedDescription)")
            }
        }
    }

    func storeDeviceToken(_ data: Data) async {
        deviceToken = data.map { String(format: "%02.2hhx", $0) }.joined()
        await registerStoredTokenIfPossible()
    }

    func registerStoredTokenIfPossible() async {
        guard let token = deviceToken, APIService.shared.token != nil else { return }
        do {
            _ = try await APIService.shared.registerNativePushToken(token)
        } catch {
            print("[Push] Failed to save native push token: \(error.localizedDescription)")
        }
    }
}

@main
struct ShinsaApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
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
                        NativePushRegistration.shared.requestAuthorizationAndRegister()
                        await NativePushRegistration.shared.registerStoredTokenIfPossible()
                        notificationPoller.start()
                    }
                }
                .onChange(of: authManager.isLoggedIn) { loggedIn in
                    if loggedIn {
                        NativePushRegistration.shared.requestAuthorizationAndRegister()
                        Task { await NativePushRegistration.shared.registerStoredTokenIfPossible() }
                        notificationPoller.start()
                    }
                    else { notificationPoller.stop() }
                }
        }
    }
}
