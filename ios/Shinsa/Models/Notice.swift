import Foundation

struct Notice: Codable, Identifiable {
    let id: String
    var title: String
    var content: String
    var pinned: Int
    var createdAt: String?

    var isPinned: Bool { pinned != 0 }

    enum CodingKeys: String, CodingKey {
        case id, title, content, pinned
        case createdAt = "created_at"
    }
}
