import Foundation

struct Shoe: Codable, Identifiable {
    let id: String
    var name: String?
    var brand: String?
    var model: String?
    var image: String?
    var userCount: Int?
    var userId: String?
    var isActive: Int?
    var createdAt: String?
    var username: String?

    var isShoeActive: Bool { isActive != nil && isActive != 0 }

    enum CodingKeys: String, CodingKey {
        case id, name, brand, model, image, username
        case userCount = "user_count"
        case userId = "user_id"
        case isActive = "is_active"
        case createdAt = "created_at"
    }
}
