import SwiftUI

struct SkillChartsView: View {
    let skillSlug: String
    @State private var charts: [ChartDetail] = []
    @State private var isLoading = true

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if isLoading {
                ProgressView()
                    .tint(DojoTheme.piuAccent)
            } else if charts.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "music.note.list")
                        .font(.system(size: 32))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.5))
                    Text("No charts for this skill")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(charts) { chart in
                            NavigationLink(value: "song-chart/\(chart.id)") {
                                chartRow(chart)
                            }
                        }
                    }
                    .padding(.top, 4)
                }
            }
        }
        .navigationTitle("Skill Charts")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadCharts() }
    }

    // MARK: - Chart Row

    private func chartRow(_ chart: ChartDetail) -> some View {
        HStack(spacing: 12) {
            // Jacket placeholder
            jacketView(chart.jacketUrl, title: chart.title ?? "")

            VStack(alignment: .leading, spacing: 3) {
                Text(chart.title ?? "Unknown")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                Text(chart.artist ?? "Unknown Artist")
                    .font(.system(size: 12))
                    .foregroundColor(DojoTheme.textMuted)
                    .lineLimit(1)
            }

            Spacer()

            let isSingle = chart.mode == "Single"
            Text("\(isSingle ? "S" : "D")\(chart.level ?? 0)")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(isSingle ? Color.red.opacity(0.7) : Color.green.opacity(0.7))
                .cornerRadius(6)

            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundColor(DojoTheme.textMuted)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(DojoTheme.piuCard)
    }

    // MARK: - Jacket

    private func jacketView(_ url: String?, title: String) -> some View {
        Group {
            if let url, !url.isEmpty, let imgURL = fullURL(url) {
                AsyncImage(url: imgURL) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 44, height: 44)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    default:
                        jacketPlaceholder
                    }
                }
            } else {
                jacketPlaceholder
            }
        }
    }

    private var jacketPlaceholder: some View {
        ZStack {
            LinearGradient(colors: [DojoTheme.piuAccent.opacity(0.3), DojoTheme.piuCard], startPoint: .topLeading, endPoint: .bottomTrailing)
            Image(systemName: "music.note")
                .font(.system(size: 16))
                .foregroundColor(DojoTheme.textMuted)
        }
        .frame(width: 44, height: 44)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func fullURL(_ path: String) -> URL? {
        if path.hasPrefix("http") { return URL(string: path) }
        let base = APIService.shared.baseURL
        let p = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: "\(base)\(p)")
    }

    private func loadCharts() async {
        isLoading = true
        charts = (try? await APIService.shared.getSkillCharts(skillSlug)) ?? []
        isLoading = false
    }
}
