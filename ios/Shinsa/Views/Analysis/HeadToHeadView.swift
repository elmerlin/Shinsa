import SwiftUI

struct HeadToHeadView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var opponentQuery = ""
    @State private var opponentResults: [User] = []
    @State private var selectedOpponent: User?
    @State private var h2hData: [[String: AnyCodable]] = []
    @State private var isSearching = false
    @State private var isLoading = false
    @State private var searchTask: Task<Void, Never>?

    private var wins: Int {
        h2hData.filter { ($0["result"]?.value as? String) == "win" }.count
    }
    private var losses: Int {
        h2hData.filter { ($0["result"]?.value as? String) == "loss" }.count
    }
    private var ties: Int {
        h2hData.filter { ($0["result"]?.value as? String) == "tie" }.count
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Your section
                    userCard(
                        label: "PLAYER 1",
                        username: auth.currentUser?.username ?? "You",
                        avatar: auth.currentUser?.avatar,
                        color: DojoTheme.piuAccent
                    )

                    // Opponent section
                    opponentSection

                    // Results
                    if selectedOpponent != nil && !h2hData.isEmpty {
                        summaryCard
                        comparisonList
                    } else if selectedOpponent != nil && !isLoading {
                        VStack(spacing: 8) {
                            Image(systemName: "arrow.left.arrow.right")
                                .font(.system(size: 32))
                                .foregroundColor(DojoTheme.textMuted.opacity(0.5))
                            Text("No shared scores found")
                                .font(.system(size: 14))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 30)
                    }
                }
                .padding()
            }
        }
        .navigationTitle("Head to Head")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - User Card

    private func userCard(label: String, username: String, avatar: String?, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(color)

            HStack(spacing: 12) {
                AvatarView(avatar, name: username, size: 44)

                Text(username)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)

                Spacer()
            }
        }
        .padding(14)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Opponent Section

    private var opponentSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PLAYER 2")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(DojoTheme.piuBlue)

            if let opp = selectedOpponent {
                HStack(spacing: 12) {
                    AvatarView(opp.avatar, name: opp.username, size: 44)

                    Text(opp.username)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)

                    Spacer()

                    Button {
                        selectedOpponent = nil
                        h2hData = []
                        opponentQuery = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
                .padding(14)
                .background(DojoTheme.piuCard)
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(DojoTheme.piuBorder, lineWidth: 1)
                )
            } else {
                // Search bar
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)

                    TextField("Search opponent...", text: $opponentQuery)
                        .font(.system(size: 14))
                        .foregroundColor(.white)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onChange(of: opponentQuery) { _ in searchOpponent() }
                }
                .padding(10)
                .background(DojoTheme.piuCard)
                .cornerRadius(10)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(DojoTheme.piuBorder, lineWidth: 1)
                )

                if isSearching {
                    ProgressView()
                        .tint(DojoTheme.piuAccent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }

                ForEach(opponentResults) { user in
                    Button {
                        selectedOpponent = user
                        opponentResults = []
                        opponentQuery = ""
                        Task { await loadH2H(user.id) }
                    } label: {
                        HStack(spacing: 10) {
                            AvatarView(user.avatar, name: user.username, size: 32)
                            Text(user.username)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.white)
                            Spacer()
                        }
                        .padding(10)
                        .background(DojoTheme.piuCard)
                        .cornerRadius(8)
                    }
                }
            }
        }
    }

    // MARK: - Summary Card

    private var summaryCard: some View {
        HStack(spacing: 0) {
            summaryItem(value: wins, label: "WINS", color: DojoTheme.piuGreen)
            summaryItem(value: ties, label: "TIES", color: DojoTheme.piuGold)
            summaryItem(value: losses, label: "LOSSES", color: DojoTheme.piuAccent)
        }
        .padding(16)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    private func summaryItem(value: Int, label: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(color)
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Comparison List

    private var comparisonList: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("SCORE COMPARISON")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            ForEach(Array(h2hData.enumerated()), id: \.offset) { _, entry in
                let title = (entry["title"]?.value as? String) ?? "Unknown"
                let myScore = (entry["my_score"]?.value as? Int) ?? 0
                let theirScore = (entry["their_score"]?.value as? Int) ?? 0
                let result = (entry["result"]?.value as? String) ?? "tie"

                HStack(spacing: 8) {
                    Text(title)
                        .font(.system(size: 12))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Text("\(myScore)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(result == "win" ? DojoTheme.piuGreen : .white)
                        .frame(width: 60, alignment: .trailing)

                    Text("vs")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)

                    Text("\(theirScore)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(result == "loss" ? DojoTheme.piuAccent : .white)
                        .frame(width: 60, alignment: .leading)
                }
                .padding(.vertical, 6)
                .padding(.horizontal, 10)
                .background(DojoTheme.piuDark)
                .cornerRadius(6)
            }
        }
        .padding(16)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - Search

    private func searchOpponent() {
        searchTask?.cancel()
        let q = opponentQuery.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else {
            opponentResults = []
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            isSearching = true
            opponentResults = (try? await APIService.shared.searchUsers(q)) ?? []
            isSearching = false
        }
    }

    private func loadH2H(_ opponentId: String) async {
        let myId = auth.userId
        guard !myId.isEmpty else { return }
        isLoading = true
        h2hData = (try? await APIService.shared.getHeadToHead(userId1: myId, userId2: opponentId)) ?? []
        isLoading = false
    }
}
