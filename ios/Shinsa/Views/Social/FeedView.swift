import SwiftUI

struct FeedView: View {
    @StateObject private var vm = FeedViewModel()
    @EnvironmentObject var auth: AuthManager

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if vm.isLoading && vm.items.isEmpty {
                ProgressView().tint(DojoTheme.piuAccent)
            } else if vm.items.isEmpty {
                VStack(spacing: 8) {
                    Text("No activity yet")
                        .foregroundColor(DojoTheme.textMuted)
                    Text("Follow users to see their posts here")
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.6))
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(vm.items) { item in
                            switch item.entryType {
                            case "post":
                                PostCardView(item: item)
                            case "upscore":
                                UpscoreCardView(item: item)
                            case "new_clear":
                                NewClearCardView(item: item)
                            default:
                                EmptyView()
                            }
                        }

                        if vm.hasMore {
                            ProgressView()
                                .tint(DojoTheme.piuAccent)
                                .onAppear {
                                    Task { await vm.loadMore() }
                                }
                        }
                    }
                    .padding()
                }
                .refreshable { await vm.loadInitial() }
            }
        }
        .navigationTitle("Feed")
        .task { await vm.loadInitial() }
    }
}
