import SwiftUI

struct TournamentCardView: View {
    let tournament: Tournament
    var onDelete: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(tournament.avatar, name: tournament.name, size: 48)

            VStack(alignment: .leading, spacing: 4) {
                Text(tournament.name)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)

                HStack(spacing: 8) {
                    if let loc = tournament.location, !loc.isEmpty {
                        Text(loc)
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                    if let date = tournament.date, !date.isEmpty {
                        Text(date)
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }
            }

            Spacer()

            StatusBadgeView(phase: tournament.phase)
        }
        .padding(12)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }
}
