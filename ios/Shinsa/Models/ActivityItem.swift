import Foundation

struct ActivityItem: Codable, Identifiable {
    let id: String
    var type: String?
    var category: String?
    var message: String?
    var detail: String?
    var link: String?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, type, category, message, detail, link
        case createdAt = "created_at"
    }
}
