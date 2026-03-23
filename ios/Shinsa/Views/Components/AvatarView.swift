import SwiftUI

struct AvatarView: View {
    let url: String?
    let name: String
    let size: CGFloat

    init(_ url: String?, name: String, size: CGFloat = 40) {
        self.url = url
        self.name = name
        self.size = size
    }

    /// Check if the URL is a base64 data URI and decode it
    private var base64Image: UIImage? {
        guard let url, url.hasPrefix("data:image/") else { return nil }
        // SVG data URIs can't be decoded to UIImage
        if url.hasPrefix("data:image/svg") { return nil }
        guard let range = url.range(of: ";base64,") else { return nil }
        let base64 = String(url[range.upperBound...])
        guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else { return nil }
        return UIImage(data: data)
    }

    private var fullURL: URL? {
        guard let url, !url.isEmpty else { return nil }
        // Skip data URIs - handled by base64Image
        if url.hasPrefix("data:") { return nil }
        if url.hasPrefix("http") { return URL(string: url) }
        let base = APIService.shared.baseURL
        let path = url.hasPrefix("/") ? url : "/\(url)"
        return URL(string: "\(base)\(path)")
    }

    private var initial: String {
        String(name.prefix(1)).uppercased()
    }

    private var gradientIndex: Int {
        abs(name.hashValue) % DojoTheme.avatarGradients.count
    }

    var body: some View {
        if let uiImage = base64Image {
            Image(uiImage: uiImage)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: size * 0.2))
        } else if let fullURL {
            AsyncImage(url: fullURL) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: size, height: size)
                        .clipShape(RoundedRectangle(cornerRadius: size * 0.2))
                default:
                    placeholder
                }
            }
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        ZStack {
            DojoTheme.avatarGradient(for: gradientIndex)
            Text(initial)
                .font(.system(size: size * 0.4, weight: .bold))
                .foregroundColor(.white)
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.2))
    }
}
