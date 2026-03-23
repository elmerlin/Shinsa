import SwiftUI

struct CommunitySettingsView: View {
    let community: Community
    var onUpdate: (() -> Void)?

    @Environment(\.dismiss) var dismiss

    @State private var name: String
    @State private var description: String
    @State private var isPrivate: Bool
    @State private var isSaving = false
    @State private var showDeleteConfirm = false
    @State private var isDeleting = false
    @State private var errorMessage: String?

    init(community: Community, onUpdate: (() -> Void)? = nil) {
        self.community = community
        self.onUpdate = onUpdate
        _name = State(initialValue: community.displayName ?? community.name)
        _description = State(initialValue: community.description ?? "")
        _isPrivate = State(initialValue: (community.isPrivate ?? 0) == 1)
    }

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("COMMUNITY SETTINGS")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)

                    // Name
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

                    // Description
                    VStack(alignment: .leading, spacing: 6) {
                        Text("DESCRIPTION")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.textMuted)

                        TextField("Description", text: $description, axis: .vertical)
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

                    // Private toggle
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

                    if let error = errorMessage {
                        Text(error)
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.piuAccent)
                    }

                    // Save button
                    Button {
                        Task { await saveCommunity() }
                    } label: {
                        HStack {
                            if isSaving {
                                ProgressView()
                                    .tint(.white)
                                    .scaleEffect(0.8)
                            }
                            Text("Save Changes")
                                .font(.system(size: 15, weight: .bold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(DojoTheme.piuAccent)
                        .cornerRadius(12)
                    }
                    .disabled(isSaving)

                    Divider()
                        .background(DojoTheme.piuBorder)

                    // Danger zone
                    VStack(alignment: .leading, spacing: 10) {
                        Text("DANGER ZONE")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)

                        Button {
                            showDeleteConfirm = true
                        } label: {
                            HStack {
                                Image(systemName: "trash")
                                Text("Delete Community")
                                    .font(.system(size: 14, weight: .bold))
                            }
                            .foregroundColor(DojoTheme.piuAccent)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(DojoTheme.piuAccent.opacity(0.5), lineWidth: 1)
                            )
                        }
                    }
                }
                .padding()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .foregroundColor(.white)
                }
            }
        }
        .alert("Delete Community", isPresented: $showDeleteConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                Task { await deleteCommunity() }
            }
        } message: {
            Text("This cannot be undone. All posts and members will be removed.")
        }
    }

    // MARK: - API

    private func saveCommunity() async {
        errorMessage = nil
        isSaving = true

        let data: [String: AnyCodable] = [
            "display_name": AnyCodable(name.trimmingCharacters(in: .whitespacesAndNewlines)),
            "description": AnyCodable(description.trimmingCharacters(in: .whitespacesAndNewlines)),
            "is_private": AnyCodable(isPrivate ? 1 : 0)
        ]

        do {
            _ = try await APIService.shared.updateCommunity(community.id, data)
            onUpdate?()
            HapticService.pump()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }

    private func deleteCommunity() async {
        isDeleting = true
        do {
            try await APIService.shared.deleteCommunity(community.id)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isDeleting = false
    }
}
