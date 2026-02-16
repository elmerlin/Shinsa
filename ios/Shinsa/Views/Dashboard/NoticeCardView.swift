import SwiftUI

struct NoticeCardView: View {
    let notice: Notice

    var body: some View {
        HStack(spacing: 10) {
            Text(notice.isPinned ? "PINNED" : "NOTICE")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(notice.isPinned ? DojoTheme.piuAccent : DojoTheme.textMuted)
                .frame(width: 50, alignment: .leading)

            Text(notice.title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white)
                .lineLimit(1)

            Spacer()

            if let created = notice.createdAt {
                Text(created.asDate?.shortDateString ?? "")
                    .font(.system(size: 10))
                    .foregroundColor(DojoTheme.textMuted)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(DojoTheme.piuCard)
        .cornerRadius(8)
    }
}
