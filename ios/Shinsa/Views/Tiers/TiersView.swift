import SwiftUI

struct TiersView: View {
    @State private var tiersResponse: TiersResponse?
    @State private var levelsByMode: [String: [TierLevelInfo]] = [:]
    @State private var selectedMode: String = "Double"
    @State private var selectedLevel: Int? = nil
    @State private var isLoading = true

    // Settings
    @State private var displayMode: String = "grade" // "grade" or "score"
    @State private var overlaySize: Double = 65
    @State private var jacketOpacity: Double = 90
    @State private var showUnplayed: Bool = true
    @State private var showEmpty: Bool = false
    @State private var hideCoOp: Bool = true
    @State private var songsPerRow: Int = 4
    @AppStorage("tiers_default_level") private var defaultLevel: Int = 0
    @State private var showSettings = false

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
                    let filteredTiers = filterTiers(tiers)
                    if filteredTiers.isEmpty {
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
                    } else {
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 12) {
                                ForEach(filteredTiers) { group in
                                    tierGroupView(group)
                                }
                            }
                            .padding()
                        }
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
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { showSettings = true } label: {
                    Image(systemName: "gearshape").foregroundColor(DojoTheme.textMuted)
                }
            }
        }
        .sheet(isPresented: $showSettings) { settingsSheet }
        .task { await loadMeta() }
    }

    // MARK: - Settings Sheet

    private var settingsSheet: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // Display Mode
                        VStack(alignment: .leading, spacing: 6) {
                            Text("OVERLAY DISPLAY").font(.system(size: 11, weight: .bold)).foregroundColor(DojoTheme.textMuted)
                            HStack(spacing: 8) {
                                ForEach(["grade", "score"], id: \.self) { mode in
                                    Button(mode.capitalized) {
                                        displayMode = mode
                                    }
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundColor(displayMode == mode ? .white : DojoTheme.textMuted)
                                    .padding(.horizontal, 16).padding(.vertical, 8)
                                    .background(displayMode == mode ? DojoTheme.piuAccent : DojoTheme.piuDark)
                                    .cornerRadius(8)
                                }
                            }
                        }

                        // Overlay Size slider
                        VStack(alignment: .leading, spacing: 6) {
                            Text("OVERLAY SIZE: \(Int(overlaySize))%").font(.system(size: 11, weight: .bold)).foregroundColor(DojoTheme.textMuted)
                            Slider(value: $overlaySize, in: 20...100, step: 5)
                                .tint(DojoTheme.piuAccent)
                        }

                        // Jacket Opacity slider
                        VStack(alignment: .leading, spacing: 6) {
                            Text("JACKET OPACITY: \(Int(jacketOpacity))%").font(.system(size: 11, weight: .bold)).foregroundColor(DojoTheme.textMuted)
                            Slider(value: $jacketOpacity, in: 10...100, step: 5)
                                .tint(DojoTheme.piuAccent)
                        }

                        // Toggles
                        Toggle("Show unplayed charts", isOn: $showUnplayed)
                            .tint(DojoTheme.piuAccent).foregroundColor(.white)
                        Toggle("Show empty tiers", isOn: $showEmpty)
                            .tint(DojoTheme.piuAccent).foregroundColor(.white)
                        Toggle("Hide Co-Op", isOn: $hideCoOp)
                            .tint(DojoTheme.piuAccent).foregroundColor(.white)

                        // Default Level
                        VStack(alignment: .leading, spacing: 6) {
                            Text("DEFAULT LEVEL").font(.system(size: 11, weight: .bold)).foregroundColor(DojoTheme.textMuted)
                            Text("Level shown when opening Tiers")
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.textMuted.opacity(0.6))

                            let maxLevel = selectedMode == "Single" ? 26 : 28
                            let levels = Array(1...maxLevel)
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                                ForEach(levels, id: \.self) { level in
                                    Button("\(level)") {
                                        defaultLevel = level
                                        selectedLevel = level
                                    }
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(defaultLevel == level ? .white : DojoTheme.textMuted)
                                    .frame(height: 32)
                                    .frame(maxWidth: .infinity)
                                    .background(defaultLevel == level ? DojoTheme.piuAccent : DojoTheme.piuDark)
                                    .cornerRadius(6)
                                }
                            }
                        }

                        // Songs per row
                        VStack(alignment: .leading, spacing: 6) {
                            Text("SONGS PER ROW").font(.system(size: 11, weight: .bold)).foregroundColor(DojoTheme.textMuted)
                            HStack(spacing: 8) {
                                ForEach([4, 5, 6, 7], id: \.self) { n in
                                    Button("\(n)") {
                                        songsPerRow = n
                                    }
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundColor(songsPerRow == n ? .white : DojoTheme.textMuted)
                                    .frame(width: 40, height: 36)
                                    .background(songsPerRow == n ? DojoTheme.piuAccent : DojoTheme.piuDark)
                                    .cornerRadius(8)
                                }
                            }
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Tier Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showSettings = false }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: - Filtering

    private func filterTiers(_ tiers: [TierGroup]) -> [TierGroup] {
        var result: [TierGroup] = []
        for group in tiers {
            var charts = group.charts ?? []

            // Filter unplayed
            if !showUnplayed {
                charts = charts.filter { ($0.bestScore ?? 0) > 0 }
            }

            // Filter co-op
            if hideCoOp {
                charts = charts.filter { $0.mode?.lowercased() != "coop" && $0.mode?.lowercased() != "co-op" }
            }

            if charts.isEmpty && !showEmpty {
                continue
            }

            var filtered = group
            filtered.charts = charts
            result.append(filtered)
        }
        return result
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
            let aPass = a.isPass ?? false
            let bPass = b.isPass ?? false
            if aPass != bPass { return aPass && !bPass }
            return (a.bestScore ?? 0) > (b.bestScore ?? 0)
        }

        let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: songsPerRow)

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

    // MARK: - Tier Jacket with Grade Overlay (centered)

    private func tierJacketView(_ chart: TierChart) -> some View {
        let cellSize = (UIScreen.main.bounds.width - 32 - CGFloat(songsPerRow - 1) * 6 - 24) / CGFloat(songsPerRow)
        let fontSize = min(cellSize * (overlaySize / 100) * 0.35, 22)

        return ZStack {
            // Jacket image with opacity
            if let url = chart.jacketUrl, !url.isEmpty, let imgURL = fullURL(url) {
                AsyncImage(url: imgURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                            .opacity(jacketOpacity / 100)
                    default:
                        Rectangle().fill(DojoTheme.piuDark)
                    }
                }
                .frame(width: cellSize, height: cellSize * 0.56)
                .clipped()
            } else {
                Rectangle().fill(DojoTheme.piuDark)
                    .frame(width: cellSize, height: cellSize * 0.56)
                Image(systemName: "music.note")
                    .font(.system(size: 14))
                    .foregroundColor(DojoTheme.textMuted)
            }

            // Grade/Score overlay centered
            if let score = chart.bestScore, score > 0 {
                if displayMode == "score" {
                    Text(formatScore(score))
                        .font(.system(size: max(fontSize * 0.65, 8), weight: .black))
                        .foregroundColor(.white)
                        .shadow(color: .black, radius: 4, x: 0, y: 1)
                        .shadow(color: .black.opacity(0.8), radius: 2, x: 0, y: 0)
                } else {
                    Text(DojoTheme.gradeLabel(for: score))
                        .font(.system(size: fontSize, weight: .black))
                        .foregroundColor(DojoTheme.gradeColor(for: score))
                        .shadow(color: .black, radius: 4, x: 0, y: 1)
                        .shadow(color: .black.opacity(0.8), radius: 2, x: 0, y: 0)
                }
            }

            // Pass indicator
            if chart.isPass == true {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 10))
                    .foregroundColor(DojoTheme.piuGreen)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(2)
            }
        }
        .frame(width: cellSize, height: cellSize * 0.56)
        .cornerRadius(6)
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(chart.isPass == true ? DojoTheme.piuBorder : Color.red.opacity(0.3), lineWidth: 1)
        )
    }

    private func formatScore(_ score: Int) -> String {
        let s = String(format: "%06d", score)
        if s.count >= 6 {
            let idx = s.index(s.startIndex, offsetBy: s.count - 3)
            return s[s.startIndex..<idx] + "," + s[idx...]
        }
        return "\(score)"
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
            // Apply default level if set, otherwise use first available
            if defaultLevel > 0, let levels = levelsByMode[first], levels.contains(where: { $0.level == defaultLevel }) {
                selectedLevel = defaultLevel
            } else {
                selectedLevel = levelsByMode[first]?.first?.level
            }
        }
        await loadTiers()
    }

    private func loadTiers() async {
        isLoading = true
        tiersResponse = try? await APIService.shared.getTiers(mode: selectedMode, level: selectedLevel)
        isLoading = false
    }
}
