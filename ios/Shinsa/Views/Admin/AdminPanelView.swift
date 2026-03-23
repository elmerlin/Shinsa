import SwiftUI

struct AdminPanelView: View {
    @State private var selectedTab = 0
    @State private var activeTournaments: [Tournament] = []
    @State private var archivedTournaments: [Tournament] = []
    @State private var notices: [Notice] = []
    @State private var changelog: [ChangelogEntry] = []
    @State private var groups: [[String: AnyCodable]] = []
    @State private var isLoading = false

    // Notice form
    @State private var showNoticeForm = false
    @State private var editingNotice: Notice?
    @State private var noticeTitle = ""
    @State private var noticeContent = ""
    @State private var noticePinned = false

    // Changelog form
    @State private var showChangelogForm = false
    @State private var editingChangelog: ChangelogEntry?
    @State private var changelogTitle = ""
    @State private var changelogContent = ""
    @State private var changelogPinned = false

    // Group form
    @State private var showGroupForm = false
    @State private var groupName = ""
    @State private var groupDescription = ""

    private let tabs = ["Active", "Archived", "Notices", "Changelog", "Groups"]

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Tab bar
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(0..<tabs.count, id: \.self) { index in
                            Button {
                                withAnimation { selectedTab = index }
                            } label: {
                                Text(tabs[index])
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(selectedTab == index ? .white : DojoTheme.textMuted)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    .background(selectedTab == index ? DojoTheme.piuAccent : DojoTheme.piuCard)
                                    .cornerRadius(8)
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }

                // Content
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        switch selectedTab {
                        case 0: activeTournamentsTab
                        case 1: archivedTournamentsTab
                        case 2: noticesTab
                        case 3: changelogTab
                        case 4: groupsTab
                        default: EmptyView()
                        }
                    }
                    .padding()
                }
                .refreshable { await loadTab() }
            }
        }
        .navigationTitle("Admin")
        .task { await loadAll() }
        .sheet(isPresented: $showNoticeForm) { noticeFormSheet }
        .sheet(isPresented: $showChangelogForm) { changelogFormSheet }
        .sheet(isPresented: $showGroupForm) { groupFormSheet }
    }

    // MARK: - Active Tournaments

    private var activeTournamentsTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("ACTIVE TOURNAMENTS")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            if activeTournaments.isEmpty && !isLoading {
                Text("No active tournaments")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .padding(.vertical, 20)
            }

            ForEach(activeTournaments) { t in
                HStack {
                    TournamentCardView(tournament: t)

                    Button {
                        Task { await archive(t.id) }
                    } label: {
                        Image(systemName: "archivebox")
                            .foregroundColor(DojoTheme.piuGold)
                    }
                }
            }
        }
    }

    // MARK: - Archived Tournaments

    private var archivedTournamentsTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("ARCHIVED TOURNAMENTS")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.textMuted)

            if archivedTournaments.isEmpty && !isLoading {
                Text("No archived tournaments")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .padding(.vertical, 20)
            }

            ForEach(archivedTournaments) { t in
                HStack {
                    TournamentCardView(tournament: t)

                    VStack(spacing: 8) {
                        Button {
                            Task { await unarchive(t.id) }
                        } label: {
                            Image(systemName: "arrow.uturn.backward")
                                .foregroundColor(DojoTheme.piuAccent)
                        }

                        Button {
                            Task { await deleteTournament(t.id) }
                        } label: {
                            Image(systemName: "trash")
                                .foregroundColor(.red)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Notices Tab

    private var noticesTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("NOTICES")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
                Spacer()
                Button {
                    editingNotice = nil
                    noticeTitle = ""
                    noticeContent = ""
                    noticePinned = false
                    showNoticeForm = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                        Text("New")
                    }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
                }
            }

            if notices.isEmpty && !isLoading {
                Text("No notices")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .padding(.vertical, 20)
            }

            ForEach(notices) { notice in
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            if notice.isPinned {
                                Image(systemName: "pin.fill")
                                    .font(.system(size: 10))
                                    .foregroundColor(DojoTheme.piuGold)
                            }
                            Text(notice.title)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                        }
                        Text(notice.content)
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textSecondary)
                            .lineLimit(2)
                        if let date = notice.createdAt {
                            Text(String(date.prefix(10)))
                                .font(.system(size: 10))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }

                    Spacer()

                    VStack(spacing: 8) {
                        Button {
                            editingNotice = notice
                            noticeTitle = notice.title
                            noticeContent = notice.content
                            noticePinned = notice.isPinned
                            showNoticeForm = true
                        } label: {
                            Image(systemName: "pencil")
                                .font(.system(size: 12))
                                .foregroundColor(DojoTheme.piuBlue)
                        }

                        Button {
                            Task { await toggleNoticePin(notice) }
                        } label: {
                            Image(systemName: notice.isPinned ? "pin.slash" : "pin")
                                .font(.system(size: 12))
                                .foregroundColor(DojoTheme.piuGold)
                        }

                        Button {
                            Task { await deleteNotice(notice.id) }
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 12))
                                .foregroundColor(.red)
                        }
                    }
                }
                .padding(12)
                .background(DojoTheme.piuCard)
                .cornerRadius(10)
            }
        }
    }

    // MARK: - Changelog Tab

    private var changelogTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("CHANGELOG")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
                Spacer()
                Button {
                    editingChangelog = nil
                    changelogTitle = ""
                    changelogContent = ""
                    changelogPinned = false
                    showChangelogForm = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                        Text("New")
                    }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
                }
            }

            if changelog.isEmpty && !isLoading {
                Text("No changelog entries")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .padding(.vertical, 20)
            }

            ForEach(changelog) { entry in
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            if entry.isPinned {
                                Image(systemName: "pin.fill")
                                    .font(.system(size: 10))
                                    .foregroundColor(DojoTheme.piuGold)
                            }
                            Text(entry.title ?? "Untitled")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                        }
                        Text(entry.content ?? "")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textSecondary)
                            .lineLimit(2)
                        if let date = entry.createdAt {
                            Text(String(date.prefix(10)))
                                .font(.system(size: 10))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }

                    Spacer()

                    VStack(spacing: 8) {
                        Button {
                            editingChangelog = entry
                            changelogTitle = entry.title ?? ""
                            changelogContent = entry.content ?? ""
                            changelogPinned = entry.isPinned
                            showChangelogForm = true
                        } label: {
                            Image(systemName: "pencil")
                                .font(.system(size: 12))
                                .foregroundColor(DojoTheme.piuBlue)
                        }

                        Button {
                            Task { await deleteChangelogEntry(entry.id) }
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 12))
                                .foregroundColor(.red)
                        }
                    }
                }
                .padding(12)
                .background(DojoTheme.piuCard)
                .cornerRadius(10)
            }
        }
    }

    // MARK: - Groups Tab

    private var groupsTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("USER GROUPS")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
                Spacer()
                Button {
                    groupName = ""
                    groupDescription = ""
                    showGroupForm = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                        Text("New")
                    }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
                }
            }

            if groups.isEmpty && !isLoading {
                Text("No groups")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .padding(.vertical, 20)
            }

            ForEach(groups.indices, id: \.self) { index in
                let group = groups[index]
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text((group["name"]?.value as? String) ?? "Group")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                        if let desc = group["description"]?.value as? String, !desc.isEmpty {
                            Text(desc)
                                .font(.system(size: 12))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }
                    Spacer()
                    if let count = group["user_count"]?.value as? Int {
                        Text("\(count) users")
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
                .padding(12)
                .background(DojoTheme.piuCard)
                .cornerRadius(10)
            }
        }
    }

    // MARK: - Notice Form Sheet

    private var noticeFormSheet: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                VStack(spacing: 16) {
                    TextField("Title", text: $noticeTitle)
                        .textFieldStyle(DojoTextFieldStyle())

                    TextEditor(text: $noticeContent)
                        .scrollContentBackground(.hidden)
                        .foregroundColor(.white)
                        .padding(10)
                        .frame(minHeight: 120)
                        .background(DojoTheme.piuCard)
                        .cornerRadius(8)

                    Toggle(isOn: $noticePinned) {
                        Text("Pinned")
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                    }
                    .tint(DojoTheme.piuAccent)

                    Button {
                        Task { await saveNotice() }
                    } label: {
                        Text(editingNotice != nil ? "Update Notice" : "Create Notice")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(DojoTheme.piuAccent)
                            .cornerRadius(10)
                    }

                    Spacer()
                }
                .padding()
            }
            .navigationTitle(editingNotice != nil ? "Edit Notice" : "New Notice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { showNoticeForm = false }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
    }

    // MARK: - Changelog Form Sheet

    private var changelogFormSheet: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                VStack(spacing: 16) {
                    TextField("Title", text: $changelogTitle)
                        .textFieldStyle(DojoTextFieldStyle())

                    TextEditor(text: $changelogContent)
                        .scrollContentBackground(.hidden)
                        .foregroundColor(.white)
                        .padding(10)
                        .frame(minHeight: 120)
                        .background(DojoTheme.piuCard)
                        .cornerRadius(8)

                    Toggle(isOn: $changelogPinned) {
                        Text("Pinned")
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                    }
                    .tint(DojoTheme.piuAccent)

                    Button {
                        Task { await saveChangelogEntry() }
                    } label: {
                        Text(editingChangelog != nil ? "Update Entry" : "Create Entry")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(DojoTheme.piuAccent)
                            .cornerRadius(10)
                    }

                    Spacer()
                }
                .padding()
            }
            .navigationTitle(editingChangelog != nil ? "Edit Entry" : "New Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { showChangelogForm = false }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
    }

    // MARK: - Group Form Sheet

    private var groupFormSheet: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                VStack(spacing: 16) {
                    TextField("Group Name", text: $groupName)
                        .textFieldStyle(DojoTextFieldStyle())

                    TextField("Description", text: $groupDescription)
                        .textFieldStyle(DojoTextFieldStyle())

                    Button {
                        Task { await createGroup() }
                    } label: {
                        Text("Create Group")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(DojoTheme.piuAccent)
                            .cornerRadius(10)
                    }

                    Spacer()
                }
                .padding()
            }
            .navigationTitle("New Group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { showGroupForm = false }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
    }

    // MARK: - Data Loading

    private func loadAll() async {
        isLoading = true
        async let t = APIService.shared.getTournaments()
        async let a = APIService.shared.getArchivedTournaments()
        async let n = APIService.shared.getNotices()
        async let c = APIService.shared.getChangelog()
        async let g = APIService.shared.getAdminGroups()
        activeTournaments = (try? await t) ?? []
        archivedTournaments = (try? await a) ?? []
        notices = (try? await n) ?? []
        changelog = (try? await c) ?? []
        groups = (try? await g) ?? []
        isLoading = false
    }

    private func loadTab() async {
        switch selectedTab {
        case 0: activeTournaments = (try? await APIService.shared.getTournaments()) ?? []
        case 1: archivedTournaments = (try? await APIService.shared.getArchivedTournaments()) ?? []
        case 2: notices = (try? await APIService.shared.getNotices()) ?? []
        case 3: changelog = (try? await APIService.shared.getChangelog()) ?? []
        case 4: groups = (try? await APIService.shared.getAdminGroups()) ?? []
        default: break
        }
    }

    // MARK: - Tournament Actions

    private func archive(_ id: String) async {
        _ = try? await APIService.shared.archiveTournament(id, archived: true)
        activeTournaments = (try? await APIService.shared.getTournaments()) ?? []
        archivedTournaments = (try? await APIService.shared.getArchivedTournaments()) ?? []
    }

    private func unarchive(_ id: String) async {
        _ = try? await APIService.shared.archiveTournament(id, archived: false)
        activeTournaments = (try? await APIService.shared.getTournaments()) ?? []
        archivedTournaments = (try? await APIService.shared.getArchivedTournaments()) ?? []
    }

    private func deleteTournament(_ id: String) async {
        try? await APIService.shared.deleteTournament(id)
        archivedTournaments = (try? await APIService.shared.getArchivedTournaments()) ?? []
    }

    // MARK: - Notice Actions

    private func saveNotice() async {
        let data: [String: AnyCodable] = [
            "title": AnyCodable(noticeTitle),
            "content": AnyCodable(noticeContent),
            "pinned": AnyCodable(noticePinned ? 1 : 0)
        ]
        if let existing = editingNotice {
            _ = try? await APIService.shared.updateNotice(existing.id, data)
        } else {
            _ = try? await APIService.shared.createNotice(data)
        }
        notices = (try? await APIService.shared.getNotices()) ?? []
        showNoticeForm = false
    }

    private func toggleNoticePin(_ notice: Notice) async {
        let data: [String: AnyCodable] = ["pinned": AnyCodable(notice.isPinned ? 0 : 1)]
        _ = try? await APIService.shared.updateNotice(notice.id, data)
        notices = (try? await APIService.shared.getNotices()) ?? []
    }

    private func deleteNotice(_ id: String) async {
        try? await APIService.shared.deleteNotice(id)
        notices = (try? await APIService.shared.getNotices()) ?? []
    }

    // MARK: - Changelog Actions

    private func saveChangelogEntry() async {
        let data: [String: AnyCodable] = [
            "title": AnyCodable(changelogTitle),
            "content": AnyCodable(changelogContent),
            "pinned": AnyCodable(changelogPinned ? 1 : 0)
        ]
        if let existing = editingChangelog {
            _ = try? await APIService.shared.updateChangelogEntry(existing.id, data)
        } else {
            _ = try? await APIService.shared.createChangelogEntry(data)
        }
        changelog = (try? await APIService.shared.getChangelog()) ?? []
        showChangelogForm = false
    }

    private func deleteChangelogEntry(_ id: String) async {
        try? await APIService.shared.deleteChangelogEntry(id)
        changelog = (try? await APIService.shared.getChangelog()) ?? []
    }

    // MARK: - Group Actions

    private func createGroup() async {
        let data: [String: AnyCodable] = [
            "name": AnyCodable(groupName),
            "description": AnyCodable(groupDescription)
        ]
        _ = try? await APIService.shared.createAdminGroup(data)
        groups = (try? await APIService.shared.getAdminGroups()) ?? []
        showGroupForm = false
    }
}
