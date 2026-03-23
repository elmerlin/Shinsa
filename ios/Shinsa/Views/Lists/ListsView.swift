import SwiftUI

struct ListsView: View {
    @State private var lists: [SongList] = []
    @State private var isLoading = false
    @State private var showCreateForm = false
    @State private var newListName = ""
    @State private var newListDescription = ""
    @State private var selectedList: SongList?
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if isLoading && lists.isEmpty {
                ProgressView().tint(DojoTheme.piuAccent)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack {
                            Text("MY SONG LISTS")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(DojoTheme.piuAccent)
                            Spacer()
                            Button {
                                newListName = ""
                                newListDescription = ""
                                showCreateForm = true
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "plus")
                                    Text("New List")
                                }
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(DojoTheme.piuAccent)
                            }
                        }

                        if let err = errorMessage {
                            Text(err).font(.system(size: 12)).foregroundColor(.red)
                        }

                        if lists.isEmpty {
                            VStack(spacing: 8) {
                                Image(systemName: "music.note.list")
                                    .font(.system(size: 30))
                                    .foregroundColor(DojoTheme.textMuted)
                                Text("No song lists yet")
                                    .font(.system(size: 14))
                                    .foregroundColor(DojoTheme.textMuted)
                                Text("Create a list to organize your favorite charts")
                                    .font(.system(size: 12))
                                    .foregroundColor(DojoTheme.textMuted.opacity(0.6))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 40)
                        }

                        ForEach(lists) { list in
                            NavigationLink {
                                ListDetailView(list: list, onUpdate: { await load() })
                            } label: {
                                listCard(list)
                            }
                        }
                    }
                    .padding()
                }
                .refreshable { await load() }
            }
        }
        .navigationTitle("Song Lists")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $showCreateForm) { createFormSheet }
    }

    private func listCard(_ list: SongList) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "music.note.list")
                .font(.system(size: 18))
                .foregroundColor(DojoTheme.piuAccent)
                .frame(width: 40, height: 40)
                .background(DojoTheme.piuAccent.opacity(0.15))
                .cornerRadius(8)

            VStack(alignment: .leading, spacing: 3) {
                Text(list.name ?? "Untitled")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)

                if let desc = list.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                        .lineLimit(1)
                }
            }

            Spacer()

            Text("\(list.itemCount ?? list.items?.count ?? 0) songs")
                .font(.system(size: 11))
                .foregroundColor(DojoTheme.textMuted)

            Image(systemName: "chevron.right")
                .font(.system(size: 10))
                .foregroundColor(DojoTheme.textMuted)
        }
        .padding(12)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    private var createFormSheet: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                VStack(spacing: 16) {
                    TextField("List Name", text: $newListName)
                        .textFieldStyle(DojoTextFieldStyle())

                    TextField("Description (optional)", text: $newListDescription)
                        .textFieldStyle(DojoTextFieldStyle())

                    Button {
                        Task { await createList() }
                    } label: {
                        Text("Create List")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(newListName.isEmpty ? DojoTheme.textMuted : DojoTheme.piuAccent)
                            .cornerRadius(10)
                    }
                    .disabled(newListName.isEmpty)

                    Spacer()
                }
                .padding()
            }
            .navigationTitle("New Song List")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { showCreateForm = false }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
    }

    private func load() async {
        isLoading = true
        lists = (try? await APIService.shared.getSongLists()) ?? []
        isLoading = false
    }

    private func createList() async {
        errorMessage = nil
        do {
            _ = try await APIService.shared.createSongList(
                name: newListName,
                description: newListDescription.isEmpty ? nil : newListDescription
            )
            showCreateForm = false
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - List Detail

struct ListDetailView: View {
    let list: SongList
    let onUpdate: () async -> Void

    @State private var items: [SongListItem] = []
    @State private var isLoading = false
    @Environment(\.dismiss) var dismiss

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    // Header
                    VStack(alignment: .leading, spacing: 6) {
                        Text(list.name ?? "Untitled")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.white)

                        if let desc = list.description, !desc.isEmpty {
                            Text(desc)
                                .font(.system(size: 13))
                                .foregroundColor(DojoTheme.textSecondary)
                        }

                        Text("\(items.count) songs")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(12)

                    // Items
                    if items.isEmpty {
                        Text("No songs in this list yet")
                            .font(.system(size: 13))
                            .foregroundColor(DojoTheme.textMuted)
                            .padding(.vertical, 20)
                            .frame(maxWidth: .infinity)
                    }

                    ForEach(items) { item in
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title ?? "Unknown")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundColor(.white)
                                    .lineLimit(1)

                                HStack(spacing: 4) {
                                    Text((item.mode ?? "").uppercased())
                                        .font(.system(size: 9, weight: .bold))
                                        .foregroundColor(item.mode == "S" ? DojoTheme.piuGold : DojoTheme.piuBlue)
                                    Text("Lv.\(item.level ?? 0)")
                                        .font(.system(size: 10))
                                        .foregroundColor(DojoTheme.textMuted)
                                }
                            }

                            Spacer()

                            Button {
                                Task { await removeItem(item) }
                            } label: {
                                Image(systemName: "minus.circle")
                                    .font(.system(size: 16))
                                    .foregroundColor(.red.opacity(0.7))
                            }
                        }
                        .padding(10)
                        .background(DojoTheme.piuCard)
                        .cornerRadius(8)
                    }

                    // Delete list
                    Button {
                        Task {
                            try? await APIService.shared.deleteSongList(list.id)
                            await onUpdate()
                            dismiss()
                        }
                    } label: {
                        HStack {
                            Image(systemName: "trash")
                            Text("Delete List")
                                .font(.system(size: 14, weight: .bold))
                        }
                        .foregroundColor(.red)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(DojoTheme.piuCard)
                        .cornerRadius(10)
                    }
                    .padding(.top, 8)
                }
                .padding()
            }
        }
        .navigationTitle(list.name ?? "List")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            items = list.items ?? []
        }
    }

    private func removeItem(_ item: SongListItem) async {
        try? await APIService.shared.removeFromSongList(list.id, itemId: item.id)
        items.removeAll { $0.id == item.id }
        await onUpdate()
    }
}
