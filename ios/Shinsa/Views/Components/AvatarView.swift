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

    private var fullURL: URL? {
        guard let url, !url.isEmpty else { return nil }
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
        if let fullURL {
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
