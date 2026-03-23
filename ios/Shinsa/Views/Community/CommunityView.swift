import SwiftUI

struct CommunityView: View {
    @StateObject private var vm: CommunityViewModel
    @EnvironmentObject var auth: AuthManager

    @State private var selectedTab = 0
    @State private var newPostText = ""
    @State private var showSettings = false

    init(communityId: String) {
        _vm = StateObject(wrappedValue: CommunityViewModel(communityId: communityId))
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if vm.isLoading && vm.community == nil {
                ProgressView().tint(DojoTheme.piuAccent)
            } else if let community = vm.community {
                ScrollView {
                    VStack(spacing: 0) {
                        headerSection(community)
                        tabPicker
                        tabContent
                    }
                }
                .refreshable { await vm.load() }
            } else {
                VStack(spacing: 8) {
                    Text("Community not found")
                        .foregroundColor(DojoTheme.textMuted)
                    if let err = vm.errorMessage {
                        Text(err)
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted.opacity(0.6))
                    }
                }
            }
        }
        .navigationTitle(vm.community?.displayName ?? vm.community?.name ?? "Community")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if vm.isAdmin {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .foregroundColor(.white)
                    }
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            if let community = vm.community {
                NavigationStack {
                    CommunitySettingsView(community: community) {
                        Task { await vm.load() }
                    }
                }
            }
        }
        .task { await vm.load() }
    }

    // MARK: - Header

    private func headerSection(_ community: Community) -> some View {
        VStack(spacing: 12) {
            // Banner
            if let banner = community.banner, !banner.isEmpty {
                let bannerURL: URL? = {
                    if banner.hasPrefix("http") { return URL(string: banner) }
                    return URL(string: "\(APIService.shared.baseURL)\(banner.hasPrefix("/") ? banner : "/\(banner)")")
                }()
                AsyncImage(url: bannerURL) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(height: 120)
                            .clipped()
                    default:
                        Rectangle()
                            .fill(DojoTheme.piuCard)
                            .frame(height: 120)
                    }
                }
            }

            VStack(spacing: 10) {
                AvatarView(community.avatar, name: community.displayName ?? community.name, size: 64)

                Text(community.displayName ?? community.name)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.white)

                if let desc = community.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textSecondary)
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                }

                // Stats
                HStack(spacing: 20) {
                    VStack(spacing: 2) {
                        Text("\(community.memberCount ?? 0)")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                        Text("Members")
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                    }

                    VStack(spacing: 2) {
                        Text("\(community.postCount ?? 0)")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                        Text("Posts")
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }

                // Join / Leave button
                Button {
                    Task {
                        if vm.isMember {
                            await vm.leaveCommunity()
                        } else {
                            await vm.joinCommunity()
                        }
                    }
                } label: {
                    Text(vm.isMember ? "Leave" : "Join Community")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(vm.isMember ? DojoTheme.piuBorder : DojoTheme.piuAccent)
                        .cornerRadius(10)
                }
                .padding(.horizontal)
            }
            .padding()
        }
    }

    // MARK: - Tab Picker

    private var tabPicker: some View {
        HStack(spacing: 0) {
            tabButton("Posts", index: 0)
            tabButton("Members", index: 1)
        }
        .background(DojoTheme.piuCard)
    }

    private func tabButton(_ title: String, index: Int) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { selectedTab = index }
        } label: {
            VStack(spacing: 6) {
                Text(title)
                    .font(.system(size: 14, weight: selectedTab == index ? .bold : .medium))
                    .foregroundColor(selectedTab == index ? DojoTheme.piuAccent : DojoTheme.textMuted)

                Rectangle()
                    .fill(selectedTab == index ? DojoTheme.piuAccent : Color.clear)
                    .frame(height: 2)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 10)
        }
    }

    // MARK: - Tab Content

    @ViewBuilder
    private var tabContent: some View {
        switch selectedTab {
        case 0:
            postsTab
        case 1:
            membersTab
        default:
            EmptyView()
        }
    }

    // MARK: - Posts Tab

    private var postsTab: some View {
        VStack(spacing: 12) {
            // New post composer
            if vm.isMember {
                HStack(spacing: 10) {
                    TextField("Write something...", text: $newPostText)
                        .font(.system(size: 14))
                        .foregroundColor(.white)
                        .padding(10)
                        .background(DojoTheme.piuCard)
                        .cornerRadius(10)

                    Button {
                        let text = newPostText
                        newPostText = ""
                        Task { await vm.createPost(text) }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 28))
                            .foregroundColor(
                                newPostText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                ? DojoTheme.textMuted
                                : DojoTheme.piuAccent
                            )
                    }
                    .disabled(newPostText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(.horizontal)
                .padding(.top, 12)
            }

            if vm.posts.isEmpty {
                Text("No posts yet")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .frame(maxWidth: .infinity, minHeight: 100)
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(vm.posts) { post in
                        communityPostCard(post)
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 20)
            }
        }
    }

    private func communityPostCard(_ post: CommunityPost) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack(spacing: 10) {
                AvatarView(post.avatar, name: post.username ?? "?", size: 32)

                VStack(alignment: .leading, spacing: 2) {
                    Text(post.username ?? "Unknown")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)

                    if let created = post.createdAt {
                        Text(created.timeAgo)
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }

                Spacer()

                if post.isPinned == 1 {
                    Image(systemName: "pin.fill")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.piuGold)
                }

                // Delete if admin or own post
                if vm.isAdmin || post.userId == auth.userId {
                    Button {
                        Task { await vm.deletePost(post.id) }
                    } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
            }

            // Content
            if let content = post.content, !content.isEmpty {
                Text(content)
                    .font(.system(size: 14))
                    .foregroundColor(.white.opacity(0.9))
                    .lineSpacing(3)
            }

            // Images
            if !post.imageUrls.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(post.imageUrls, id: \.self) { urlStr in
                            let fullURL: URL? = {
                                if urlStr.hasPrefix("http") { return URL(string: urlStr) }
                                return URL(string: "\(APIService.shared.baseURL)\(urlStr.hasPrefix("/") ? urlStr : "/\(urlStr)")")
                            }()
                            AsyncImage(url: fullURL) { phase in
                                switch phase {
                                case .success(let image):
                                    image
                                        .resizable()
                                        .aspectRatio(contentMode: .fill)
                                        .frame(width: 120, height: 120)
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                default:
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(DojoTheme.piuBorder)
                                        .frame(width: 120, height: 120)
                                }
                            }
                        }
                    }
                }
            }

            // Actions
            HStack(spacing: 16) {
                // Pump
                Button {
                    Task { await vm.pumpPost(post.id) }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: post.isPumped == true ? "flame.fill" : "flame")
                            .font(.system(size: 13))
                        Text("\(post.pumpCount ?? 0)")
                            .font(.system(size: 12))
                    }
                    .foregroundColor(post.isPumped == true ? DojoTheme.piuAccent : DojoTheme.textMuted)
                }

                // Comments
                HStack(spacing: 4) {
                    Image(systemName: "bubble.left")
                        .font(.system(size: 12))
                    Text("\(post.commentCount ?? 0)")
                        .font(.system(size: 12))
                }
                .foregroundColor(DojoTheme.textMuted)

                Spacer()
            }
        }
        .padding(12)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Members Tab

    private var membersTab: some View {
        VStack(spacing: 0) {
            if vm.members.isEmpty {
                Text("No members")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .frame(maxWidth: .infinity, minHeight: 100)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(vm.members) { member in
                        memberRow(member)
                        Divider()
                            .background(DojoTheme.piuBorder.opacity(0.3))
                    }
                }
                .padding(.horizontal)
                .padding(.top, 8)
            }
        }
    }

    private func memberRow(_ member: CommunityMember) -> some View {
        HStack(spacing: 10) {
            AvatarView(member.avatar, name: member.username ?? "?", size: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(member.username ?? "Unknown")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)

                if let joined = member.joinedAt {
                    Text("Joined \(joined.timeAgo)")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            Spacer()

            if let role = member.role, !role.isEmpty {
                Text(role.uppercased())
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(role == "admin" ? DojoTheme.piuGold : DojoTheme.piuBlue)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(
                        (role == "admin" ? DojoTheme.piuGold : DojoTheme.piuBlue).opacity(0.15)
                    )
                    .cornerRadius(4)
            }
        }
        .padding(.vertical, 8)
    }
}
