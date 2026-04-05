import SwiftUI

struct WCWeekPickerSheet: View {
    let weeks: [WCWeek]
    let currentWeekKey: String?
    let onSelect: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 4) {
                    ForEach(weeks) { week in
                        weekRow(week)
                    }
                }
                .padding(16)
            }
            .background(DojoTheme.piuBg.ignoresSafeArea())
            .navigationTitle("Select Week")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
    }

    private func weekRow(_ week: WCWeek) -> some View {
        let isSelected = week.weekKey == currentWeekKey

        return Button {
            onSelect(week.weekKey)
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(week.weekKey)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(isSelected ? DojoTheme.piuGold : .white)

                        if week.isLive {
                            Text("LIVE")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.red)
                                .cornerRadius(3)
                        }
                    }

                    Text(week.dateRange)
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textSecondary)
                }

                Spacer()

                if let count = week.participantCount, count > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "person.2.fill")
                            .font(.system(size: 10))
                        Text("\(count)")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundColor(DojoTheme.textMuted)
                }

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundColor(DojoTheme.piuGold)
                }
            }
            .padding(12)
            .background(
                isSelected
                    ? DojoTheme.piuGold.opacity(0.08)
                    : DojoTheme.piuCard
            )
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(
                        isSelected ? DojoTheme.piuGold.opacity(0.3) : DojoTheme.piuBorder,
                        lineWidth: 1
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}
