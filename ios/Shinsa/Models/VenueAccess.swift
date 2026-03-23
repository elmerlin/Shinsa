import Foundation

struct VenuePlan: Codable, Identifiable {
    let id: String
    var venueSlug: String?
    var name: String?
    var planType: String?  // "day_pass", "subscription"
    var price: Int?  // in cents
    var currency: String?
    var cadences: [PlanCadence]?
    var features: [String]?
    var isActive: Int?
    var createdAt: String?

    var priceFormatted: String {
        guard let p = price else { return "Free" }
        return String(format: "$%.2f", Double(p) / 100.0)
    }

    enum CodingKeys: String, CodingKey {
        case id, name, price, currency, cadences, features
        case venueSlug = "venue_slug"
        case planType = "plan_type"
        case isActive = "is_active"
        case createdAt = "created_at"
    }
}

struct PlanCadence: Codable, Identifiable {
    var id: String { key ?? UUID().uuidString }
    var key: String?
    var label: String?
    var price: Int?
    var intervalDays: Int?

    enum CodingKeys: String, CodingKey {
        case key, label, price
        case intervalDays = "interval_days"
    }
}

struct VenueAccessStatus: Codable {
    var hasAccess: Bool?
    var accessType: String?
    var expiresAt: String?
    var membership: VenueMembership?

    enum CodingKeys: String, CodingKey {
        case hasAccess = "has_access"
        case accessType = "access_type"
        case expiresAt = "expires_at"
        case membership
    }
}

struct VenueMembership: Codable {
    var planName: String?
    var status: String?
    var startDate: String?
    var endDate: String?
    var autoRenew: Bool?

    enum CodingKeys: String, CodingKey {
        case status
        case planName = "plan_name"
        case startDate = "start_date"
        case endDate = "end_date"
        case autoRenew = "auto_renew"
    }
}
