import SwiftUI

struct MyAccountView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var showPasswordChange = false
    @State private var shoes: [Shoe] = []
    @State private var invitations: [Invitation] = []
    @State private var youtubeConnected = false
    @State private var isLoading = false

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 16) {
                    if let user = auth.currentUser {
                        // Profile Summary
                        VStack(spacing: 12) {
                            AvatarView(user.avatar, name: user.username, size: 80)
                            Text(user.username)
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.white)
                            if let email = user.email {
                                Text(email)
                                    .font(.system(size: 13))
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                        }
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(DojoTheme.piuCard)
                        .cornerRadius(12)

                        // Settings
                        VStack(spacing: 2) {
                            settingsRow("Change Password", icon: "lock") {
                                showPasswordChange = true
                            }
                            settingsRow("Server URL", icon: "server.rack") {}
                        }
                        .background(DojoTheme.piuCard)
                        .cornerRadius(12)

                        // Shoe Management
                        shoeSection

                        // YouTube Connection
                        youtubeSection

                        // Invitations
                        invitationsSection

                        // Logout
                        Button {
                            auth.logout()
                        } label: {
                            HStack {
                                Image(systemName: "rectangle.portrait.and.arrow.forward")
                                Text("Logout")
                                    .font(.system(size: 15, weight: .bold))
                            }
                            .foregroundColor(.red)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(DojoTheme.piuCard)
                            .cornerRadius(12)
                        }
                    }
                }
                .padding()
            }
            .refreshable { await loadExtras() }
        }
        .navigationTitle("Account")
        .sheet(isPresented: $showPasswordChange) {
            PasswordChangeView()
        }
        .task { await loadExtras() }
    }

    // MARK: - Shoe Section

    private var shoeSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("MY SHOES")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(DojoTheme.piuAccent)
                Spacer()
                NavigationLink {
                    ShoesView()
                } label: {
                    Text("Browse All")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }

            if shoes.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "shoe")
                        .font(.system(size: 16))
                        .foregroundColor(DojoTheme.textMuted)
                    Text("No shoes added yet")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                }
                .padding(.vertical, 12)
            } else {
                ForEach(shoes) { shoe in
                    HStack(spacing: 10) {
                        if let imageUrl = shoe.image, !imageUrl.isEmpty {
                            AsyncImage(url: URL(string: imageUrl)) { image in
                                image.resizable().aspectRatio(contentMode: .fill)
                            } placeholder: {
                                Image(systemName: "shoe")
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                            .frame(width: 40, height: 40)
                            .cornerRadius(8)
                        } else {
                            Image(systemName: "shoe")
                                .font(.system(size: 16))
                                .foregroundColor(DojoTheme.textMuted)
                                .frame(width: 40, height: 40)
                                .background(Color.white.opacity(0.05))
                                .cornerRadius(8)
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(shoe.name ?? "Unnamed")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.white)
                            if let brand = shoe.brand {
                                Text(brand)
                                    .font(.system(size: 11))
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                        }

                        Spacer()

                        if shoe.isShoeActive {
                            Text("Active")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(DojoTheme.piuGreen)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(DojoTheme.piuGreen.opacity(0.15))
                                .cornerRadius(4)
                        }
                    }
                    .padding(8)
                    .background(Color.white.opacity(0.03))
                    .cornerRadius(8)
                }
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - YouTube Section

    private var youtubeSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("YOUTUBE CONNECTION")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            HStack(spacing: 12) {
                Image(systemName: "play.rectangle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(.red)

                VStack(alignment: .leading, spacing: 2) {
                    Text("YouTube")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                    Text("Connect your YouTube channel to share videos")
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                }

                Spacer()

                Text(youtubeConnected ? "Connected" : "Not linked")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(youtubeConnected ? DojoTheme.piuGreen : DojoTheme.textMuted)
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Invitations Section

    private var invitationsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("INVITATIONS")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)

            if invitations.isEmpty {
                Text("No pending invitations")
                    .font(.system(size: 13))
                    .foregroundColor(DojoTheme.textMuted)
                    .padding(.vertical, 8)
            } else {
                ForEach(invitations) { invite in
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(invite.type.capitalized)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.white)
                            if let name = invite.tournamentName ?? invite.duelName {
                                Text(name)
                                    .font(.system(size: 11))
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                        }

                        Spacer()

                        if invite.status == "pending" {
                            HStack(spacing: 6) {
                                Button {
                                    Task { await respondInvitation(invite.id, status: "accepted") }
                                } label: {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.system(size: 20))
                                        .foregroundColor(DojoTheme.piuGreen)
                                }

                                Button {
                                    Task { await respondInvitation(invite.id, status: "declined") }
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 20))
                                        .foregroundColor(.red)
                                }
                            }
                        } else {
                            Text(invite.status.capitalized)
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }
                    .padding(8)
                    .background(Color.white.opacity(0.03))
                    .cornerRadius(8)
                }
            }
        }
        .padding()
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Helpers

    private func settingsRow(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .foregroundColor(DojoTheme.piuAccent)
                    .frame(width: 24)
                Text(title)
                    .font(.system(size: 14))
                    .foregroundColor(.white)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundColor(DojoTheme.textMuted)
            }
            .padding(14)
        }
    }

    private func loadExtras() async {
        isLoading = true
        shoes = (try? await APIService.shared.getUserShoes(auth.userId)) ?? []
        invitations = (try? await APIService.shared.getInvitations()) ?? []
        isLoading = false
    }

    private func respondInvitation(_ id: String, status: String) async {
        _ = try? await APIService.shared.respondInvitation(id, status: status)
        invitations = (try? await APIService.shared.getInvitations()) ?? []
    }
}

struct PasswordChangeView: View {
    @Environment(\.dismiss) var dismiss
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var saving = false
    @State private var errorMessage: String?
    @State private var success = false

    var body: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                VStack(spacing: 16) {
                    SecureField("Current Password", text: $currentPassword)
                        .textFieldStyle(DojoTextFieldStyle())
                    SecureField("New Password", text: $newPassword)
                        .textFieldStyle(DojoTextFieldStyle())
                    SecureField("Confirm New Password", text: $confirmPassword)
                        .textFieldStyle(DojoTextFieldStyle())

                    if let err = errorMessage {
                        Text(err).font(.system(size: 12)).foregroundColor(.red)
                    }
                    if success {
                        Text("Password changed").font(.system(size: 12)).foregroundColor(DojoTheme.piuGreen)
                    }

                    Button {
                        Task { await changePassword() }
                    } label: {
                        HStack {
                            if saving { ProgressView().tint(.white).scaleEffect(0.8) }
                            Text("Change Password")
                                .font(.system(size: 16, weight: .bold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(DojoTheme.piuAccent)
                        .cornerRadius(12)
                    }
                    .disabled(saving)

                    Spacer()
                }
                .padding()
            }
            .navigationTitle("Change Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
    }

    private func changePassword() async {
        guard newPassword == confirmPassword else {
            errorMessage = "Passwords do not match"
            return
        }
        saving = true
        errorMessage = nil
        do {
            _ = try await APIService.shared.changePassword(currentPassword: currentPassword, newPassword: newPassword)
            success = true
        } catch {
            errorMessage = error.localizedDescription
        }
        saving = false
    }
}
