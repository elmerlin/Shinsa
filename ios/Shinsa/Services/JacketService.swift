import Foundation

@MainActor
class JacketService: ObservableObject {
    static let shared = JacketService()

    @Published private(set) var jacketMap: [String: String] = [:]
    private var loaded = false

    func loadIfNeeded() async {
        guard !loaded else { return }
        loaded = true
        do {
            jacketMap = try await APIService.shared.getJacketMap()
        } catch {
            print("[JacketService] Failed to load jacket map: \(error)")
        }
    }

    func resolveJacketURL(title: String?, mode: String?, level: Int?, backgroundUrl: String? = nil) -> URL? {
        let normalized = (title ?? "").lowercased()
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        guard !normalized.isEmpty else { return nil }

        let baseURL = APIService.shared.baseURL.replacingOccurrences(of: "/api", with: "")

        // Try exact key with mode|level
        if let mode = mode, let level = level {
            let exactKey = "\(normalized)|\(mode)|\(level)"
            if let path = jacketMap[exactKey] {
                return URL(string: "\(baseURL)\(path)")
            }
        }

        // Try title-only
        if let path = jacketMap[normalized] {
            return URL(string: "\(baseURL)\(path)")
        }

        // Fall back to backgroundUrl (filter out piugame URLs)
        if let bg = backgroundUrl, !bg.isEmpty, !bg.contains("piugame") {
            if bg.hasPrefix("http") {
                return URL(string: bg)
            }
            return URL(string: "\(baseURL)\(bg)")
        }

        return nil
    }
}
