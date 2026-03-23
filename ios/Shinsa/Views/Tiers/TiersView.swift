import SwiftUI

struct TiersView: View {
    @State private var tiersResponse: TiersResponse?
    @State private var levelsByMode: [String: [TierLevelInfo]] = [:]
    @State private var selectedMode: String = "Double"
    @State private var selectedLevel: Int? = nil
    @State private var isLoading = true

    private let modeOrder = ["Single", "Double", "CoOp"]

    private let tierLabels: [String: String] = [
        "Overrated": "Overrated",
        "VeryEasy": "Very Easy",
        "Easy": "Easy",
        "Medium": "Medium",
        "Hard": "Hard",
        "VeryHard": "Very Hard",
        "Underrated": "Underrated",
    ]

    private func tierColor(_ name: String) -> Color {
        switch name {
        case "Overrated": return Color(hex: "#6366f1")
        case "VeryEasy": return Color(hex: "#06b6d4")
        case "Easy": return Color(hex: "#10b981")
        case "Medium": return Color(hex: "#eab308")
        case "Hard": return Color(hex: "#f97316")
        case "VeryHard": return Color(hex: "#f43f5e")
        case "Underrated": return Color(hex: "#b91c1c")
        default: return DojoTheme.textMuted
        }
    }

    private var availableModes: [String] {
        modeOrder.filter { levelsByMode[$0] != nil && !(levelsByMode[$0]?.isEmpty ?? true) }
    }

    private var availableLevels: [TierLevelInfo] {
        levelsByMode[selectedMode] ?? []
    }

