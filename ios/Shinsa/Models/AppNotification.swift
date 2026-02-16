import Foundation

struct AppNotification: Codable, Identifiable {
    let id: Int
    var userId: String?
    var type: String
    var title: String
    var message: String?
    var read: Int
    var link: String?
    var createdAt: String?

    var isRead: Bool { read != 0 }

    enum CodingKeys: String, CodingKey {
        case id, type, title, message, read, link
        case userId = "user_id"
        case createdAt = "created_at"
    }
}

struct NotificationsResponse: Codable {
    var notifications: [AppNotification]
    var unreadCount: Int

    enum CodingKeys: String, CodingKey {
        case notifications
        case unreadCount = "unread_count"
    }
}
