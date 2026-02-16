import SwiftUI

struct ImageLightboxView: View {
    let images: [String]
    let initialIndex: Int
    @Environment(\.dismiss) var dismiss
    @State private var currentIndex: Int

    init(images: [String], initialIndex: Int = 0) {
        self.images = images
        self.initialIndex = initialIndex
        _currentIndex = State(initialValue: initialIndex)
    }

    private func fullURL(for urlStr: String) -> URL? {
        if urlStr.hasPrefix("http") { return URL(string: urlStr) }
        let base = APIService.shared.baseURL
        let path = urlStr.hasPrefix("/") ? urlStr : "/\(urlStr)"
        return URL(string: "\(base)\(path)")
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Image pager
            TabView(selection: $currentIndex) {
                ForEach(Array(images.enumerated()), id: \.offset) { index, urlStr in
                    if let url = fullURL(for: urlStr) {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fit)
                            case .failure:
                                VStack(spacing: 8) {
                                    Image(systemName: "photo.fill")
                                        .font(.system(size: 40))
                                        .foregroundColor(DojoTheme.textMuted)
                                    Text("Failed to load")
                                        .font(.system(size: 12))
                                        .foregroundColor(DojoTheme.textMuted)
                                }
                            default:
                                ProgressView()
                                    .tint(.white)
                            }
                        }
                        .tag(index)
                    }
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            // Close button
            VStack {
                HStack {
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 36, height: 36)
                            .background(Color.white.opacity(0.2))
                            .clipShape(Circle())
                    }
                    .padding(.trailing, 16)
                    .padding(.top, 8)
                }
                Spacer()
            }

            // Image counter
            if images.count > 1 {
                VStack {
                    Spacer()
                    Text("\(currentIndex + 1) / \(images.count)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.white.opacity(0.8))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(Color.black.opacity(0.5))
                        .cornerRadius(12)
                        .padding(.bottom, 40)
                }
            }
        }
        .statusBarHidden(true)
    }
}
