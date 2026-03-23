import SwiftUI

struct SkillsView: View {
    @State private var skills: [ChartSkill] = []
    @State private var isLoading = true

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            if isLoading {
                ProgressView()
                    .tint(DojoTheme.piuAccent)
            } else if skills.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "star.square.on.square")
                        .font(.system(size: 32))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.5))
                    Text("No skills available")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.textMuted)
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(skills) { skill in
                            NavigationLink(value: "skill-charts/\(skill.slug ?? "")") {
                                skillRow(skill)
                            }
                        }
                    }
                    .padding(.top, 4)
                }
            }
        }
        .navigationTitle("Skills")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadSkills() }
    }

    // MARK: - Skill Row

    private func skillRow(_ skill: ChartSkill) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(DojoTheme.piuAccent.opacity(0.15))
                    .frame(width: 44, height: 44)
                Image(systemName: "star.fill")
                    .font(.system(size: 18))
                    .foregroundColor(DojoTheme.piuAccent)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(skill.name ?? "Unknown Skill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)

                if let desc = skill.description {
                    Text(desc)
                        .font(.system(size: 12))
                        .foregroundColor(DojoTheme.textMuted)
                        .lineLimit(2)
                }
            }

            Spacer()

            if let count = skill.chartCount {
                VStack(spacing: 2) {
                    Text("\(count)")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(DojoTheme.piuBlue)
                    Text("charts")
                        .font(.system(size: 9))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundColor(DojoTheme.textMuted)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(DojoTheme.piuCard)
    }

    private func loadSkills() async {
        isLoading = true
        skills = (try? await APIService.shared.getSkillsMeta()) ?? []
        isLoading = false
    }
}
