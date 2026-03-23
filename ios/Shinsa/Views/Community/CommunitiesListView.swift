import SwiftUI

struct CommunitiesListView: View {
    @State private var communities: [Community] = []
    @State private var isLoading = false
    @State private var searchQuery = ""
    @State private var searchTask: Task<Void, Never>?

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var filteredCommunities: [Community] {
        if searchQuery.trimmingCharacters(in: .whitespaces).isEmpty {
            return communities
        }
        let query = searchQuery.lowercased()
        return communities.filter {
            ($0.name.lowercased().contains(query)) ||
            ($0.displayName?.lowercased().contains(query) ?? false) ||
            ($0.description?.lowercased().contains(query) ?? false)
        }
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Search bar
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)

                    TextField("Search communities...", text: $searchQuery)
                        .font(.system(size: 14))
                        .foregroundColor(.white)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)

                    if !searchQuery.isEmpty {
                        Button {
                            searchQuery = ""
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

                // Content
                if isLoading && communities.isEmpty {
                    Spacer()
                    ProgressView().tint(DojoTheme.piuAccent)
                    Spacer()
                } else if filteredCommunities.isEmpty {
                    Spacer()
                    VStack(spacing: 8) {
                        Image(systemName: "person.3")
                            .font(.system(size: 32))
                            .foregroundColor(DojoTheme.textMuted.opacity(0.5))
                        Text(searchQuery.isEmpty ? "No communities yet" : "No communities found")
                            .font(.system(size: 14))
                            .foregroundColor(DojoTheme.textMuted)
                        if searchQuery.isEmpty {
                            Text("Create the first community!")
                                .font(.system(size: 12))
                                .foregroundColor(DojoTheme.textMuted.opacity(0.6))
                        }
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(filteredCommunities) { community in
                                NavigationLink {
                                    CommunityView(communityId: community.name)
                                } label: {
                                    communityCard(community)
                                }
                            }
                        }
                        .padding()
                    }
                    .refreshable { await loadCommunities() }
                }
            }
        }
        .navigationTitle("Communities")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                NavigationLink {
                    CommunitySetupView()
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
        .task { await loadCommunities() }
    }

    // MARK: - Community Card

    private func communityCard(_ community: Community) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // Avatar
            HStack {
                AvatarView(community.avatar, name: community.displayName ?? community.name, size: 44)
                Spacer()
                if community.isPrivate == 1 {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            // Name
            Text(community.displayName ?? community.name)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(1)

            // Member count
            HStack(spacing: 4) {
                Image(systemName: "person.2.fill")
                    .font(.system(size: 10))
                Text("\(community.memberCount ?? 0)")
                    .font(.system(size: 11, weight: .medium))
            }
            .foregroundColor(DojoTheme.textMuted)

            // Description
            if let desc = community.description, !desc.isEmpty {
                Text(desc)
                    .font(.system(size: 11))
                    .foregroundColor(DojoTheme.textSecondary)
                    .lineLimit(2)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DojoTheme.piuBorder, lineWidth: 1)
        )
    }

    // MARK: - API

    private func loadCommunities() async {
        isLoading = true
        do {
            communities = try await APIService.shared.getCommunities()
        } catch {
            communities = []
        }
        isLoading = false
    }
}
