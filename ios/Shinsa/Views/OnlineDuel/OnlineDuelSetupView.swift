import SwiftUI

struct OnlineDuelSetupView: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) var dismiss

    @State private var name = ""
    @State private var mode = "Single"
    @State private var opponentQuery = ""
    @State private var searchResults: [User] = []
    @State private var selectedOpponent: User?
    @State private var isSearching = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var searchTask: Task<Void, Never>?

    private let modes = ["Single", "Double"]

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Duel Name
                    sectionHeader("DUEL INFO")

                    formField("Duel Name") {
                        TextField("Enter duel name", text: $name)
                            .textFieldStyle(DojoTextFieldStyle())
                    }

                    // Mode Picker
                    formField("Mode") {
                        Picker("Mode", selection: $mode) {
                            ForEach(modes, id: \.self) { m in
                                Text(m).tag(m)
                            }
                        }
                        .pickerStyle(.segmented)
                        .padding(4)
                        .background(DojoTheme.piuCard)
                        .cornerRadius(8)
                    }

                    // Opponent Search
                    sectionHeader("OPPONENT")

                    formField("Search for opponent") {
                        HStack {
                            TextField("Type a username...", text: $opponentQuery)
                                .textFieldStyle(DojoTextFieldStyle())
                                .onChange(of: opponentQuery) { newValue in
                                    searchTask?.cancel()
                                    guard newValue.count >= 2 else {
                                        searchResults = []
                                        return
                                    }
                                    searchTask = Task {
                                        try? await Task.sleep(nanoseconds: 300_000_000)
                                        guard !Task.isCancelled else { return }
                                        await searchUsers(newValue)
                                    }
                                }

                            if isSearching {
                                ProgressView()
                                    .tint(DojoTheme.piuAccent)
                                    .scaleEffect(0.8)
                            }
                        }
                    }

                    // Selected opponent
                    if let opponent = selectedOpponent {
                        HStack(spacing: 12) {
                            AvatarView(opponent.avatar, name: opponent.username, size: 36)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(opponent.username)
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(.white)
                                if let nat = opponent.nationality, !nat.isEmpty {
                                    Text(CountryData.flag(for: nat))
                                        .font(.system(size: 12))
                                }
                            }

                            Spacer()

                            Button {
                                selectedOpponent = nil
                                opponentQuery = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                        }
                        .padding(12)
                        .background(DojoTheme.piuAccent.opacity(0.15))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(DojoTheme.piuAccent.opacity(0.4), lineWidth: 1)
                        )
                        .cornerRadius(8)
                    }

                    // Search results
                    if !searchResults.isEmpty && selectedOpponent == nil {
                        VStack(spacing: 0) {
                            ForEach(searchResults) { user in
                                Button {
                                    selectedOpponent = user
                                    opponentQuery = user.username
                                    searchResults = []
                                } label: {
                                    HStack(spacing: 10) {
                                        AvatarView(user.avatar, name: user.username, size: 32)

                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(user.username)
                                                .font(.system(size: 13, weight: .medium))
                                                .foregroundColor(.white)
                                            if let skill = user.skillTitle {
                                                Text(skill)
                                                    .font(.system(size: 11))
                                                    .foregroundColor(DojoTheme.textMuted)
                                            }
                                        }

                                        Spacer()

                                        if let nat = user.nationality, !nat.isEmpty {
                                            Text(CountryData.flag(for: nat))
                                                .font(.system(size: 14))
                                        }
                                    }
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 10)
                                }

                                if user.id != searchResults.last?.id {
                                    Divider()
                                        .background(DojoTheme.piuBorder)
                                }
                            }
                        }
                        .background(DojoTheme.piuCard)
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(DojoTheme.piuBorder, lineWidth: 1)
                        )
                    }

                    // Note about leaving opponent blank
                    if selectedOpponent == nil {
                        Text("Leave blank to create an open duel anyone can join.")
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                    }

                    // Error
                    if let err = errorMessage {
                        Text(err)
                            .font(.system(size: 12))
                            .foregroundColor(.red)
                    }

                    // Create Button
                    Button {
                        Task { await createDuel() }
                    } label: {
                        HStack {
                            if isSaving {
                                ProgressView()
                                    .tint(.white)
                                    .scaleEffect(0.8)
                            }
                            Text("Create Duel")
                                .font(.system(size: 16, weight: .bold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(canCreate ? DojoTheme.piuAccent : DojoTheme.piuAccent.opacity(0.4))
                        .cornerRadius(12)
                    }
                    .disabled(!canCreate || isSaving)
                }
                .padding()
            }
        }
        .navigationTitle("New Online Duel")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Helpers

    private var canCreate: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(DojoTheme.piuAccent)
            .tracking(1)
    }

    private func formField<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12))
                .foregroundColor(DojoTheme.textMuted)
            content()
        }
    }

    // MARK: - API

    private func searchUsers(_ query: String) async {
        isSearching = true
        do {
            let results = try await APIService.shared.searchUsers(query)
            // Filter out self
            searchResults = results.filter { $0.id != auth.userId }
        } catch {
            searchResults = []
        }
        isSearching = false
    }

    private func createDuel() async {
        isSaving = true
        errorMessage = nil

        var data: [String: AnyCodable] = [
            "name": AnyCodable(name.trimmingCharacters(in: .whitespacesAndNewlines)),
            "mode": AnyCodable(mode),
        ]
        if let opponent = selectedOpponent {
            data["opponent_user_id"] = AnyCodable(opponent.id)
        }

        do {
            _ = try await APIService.shared.createOnlineDuel(data)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
