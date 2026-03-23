import Foundation

struct Venue: Codable, Identifiable {
    let id: String
    var name: String?
    var slug: String?
    var address: String?
    var city: String?
    var country: String?
    var lat: Double?
    var lng: Double?
    var machineCount: Int?
    var activeUsers: Int?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, slug, address, city, country, lat, lng
        case machineCount = "machine_count"
        case activeUsers = "active_users"
        case createdAt = "created_at"
    }
}

struct CheckinStatus: Codable {
    var isCheckedIn: Bool?
    var venueId: String?
    var venueName: String?
    var checkinTime: String?
    var playingStatus: String?

    enum CodingKeys: String, CodingKey {
        case isCheckedIn = "is_checked_in"
        case venueId = "venue_id"
        case venueName = "venue_name"
        case checkinTime = "checkin_time"
        case playingStatus = "playing_status"
    }
}

struct CheckinHistory: Codable, Identifiable {
    let id: String
    var venueId: String?
    var venueName: String?
    var checkinTime: String?
    var checkoutTime: String?
    var duration: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case venueId = "venue_id"
        case venueName = "venue_name"
        case checkinTime = "checkin_time"
        case checkoutTime = "checkout_time"
        case duration
    }
}
