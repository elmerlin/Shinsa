import Foundation

struct RecentActivity: Codable, Identifiable {
    var id: String { "\(type)-\(createdAt ?? "")-\(username ?? "")" }
    let type: String
    let createdAt: String?
    let message: String
    let link: String
    let avatar: String?
    let username: String?
    let nationality: String?

    enum CodingKeys: String, CodingKey {
        case type, message, link, avatar, username, nationality
        case createdAt = "created_at"
    }

    var icon: String {
        switch type {
        case "new_user": return "\u{1F464}"
        case "upscore": return "\u{1F4C8}"
        case "new_clear": return "\u{1F3AF}"
        case "new_post": return "\u{1F4DD}"
        case "new_tournament": return "\u{1F3C6}"
        case "new_duel": return "\u{2694}\u{FE0F}"
        case "new_online_duel": return "\u{1F310}"
        case "tournament_win": return "\u{1F947}"
        case "duel_win", "online_duel_win": return "\u{1F3C5}"
        default: return "\u{2022}"
        }
    }

    var iconColor: String {
        switch type {
        case "new_user": return "accent"
        case "upscore": return "green"
        case "new_clear": return "blue"
        case "new_post": return "purple"
        case "new_tournament": return "gold"
        case "new_duel": return "red"
        case "new_online_duel": return "blue"
        case "tournament_win", "duel_win", "online_duel_win": return "gold"
        default: return "gray"
        }
    }
}
