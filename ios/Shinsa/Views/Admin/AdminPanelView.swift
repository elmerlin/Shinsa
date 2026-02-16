import SwiftUI

struct AdminPanelView: View {
    @State private var archivedTournaments: [Tournament] = []
    @State private var isLoading = false

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("ADMIN PANEL")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(DojoTheme.piuAccent)

                    // Tournament Archive
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
                            Button {
                                Task { await unarchive(t.id) }
                            } label: {
                                Image(systemName: "arrow.uturn.backward")
                                    .foregroundColor(DojoTheme.piuAccent)
                            }
                        }
                    }
                }
                .padding()
            }
            .refreshable { await loadArchived() }
        }
        .navigationTitle("Admin")
        .task { await loadArchived() }
    }

    private func loadArchived() async {
        isLoading = true
        archivedTournaments = (try? await APIService.shared.getArchivedTournaments()) ?? []
        isLoading = false
    }

    private func unarchive(_ id: String) async {
        _ = try? await APIService.shared.archiveTournament(id, archived: false)
        await loadArchived()
    }
}
