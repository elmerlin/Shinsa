import Foundation
import SwiftUI

@MainActor
class WeeklyChallengesViewModel: ObservableObject {
    // MARK: - Published State

    @Published var homeData: WCHomeResponse?
    @Published var weekDetail: WCWeekDetailResponse?
    @Published var weeks: [WCWeek] = []
    @Published var chartScores: WCChartScoresResponse?
    @Published var userHistory: [WCUserHistory] = []

    @Published var isLoadingHome = false
    @Published var isLoadingWeek = false
    @Published var isLoadingWeeks = false
    @Published var isLoadingChartScores = false

    @Published var selectedWeekKey: String?
    @Published var chartMode: String = "both"
    @Published var leaderboardMode: String = "both"
    @Published var skillFamily: String = "all"

    @Published var error: String?

    // MARK: - Load Home (Dashboard summary)

    func loadHome() async {
        isLoadingHome = true
        error = nil
        do {
            homeData = try await APIService.shared.getWeeklyChallengesHome()
            if selectedWeekKey == nil {
                selectedWeekKey = homeData?.week.weekKey
            }
        } catch {
            self.error = error.localizedDescription
        }
        isLoadingHome = false
    }

    // MARK: - Load Weeks Archive

    func loadWeeks() async {
        isLoadingWeeks = true
        do {
            weeks = try await APIService.shared.getWeeklyChallengeWeeks()
        } catch {
            // Silently fail for weeks list
        }
        isLoadingWeeks = false
    }

    // MARK: - Load Week Detail

    func loadWeekDetail(weekKey: String? = nil) async {
        let key = weekKey ?? selectedWeekKey ?? "current"
        isLoadingWeek = true
        error = nil
        do {
            weekDetail = try await APIService.shared.getWeeklyChallengeWeek(
                weekKey: key,
                chartMode: chartMode,
                leaderboardMode: leaderboardMode,
                skillFamily: skillFamily
            )
            if let wk = weekDetail?.week.weekKey {
                selectedWeekKey = wk
            }
        } catch {
            self.error = error.localizedDescription
        }
        isLoadingWeek = false
    }

    // MARK: - Load Chart Scores

    func loadChartScores(chartId: Int) async {
        isLoadingChartScores = true
        chartScores = nil
        do {
            chartScores = try await APIService.shared.getWeeklyChallengeChartScores(chartId: chartId)
        } catch {
            // Silently fail
        }
        isLoadingChartScores = false
    }

    // MARK: - Load User History

    func loadUserHistory(userId: String) async {
        do {
            userHistory = try await APIService.shared.getWeeklyChallengeUserHistory(userId: userId)
        } catch {
            // Silently fail
        }
    }

    // MARK: - Filter Changes

    func applyFilters() async {
        await loadWeekDetail()
    }

    // MARK: - Select Week

    func selectWeek(_ weekKey: String) async {
        selectedWeekKey = weekKey
        await loadWeekDetail(weekKey: weekKey)
    }

    // MARK: - Sorted Levels

    var sortedLevels: [(level: Int, charts: [WCChart])] {
        guard let grouped = weekDetail?.groupedByLevel else { return [] }
        return grouped.sorted { Int($0.key) ?? 0 < Int($1.key) ?? 0 }
            .map { (level: Int($0.key) ?? 0, charts: $0.value) }
    }

    // MARK: - Awards grouped by category

    var awardsByCategory: [(key: String, label: String, awards: [WCAward])] {
        guard let awards = weekDetail?.awards ?? homeData?.awards else { return [] }
        let order = ["overall", "singles", "doubles", "advanced", "intermediate"]
        var grouped: [String: [WCAward]] = [:]
        for award in awards {
            grouped[award.awardKey, default: []].append(award)
        }
        return order.compactMap { key in
            guard let list = grouped[key], !list.isEmpty else { return nil }
            let label = list.first?.awardDisplayName ?? key.capitalized
            return (key: key, label: label, awards: list.sorted { $0.rank < $1.rank })
        }
    }
}
