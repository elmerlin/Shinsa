import SwiftUI

struct SongsView: View {
    @StateObject private var vm = SongsViewModel()
    @EnvironmentObject var auth: AuthManager

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            VStack(spacing: 0) {
                titleBar
                searchBar

                if vm.isLoading {
                    Spacer()
                    ProgressView()
                        .tint(DojoTheme.piuAccent)
                    Spacer()
                } else if vm.filteredSongs.isEmpty {
                    Spacer()
                    VStack(spacing: 8) {
                        Image(systemName: "music.note.list")
                            .font(.system(size: 32))
                            .foregroundColor(DojoTheme.textMuted.opacity(0.5))
                        Text("No songs found")
                            .font(.system(size: 14))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 6) {
                            ForEach(vm.filteredSongs) { song in
                                songCard(song)
                            }
                        }
                        .padding(.horizontal)
                        .padding(.top, 8)
                        .padding(.bottom, 16)
                    }
                }
            }
        }
        .navigationTitle("Songs")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
    }

    // MARK: - Title Bar

    private var titleBar: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Songs")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.white)
                Text("\(vm.totalSongs) songs, \(vm.totalCharts) charts")
                    .font(.system(size: 11))
                    .foregroundColor(DojoTheme.textMuted)
            }

            Spacer()

            if auth.isLoggedIn {
                Button {} label: {
                    HStack(spacing: 4) {
                        Image(systemName: "star.fill")
                            .font(.system(size: 11))
                        Text("Recommend")
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(DojoTheme.piuAccent)
                    .cornerRadius(8)
                }
            }

            NavigationLink {
                HeadToHeadView()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "person.2.fill")
                        .font(.system(size: 11))
                    Text("Head to Head")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundColor(.black)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color(hex: "#f59e0b"))
                .cornerRadius(8)
            }
        }
        .padding(.horizontal)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundColor(DojoTheme.textMuted)

            TextField("Search songs by title or artist...", text: Binding(
                get: { vm.searchQuery },
                set: { vm.search($0) }
            ))
            .font(.system(size: 14))
            .foregroundColor(.white)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)

            if !vm.searchQuery.isEmpty {
                Button { vm.clearSearch() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }
        }
        .padding(10)
        .background(DojoTheme.piuCard)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
        .padding(.horizontal)
        .padding(.top, 8)
    }

    // MARK: - Song Card

    private func songCard(_ song: SongLibraryEntry) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                // Jacket image
                jacketView(song.jacketUrl, title: song.title ?? "")

                VStack(alignment: .leading, spacing: 4) {
                    Text(song.title ?? "Unknown")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)

                    Text(song.artist ?? "Unknown Artist")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textMuted)
                        .lineLimit(1)
                }

                Spacer()
            }

            // Chart badges grid
            if let charts = song.charts, !charts.isEmpty {
                chartBadgesGrid(charts)
            }
        }
        .padding(12)
        .background(
            LinearGradient(
                colors: [Color(hex: "#112947"), Color(hex: "#1b3554")],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder.opacity(0.5), lineWidth: 1)
        )
    }

    // MARK: - Chart Badges Grid

    private func chartBadgesGrid(_ charts: [SongLibraryChart]) -> some View {
        let sorted = charts.sorted { a, b in
            let modeOrder = ["Single": 0, "Double": 1, "CoOp": 2]
            let ma = modeOrder[a.mode ?? ""] ?? 3
            let mb = modeOrder[b.mode ?? ""] ?? 3
            if ma != mb { return ma < mb }
            return (a.level ?? 0) < (b.level ?? 0)
        }

        return FlowLayout(spacing: 6) {
            ForEach(sorted) { chart in
                NavigationLink(value: "song-chart/\(chart.chartId ?? 0)") {
                    chartBadge(chart)
                }
            }
        }
    }

    private func chartBadge(_ chart: SongLibraryChart) -> some View {
        let bgColor: Color = {
            switch chart.mode {
            case "Single": return Color(hex: "#dc2626")
            case "Double": return Color(hex: "#16a34a")
            case "CoOp": return Color(hex: "#7c3aed")
            default: return DojoTheme.textMuted
            }
        }()

        let prefix: String = {
            switch chart.mode {
            case "Single": return "S"
            case "Double": return "D"
            case "CoOp": return "CO"
            default: return "?"
            }
        }()

        return HStack(spacing: 3) {
            Text("\(prefix)\(chart.level ?? 0)")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)

            if let grade = chart.bestGrade, !grade.isEmpty {
                Text(grade)
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(gradeColor(grade))
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(bgColor.opacity(0.85))
        .cornerRadius(6)
    }

    // MARK: - Grade Color

    private func gradeColor(_ grade: String) -> Color {
        switch grade {
        case "SSS+", "SSS": return Color(hex: "#7dd3fc") // sky
        case "SS+", "SS": return DojoTheme.piuGold
        case "S+", "S": return Color(hex: "#fbbf24") // amber
        case "AAA+", "AAA": return DojoTheme.piuSilver
        case "AA+", "AA": return DojoTheme.piuBronze
        default: return .white.opacity(0.7)
        }
    }

    // MARK: - Jacket

    private func jacketView(_ url: String?, title: String) -> some View {
        Group {
            if let url, !url.isEmpty, let imgURL = fullJacketURL(url) {
                AsyncImage(url: imgURL) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 48, height: 48)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    default:
                        jacketPlaceholder(title)
                    }
                }
            } else {
                jacketPlaceholder(title)
            }
        }
    }

    private func jacketPlaceholder(_ title: String) -> some View {
        ZStack {
            LinearGradient(
                colors: [DojoTheme.piuAccent.opacity(0.3), Color(hex: "#112947")],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Image(systemName: "music.note")
                .font(.system(size: 18))
                .foregroundColor(DojoTheme.textMuted)
        }
        .frame(width: 48, height: 48)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func fullJacketURL(_ path: String) -> URL? {
        if path.hasPrefix("http") { return URL(string: path) }
        let base = APIService.shared.baseURL
        let p = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: "\(base)\(p)")
    }
}
