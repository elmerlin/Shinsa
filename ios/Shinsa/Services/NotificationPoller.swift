import Foundation
import Combine

@MainActor
class NotificationPoller: ObservableObject {
    @Published var unreadCount: Int = 0
    @Published var notifications: [AppNotification] = []
    @Published var invitationCount: Int = 0

    private var timer: AnyCancellable?

    func start() {
        poll()
        timer = Timer.publish(every: 15, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.poll()
            }
    }

    func stop() {
        timer?.cancel()
        timer = nil
    }

    private func poll() {
        Task {
            do {
                let response = try await APIService.shared.getNotifications()
                notifications = response.notifications
                unreadCount = response.unreadCount
            } catch {}

            do {
                let invitations = try await APIService.shared.getInvitations()
                invitationCount = invitations.filter { $0.status == "pending" }.count
            } catch {}
        }
    }

    func markRead(_ id: Int) async {
        _ = try? await APIService.shared.markNotificationRead(id)
        if let idx = notifications.firstIndex(where: { $0.id == id }) {
            notifications[idx] = AppNotification(
                id: notifications[idx].id,
                userId: notifications[idx].userId,
                type: notifications[idx].type,
                title: notifications[idx].title,
                message: notifications[idx].message,
                read: 1,
                link: notifications[idx].link,
                createdAt: notifications[idx].createdAt
            )
        }
        unreadCount = max(0, unreadCount - 1)
    }

    func markAllRead() async {
        _ = try? await APIService.shared.markAllNotificationsRead()
        notifications = notifications.map {
            AppNotification(id: $0.id, userId: $0.userId, type: $0.type, title: $0.title, message: $0.message, read: 1, link: $0.link, createdAt: $0.createdAt)
        }
        unreadCount = 0
    }
}
