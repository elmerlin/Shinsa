import Foundation

@MainActor
class CommunityViewModel: ObservableObject {
    let communityId: String

    @Published var community: Community?
    @Published var posts: [CommunityPost] = []
    @Published var members: [CommunityMember] = []
    @Published var isLoading = false
    @Published var isMember = false
    @Published var isAdmin = false
    @Published var errorMessage: String?

    init(communityId: String) {
        self.communityId = communityId
    }

    func load() async {
        isLoading = true
        errorMessage = nil

        do {
            let comm = try await APIService.shared.getCommunityByName(communityId)
            community = comm
            isMember = comm.isMember ?? false
            isAdmin = comm.isAdmin ?? false

            async let postsResult = APIService.shared.getCommunityPosts(comm.id)
            async let membersResult = APIService.shared.getCommunityMembers(comm.id)

            posts = (try? await postsResult) ?? []
            members = (try? await membersResult) ?? []
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func joinCommunity() async {
        guard let id = community?.id else { return }
        do {
            _ = try await APIService.shared.joinCommunity(id)
            isMember = true
            community?.isMember = true
            if let count = community?.memberCount {
                community?.memberCount = count + 1
            }
            HapticService.pump()
        } catch {}
    }

    func leaveCommunity() async {
        guard let id = community?.id else { return }
        do {
            _ = try await APIService.shared.leaveCommunity(id)
            isMember = false
            community?.isMember = false
            if let count = community?.memberCount, count > 0 {
                community?.memberCount = count - 1
            }
        } catch {}
    }

    func createPost(_ content: String) async {
        guard let id = community?.id, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        do {
            let post = try await APIService.shared.createCommunityPost(id, content: content)
            posts.insert(post, at: 0)
            HapticService.pump()
        } catch {}
    }

    func deletePost(_ postId: Int) async {
        guard let id = community?.id else { return }
        do {
            try await APIService.shared.deleteCommunityPost(id, postId: postId)
            posts.removeAll { $0.id == postId }
        } catch {}
    }

    func pumpPost(_ postId: Int) async {
        guard let id = community?.id else { return }
        do {
            let response = try await APIService.shared.pumpCommunityPost(id, postId: postId)
            if let index = posts.firstIndex(where: { $0.id == postId }) {
                posts[index].isPumped = response.pumped
                posts[index].pumpCount = response.pumpCount
            }
            if response.pumped { HapticService.pump() }
        } catch {}
    }
}
