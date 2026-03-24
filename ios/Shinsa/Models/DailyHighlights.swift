import Foundation

struct DailyHighlightsData: Codable {
    var topReplays: [HighlightItem]?
    var topUpscores: [HighlightItem]?
    var topClears: [HighlightItem]?

    enum CodingKeys: String, CodingKey {
        case topReplays = "topReplays"
        case topUpscores = "topUpscores"
        case topClears = "topClears"
    }
}

struct HighlightItem: Codable, Identifiable {
    var id: String { "\(upscoreId ?? clearId ?? playId ?? 0)_\(songTitle ?? "")" }
    var upscoreId: Int?
    var clearId: Int?
    var playId: Int?
    var songTitle: String?
    var mode: String?
    var level: Int?
    var score: Int?
    var newScore: Int?
    var oldScore: Int?
    var grade: String?
    var newGrade: String?
    var oldGrade: String?
    var plate: String?
    var backgroundUrl: String?
    var username: String?
    var avatar: String?
    var nationality: String?
    var replayEmbedUrl: String?
    var replayVideoId: String?

    enum CodingKeys: String, CodingKey {
        case mode, level, score, grade, plate, username, avatar, nationality
        case upscoreId = "upscore_id"
        case clearId = "clear_id"
        case playId = "id"
        case songTitle = "song_title"
        case newScore = "new_score"
        case oldScore = "old_score"
        case newGrade = "new_grade"
        case oldGrade = "old_grade"
        case backgroundUrl = "background_url"
        case replayEmbedUrl = "replay_embed_url"
        case replayVideoId = "replay_video_id"
    }
}
