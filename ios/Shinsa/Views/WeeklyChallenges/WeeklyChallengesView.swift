import SwiftUI

struct WeeklyChallengesView: View {
    @StateObject private var vm = WeeklyChallengesViewModel()
    @EnvironmentObject var auth: AuthManager
    @State private var showWeekPicker = false
    @State private var selectedChartId: Int?
    @State private var showChartScores = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Header
                headerSection

                if vm.isLoadingWeek && vm.weekDetail == nil {
                    loadingView
                } else if let detail = vm.weekDetail {
                    // Viewer Summary
                    if let viewer = detail.viewerSummary {
                        viewerSummaryCard(viewer, participantCount: detail.participantCount)
                    }

                    // Filter Bar
                    filterBar

                    // Podium Strip
                    if !vm.awardsByCategory.isEmpty {
                        WCPodiumStripView(categories: vm.awardsByCategory)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                    }

                    // Leaderboard
                    if !detail.leaderboard.isEmpty {
                        WCLeaderboardView(
                            entries: detail.leaderboard,
                            viewerUserId: auth.userId,
                            maxRows: 20
                        )
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                    }

                    // Charts by Level
                    if !vm.sortedLevels.isEmpty {
                        chartsSection
                    }
                } else if let err = vm.error {
                    errorView(err)
                }
            }
            .padding(.bottom, 32)
        }
        .background(DojoTheme.piuBg.ignoresSafeArea())
        .navigationTitle("Weekly Challenges")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            async let home: () = vm.loadHome()
            async let weeks: () = vm.loadWeeks()
            async let detail: () = vm.loadWeekDetail()
            _ = await (home, weeks, detail)
        }
        .sheet(isPresented: $showWeekPicker) {
            WCWeekPickerSheet(
                weeks: vm.weeks,
                currentWeekKey: vm.selectedWeekKey,
                onSelect: { weekKey in
                    showWeekPicker = false
                    Task { await vm.selectWeek(weekKey) }
                }
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showChartScores) {
            if let chartId = selectedChartId {
                WCChartScoresSheet(vm: vm, chartId: chartId)
                    .presentationDetents([.large])
            }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Weekly Challenges")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(.white)

                    if let week = vm.weekDetail?.week ?? vm.homeData?.week {
                        HStack(spacing: 6) {
                            Text(week.dateRange)
                                .font(.system(size: 13))
                                .foregroundColor(DojoTheme.textSecondary)

                            if week.isLive {
                                liveBadge
                            }
                        }
                    }
                }

                Spacer()

                Button {
                    showWeekPicker = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "calendar")
                            .font(.system(size: 13))
                        Text(vm.selectedWeekKey ?? "Select")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundColor(DojoTheme.piuGold)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(DojoTheme.piuGold.opacity(0.15))
                    .cornerRadius(8)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)

            // Participant count
            if let count = vm.weekDetail?.participantCount ?? vm.homeData?.participantCount, count > 0 {
                HStack(spacing: 4) {
                    Image(systemName: "person.2.fill")
                        .font(.system(size: 11))
                    Text("\(count) participants")
                        .font(.system(size: 12))
                }
                .foregroundColor(DojoTheme.textMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
            }
        }
    }

    // MARK: - Viewer Summary Card

    private func viewerSummaryCard(_ viewer: WCViewerSummary, participantCount: Int) -> some View {
        HStack(spacing: 16) {
            if let rank = viewer.rank {
                VStack(spacing: 2) {
                    Text("#\(rank)")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(DojoTheme.piuGold)
                    Text("Rank")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            VStack(spacing: 2) {
                Text(String(format: "%.1f", viewer.totalPoints ?? 0))
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
                Text("Points")
                    .font(.system(size: 10))
                    .foregroundColor(DojoTheme.textMuted)
            }

            VStack(spacing: 2) {
                Text("\(viewer.totalClears ?? 0)")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(DojoTheme.piuGreen)
                Text("Clears")
                    .font(.system(size: 10))
                    .foregroundColor(DojoTheme.textMuted)
            }

            Spacer()

            // Award badges earned by viewer
            if let awards = vm.weekDetail?.awards {
                let viewerAwards = awards.filter { $0.userId == auth.userId }
                if !viewerAwards.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(viewerAwards) { award in
                            medalBadge(rank: award.rank, label: award.awardDisplayName)
                        }
                    }
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(DojoTheme.piuCard)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(DojoTheme.piuGold.opacity(0.3), lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    private func medalBadge(rank: Int, label: String) -> some View {
        VStack(spacing: 1) {
            Text(DojoTheme.medalEmoji(for: rank))
                .font(.system(size: 16))
            Text(label)
                .font(.system(size: 8, weight: .semibold))
                .foregroundColor(DojoTheme.textMuted)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .background(Color.white.opacity(0.05))
        .cornerRadius(6)
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Leaderboard mode
                filterChip("Both", isSelected: vm.leaderboardMode == "both") {
                    vm.leaderboardMode = "both"
                    Task { await vm.applyFilters() }
                }
                filterChip("Singles", isSelected: vm.leaderboardMode == "single") {
                    vm.leaderboardMode = "single"
                    Task { await vm.applyFilters() }
                }
                filterChip("Doubles", isSelected: vm.leaderboardMode == "double") {
                    vm.leaderboardMode = "double"
                    Task { await vm.applyFilters() }
                }

                Divider()
                    .frame(height: 20)
                    .background(DojoTheme.piuBorder)

                // Chart mode
                filterChip("All Charts", isSelected: vm.chartMode == "both") {
                    vm.chartMode = "both"
                    Task { await vm.applyFilters() }
                }
                filterChip("S Only", isSelected: vm.chartMode == "single") {
                    vm.chartMode = "single"
                    Task { await vm.applyFilters() }
                }
                filterChip("D Only", isSelected: vm.chartMode == "double") {
                    vm.chartMode = "double"
                    Task { await vm.applyFilters() }
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.top, 12)
    }

    private func filterChip(_ title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(isSelected ? .white : DojoTheme.textMuted)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? DojoTheme.piuAccent : DojoTheme.piuCard)
                .cornerRadius(16)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(isSelected ? Color.clear : DojoTheme.piuBorder, lineWidth: 1)
                )
        }
    }

    // MARK: - Charts Section

    private var chartsSection: some View {
        VStack(spacing: 0) {
            Text("CHALLENGES")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)
                .tracking(1.5)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.top, 20)
                .padding(.bottom, 8)

            ForEach(vm.sortedLevels, id: \.level) { levelGroup in
                WCLevelRowView(
                    level: levelGroup.level,
                    charts: levelGroup.charts,
                    viewerBests: vm.weekDetail?.viewerSummary?.bests,
                    onChartTap: { chartId in
                        selectedChartId = chartId
                        showChartScores = true
                    }
                )
            }
        }
    }

    // MARK: - Helpers

    private var liveBadge: some View {
        Text("LIVE")
            .font(.system(size: 9, weight: .bold))
            .foregroundColor(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.red)
            .cornerRadius(4)
    }

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
                .tint(DojoTheme.piuAccent)
            Text("Loading challenges...")
                .font(.system(size: 13))
                .foregroundColor(DojoTheme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 28))
                .foregroundColor(DojoTheme.piuAccent)
            Text(message)
                .font(.system(size: 13))
                .foregroundColor(DojoTheme.textSecondary)
                .multilineTextAlignment(.center)

            Button("Retry") {
                Task { await vm.loadWeekDetail() }
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(DojoTheme.piuAccent)
        }
        .padding(.top, 60)
        .padding(.horizontal, 32)
    }
}
