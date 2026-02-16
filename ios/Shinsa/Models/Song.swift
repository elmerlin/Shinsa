import Foundation

struct Song: Codable, Identifiable {
    let id: Int
    var title: String
    var artist: String
    var jacketUrl: String?
    var mode: String
    var level: Int
    var bpm: String?
    var songKey: String?
    var flags: String?

    var isSingle: Bool { mode == "Single" }
    var isDouble: Bool { mode == "Double" }

    var levelBadge: String {
        let prefix = isSingle ? "S" : "D"
        return "\(prefix)\(level)"
    }

    enum CodingKeys: String, CodingKey {
        case id, title, artist, mode, level, bpm, flags
        case jacketUrl = "jacket_url"
        case songKey = "song_key"
    }
}
