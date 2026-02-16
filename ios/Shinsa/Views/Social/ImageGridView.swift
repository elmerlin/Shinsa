import SwiftUI

struct ImageGridView: View {
    let urls: [String]

    private var fullURLs: [URL] {
        urls.compactMap { urlStr in
            if urlStr.hasPrefix("http") { return URL(string: urlStr) }
            let base = APIService.shared.baseURL
            let path = urlStr.hasPrefix("/") ? urlStr : "/\(urlStr)"
            return URL(string: "\(base)\(path)")
        }
    }

    var body: some View {
        let imageURLs = fullURLs
        let count = imageURLs.count

        if count == 1 {
            imageView(imageURLs[0])
                .frame(maxHeight: 300)
                .cornerRadius(8)
        } else if count == 2 {
            HStack(spacing: 4) {
                imageView(imageURLs[0]).cornerRadius(8)
                imageView(imageURLs[1]).cornerRadius(8)
            }
            .frame(maxHeight: 200)
        } else if count == 3 {
            HStack(spacing: 4) {
                imageView(imageURLs[0]).cornerRadius(8)
                VStack(spacing: 4) {
                    imageView(imageURLs[1]).cornerRadius(8)
                    imageView(imageURLs[2]).cornerRadius(8)
                }
            }
            .frame(maxHeight: 200)
        } else if count >= 4 {
            let columns = [GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4), GridItem(.flexible(), spacing: 4)]
            LazyVGrid(columns: columns, spacing: 4) {
                ForEach(Array(imageURLs.prefix(9).enumerated()), id: \.offset) { _, url in
                    imageView(url)
                        .aspectRatio(1, contentMode: .fill)
                        .cornerRadius(6)
                }
            }
        }
    }

    private func imageView(_ url: URL) -> some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .clipped()
            default:
                Rectangle()
                    .fill(DojoTheme.piuDark)
            }
        }
    }
}
