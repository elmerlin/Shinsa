import SwiftUI

/// Dashboard widget showing current weekly challenge summary with previews
struct WCSummaryCardView: View {
    @StateObject private var vm = WeeklyChallengesViewModel()

    var body: some View {
        VStack(spacing: 0) {
            if vm.isLoadingHome && vm.homeData == nil {
                // Loading skeleton
                HStack {
                    Text("Weekly Challenges")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                    Spacer()
                    ProgressView()
                        .tint(DojoTheme.piuAccent)
                        .scaleEffect(0.7)
                }
                .padding(14)
                .background(DojoTheme.piuCard)
                .cornerRadius(12)
            } else if let data = vm.homeData {
                NavigationLink(value: "weekly-challenges") {
                    cardContent(data)
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
        .task {
            await vm.loadHome()
        }
    }

    private func cardContent(_ data: WCHomeResponse) -> some View {
        VStack(spacing: 0) {
            // Header row
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Image(systemName: "trophy.fill")
                            .font(.system(size: 13))
                            .foregroundColor(DojoTheme.piuGold)

                        Text("Weekly Challenges")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(.white)

                        if data.week.isLive {
                            Text("LIVE")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.red)
                                .cornerRadius(3)
                        }
                    }

                    Text(data.week.dateRange)
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textSecondary)
                }

                Spacer()

                HStack(spacing: 3) {
                    Image(systemName: "person.2.fill")
                        .font(.system(size: 10))
                    Text("\(data.participantCount)")
                        .font(.system(size: 12, weight: .semibold))
                }
                .foregroundColor(DojoTheme.textMuted)
            }
            .padding(.horizontal, 14)
            .padding(.top, 14)
            .padding(.bottom, 10)

            // Challenge previews
            if !data.challengePreviews.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(data.challengePreviews) { chart in
                            previewCard(chart)
                        }
                    }
                    .padding(.horizontal, 14)
                }
                .padding(.bottom, 10)
            }

            // Viewer summary row
            if let viewer = data.viewerSummary {
                Divider().background(DojoTheme.piuBorder)

                HStack(spacing: 16) {
                    HStack(spacing: 4) {
                        Image(systemName: "star.fill")
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.piuGold)
                        Text(String(format: "%.1f pts", viewer.totalPoints ?? 0))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(DojoTheme.piuGold)
                    }

                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.piuGreen)
                        Text("\(viewer.totalClears ?? 0) clears")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(DojoTheme.piuGreen)
                    }

                    Spacer()

                    HStack(spacing: 3) {
                        Text("View All")
                            .font(.system(size: 11, weight: .semibold))
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9))
                    }
                    .foregroundColor(DojoTheme.piuAccent)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
            } else {
                // CTA for non-participants
                Divider().background(DojoTheme.piuBorder)

                HStack {
                    Text("Sync your scores to participate!")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textSecondary)
                    Spacer()
                    HStack(spacing: 3) {
                        Text("View Challenges")
                            .font(.system(size: 11, weight: .semibold))
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9))
                    }
                    .foregroundColor(DojoTheme.piuAccent)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
            }
        }
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Preview Card

    private func previewCard(_ chart: WCChart) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topTrailing) {
                // Jacket
                if let urlStr = chart.jacketUrlSnapshot,
                   let url = URL(string: urlStr.hasPrefix("http") ? urlStr : "\(APIService.shared.baseURL)\(urlStr)") {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase {
                            img.resizable().aspectRatio(contentMode: .fill)
                        } else {
                            previewPlaceholder(chart)
                        }
                    }
                    .frame(width: 100, height: 60)
                    .clipped()
                } else {
                    previewPlaceholder(chart)
                        .frame(width: 100, height: 60)
                }

                // Mode badge
                let letter = chart.mode == "Single" ? "S" : "D"
                let color = chart.mode == "Single" ? Color(hex: "#ff6688") : Color(hex: "#44cc88")
                Text("\(letter)\(chart.level)")
                    .font(.system(size: 8, weight: .black))
                    .foregroundColor(.white)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(color.opacity(0.85))
                    .cornerRadius(3)
                    .padding(3)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(chart.songTitleSnapshot ?? "?")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                HStack(spacing: 3) {
                    Image(systemName: "person.fill")
                        .font(.system(size: 7))
                    Text("\(chart.participantCount ?? 0)")
                        .font(.system(size: 8))
                }
                .foregroundColor(DojoTheme.textMuted)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
        }
        .frame(width: 100)
        .background(DojoTheme.piuDark)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(DojoTheme.piuBorder, lineWidth: 0.5)
        )
    }

    private func previewPlaceholder(_ chart: WCChart) -> some View {
        ZStack {
            let color = chart.mode == "Single" ? Color(hex: "#ff6688") : Color(hex: "#44cc88")
            color.opacity(0.15)
            Text(String((chart.songTitleSnapshot ?? "?").prefix(2)).uppercased())
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white.opacity(0.3))
        }
    }
}
