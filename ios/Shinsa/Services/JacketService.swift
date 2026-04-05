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

    /// Resolve a jacket to a local bundle URL (instant) or remote URL (fallback).
    func resolveJacketURL(title: String?, mode: String?, level: Int?, backgroundUrl: String? = nil) -> URL? {
        let normalized = (title ?? "").lowercased()
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        guard !normalized.isEmpty else { return nil }

        // Try exact key with mode|level, then title-only
        var jacketPath: String?
        if let mode = mode, let level = level {
            let exactKey = "\(normalized)|\(mode)|\(level)"
            jacketPath = jacketMap[exactKey]
        }
        if jacketPath == nil {
            jacketPath = jacketMap[normalized]
        }

        // Resolve from local bundle first
        if let path = jacketPath {
            // Path looks like "/jackets/pump/21.jpg" — extract filename
            let filename = (path as NSString).lastPathComponent
            let nameOnly = (filename as NSString).deletingPathExtension

            if let bundleURL = Bundle.main.url(forResource: nameOnly, withExtension: "jpg", subdirectory: "jackets") {
                return bundleURL
            }
            // Fallback to remote if not in bundle
            let baseURL = APIService.shared.baseURL.replacingOccurrences(of: "/api", with: "")
            return URL(string: "\(baseURL)\(path)")
        }

        // Fall back to backgroundUrl (filter out piugame URLs)
        if let bg = backgroundUrl, !bg.isEmpty, !bg.contains("piugame") {
            if bg.hasPrefix("http") {
                return URL(string: bg)
            }
            let baseURL = APIService.shared.baseURL.replacingOccurrences(of: "/api", with: "")
            return URL(string: "\(baseURL)\(bg)")
        }

        return nil
    }
}
