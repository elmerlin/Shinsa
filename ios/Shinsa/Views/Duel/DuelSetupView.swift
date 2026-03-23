import SwiftUI

struct DuelSetupView: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) var dismiss

    @State private var name = ""
    @State private var location = ""
    @State private var date = Date()
    @State private var mode = "singles"

    // Player search
    @State private var p1Query = ""
    @State private var p2Query = ""
    @State private var p1Results: [User] = []
    @State private var p2Results: [User] = []
    @State private var player1: User?
    @State private var player2: User?
    @State private var isCreating = false
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Player 1
                    playerSection(
                        label: "PLAYER 1",
                        color: DojoTheme.piuAccent,
                        player: player1,
                        query: $p1Query,
                        results: p1Results,
                        onSearch: { searchPlayer($0, isP1: true) },
                        onSelect: { player1 = $0; p1Query = ""; p1Results = [] },
                        onClear: { player1 = nil }
                    )

                    // VS
                    HStack {
                        Spacer()
                        Text("VS")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(DojoTheme.piuGold)
                        Spacer()
                    }

                    // Player 2
                    playerSection(
                        label: "PLAYER 2",
                        color: DojoTheme.piuBlue,
                        player: player2,
                        query: $p2Query,
                        results: p2Results,
                        onSearch: { searchPlayer($0, isP1: false) },
                        onSelect: { player2 = $0; p2Query = ""; p2Results = [] },
                        onClear: { player2 = nil }
                    )

                    // Duel name
                    formField("Duel Name", text: $name, placeholder: "e.g. Friday Night Duel")

                    // Location
                    formField("Location", text: $location, placeholder: "Where is this duel?")

                    // Date
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Date")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)

                        DatePicker("", selection: $date, displayedComponents: .date)
                            .datePickerStyle(.compact)
                            .labelsHidden()
                            .colorScheme(.dark)
                    }

                    // Mode picker
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Mode")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)

                        HStack(spacing: 8) {
                            ForEach(["singles", "doubles", "both"], id: \.self) { m in
                                Button {
                                    mode = m
                                } label: {
                                    Text(m.capitalized)
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundColor(mode == m ? .white : DojoTheme.textMuted)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 8)
                                        .background(mode == m ? DojoTheme.piuAccent : DojoTheme.piuCard)
                                        .cornerRadius(8)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8)
                                                .stroke(mode == m ? DojoTheme.piuAccent : DojoTheme.piuBorder, lineWidth: 1)
                                        )
                                }
                            }
                        }
                    }

                    // Start button
                    Button {
                        Task { await createDuel() }
                    } label: {
                        HStack {
                            Image(systemName: "bolt.fill")
                            Text(isCreating ? "Creating..." : "Start Duel")
                                .font(.system(size: 15, weight: .bold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(canCreate ? DojoTheme.piuAccent : DojoTheme.textMuted)
                        .cornerRadius(12)
                    }
                    .disabled(!canCreate || isCreating)
                }
                .padding()
            }
        }
        .navigationTitle("New Duel")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Player Section

    private func playerSection(
        label: String,
        color: Color,
        player: User?,
        query: Binding<String>,
        results: [User],
        onSearch: @escaping (String) -> Void,
        onSelect: @escaping (User) -> Void,
        onClear: @escaping () -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(color)

            if let player {
                HStack(spacing: 10) {
                    AvatarView(player.avatar, name: player.username, size: 40)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(player.username)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)

                        if let skill = player.skillTitle {
                            Text(skill)
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.skillColor(for: skill))
                        }
                    }

                    Spacer()

                    Button { onClear() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
                .padding(12)
                .background(DojoTheme.piuCard)
                .cornerRadius(10)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(color.opacity(0.3), lineWidth: 1)
                )
            } else {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)

                    TextField("Search player...", text: query)
                        .font(.system(size: 14))
                        .foregroundColor(.white)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onChange(of: query.wrappedValue) { newValue in
                            onSearch(newValue)
                        }
                }
                .padding(10)
                .background(DojoTheme.piuCard)
                .cornerRadius(10)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(DojoTheme.piuBorder, lineWidth: 1)
                )

                ForEach(results) { user in
                    Button { onSelect(user) } label: {
                        HStack(spacing: 8) {
                            AvatarView(user.avatar, name: user.username, size: 28)
                            Text(user.username)
                                .font(.system(size: 13))
                                .foregroundColor(.white)
                            Spacer()
                        }
                        .padding(8)
                        .background(DojoTheme.piuDark)
                        .cornerRadius(6)
                    }
                }
            }
        }
    }

    // MARK: - Form Field

    private func formField(_ label: String, text: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)

            TextField(placeholder, text: text)
                .font(.system(size: 14))
                .foregroundColor(.white)
                .padding(10)
                .background(DojoTheme.piuCard)
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(DojoTheme.piuBorder, lineWidth: 1)
                )
        }
    }

    // MARK: - Helpers

    private var canCreate: Bool {
        player1 != nil && player2 != nil && !name.isEmpty
    }

    private func searchPlayer(_ query: String, isP1: Bool) {
        searchTask?.cancel()
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else {
            if isP1 { p1Results = [] } else { p2Results = [] }
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            let results = (try? await APIService.shared.searchUsers(q)) ?? []
            if !Task.isCancelled {
                if isP1 { p1Results = results } else { p2Results = results }
            }
        }
    }

    private func createDuel() async {
        guard let p1 = player1, let p2 = player2 else { return }
        isCreating = true

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"

        let data: [String: AnyCodable] = [
            "name": AnyCodable(name),
            "player1_user_id": AnyCodable(p1.id),
            "player2_user_id": AnyCodable(p2.id),
            "mode": AnyCodable(mode),
            "location": AnyCodable(location),
            "date": AnyCodable(formatter.string(from: date))
        ]
        _ = try? await APIService.shared.createDuel(data)
        isCreating = false
        dismiss()
    }
}
