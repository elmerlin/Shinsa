import SwiftUI

struct ShoesView: View {
    @State private var shoes: [Shoe] = []
    @State private var isLoading = true

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if isLoading {
                ProgressView()
                    .tint(DojoTheme.piuAccent)
            } else if shoes.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "shoe")
                        .font(.system(size: 32))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.5))
                    Text("No shoes in the catalog")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)
                }
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(shoes) { shoe in
                            shoeCard(shoe)
                        }
                    }
                    .padding()
                }
                .refreshable { await loadShoes() }
            }
        }
        .navigationTitle("Shoes")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadShoes() }
    }

    // MARK: - Shoe Card

    private func shoeCard(_ shoe: Shoe) -> some View {
        VStack(spacing: 8) {
            // Shoe image
            if let img = shoe.image, !img.isEmpty, let url = fullURL(img) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(height: 120)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    default:
                        shoePlaceholder
                    }
                }
            } else {
                shoePlaceholder
            }

            VStack(spacing: 4) {
                Text(shoe.name ?? "Unknown Shoe")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)

                if let brand = shoe.brand {
                    Text(brand)
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textSecondary)
                }

                if let count = shoe.userCount, count > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "person.2.fill")
                            .font(.system(size: 9))
                        Text("\(count) user\(count != 1 ? "s" : "")")
                            .font(.system(size: 10))
                    }
                    .foregroundColor(DojoTheme.textMuted)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    private var shoePlaceholder: some View {
        ZStack {
            LinearGradient(colors: [DojoTheme.piuAccent.opacity(0.15), DojoTheme.piuCard], startPoint: .topLeading, endPoint: .bottomTrailing)
            Image(systemName: "shoe")
                .font(.system(size: 28))
                .foregroundColor(DojoTheme.textMuted.opacity(0.5))
        }
        .frame(height: 120)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func fullURL(_ path: String) -> URL? {
        if path.hasPrefix("http") { return URL(string: path) }
        let base = APIService.shared.baseURL
        let p = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: "\(base)\(p)")
    }

    private func loadShoes() async {
        isLoading = true
        shoes = (try? await APIService.shared.getShoeTopStats()) ?? []
        isLoading = false
    }
}
