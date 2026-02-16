import SwiftUI

struct PlayerListView: View {
    @ObservedObject var vm: TournamentViewModel
    @State private var showingForm = false

    var body: some View {
        VStack(spacing: 12) {
            // Header
            HStack {
                Text("\(vm.players.count) Players")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)

                Spacer()

                if vm.tournament?.phase == "SETUP" {
                    Button {
                        showingForm = true
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "plus")
                            Text("Add Player")
                        }
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(DojoTheme.piuAccent)
                    }
                }
            }
            .padding(.horizontal)
            .padding(.top, 8)

            // Player List
            ForEach(vm.players) { player in
                playerCard(player)
            }

            if vm.players.isEmpty {
                VStack(spacing: 8) {
                    Text("No players yet")
                        .foregroundColor(DojoTheme.textMuted)
                    if vm.tournament?.phase == "SETUP" {
                        Text("Add at least 3 players to start")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted.opacity(0.6))
                    }
                }
                .padding(.vertical, 30)
            }
        }
        .sheet(isPresented: $showingForm) {
            NavigationStack {
                PlayerFormView(tournamentId: vm.tournamentId) { _ in
                    Task { await vm.load() }
                    showingForm = false
                }
            }
        }
    }

    private func playerCard(_ player: Player) -> some View {
        HStack(spacing: 12) {
            AvatarView(player.avatar, name: player.name, size: 44)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(player.name)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)

                    if let nat = player.nationality, !nat.isEmpty {
                        Text(CountryData.flag(for: nat))
                            .font(.system(size: 12))
                    }

                    if let gender = player.gender, !gender.isEmpty {
                        Text(gender == "male" ? "\u{2642}" : gender == "female" ? "\u{2640}" : "")
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }

                HStack(spacing: 8) {
                    if let skill = player.skillTitle {
                        Text(skill)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(DojoTheme.skillColor(for: skill))
                    }
                    Text("Lv.\(player.skillLevel)")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted)
                    if player.pumbility > 0 {
                        Text("P\(player.pumbility)")
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.piuGold)
                    }
                }
            }

            Spacer()

            if vm.tournament?.phase == "SETUP" {
                Menu {
                    Button("Edit") {
                        // TODO: edit player sheet
                    }
                    Button("Delete", role: .destructive) {
                        Task { await vm.deletePlayer(player.id) }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .foregroundColor(DojoTheme.textMuted)
                        .frame(width: 30, height: 30)
                }
            }
        }
        .padding(12)
        .background(DojoTheme.piuCard)
        .cornerRadius(10)
        .padding(.horizontal)
    }
}
