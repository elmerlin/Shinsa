import Foundation

struct WorldMaxMachine: Codable, Identifiable {
    let id: String
    var name: String?
    var address: String?
    var city: String?
    var country: String?
    var lat: Double?
    var lng: Double?
    var gameVersion: String?
    var machineType: String?
    var padCondition: String?
    var notes: String?
    var photos: [String]?
    var addedBy: String?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, address, city, country, lat, lng, notes, photos
        case gameVersion = "game_version"
        case machineType = "machine_type"
        case padCondition = "pad_condition"
        case addedBy = "added_by"
        case createdAt = "created_at"
    }
}

struct WorldMaxMeta: Codable {
    var gameVersions: [String]?
    var machineTypes: [String]?

    enum CodingKeys: String, CodingKey {
        case gameVersions = "game_versions"
        case machineTypes = "machine_types"
    }
}
