import UIKit

/// Resolves achievement badge images from local bundle first, falling back to data URI decoding.
final class BadgeImageCache {
    static let shared = BadgeImageCache()
    private var cache: [String: UIImage] = [:]

    private init() {}

    /// Quick lookup for local bundle badge image (no data URI fallback).
    func localBadgeImage(seriesKey: String?, threshold: Int?) -> UIImage? {
        guard let key = seriesKey, !key.isEmpty, let thresh = threshold, thresh > 0 else { return nil }
        let cacheKey = "\(key)_\(thresh)"
        if let cached = cache[cacheKey] { return cached }

        // Look in Resources/badges/
        if let path = Bundle.main.path(forResource: cacheKey, ofType: "png", inDirectory: "badges") {
            if let img = UIImage(contentsOfFile: path) {
                cache[cacheKey] = img
                return img
            }
        }
        // Flat bundle fallback
        if let path = Bundle.main.path(forResource: cacheKey, ofType: "png") {
            if let img = UIImage(contentsOfFile: path) {
                cache[cacheKey] = img
                return img
            }
        }
        return nil
    }

    /// Try to resolve a badge image from local bundle using series_key + threshold.
    /// Falls back to decoding base64 data URI if no local file found.
    func resolveImage(seriesKey: String?, threshold: Int?, imageDataURI: String?) -> UIImage? {
        // Try local bundle first
        if let key = seriesKey, !key.isEmpty, let thresh = threshold, thresh > 0 {
            let cacheKey = "\(key)_\(thresh)"
            if let cached = cache[cacheKey] { return cached }

            // Look in Resources/badges/
            if let path = Bundle.main.path(forResource: cacheKey, ofType: "png", inDirectory: "badges") {
                if let img = UIImage(contentsOfFile: path) {
                    cache[cacheKey] = img
                    return img
                }
            }
            // Also try without directory (flat bundle)
            if let path = Bundle.main.path(forResource: cacheKey, ofType: "png") {
                if let img = UIImage(contentsOfFile: path) {
                    cache[cacheKey] = img
                    return img
                }
            }
        }

        // Fallback: decode data URI
        guard let uri = imageDataURI, !uri.isEmpty else { return nil }

        // WebP and PNG data URIs
        if let range = uri.range(of: ";base64,") {
            let base64 = String(uri[range.upperBound...])
            if let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) {
                let img = UIImage(data: data)
                // Cache it
                if let key = seriesKey, !key.isEmpty, let thresh = threshold, thresh > 0 {
                    cache["\(key)_\(thresh)"] = img
                }
                return img
            }
        }

        return nil
    }
}
