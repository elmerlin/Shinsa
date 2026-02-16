import SwiftUI

struct MyAccountView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var showPasswordChange = false

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
        }
        .navigationTitle("Account")
        .sheet(isPresented: $showPasswordChange) {
            PasswordChangeView()
        }
    }

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