    private var currentLevelIndex: Int? {
        guard let sl = selectedLevel else { return nil }
        return availableLevels.firstIndex(where: { $0.level == sl })
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Compact sticky nav header
                levelNavigationHeader

                if isLoading {
                    Spacer()
                    ProgressView().tint(DojoTheme.piuAccent)
                    Spacer()
                } else if let response = tiersResponse, let tiers = response.tiers, !tiers.isEmpty {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(tiers) { group in
                                tierGroupView(group)
                            }
                        }
                        .padding()
                    }
                } else {
                    Spacer()
                    VStack(spacing: 8) {
                        Image(systemName: "chart.bar")
                            .font(.system(size: 32))
                            .foregroundColor(DojoTheme.textMuted.opacity(0.5))
                        Text("No tier data for this selection")
                            .font(.system(size: 14))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                    Spacer()
                }
            }
        }
        .navigationTitle("Tier List")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadMeta() }
    }

    // MARK: - Level Navigation Header (compact arrows)

    private var levelNavigationHeader: some View {
        HStack(spacing: 0) {
            // Left arrow
            Button {
                navigateLevel(direction: -1)
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(canNavigateLevel(-1) ? .white : DojoTheme.textMuted.opacity(0.3))
                    .frame(width: 44, height: 44)
            }
            .disabled(!canNavigateLevel(-1))

            Spacer()

            // Center: mode + level (tappable mode to cycle)
            Button {
                cycleMode()
            } label: {
                HStack(spacing: 8) {
                    Text(selectedMode)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(modeColor(selectedMode))

                    if let level = selectedLevel {
                        Text("Lv. \(level)")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
            }

            Spacer()

            // Right arrow
            Button {
                navigateLevel(direction: 1)
            } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(canNavigateLevel(1) ? .white : DojoTheme.textMuted.opacity(0.3))
                    .frame(width: 44, height: 44)
            }
            .disabled(!canNavigateLevel(1))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(DojoTheme.piuCard)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(DojoTheme.piuBorder),
            alignment: .bottom
        )
    }

    private func modeColor(_ mode: String) -> Color {
        switch mode {
        case "Single": return Color(hex: "#dc2626")
        case "Double": return Color(hex: "#16a34a")
        case "CoOp": return Color(hex: "#7c3aed")
        default: return DojoTheme.textMuted
        }
    }

    private func canNavigateLevel(_ direction: Int) -> Bool {
        guard let idx = currentLevelIndex else { return false }
        let newIdx = idx + direction
        return newIdx >= 0 && newIdx < availableLevels.count
    }

    private func navigateLevel(direction: Int) {
        guard let idx = currentLevelIndex else { return }
        let newIdx = idx + direction
        guard newIdx >= 0 && newIdx < availableLevels.count else { return }
        selectedLevel = availableLevels[newIdx].level
        Task { await loadTiers() }
    }

    private func cycleMode() {
        let modes = availableModes
        guard !modes.isEmpty else { return }
        if let idx = modes.firstIndex(of: selectedMode) {
            let nextIdx = (idx + 1) % modes.count
            selectedMode = modes[nextIdx]
        } else {
            selectedMode = modes[0]
        }
        selectedLevel = availableLevels.first?.level
        Task { await loadTiers() }
    }

    // MARK: - Tier Group

    private func tierGroupView(_ group: TierGroup) -> some View {
        let sortedCharts = (group.charts ?? []).sorted { a, b in
            // Passed first, then by score DESC
            let aPass = a.isPass ?? false
            let bPass = b.isPass ?? false
            if aPass != bPass { return aPass && !bPass }
            return (a.bestScore ?? 0) > (b.bestScore ?? 0)
        }

        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(tierLabels[group.name ?? ""] ?? (group.name ?? "?"))
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(tierColor(group.name ?? ""))
                    .cornerRadius(6)

                if let rank = group.rank {
                    Text("#\(rank)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(DojoTheme.textMuted)
                }

                Text("\(sortedCharts.count) charts")
                    .font(.system(size: 11))
                    .foregroundColor(DojoTheme.textMuted)

                Spacer()
            }

            if !sortedCharts.isEmpty {
                // Responsive grid: 4 on iPhone, 5 on iPad
                let columns = UIDevice.current.userInterfaceIdiom == .pad
                    ? Array(repeating: GridItem(.flexible(), spacing: 6), count: 5)
                    : Array(repeating: GridItem(.flexible(), spacing: 6), count: 4)

                LazyVGrid(columns: columns, spacing: 6) {
                    ForEach(sortedCharts) { chart in
                        NavigationLink(value: "song-chart/\(chart.id)") {
                            tierJacketView(chart)
                        }
                    }
                }
            }
        }
        .padding(12)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Tier Jacket with Grade Overlay

    private func tierJacketView(_ chart: TierChart) -> some View {
        ZStack(alignment: .bottomTrailing) {
            if let url = chart.jacketUrl, !url.isEmpty, let imgURL = fullURL(url) {
                AsyncImage(url: imgURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                            .frame(minWidth: 0, maxWidth: .infinity)
                            .aspectRatio(1, contentMode: .fill)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    default:
                        jacketPlaceholder
                    }
                }
            } else {
                jacketPlaceholder
            }

            // Grade overlay if user has a score
            if let grade = chart.bestGrade, !grade.isEmpty {
                Text(grade)
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(gradeOverlayColor(grade).opacity(0.85))
                    .cornerRadius(4)
                    .padding(3)
            }

            // Pass indicator
            if chart.isPass == true {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundColor(DojoTheme.piuGreen)
                    .padding(3)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .aspectRatio(1, contentMode: .fit)
    }

    private func gradeOverlayColor(_ grade: String) -> Color {
        switch grade {
        case "SSS+", "SSS": return Color(hex: "#0ea5e9")
        case "SS+", "SS": return Color(hex: "#ca8a04")
        case "S+", "S": return Color(hex: "#d97706")
        case "AAA+", "AAA": return Color(hex: "#6b7280")
        case "AA+", "AA": return Color(hex: "#92400e")
        default: return DojoTheme.piuBorder
        }
    }

    private var jacketPlaceholder: some View {
        ZStack {
            LinearGradient(colors: [DojoTheme.piuAccent.opacity(0.2), DojoTheme.piuDark], startPoint: .topLeading, endPoint: .bottomTrailing)
            Image(systemName: "music.note")
                .font(.system(size: 14))
                .foregroundColor(DojoTheme.textMuted)
        }
        .aspectRatio(1, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func fullURL(_ path: String) -> URL? {
        if path.hasPrefix("http") { return URL(string: path) }
        let base = APIService.shared.baseURL
        let p = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: "\(base)\(p)")
    }

    // MARK: - Data Loading

    private func loadMeta() async {
        isLoading = true
        if let meta = try? await APIService.shared.getTiersMeta() {
            levelsByMode = meta.levelsByMode ?? [:]
        }
        let modes = modeOrder.filter { levelsByMode[$0] != nil && !(levelsByMode[$0]?.isEmpty ?? true) }
        if let first = modes.first {
            selectedMode = first
            selectedLevel = levelsByMode[first]?.first?.level
        }
        await loadTiers()
    }

    private func loadTiers() async {
        isLoading = true
        tiersResponse = try? await APIService.shared.getTiers(mode: selectedMode, level: selectedLevel)
        isLoading = false
    }
}
