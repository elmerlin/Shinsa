import SwiftUI

struct ChangelogView: View {
    @State private var entries: [ChangelogEntry] = []
    @State private var isLoading = false
    @State private var selectedEntry: ChangelogEntry?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if isLoading && entries.isEmpty {
                ProgressView().tint(DojoTheme.piuAccent)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("CHANGELOG")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)

                        if entries.isEmpty {
                            Text("No changelog entries yet")
                                .font(.system(size: 13))
                                .foregroundColor(DojoTheme.textMuted)
                                .padding(.vertical, 30)
                                .frame(maxWidth: .infinity)
                        }

                        ForEach(entries) { entry in
                            Button {
                                selectedEntry = entry
                            } label: {
                                changelogCard(entry)
                            }
                        }
                    }
                    .padding()
                }
                .refreshable { await load() }
            }
        }
        .navigationTitle("Changelog")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(item: $selectedEntry) { entry in
            changelogDetailSheet(entry)
        }
    }

    private func changelogCard(_ entry: ChangelogEntry) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                if entry.isPinned {
                    Image(systemName: "pin.fill")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.piuGold)
                }

                Text(entry.title ?? "Untitled")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                Spacer()

                if let date = entry.createdAt {
                    Text(String(date.prefix(10)))
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            if let content = entry.content, !content.isEmpty {
                Text(content)
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textSecondary)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    private func changelogDetailSheet(_ entry: ChangelogEntry) -> some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if entry.isPinned {
                            HStack(spacing: 4) {
                                Image(systemName: "pin.fill")
                                    .font(.system(size: 10))
                                Text("PINNED")
                                    .font(.system(size: 10, weight: .bold))
                            }
                            .foregroundColor(DojoTheme.piuGold)
                        }

                        Text(entry.title ?? "Untitled")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(.white)

                        if let date = entry.createdAt {
                            Text(String(date.prefix(10)))
                                .font(.system(size: 12))
                                .foregroundColor(DojoTheme.textMuted)
                        }

                        Divider().background(DojoTheme.piuBorder)

                        if let content = entry.content {
                            MarkdownContentView(text: content)
                        }
                    }
                    .padding()
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { selectedEntry = nil } label: {
                        Image(systemName: "xmark")
                            .foregroundColor(.white)
                    }
                }
            }
        }
    }

    private func load() async {
        isLoading = true
        entries = (try? await APIService.shared.getChangelog()) ?? []
        isLoading = false
    }
}
