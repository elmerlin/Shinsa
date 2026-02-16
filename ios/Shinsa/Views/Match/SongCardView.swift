import SwiftUI

struct SongCardView: View {
    let song: Song
    let isVetoed: Bool
    let canVeto: Bool
    let onVeto: () -> Void

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                // Background
                RoundedRectangle(cornerRadius: 8)
                    .fill(
                        LinearGradient(
                            colors: song.isSingle
                                ? [Color.red.opacity(0.3), Color.red.opacity(0.1)]
                                : [Color.green.opacity(0.3), Color.green.opacity(0.1)],
                            startPoint: .top, endPoint: .bottom
                        )
                    )

                VStack(spacing: 6) {
                    // Level badge
                    HStack {
                        Text(song.levelBadge)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(song.isSingle ? .red : .green)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.black.opacity(0.5))
                            .cornerRadius(4)

                        Spacer()

                        Text("\(song.bpm ?? "") BPM")
                            .font(.system(size: 9))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                    .padding(.horizontal, 6)
                    .padding(.top, 6)

                    // Song image placeholder
                    ZStack {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(song.isSingle ? Color.red.opacity(0.2) : Color.green.opacity(0.2))
                            .aspectRatio(1, contentMode: .fit)

                        Text(String(song.title.prefix(1)))
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.white.opacity(0.5))
                    }
                    .padding(.horizontal, 6)

                    // Title
                    Text(song.title)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .padding(.horizontal, 6)
                        .padding(.bottom, 6)
                }

                // Vetoed overlay
                if isVetoed {
                    ZStack {
                        Color.black.opacity(0.6)
                        Image(systemName: "xmark")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(.red)
                    }
                    .cornerRadius(8)
                }
            }
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(
                        isVetoed ? Color.red.opacity(0.5) :
                        canVeto ? Color.white.opacity(0.6) :
                        (song.isSingle ? Color.red.opacity(0.3) : Color.green.opacity(0.3)),
                        lineWidth: canVeto ? 2 : 1
                    )
            )
            .opacity(isVetoed ? 0.5 : 1)

            // Ban button
            if canVeto {
                Button {
                    onVeto()
                } label: {
                    Text("BAN")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 4)
                        .background(Color.red)
                        .cornerRadius(4)
                }
            }
        }
    }
}
