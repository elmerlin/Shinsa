import Foundation

struct ShoeCabinet: Codable {
    var shoes: [Shoe]?
    var lifetimeSteps: Int?
    var lifetimeSongs: Int?

    enum CodingKeys: String, CodingKey {
        case shoes
        case lifetimeSteps = "lifetime_steps"
        case lifetimeSongs = "lifetime_songs"
    }
}

struct Shoe: Codable, Identifiable {
    let id: String
    var name: String?
    var brand: String?
    var make: String?
    var model: String?
    var colorway: String?
    var image: String?
    var imageData: String?
    var userCount: Int?
    var userId: String?
    var isActive: Int?
    var isCurrent: Bool?
    var retiredAt: String?
    var songsLogged: Int?
    var stepsLogged: Int?
    var createdAt: String?
    var username: String?

    var isShoeActive: Bool { isActive != nil && isActive != 0 }

    enum CodingKeys: String, CodingKey {
        case id, name, brand, make, model, colorway, image, username
        case imageData = "image_data"
        case userCount = "user_count"
        case userId = "user_id"
        case isActive = "is_active"
        case isCurrent = "is_current"
        case retiredAt = "retired_at"
        case songsLogged = "songs_logged"
        case stepsLogged = "steps_logged"
        case createdAt = "created_at"
    }
}
