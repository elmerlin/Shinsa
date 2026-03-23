import SwiftUI

struct CommunitySetupView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var auth: AuthManager

    @State private var name = ""
    @State private var description = ""
    @State private var isPrivate = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var createdCommunity: Community?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Title
                    Text("CREATE COMMUNITY")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)

                    Text("Build a space for your crew")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)

                    // Name field
                    VStack(alignment: .leading, spacing: 6) {
                        Text("NAME")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)

                        TextField("Community name", text: $name)
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                            .padding(12)
                            .background(DojoTheme.piuCard)
                            .cornerRadius(10)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(DojoTheme.piuBorder, lineWidth: 1)
                            )
                    }

                    // Description field
                    VStack(alignment: .leading, spacing: 6) {
                        Text("DESCRIPTION")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)

                        TextField("What is this community about?", text: $description, axis: .vertical)
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                            .lineLimit(3...6)
                            .padding(12)
                            .background(DojoTheme.piuCard)
                            .cornerRadius(10)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(DojoTheme.piuBorder, lineWidth: 1)
                            )
                    }

                    // Invite-only toggle
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("INVITE ONLY")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(DojoTheme.textMuted)

                            Text("Only invited users can join")
                                .font(.system(size: 12))
                                .foregroundColor(DojoTheme.textMuted.opacity(0.7))
                        }

                        Spacer()

                        Toggle("", isOn: $isPrivate)
                            .tint(DojoTheme.piuAccent)
                            .labelsHidden()
                    }
                    .padding(12)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(10)

                    // Error
                    if let error = errorMessage {
                        Text(error)
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.piuAccent)
                    }

                    // Save button
                    Button {
                        Task { await createCommunity() }
                    } label: {
                        HStack {
                            if isSaving {
                                ProgressView()
                                    .tint(.white)
                                    .scaleEffect(0.8)
                            }
                            Text("Create Community")
                                .font(.system(size: 15, weight: .bold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            canSave ? DojoTheme.piuAccent : DojoTheme.piuBorder
                        )
                        .cornerRadius(12)
                    }
                    .disabled(!canSave || isSaving)
                }
                .padding()
            }
        }
        .navigationTitle("New Community")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Helpers

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func createCommunity() async {
        errorMessage = nil
        isSaving = true

        let data: [String: AnyCodable] = [
            "name": AnyCodable(name.trimmingCharacters(in: .whitespacesAndNewlines)),
            "display_name": AnyCodable(name.trimmingCharacters(in: .whitespacesAndNewlines)),
            "description": AnyCodable(description.trimmingCharacters(in: .whitespacesAndNewlines)),
            "is_private": AnyCodable(isPrivate ? 1 : 0)
        ]

        do {
            let community = try await APIService.shared.createCommunity(data)
            createdCommunity = community
            HapticService.pump()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }
}
