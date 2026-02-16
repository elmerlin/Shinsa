import SwiftUI

struct UserSearchView: View {
    @State private var query = ""
    @State private var results: [User] = []
    @State private var isSearching = false
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Search bar
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)

                    TextField("Search users...", text: $query)
                        .font(.system(size: 14))
                        .foregroundColor(.white)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)

                    if !query.isEmpty {
                        Button {
                            query = ""
                            results = []
                        } label: {
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

                // Results
                if isSearching {
                    ProgressView()
                        .tint(DojoTheme.piuAccent)
                        .frame(maxWidth: .infinity, minHeight: 100)
                } else if query.trimmingCharacters(in: .whitespaces).count >= 2 && results.isEmpty {
                    Text("No users found")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                        .frame(maxWidth: .infinity, minHeight: 100)
                } else if !results.isEmpty {
                    ScrollView {
                        LazyVStack(spacing: 2) {
                            ForEach(results) { user in
                                NavigationLink(value: "profile/\(user.id)") {
                                    userRow(user)
                                }
                            }
                        }
                        .padding(.top, 8)
                    }
                } else {
                    VStack(spacing: 8) {
                        Spacer()
                        Image(systemName: "person.2")
                            .font(.system(size: 32))
                            .foregroundColor(DojoTheme.textMuted.opacity(0.5))
                        Text("Search for users by name")
                            .font(.system(size: 13))
                            .foregroundColor(DojoTheme.textMuted)
                        Spacer()
                    }
                }
            }
        }
        .navigationTitle("Search Users")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: query) { _ in
            debouncedSearch()
        }
    }

    // MARK: - User Row

    private func userRow(_ user: User) -> some View {
        HStack(spacing: 10) {
            AvatarView(user.avatar, name: user.username, size: 40)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(user.username)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)

                    if let nat = user.nationality, !nat.isEmpty {
                        Text(CountryData.flag(for: nat))
                            .font(.system(size: 12))
                    }
                }

                HStack(spacing: 8) {
                    if let skill = user.skillTitle {
                        Text(skill)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(DojoTheme.skillColor(for: skill))
                    }

                    if let pumbility = user.pumbility, pumbility > 0 {
                        HStack(spacing: 2) {
                            Text("PMB")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(DojoTheme.textMuted)
                            Text("\(pumbility)")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(DojoTheme.piuGold)
                        }
                    }
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundColor(DojoTheme.textMuted)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(DojoTheme.piuCard)
    }

    // MARK: - Debounced Search

    private func debouncedSearch() {
        searchTask?.cancel()

        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2 else {
            results = []
            isSearching = false
            return
        }

        searchTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }

            isSearching = true
            do {
                let users = try await APIService.shared.searchUsers(trimmed)
                guard !Task.isCancelled else { return }
                results = users
            } catch {
                guard !Task.isCancelled else { return }
                results = []
            }
            isSearching = false
        }
    }
}
